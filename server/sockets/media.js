import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import { EXERCISE } from "../constants/exercises.js";
import pool from "../db/index.js";
import { logger } from "../lib/cloudwatch-logger.js";
import redis from "../lib/redisClient.js";
import { getAvatarPersona } from "../personas/config.js";
import {
  createCompletion,
  generateInterruptionResponse,
  generateLLMResponse,
} from "../pipeline/llmResponder.js";
import { PurchaseFlowEventHandler } from "../pipeline/purchaseFlowEnhancer.js";
import { createRealtimeTranscriber } from "../pipeline/realtimeTranscriber.js";
import {
  createStreamingTTSCallback,
  synthesizeTTSStreaming,
} from "../pipeline/ttsSynth.js";
import {
  adjustFuturePlans,
  getSessionPerformanceSummary,
} from "../services/adaptivePlanAdjustment.js";
import { creditsService } from "../services/creditsService.js";
import storageService from "../services/storage.js";
import { generateWorkoutPlan } from "../services/workoutPlanGenerator.js";
import {
  executePurchase,
  getTrendingProducts,
} from "../tools/amazon-purchase.js";

// Credit system uses avatar-specific pricing_per_min

// Active recording sessions for WebSocket streaming
const activeRecordings = new Map();

// Helper functions for Redis persistence
async function setRecordingMeta(recordingId, meta) {
  await redis.hmset(`rec:${recordingId}`, meta);
}

async function addChunkPath(recordingId, chunkPath) {
  await redis.rpush(`rec:${recordingId}:chunks`, chunkPath);
}

async function clearRecordingKeys(recordingId) {
  await redis.del(`rec:${recordingId}`, `rec:${recordingId}:chunks`);
}

export function setupMediaNamespace(io) {
  const mediaNamespace = io.of("/media");

  mediaNamespace.on("connection", (socket) => {
    logger.info("Client connected to media namespace", {
      socketId: socket.id,
      component: "mediaSocket",
    });

    // Track all event listeners for cleanup verification
    const eventListeners = new Map(); // Use Map for better tracking
    const originalOn = socket.on.bind(socket);
    const originalOff = socket.off.bind(socket);
    const originalRemoveAllListeners = socket.removeAllListeners.bind(socket);

    // Override socket.on to track listeners
    socket.on = function (event, listener) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event).add(listener);
      return originalOn(event, listener);
    };

    // Override socket.off to track cleanup
    socket.off = function (event, listener) {
      if (eventListeners.has(event)) {
        if (listener) {
          eventListeners.get(event).delete(listener);
          if (eventListeners.get(event).size === 0) {
            eventListeners.delete(event);
          }
        } else {
          // Remove all listeners for this event
          eventListeners.delete(event);
        }
      }
      return originalOff(event, listener);
    };

    // Override removeAllListeners to track cleanup
    socket.removeAllListeners = function (event) {
      if (event) {
        eventListeners.delete(event);
      } else {
        eventListeners.clear();
      }
      return originalRemoveAllListeners(event);
    };

    let sessionInitialized = false; // Per-socket session state
    let transcriber = null;
    let isSessionEnding = false;
    let currentCallSessionId = null; // To store the ID of the current call session
    let avatarId = null; // Store current avatar ID for interruption responses
    let currentRecordingId = null; // Track current recording session
    let visionEnabled = false; // Track if vision is enabled for this session
    let workoutPlan = null; // Store current workout plan for fitness coaches

    // Credit charging variables
    let creditTimer = null;
    let totalCreditsSpent = 0;
    let userId = null;
    let perMinuteCost = 10; // Default 10 credits per minute
    let isAvatarSpeaking = false; // Track avatar speaking state to prevent overlaps

    // Initialize session and transcriber
    socket.on("init_session", async (data) => {
      if (sessionInitialized) {
        logger.warn("Duplicate init_session ignored", {
          socketId: socket.id,
          component: "mediaSocket",
        });
        return;
      }
      sessionInitialized = true;

      // Clear any existing timers or states from previous sessions
      if (creditTimer) {
        clearInterval(creditTimer);
        creditTimer = null;
      }

      logger.info("Initializing session", {
        socketId: socket.id,
        avatarId: data.avatarId,
        payload: data,
        component: "mediaSocket",
      });
      isSessionEnding = false;
      avatarId = data.avatarId;
      userId = data.userId;

      // Check if vision is enabled in the init data
      if (data.visionEnabled !== undefined) {
        visionEnabled = data.visionEnabled;
        logger.info("[VISION] Vision enabled from init", {
          enabled: visionEnabled,
          component: "mediaSocket",
        });
        // Initialize vision comment timer - set to 0 so first image triggers immediately
        if (visionEnabled) {
          socket.lastVisionCommentTime = 0;
        }
      }

      // --- Log CallSession Start (or reuse existing) ---
      if (!currentCallSessionId) {
        try {
          const sessionResult = await pool.query(
            `INSERT INTO "CallSession" (user_id, avatar_id, started_at, transcript)
         VALUES ($1, $2, NOW(), '[]'::jsonb)
         RETURNING id;`,
            [data.userId, data.avatarId],
          );
          currentCallSessionId = sessionResult.rows[0].id;
          logger.info("Started new CallSession", {
            callSessionId: currentCallSessionId,
            component: "mediaSocket",
          });

          const projectResult = await pool.query(
            `INSERT INTO "Project" (owner_id, title, call_session_id, meta)
           VALUES ($1, $2, $3, $4)
           RETURNING id;`,
            [
              data.userId,
              `New Project from Session ${currentCallSessionId}`,
              currentCallSessionId,
              JSON.stringify({ source: "session" }),
            ],
          );
          logger.info("Created Project for CallSession", {
            projectId: projectResult.rows[0].id,
            callSessionId: currentCallSessionId,
            component: "mediaSocket",
          });
        } catch (dbError) {
          logger.error("Error starting CallSession or Project", {
            error: dbError.message,
            socketId: socket.id,
            component: "mediaSocket",
          });
          socket.emit("error", { message: "Failed to log session start." });
          return;
        }
      } else {
        logger.info("Reusing existing CallSession", {
          callSessionId: currentCallSessionId,
          component: "mediaSocket",
        });
      }

      // --- CREDIT CHARGING SETUP ---

      try {
        const avatarResult = await pool.query(
          'SELECT pricing_per_min, name FROM "AvatarPersona" WHERE id = $1',
          [data.avatarId],
        );

        if (avatarResult.rows.length === 0) {
          logger.error("Avatar not found for credits", {
            avatarId: data.avatarId,
            socketId: socket.id,
            component: "mediaSocket",
          });
          socket.emit("error", { message: "Avatar configuration not found." });
          return;
        }

        const { pricing_per_min, name } = avatarResult.rows[0];
        perMinuteCost = pricing_per_min;

        // Clear existing timer (if any)
        if (creditTimer) {
          clearInterval(creditTimer);
          creditTimer = null;
          logger.warn("Existing creditTimer found — clearing it", {
            socketId: socket.id,
            component: "mediaSocket",
          });
        }

        // ✅ Set interval for per-minute charges
        logger.info("Starting per-minute credit timer", {
          amount: perMinuteCost,
          intervalSeconds: 60,
          avatarName: name,
          socketId: socket.id,
          component: "mediaSocket",
        });
        creditTimer = setInterval(async () => {
          try {
            logger.info("Charging per-minute credits", {
              amount: perMinuteCost,
              timestamp: new Date().toISOString(),
              socketId: socket.id,
              component: "mediaSocket",
            });
            const newBalance = await creditsService.spendCredits(
              data.userId,
              perMinuteCost,
              `1 minute conversation with ${name}`,
              data.avatarId,
              currentCallSessionId,
            );
            totalCreditsSpent += perMinuteCost;
            logger.info("Per-minute charge successful", {
              newBalance,
              totalSpent: totalCreditsSpent,
              socketId: socket.id,
              component: "mediaSocket",
            });
            socket.emit("credits_charged", {
              amount: perMinuteCost,
              newBalance,
              totalSpent: totalCreditsSpent,
            });
          } catch (creditError) {
            logger.error("Per-minute charge failed", {
              error: creditError.message,
              socketId: socket.id,
              component: "mediaSocket",
            });
            socket.emit("insufficient_credits", {
              message: "Call ended due to insufficient credits",
              totalSpent: totalCreditsSpent,
            });
            socket.emit("session_force_end");
          }
        }, 60000); // Every 60 seconds
      } catch (creditError) {
        logger.error("Error setting up credit charging", {
          error: creditError.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("error", { message: creditError.message });
        return;
      }

      // ---------------------------

      if (transcriber) {
        logger.info("Closing existing transcriber before creating new one", {
          socketId: socket.id,
          component: "mediaSocket",
        });
        transcriber.close();
        transcriber = null;
      }

      try {
        const newTranscriber = await createRealtimeTranscriber(
          socket,
          data.avatarId,
          currentCallSessionId,
          userId,
        );

        if (isSessionEnding) {
          logger.info(
            "Session was ended while transcriber was initializing. Closing immediately",
            { socketId: socket.id, component: "mediaSocket" },
          );
          newTranscriber.close();
          isSessionEnding = false;
          return;
        }

        transcriber = newTranscriber;
        logger.info("Transcriber created successfully", {
          socketId: socket.id,
          component: "mediaSocket",
        });

        // Reset avatar speaking state on new session
        isAvatarSpeaking = false;

        socket.emit("session_ready", { sessionId: socket.id, ...data });

        // Generate and send avatar intro after session is ready
        // Use session-specific flag to prevent duplicate intros
        logger.info("[DEBUG] Intro generation check", {
          introGeneratedForSession: socket.introGeneratedForSession,
          currentSessionId: socket.currentSessionId,
          callSessionId: currentCallSessionId,
          shouldGenerate:
            !socket.introGeneratedForSession ||
            socket.currentSessionId !== currentCallSessionId,
          socketId: socket.id,
          component: "mediaSocket",
        });

        if (
          !socket.introGeneratedForSession ||
          socket.currentSessionId !== currentCallSessionId
        ) {
          socket.introGeneratedForSession = true;
          socket.currentSessionId = currentCallSessionId;
          try {
            const ttsCallback = createStreamingTTSCallback(
              data.avatarId,
              socket,
            );

            // Get persona to check if it's a fitness coach
            const persona = await getAvatarPersona(data.avatarId);
            const isFitnessCoach = persona && persona.category === "fitness";

            logger.info("[DEBUG] Persona check", {
              avatarId: data.avatarId,
              personaName: persona?.name,
              category: persona?.category,
              isFitnessCoach,
              socketId: socket.id,
              component: "mediaSocket",
            });

            let introContent =
              "The user just connected to start a new session. Generate a brief, self-aware greeting that: 1) States your name/identity clearly, 2) If you've talked before, specifically mention what you previously discussed or worked on together, 3) If this is your first meeting, introduce yourself and your expertise. Examples: 'Hey! I'm Sarah, your AI stylist. Last time we worked on your business casual wardrobe. Ready to explore more looks?' or 'Hi! I'm Marcus, your venture advisor. Following up on our product-market fit discussion from yesterday. What's on your mind today?' Keep it under 30 words. Be specific about past conversations.";

            // Special intro for fitness coaches
            if (isFitnessCoach) {
              introContent =
                "The user just connected for a fitness session. Generate a brief, energetic greeting that: 1) States your name clearly, 2) Welcomes them to the workout session, 3) Mentions that you're preparing their personalized workout plan. Keep it under 30 words. Example: 'Hey! I'm Jake, your AI fitness coach. Great to see you! I'm preparing your personalized workout plan right now. Let's get you moving!'";
            }

            // Create a system instruction for generating a contextual intro
            const introContext = [
              {
                role: "system",
                content: introContent,
              },
            ];

            await generateLLMResponse(
              "Start the session with a greeting.", // User prompt to trigger generation
              data.avatarId,
              socket,
              currentCallSessionId,
              ttsCallback,
              introContext, // additionalContext with system instruction
              true, // isProactive (intro is proactive)
              data.userId, // pass userId for cross-session history
            );

            // If this is a fitness coach, generate workout plan after intro (but not if workout was just completed)
            if (isFitnessCoach && !socket.workoutCompleted) {
              logger.info("Generating workout plan after intro", {
                socketId: socket.id,
                sessionId: currentCallSessionId,
                workoutCompleted: socket.workoutCompleted,
                component: "mediaSocket",
              });

              try {
                // Check if session is still active
                if (isSessionEnding || !socket.connected) {
                  return;
                }

                workoutPlan = await generateWorkoutPlan(data.userId, {
                  sessionId: currentCallSessionId,
                  avatarId: data.avatarId,
                });

                // Store workout plan in transcript as a string message
                const planMessage = {
                  role: "system",
                  content: `Workout plan generated: ${JSON.stringify(workoutPlan)}`,
                };

                await pool.query(
                  `UPDATE "CallSession" 
                 SET transcript = transcript || $1::jsonb 
                 WHERE id = $2`,
                  [JSON.stringify([planMessage]), currentCallSessionId],
                );

                // Emit workout plan to frontend
                socket.emit("workout_plan_generated", workoutPlan);

                // Check again if session is still active before announcing
                if (isSessionEnding || !socket.connected) {
                  return;
                }

                // Announce workout plan separately
                const exerciseList = workoutPlan.exercises
                  .map(
                    (ex, idx) =>
                      `${idx + 1}. ${ex.exerciseType}: ${ex.sets} sets of ${ex.targetReps} reps`,
                  )
                  .join(", ");

                const planAnnouncementContext = [
                  {
                    role: "system",
                    content: `The workout plan is now ready. Announce the exercises to the user enthusiastically. The plan includes: ${exerciseList}. Example: 'Alright, your workout is ready! Here's what we'll be doing today: ${exerciseList}. I'll use auto-detection to track your movements, so just start with any exercise when you're ready!'`,
                  },
                ];

                // Send workout plan announcement
                await generateLLMResponse(
                  "Announce the workout plan",
                  data.avatarId,
                  socket,
                  currentCallSessionId,
                  ttsCallback,
                  planAnnouncementContext,
                  true, // isProactive
                  data.userId,
                );
              } catch (planError) {
                logger.error("Error generating workout plan", {
                  error: planError.message,
                  userId: data.userId,
                  component: "mediaSocket",
                });
              }
            }
          } catch (introError) {
            logger.error("Error generating avatar intro", {
              error: introError.message,
              socketId: socket.id,
              component: "mediaSocket",
            });
            // Don't fail the session if intro fails
          }
        }
      } catch (error) {
        logger.error("Error creating transcriber", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("error", {
          message: "Failed to initialize transcription service.",
        });
      }
    });

    // --- RECORDING EVENTS ---

    // Start recording session
    socket.on("recording_start", async (data) => {
      try {
        const {
          sessionId,
          avatarId: recAvatarId,
          userId: recUserId,
          mimeType,
        } = data;

        if (!sessionId || !recAvatarId || !recUserId) {
          socket.emit("recording_error", { error: "Missing required fields" });
          return;
        }

        const recordingId = crypto.randomUUID();
        // Create per-recording temp dir via storage service helper
        const tempDir =
          await storageService.createTempRecordingDir(recordingId);

        // Store recording metadata (memory + Redis)
        activeRecordings.set(recordingId, {
          sessionId,
          callSessionId: currentCallSessionId,
          avatarId: recAvatarId,
          userId: recUserId,
          mimeType,
          tempDir,
          chunks: [],
          startTime: Date.now(),
          socketId: socket.id,
          receivedIdx: new Set(), // <-- track indices to detect duplicates
          inFlight: new Set(),
        });

        await setRecordingMeta(recordingId, {
          sessionId,
          callSessionId: currentCallSessionId,
          avatarId: recAvatarId,
          userId: recUserId,
          mimeType,
          tempDir,
          startTime: Date.now(),
          serverId: process.env.SERVER_ID || process.pid,
        });

        currentRecordingId = recordingId;
        logger.info("Started WebSocket recording session", {
          recordingId,
          callSessionId: currentCallSessionId,
          socketId: socket.id,
          component: "mediaSocket",
        });

        socket.emit("recording_started", { recordingId });
      } catch (error) {
        logger.error("Error starting recording", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("recording_error", { error: "Failed to start recording" });
      }
    });

    // Stream recording chunk
    socket.on("recording_chunk", async (meta, binaryPayload) => {
      try {
        const { recordingId, chunkIndex } = meta || {};

        if (!recordingId || binaryPayload == null) {
          return; // Silently ignore malformed chunks
        }

        const recording = activeRecordings.get(recordingId);
        if (!recording) {
          // Ignore stray chunks that arrive after recording is finished
          // This prevents accidental creation of a new recording session
          const payloadSize = binaryPayload ? binaryPayload.length : 0;
          logger.info("Stray chunk ignored", {
            recordingId,
            chunkIndex: chunkIndex,
            size: payloadSize,
            socketId: socket.id,
            component: "mediaSocket",
          });
          return;
        }

        // DEBUG: Log every received chunk
        const payloadSize = binaryPayload ? binaryPayload.length : 0;
        // logger.info("Received recording chunk", {
        //   recordingId,
        //   chunkIndex: chunkIndex,
        //   size: payloadSize,
        //   socketId: socket.id,
        //   component: "mediaSocket",
        // });

        // Ensure Node Buffer (Socket.IO already gives Buffer for binary attachments)
        const chunkBuffer = Buffer.isBuffer(binaryPayload)
          ? binaryPayload
          : Buffer.from(binaryPayload);

        const idx = parseInt(chunkIndex);
        // DUPLICATE DETECTION ----------------------------------
        if (recording.receivedIdx && recording.receivedIdx.has(idx)) {
          logger.warn("Duplicate chunk detected - ignoring", {
            chunkIndex: idx,
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });
          return;
        }
        if (!recording.receivedIdx) recording.receivedIdx = new Set();
        recording.receivedIdx.add(idx);
        // ------------------------------------------------------

        // Convert base64 chunk to buffer and validate header
        if (idx === 0) {
          if (chunkBuffer[0] !== 0x1a || chunkBuffer[1] !== 0x45) {
            logger.warn("Chunk 0 missing EBML header", {
              recordingId,
              socketId: socket.id,
              component: "mediaSocket",
            });
          }
        } else {
          // For subsequent chunks just log first two bytes for diagnostics in hex
        }

        const chunkPath = path.join(
          recording.tempDir,
          `chunk_${chunkIndex.toString().padStart(6, "0")}.webm`,
        );
        // Write only if file doesn\'t already exist (extra safety)
        const writePromise = (async () => {
          try {
            await fs.access(chunkPath);
            logger.warn("File already exists for chunk - skipping write", {
              chunkIndex: idx,
              chunkPath,
              recordingId,
              socketId: socket.id,
              component: "mediaSocket",
            });
          } catch {
            await fs.writeFile(chunkPath, chunkBuffer);
          }
        })();
        recording.inFlight.add(writePromise);
        try {
          await writePromise;
        } finally {
          recording.inFlight.delete(writePromise);
        }

        // Track chunk metadata (only once)
        if (!recording.chunks.some((c) => c.index === idx)) {
          recording.chunks.push({
            index: idx,
            path: chunkPath,
            size: chunkBuffer.length,
          });
          await addChunkPath(recordingId, chunkPath);
        }
      } catch (error) {
        logger.error("Error processing audio chunk", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        // Don't emit error to avoid spamming client
      }
    });

    // Finish recording
    socket.on("recording_finish", async (data) => {
      try {
        const { recordingId, lastChunkIndex, totalChunks, duration } = data;
        const effectiveLastIndex =
          typeof lastChunkIndex === "number"
            ? lastChunkIndex
            : typeof totalChunks === "number"
              ? totalChunks - 1
              : null;

        const recording = activeRecordings.get(recordingId);
        if (!recording) {
          socket.emit("recording_error", {
            error: "Recording session not found",
          });
          return;
        }

        logger.info("Finalizing WebSocket recording", {
          recordingId,
          reportedLastChunkIndex: effectiveLastIndex,
          receivedChunks: recording.chunks.length,
          socketId: socket.id,
          component: "mediaSocket",
        });

        // Await any in-flight fs writes to finish
        if (recording.inFlight && recording.inFlight.size) {
          logger.info("Waiting for in-flight writes", {
            inFlightCount: recording.inFlight.size,
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });
          await Promise.all([...recording.inFlight]);
        }

        // Wait until chunk list size stabilises (handle races between final dataavailable and finish)
        let prevCount;
        do {
          prevCount = recording.chunks.length;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 300));
        } while (recording.chunks.length !== prevCount);

        if (recording.chunks.length === 0) {
          logger.warn("No chunks received - aborting recording", {
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });
          await clearRecordingKeys(recordingId);
          activeRecordings.delete(recordingId);
          socket.emit("recording_error", { error: "No chunks received" });
          return;
        }

        let videoUrl = null;
        let thumbnailUrl = null;
        let processedDuration = duration || 0;
        let fileSize = 0;

        try {
          // Merge by piping all chunks through stdin to FFmpeg. This avoids
          // the concat demuxer requirement that every segment have its own
          // WebM header (only the first MediaRecorder chunk does).

          logger.info("Merging chunks via FFmpeg stdin", {
            chunkCount: recording.chunks.length,
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });

          const sortedChunks = recording.chunks.sort(
            (a, b) => a.index - b.index,
          );

          const { spawn } = await import("child_process");
          const ffmpegPath = (await import("ffmpeg-static")).default;

          const outputIsMp4 =
            recording.mimeType && recording.mimeType.includes("mp4");
          const outputPath = path.join(
            recording.tempDir,
            outputIsMp4 ? "final_video.mp4" : "final_video.webm",
          );

          const runFfmpeg = (ffmpegArgs) =>
            new Promise((resolve, reject) => {
              logger.info("FFmpeg args selected", {
                args: ffmpegArgs.join(" "),
                recordingId,
                mimeType: recording.mimeType,
                component: "mediaSocket",
              });

              const ff = spawn(ffmpegPath, ffmpegArgs);

              ff.stderr.on("data", (d) => {
                logger.info("FFmpeg output", {
                  output: d.toString(),
                  recordingId,
                  socketId: socket.id,
                  component: "mediaSocket",
                });
              });

              ff.on("error", reject);
              ff.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited ${code}`));
              });

              (async () => {
                try {
                  for (const c of sortedChunks) {
                    const buf = await fs.readFile(c.path);
                    ff.stdin.write(buf);
                  }
                  ff.stdin.end();
                } catch (pipeErr) {
                  reject(pipeErr);
                }
              })();
            });

          const attemptCopyArgs = [
            "-f",
            "webm",
            "-i",
            "pipe:0",
            "-c",
            "copy",
            "-y",
            outputPath,
          ];

          let succeeded = false;

          try {
            if (!outputIsMp4) {
              // Fast path – copy WebM without re-encode
              await runFfmpeg(attemptCopyArgs);
              succeeded = true;
            }
          } catch (copyErr) {
            logger.warn("Fast WebM copy failed – falling back to encode", {
              error: copyErr.message,
              recordingId,
              component: "mediaSocket",
            });
          }

          if (!succeeded) {
            // Build slower encode / remux args
            const encodeArgs = outputIsMp4
              ? [
                  "-f",
                  "mp4",
                  "-i",
                  "pipe:0",
                  "-c",
                  "copy",
                  "-movflags",
                  "+faststart",
                  "-y",
                  outputPath,
                ]
              : [
                  "-f",
                  "webm",
                  "-i",
                  "pipe:0",
                  "-c:v",
                  "libx264",
                  "-preset",
                  "ultrafast",
                  "-crf",
                  "28",
                  "-pix_fmt",
                  "yuv420p",
                  "-c:a",
                  "aac",
                  "-b:a",
                  "128k",
                  "-movflags",
                  "+faststart",
                  "-y",
                  outputPath,
                ];

            await runFfmpeg(encodeArgs);
          }

          // Read the merged buffer
          const videoBuffer = await fs.readFile(outputPath);
          const mimeTypeForUpload = outputIsMp4 ? "video/mp4" : "video/webm";
          fileSize = videoBuffer.length;

          // Process video (generate thumbnail, validate, etc.)
          const processedData =
            await storageService.processVideoBuffer(videoBuffer);
          processedDuration = processedData.duration || duration || 0;

          // Save video locally and use local URLs
          const videoKey = outputIsMp4
            ? `recordings/${recordingId}/video.mp4`
            : `recordings/${recordingId}/video.webm`;
          const thumbnailKey = `recordings/${recordingId}/thumbnail.jpg`;

          videoUrl = await storageService.uploadFile(
            videoKey,
            videoBuffer,
            mimeTypeForUpload,
          );

          if (
            processedData.thumbnailBuffer &&
            processedData.thumbnailBuffer.length > 0
          ) {
            thumbnailUrl = await storageService.uploadFile(
              thumbnailKey,
              processedData.thumbnailBuffer,
              "image/jpeg",
            );
          }
        } catch (videoError) {
          logger.error(
            "Video processing failed, saving recording without video",
            {
              error: videoError.message,
              recordingId,
              socketId: socket.id,
              component: "mediaSocket",
            },
          );
          // Continue without video - save recording metadata only
        }

        // Always save recording to database (even if video processing failed)
        try {
          await pool.query(
            `
            INSERT INTO "SessionRecording" 
            (id, session_id, user_id, avatar_id, call_session_id, video_url, thumbnail_url, duration_sec, created_at, file_size)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
            RETURNING *
          `,
            [
              recordingId,
              recording.sessionId,
              recording.userId,
              recording.avatarId,
              recording.callSessionId,
              videoUrl,
              thumbnailUrl,
              processedDuration,
              fileSize,
            ],
          );

          logger.info("WebSocket recording saved to database", {
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });
        } catch (dbError) {
          logger.error("Database insert failed", {
            error: dbError.message,
            recordingId,
            socketId: socket.id,
            component: "mediaSocket",
          });
          socket.emit("recording_error", {
            error: "Failed to save recording to database",
          });
          return;
        }

        // Cleanup temp files AFTER video processing and database insert
        await storageService.cleanupTempDir(recording.tempDir);
        logger.info("Cleaned up temp files for recording", {
          recordingId,
          socketId: socket.id,
          component: "mediaSocket",
        });

        await clearRecordingKeys(recordingId);

        activeRecordings.delete(recordingId);
        currentRecordingId = null;

        logger.info("WebSocket recording finalized and saved", {
          recordingId,
          socketId: socket.id,
          component: "mediaSocket",
        });

        socket.emit("recording_finished", {
          recordingId,
          videoUrl,
          thumbnailUrl,
          duration: processedDuration,
        });

        // --- MISSING CHUNK REPORT (after all writes) -----------------------
        if (typeof effectiveLastIndex === "number") {
          const expectedTotal = effectiveLastIndex + 1;
          if (
            recording.receivedIdx &&
            recording.receivedIdx.size < expectedTotal
          ) {
            const missing = [];
            for (let i = 0; i <= effectiveLastIndex; i++) {
              if (!recording.receivedIdx.has(i)) missing.push(i);
            }
            if (missing.length) {
              logger.warn("Missing chunks detected", {
                recordingId,
                missingChunks: missing.slice(0, 20),
                totalMissing: missing.length,
                socketId: socket.id,
                component: "mediaSocket",
              });
            }
          }
        }
        // -------------------------------------------------------------------
      } catch (error) {
        logger.error("Error finalizing recording", {
          error: error.message,
          recordingId,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("recording_error", {
          error: "Failed to finalize recording",
        });
      }
    });

    // --- END RECORDING EVENTS ---

    // Pipe audio chunks to the transcriber
    socket.on("audio_chunk", (audioData) => {
      if (transcriber) {
        transcriber.send(audioData);
      } else {
        logger.warn("[Media Socket] No transcriber available for audio chunk", {
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
    });

    // The 'speech_end' event from the client is no longer the authority.
    // The server-side VAD will determine when speech ends.
    socket.on("speech_end", () => {
      // This could be used to manually force an endpoint if needed, but for now we trust the VAD
      logger.info(
        "Received speech_end from client, but server VAD is in control",
        { socketId: socket.id, component: "mediaSocket" },
      );
    });

    // Clean up on session end
    socket.on("end_session", async () => {
      logger.info("Session ended", {
        socketId: socket.id,
        component: "mediaSocket",
      });

      // --- Stop Credit Charging ---
      if (creditTimer) {
        clearInterval(creditTimer);
        creditTimer = null;
        logger.info("Stopped charging timer", {
          totalCreditsSpent,
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
      // ---------------------------

      // --- Clean up any active recording ---
      if (currentRecordingId) {
        const recording = activeRecordings.get(currentRecordingId);
        if (recording) {
          // Don't delete files if recording is still being finalized
          // The recording_finish event will handle cleanup
          logger.info(
            "Recording session will be cleaned up by recording_finish event",
            {
              recordingId: currentRecordingId,
              socketId: socket.id,
              component: "mediaSocket",
            },
          );
        }
        currentRecordingId = null;
      }
      // ---------------------------

      // --- Log CallSession End ---
      if (currentCallSessionId) {
        try {
          await pool.query(
            `UPDATE "CallSession" SET ended_at = NOW(), credits_spent = $1 WHERE id = $2;`,
            [totalCreditsSpent, currentCallSessionId],
          );
          logger.info("Ended CallSession", {
            callSessionId: currentCallSessionId,
            creditsSpent: totalCreditsSpent,
            socketId: socket.id,
            component: "mediaSocket",
          });
          currentCallSessionId = null; // Clear the ID
        } catch (dbError) {
          logger.error("Error ending CallSession", {
            error: dbError.message,
            socketId: socket.id,
            component: "mediaSocket",
          });
        }
      }
      // --------------------------

      if (transcriber) {
        transcriber.close();
        transcriber = null;
      } else {
        // This handles the case where end_session arrives before the transcriber has finished initializing
        logger.info(
          "No active transcriber, setting flag to end session upon creation",
          { socketId: socket.id, component: "mediaSocket" },
        );
        isSessionEnding = true;
      }

      sessionInitialized = false;
    });

    // **EXERCISE MILESTONE**: Handle special milestone events (PRs, achievements)
    socket.on("exercise_milestone", async (data) => {
      const { exercise, reps, formScore, sessionId, setComplete } = data;

      logger.info("[EXERCISE] Milestone achieved", {
        exercise,
        reps,
        formScore,
        setComplete,
        sessionId,
        socketId: socket.id,
        component: "mediaSocket",
      });

      // Initialize tracking if needed
      if (!socket.coachTracking) {
        socket.coachTracking = {
          lastFormFeedbackTime: 0,
          lastPlankEncouragementTime: 0,
          completedSets: new Set(),
          currentExerciseSessionId: sessionId || `${exercise}-${Date.now()}`,
        };
      }

      // Check if this session has already been completed
      if (
        socket.coachTracking &&
        socket.coachTracking.currentExerciseSessionId &&
        socket.coachTracking.completedSets &&
        socket.coachTracking.completedSets.has(
          socket.coachTracking.currentExerciseSessionId,
        )
      ) {
        return;
      }

      // Mark this specific exercise session as complete if indicated
      if (
        setComplete &&
        socket.coachTracking &&
        socket.coachTracking.currentExerciseSessionId
      ) {
        if (!socket.coachTracking.completedSets) {
          socket.coachTracking.completedSets = new Set();
        }
        socket.coachTracking.completedSets.add(
          socket.coachTracking.currentExerciseSessionId,
        );
        logger.info("[EXERCISE] Marked session as complete", {
          sessionId: socket.coachTracking.currentExerciseSessionId,
          component: "mediaSocket",
        });
      }

      try {
        // Store exercise milestone in call session transcript
        if (currentCallSessionId && userId) {
          const exerciseMessage = {
            role: "user",
            content: `[Exercise Completed] ${exercise}: ${reps} reps (Form Score: ${Math.round(formScore * 100)}%)`,
            timestamp: new Date().toISOString(),
          };

          // Update call session transcript
          await pool.query(
            `UPDATE "CallSession" 
            SET transcript = COALESCE(transcript, '[]'::jsonb) || $1::jsonb
            WHERE id = $2`,
            [JSON.stringify([exerciseMessage]), currentCallSessionId],
          );

          logger.info("[EXERCISE] Stored in call session transcript", {
            userId,
            avatarId,
            currentCallSessionId,
            exercise,
            reps,
            component: "mediaSocket",
          });
        }

        // No celebration for individual sets - only announce next exercise
        // Celebrations are reserved for complete workout only
      } catch (error) {
        logger.error("Error processing exercise milestone", {
          error: error.message,
          exercise,
          reps,
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
    });

    // **AMAZON PURCHASE EVENTS**: Handle product display and purchase completion
    socket.on("display_products", async (data) => {
      try {
        const { products, sessionId } = data;

        logger.info("Emitting products display", {
          productCount: products?.length || 0,
          sessionId,
          callSessionId: currentCallSessionId,
          component: "amazon-purchase",
        });

        // Emit to the current session room
        if (currentCallSessionId) {
          mediaNamespace
            .to(`session:${currentCallSessionId}`)
            .emit("products-display", {
              products,
              sessionId: currentCallSessionId,
              timestamp: Date.now(),
            });
        }

        // Also emit directly to the socket that requested it
        socket.emit("products-display", {
          products,
          sessionId: currentCallSessionId,
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error("Error displaying products", {
          error: error.message,
          socketId: socket.id,
          component: "amazon-purchase",
        });

        socket.emit("products-display-error", {
          error: "Failed to display products",
        });
      }
    });

    socket.on("purchase_completed", async (data) => {
      try {
        const { orderId, asin, status, txHash } = data;

        logger.info("Emitting purchase completion", {
          orderId,
          asin,
          status,
          txHash: txHash ? `${txHash.slice(0, 10)}...` : null,
          callSessionId: currentCallSessionId,
          component: "amazon-purchase",
        });

        const purchaseData = {
          orderId,
          asin,
          status,
          txHash,
          callSessionId: currentCallSessionId,
          timestamp: Date.now(),
        };

        // Emit to the current session room
        if (currentCallSessionId) {
          mediaNamespace
            .to(`session:${currentCallSessionId}`)
            .emit("purchase-completed", purchaseData);
        }

        // Also emit directly to the socket
        socket.emit("purchase-completed", purchaseData);
      } catch (error) {
        logger.error("Error emitting purchase completion", {
          error: error.message,
          socketId: socket.id,
          component: "amazon-purchase",
        });
      }
    });

    // Enhanced Purchase Flow Events
    socket.on("product-selected", async (data) => {
      try {
        const { product, sessionId } = data;

        logger.info("Product selected for purchase", {
          product: product.name,
          asin: product.asin,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleProductSelected(
          socket,
          sessionId || currentCallSessionId,
          {
            productName: product.name,
            asin: product.asin,
            price: product.price,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling product selection", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("wallet-connected", async (data) => {
      try {
        const { address, chainId, sessionId } = data;

        logger.info("Wallet connected", {
          address: address?.slice(0, 6) + "..." + address?.slice(-4),
          chainId,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleWalletConnected(
          socket,
          sessionId || currentCallSessionId,
          {
            address,
            chainId,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling wallet connection", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("wallet-disconnected", async (data) => {
      try {
        const { sessionId } = data;

        logger.info("Wallet disconnected", {
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleWalletDisconnected(
          socket,
          sessionId || currentCallSessionId,
        );
      } catch (error) {
        logger.error("Error handling wallet disconnection", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("crypto-payment-initiated", async (data) => {
      try {
        const { amount, currency, sessionId } = data;

        logger.info("Crypto payment initiated", {
          amount,
          currency,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleCryptoPaymentInitiated(
          socket,
          sessionId || currentCallSessionId,
          {
            amount,
            currency,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling crypto payment initiation", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("transaction-pending", async (data) => {
      try {
        const { txHash, amount, currency, sessionId } = data;

        logger.info("Transaction pending", {
          txHash: txHash?.slice(0, 10) + "...",
          amount,
          currency,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleTransactionPending(
          socket,
          sessionId || currentCallSessionId,
          {
            txHash,
            amount,
            currency,
            explorerUrl: `https://basescan.org/tx/${txHash}`,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling transaction pending", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("transaction-confirmed", async (data) => {
      try {
        const { txHash, amount, currency, sessionId } = data;

        logger.info("Transaction confirmed", {
          txHash: txHash?.slice(0, 10) + "...",
          amount,
          currency,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleTransactionConfirmed(
          socket,
          sessionId || currentCallSessionId,
          {
            txHash,
            amount,
            currency,
            explorerUrl: `https://basescan.org/tx/${txHash}`,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling transaction confirmation", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("purchase-failed", async (data) => {
      try {
        const { error, errorType, sessionId, txHash } = data;

        logger.error("Purchase failed", {
          error,
          errorType,
          txHash: txHash?.slice(0, 10) + "...",
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handlePurchaseFailed(
          socket,
          sessionId || currentCallSessionId,
          {
            error,
            errorType,
            txHash,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling purchase failure", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    socket.on("insufficient-funds", async (data) => {
      try {
        const { required, available, currency, sessionId } = data;

        logger.info("Insufficient funds detected", {
          required,
          available,
          currency,
          sessionId,
          component: "purchase-flow",
        });

        PurchaseFlowEventHandler.handleInsufficientFunds(
          socket,
          sessionId || currentCallSessionId,
          {
            required,
            available,
            currency,
            timestamp: Date.now(),
          },
        );
      } catch (error) {
        logger.error("Error handling insufficient funds", {
          error: error.message,
          socketId: socket.id,
          component: "purchase-flow",
        });
      }
    });

    // Clean up on disconnect
    socket.on("disconnect", async () => {
      if (creditTimer) {
        clearInterval(creditTimer);
        creditTimer = null;
        logger.info("Stopped charging timer on disconnect", {
          totalCreditsSpent,
          socketId: socket.id,
          component: "mediaSocket",
        });
      }

      if (currentCallSessionId) {
        try {
          await pool.query(
            `UPDATE "CallSession" SET ended_at = NOW(), credits_spent = $1 WHERE id = $2;`,
            [totalCreditsSpent, currentCallSessionId],
          );
          logger.info("Ended CallSession on disconnect", {
            callSessionId: currentCallSessionId,
            creditsSpent: totalCreditsSpent,
            socketId: socket.id,
            component: "mediaSocket",
          });
          currentCallSessionId = null;
        } catch (dbError) {
          logger.error("Error ending CallSession on disconnect", {
            error: dbError.message,
            socketId: socket.id,
            component: "mediaSocket",
          });
        }
      }

      sessionInitialized = false;

      if (transcriber) {
        transcriber.close();
        transcriber = null;
      }

      // Verify all event listeners have been cleaned up
      if (eventListeners.size > 0) {
        const remainingEvents = Array.from(eventListeners.keys());
        const listenerCounts = {};
        eventListeners.forEach((listeners, event) => {
          listenerCounts[event] = listeners.size;
        });

        logger.warn("Uncleaned event listeners detected on disconnect", {
          socketId: socket.id,
          totalEvents: eventListeners.size,
          events: remainingEvents,
          listenerCounts,
          component: "mediaSocket",
        });

        // Force cleanup of remaining listeners
        remainingEvents.forEach((event) => {
          socket.removeAllListeners(event);
        });
        eventListeners.clear();
      } else {
        logger.info("All event listeners properly cleaned up", {
          socketId: socket.id,
          component: "mediaSocket",
        });
      }

      logger.info("Client disconnected from media", {
        socketId: socket.id,
        component: "mediaSocket",
      });
    });

    socket.on("error", (error) => {
      logger.error("Socket error occurred", {
        error: error.message,
        socketId: socket.id,
        component: "mediaSocket",
      });
      if (transcriber) {
        transcriber.close();
        transcriber = null;
      }
    });

    socket.on("turn_end", () => {
      if (transcriber && transcriber.endTurn) {
        logger.info("Turn end received, forwarding to transcriber", {
          socketId: socket.id,
          component: "mediaSocket",
        });
        transcriber.endTurn();
      } else {
        logger.info("Turn end received but no active transcriber", {
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
    });

    // **INTERRUPTION HANDLING**: Handle user interruptions during avatar speech
    socket.on("user_spoke", async (data) => {
      logger.info("Received user_spoke event", {
        data,
        socketId: socket.id,
        component: "mediaSocket",
      });

      if (!avatarId) {
        logger.warn("No avatar ID available, skipping interruption response", {
          socketId: socket.id,
          component: "mediaSocket",
        });
        return;
      }

      try {
        // Generate natural interruption response
        const interruptionResponse = await generateInterruptionResponse(
          avatarId,
          data,
        );
        logger.info("Generated interruption response", {
          response: interruptionResponse,
          socketId: socket.id,
          component: "mediaSocket",
        });

        // Stream the interruption response with high priority
        const ttsCallback = createStreamingTTSCallback(avatarId, socket);
        socket.emit("llm_response_chunk", {
          chunk: interruptionResponse,
          isInterruption: true,
        });

        // Process TTS for interruption response
        await ttsCallback.onChunk(interruptionResponse);
        await ttsCallback.onComplete();

        socket.emit("llm_response_complete", { isInterruption: true });
      } catch (error) {
        logger.error("Error handling interruption", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
    });

    // **TEXT INPUT HANDLING**: Handle direct text input from chat
    socket.on("text_input", async (data) => {
      logger.info("Received text input", {
        text: data.text,
        socketId: socket.id,
        component: "mediaSocket",
      });

      if (!data.text || !data.text.trim()) {
        logger.warn("Empty text input - skipping", {
          socketId: socket.id,
          component: "mediaSocket",
        });
        return;
      }

      const inputText = data.text.trim();

      // Mark that user has interacted
      socket.hasUserInteracted = true;

      try {
        // **ENSURE CALL SESSION EXISTS**: Create CallSession for text-only conversations
        const sessionUserId = data.userId || userId;
        const sessionAvatarId = data.avatarId || avatarId;

        if (!currentCallSessionId && sessionAvatarId && sessionUserId) {
          logger.info(
            "No active CallSession, creating one for text conversation",
            {
              sessionUserId,
              sessionAvatarId,
              socketId: socket.id,
              component: "mediaSocket",
            },
          );
          try {
            const sessionResult = await pool.query(
              `INSERT INTO "CallSession" (user_id, avatar_id, started_at, transcript)
               VALUES ($1, $2, NOW(), '[]'::jsonb)
               RETURNING id;`,
              [sessionUserId, sessionAvatarId],
            );
            currentCallSessionId = sessionResult.rows[0].id;
            logger.info("Created CallSession for text chat", {
              callSessionId: currentCallSessionId,
              socketId: socket.id,
              component: "mediaSocket",
            });

            // Create corresponding Project
            const projectResult = await pool.query(
              `INSERT INTO "Project" (owner_id, title, call_session_id, meta)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id;`,
              [
                sessionUserId,
                `Text Chat Session ${currentCallSessionId}`,
                currentCallSessionId,
                JSON.stringify({ source: "text_chat" }),
              ],
            );
            logger.info("Created Project for text chat", {
              projectId: projectResult.rows[0].id,
              callSessionId: currentCallSessionId,
              socketId: socket.id,
              component: "mediaSocket",
            });

            // Set socket-level variables for future use
            if (!userId) userId = sessionUserId;
            if (!avatarId) avatarId = sessionAvatarId;
          } catch (dbError) {
            logger.error("Error creating CallSession for text chat", {
              error: dbError.message,
              socketId: socket.id,
              component: "mediaSocket",
            });
          }
        }

        // Emit transcription events for consistency with voice flow
        socket.emit("transcription_final", { text: inputText });

        // Check if user is requesting a different workout after completion
        const lowerInput = inputText.toLowerCase();
        const isRequestingNewWorkout =
          socket.workoutCompleted &&
          (lowerInput.includes("different workout") ||
            lowerInput.includes("new workout") ||
            lowerInput.includes("another workout") ||
            lowerInput.includes("different routine"));

        if (isRequestingNewWorkout) {
          logger.info("User requested different workout after completion", {
            socketId: socket.id,
            sessionId: currentCallSessionId,
            component: "mediaSocket",
          });

          // Reset workout completion flag
          socket.workoutCompleted = false;

          // Generate new workout plan
          try {
            const newWorkoutPlan = await generateWorkoutPlan(sessionUserId, {
              sessionId: currentCallSessionId,
              avatarId: sessionAvatarId,
              requestType: "different", // Mark as different workout request
            });

            // Store workout plan in transcript
            const planMessage = {
              role: "system",
              content: `New workout plan generated: ${JSON.stringify(newWorkoutPlan)}`,
            };

            await pool.query(
              `UPDATE "CallSession" 
               SET transcript = transcript || $1::jsonb 
               WHERE id = $2`,
              [JSON.stringify([planMessage]), currentCallSessionId],
            );

            // Emit new workout plan to frontend
            socket.emit("workout_plan_generated", newWorkoutPlan);

            // Announce the new workout
            const exerciseList = newWorkoutPlan.exercises
              .map(
                (ex, idx) =>
                  `${idx + 1}. ${ex.exerciseType}: ${ex.sets} sets of ${ex.targetReps} reps`,
              )
              .join(", ");

            const newPlanResponse = `Great! I've prepared a different workout for you. Here's your new routine: ${exerciseList}. Remember, I'll use auto-detection to track your movements. Start with any exercise when you're ready!`;

            const ttsCallback = createStreamingTTSCallback(
              sessionAvatarId,
              socket,
            );
            await generateLLMResponse(
              newPlanResponse,
              sessionAvatarId,
              socket,
              currentCallSessionId,
              ttsCallback,
              [],
              true, // isProactive
            );

            return; // Skip normal LLM processing
          } catch (error) {
            logger.error("Error generating new workout plan", {
              error: error.message,
              socketId: socket.id,
              component: "mediaSocket",
            });
          }
        }

        // Process through LLM and TTS pipeline
        const ttsCallback = createStreamingTTSCallback(sessionAvatarId, socket);

        logger.info("Processing through LLM pipeline", {
          inputText,
          sessionId: currentCallSessionId,
          socketId: socket.id,
          component: "mediaSocket",
        });
        // Check if we have a recent image to include with the user's message
        let messageContent = inputText;
        // Include image if available within last 5 minutes (300000ms)
        if (
          socket.lastVisionImage &&
          Date.now() - socket.lastVisionImage.timestamp < 300000
        ) {
          // Convert text message to multimodal message with image
          messageContent = [
            {
              type: "text",
              text: inputText,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${socket.lastVisionImage.data}`,
              },
            },
          ];
        }

        await generateLLMResponse(
          messageContent,
          sessionAvatarId,
          socket,
          currentCallSessionId,
          ttsCallback,
          [], // additionalContext
          false, // isProactive
          userId, // pass userId for cross-session history
        );

        logger.info("Completed processing text input", {
          inputText,
          socketId: socket.id,
          component: "mediaSocket",
        });
      } catch (error) {
        logger.error("Error processing text input", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("error", { message: "Failed to process text input." });
      }
    });

    // **AVATAR SPEAKING TRACKING**: Track when avatar starts/stops speaking
    socket.on("avatar_speaking_start", () => {
      isAvatarSpeaking = true;

      if (transcriber && transcriber.setAvatarSpeaking) {
        transcriber.setAvatarSpeaking(true);
      }
    });

    socket.on("avatar_speaking_end", () => {
      isAvatarSpeaking = false;
      logger.info("Avatar stopped speaking", {
        socketId: socket.id,
        component: "mediaSocket",
      });
      if (transcriber && transcriber.setAvatarSpeaking) {
        transcriber.setAvatarSpeaking(false);
      }
    });

    // Handle vision enabled state change
    socket.on("set_vision_enabled", (data) => {
      visionEnabled = data.enabled;
      logger.info("[VISION] Vision enabled state changed", {
        enabled: visionEnabled,
        socketId: socket.id,
        component: "mediaSocket",
      });
    });

    // **EXERCISE TRACKING**: Handle pose data updates from fitness coach sessions
    socket.on("exercise_update", async (data) => {
      const { sessionId, exercise, repCount, formScore, formCorrections } =
        data;

      try {
        if (!currentCallSessionId) {
          socket.emit("exercise_error", { error: "No active session" });
          return;
        }

        // Skip all updates if this specific exercise session is complete
        if (
          socket.coachTracking &&
          socket.coachTracking.currentExerciseSessionId &&
          socket.coachTracking.completedSets &&
          socket.coachTracking.completedSets.has(
            socket.coachTracking.currentExerciseSessionId,
          )
        ) {
          logger.info("[EXERCISE] Ignoring update - set already complete", {
            exercise,
            repCount,
            sessionId: socket.coachTracking.currentExerciseSessionId,
            component: "mediaSocket",
          });
          return;
        }

        // Initialize tracking for this socket if needed
        if (!socket.coachTracking) {
          socket.coachTracking = {
            lastFormFeedbackTime: 0,
            lastPlankEncouragementTime: 0,
            completedSets: new Set(),
            exerciseStartTime: Date.now(),
            lastPeriodicFeedbackTime: 0,
            totalReps: 0,
            recentFormScores: [],
          };
        }

        const now = Date.now();

        // Initialize exercise start time if not set (for auto-detection without new_exercise_started event)
        if (!socket.coachTracking.exerciseStartTime) {
          socket.coachTracking.exerciseStartTime = now;
          socket.coachTracking.lastPeriodicFeedbackTime = 0;
          socket.coachTracking.totalReps = 0;
          socket.coachTracking.recentFormScores = [];
        }

        // Update tracking data
        if (socket.coachTracking.totalReps !== undefined) {
          socket.coachTracking.totalReps = repCount;
        }
        if (socket.coachTracking.recentFormScores) {
          socket.coachTracking.recentFormScores.push(formScore);
          // Keep only last 10 form scores
          if (socket.coachTracking.recentFormScores.length > 10) {
            socket.coachTracking.recentFormScores.shift();
          }
        }

        // TIME-BASED PERIODIC FEEDBACK
        const timeSinceStart =
          now - (socket.coachTracking.exerciseStartTime || now);
        const timeSinceLastPeriodic =
          now - (socket.coachTracking.lastPeriodicFeedbackTime || 0);
        const PERIODIC_FEEDBACK_INTERVAL = 15000; // 15 seconds

        // Give periodic feedback based on time and progress
        // Check if avatar is still speaking to prevent overlaps
        if (
          timeSinceLastPeriodic >= PERIODIC_FEEDBACK_INTERVAL &&
          timeSinceStart > 5000 &&
          !isAvatarSpeaking
        ) {
          socket.coachTracking.lastPeriodicFeedbackTime = now;

          // Calculate average form score
          const avgFormScore =
            socket.coachTracking.recentFormScores.length > 0
              ? socket.coachTracking.recentFormScores.reduce(
                  (a, b) => a + b,
                  0,
                ) / socket.coachTracking.recentFormScores.length
              : formScore;

          // Generate time-based feedback
          const timeSeconds = Math.floor(timeSinceStart / 1000);
          const progressRate = repCount / (timeSeconds / 60); // reps per minute

          // Generate appropriate context based on exercise state
          let periodicContext = "";
          const encouragementNumber = Math.floor(Math.random() * 3) + 1; // Random 1-3 for variety

          if (exercise === EXERCISE.PLANKS) {
            if (avgFormScore < 0.6) {
              periodicContext = `User's plank form is dropping (${Math.round(avgFormScore * 100)}% score). Time: ${timeSeconds}s. Give a specific form correction tip that's different from previous feedback. Be conversational and aware you're in an ongoing workout.`;
            } else if (timeSeconds < 15) {
              periodicContext = `User just started their plank (${timeSeconds}s so far). Give early encouragement and a breathing reminder. Don't repeat previous messages.`;
            } else if (timeSeconds >= 60) {
              periodicContext = `User has been holding plank for ${timeSeconds} seconds! This is impressive. Give unique, enthusiastic praise acknowledging this specific milestone. Vary from previous compliments.`;
            } else {
              const contexts = [
                `User at ${timeSeconds}s plank, form ${Math.round(avgFormScore * 100)}%. Give a motivational check-in that feels natural in conversation.`,
                `Plank update: ${timeSeconds}s elapsed, maintaining ${Math.round(avgFormScore * 100)}% form. Share a technique tip or mental focus cue.`,
                `${timeSeconds} seconds into plank with solid form. Encourage differently than before - maybe mention core engagement or breathing.`,
              ];
              periodicContext = contexts[encouragementNumber - 1];
            }
          } else {
            if (avgFormScore < 0.6) {
              periodicContext = `User's ${exercise} form needs work (${Math.round(avgFormScore * 100)}% score) after ${repCount} reps. Give a specific, actionable form tip that builds on previous feedback without repeating.`;
            } else if (progressRate < 10) {
              periodicContext = `User doing ${exercise} slowly: ${repCount} reps in ${timeSeconds}s. Acknowledge their controlled pace positively and encourage consistency. Be conversational, not robotic.`;
            } else if (progressRate > 40) {
              periodicContext = `User's ${exercise} pace is very fast (${Math.round(progressRate)} reps/min). Remind about form over speed in a new way, referencing their progress so far.`;
            } else {
              const contexts = [
                `${repCount} ${exercise} completed in ${timeSeconds}s, ${Math.round(avgFormScore * 100)}% form quality. Give varied encouragement that feels like natural coaching.`,
                `Progress update: ${repCount} reps done. The user is maintaining good form. Offer a fresh motivational insight or technique reminder.`,
                `User crushing ${exercise} - ${repCount} reps with ${Math.round(avgFormScore * 100)}% form score. Celebrate their consistency with unique praise.`,
              ];
              periodicContext = contexts[encouragementNumber - 1];
            }
          }

          // Add instruction to be conversational and avoid repetition
          periodicContext += ` Keep it to 10-15 words. Be aware this is ongoing exercise coaching - reference their journey and progress naturally. Don't repeat phrases from the last few messages.`;

          // Use generateLLMResponse for proper persistence
          const ttsCallback = createStreamingTTSCallback(avatarId, socket);
          await generateLLMResponse(
            periodicContext,
            avatarId,
            socket,
            currentCallSessionId,
            ttsCallback,
            [], // additionalContext
            true, // isProactive
            userId,
          );
        }

        // FORM CORRECTION FEEDBACK
        if (formScore < 0.7 && formCorrections?.length > 0) {
          const timeSinceLastFeedback =
            now - socket.coachTracking.lastFormFeedbackTime;
          const FORM_FEEDBACK_COOLDOWN = 5000; // 5 seconds

          logger.info("[EXERCISE] Form correction check", {
            exercise,
            formScore,
            needsCorrection: formScore < 0.7,
            hasCorrections: formCorrections?.length > 0,
            corrections: formCorrections,
            timeSinceLastFeedback,
            cooldownMet: timeSinceLastFeedback > FORM_FEEDBACK_COOLDOWN,
            component: "mediaSocket",
          });

          if (timeSinceLastFeedback > FORM_FEEDBACK_COOLDOWN) {
            socket.coachTracking.lastFormFeedbackTime = now;

            const formContext = `During ${exercise}, user's form issue: "${formCorrections[0]}". Provide a specific, encouraging correction that builds on conversation history. Be aware of what corrections you've already given. Keep it conversational and supportive (10-15 words).`;

            logger.info("[EXERCISE] Sending form correction", {
              formContext,
              avatarId,
              component: "mediaSocket",
            });

            // Use generateLLMResponse for proper persistence
            const ttsCallback = createStreamingTTSCallback(avatarId, socket);
            await generateLLMResponse(
              formContext,
              avatarId,
              socket,
              currentCallSessionId,
              ttsCallback,
              [], // additionalContext
              true, // isProactive
              userId,
            );
          }
        }

        // REMOVED: Plank-specific time encouragement - now handled by general periodic feedback
        // REMOVED: Rep-based milestone feedback to reduce interruptions
        // Feedback is now time-based (every 5 seconds) and on workout completion only

        // Emit acknowledgment
        socket.emit("exercise_update_ack", {
          sessionId,
          repCount,
          processed: true,
        });
      } catch (error) {
        logger.error("Error processing exercise update", {
          error: error.message,
          sessionId,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("exercise_error", {
          error: "Failed to process exercise update",
        });
      }
    });

    // **WRONG EXERCISE CORRECTION**: Handle when user does wrong exercise
    socket.on("wrong_exercise_correction", async (data) => {
      const { detectedExercise, expectedExercise, sessionId } = data;

      logger.info("[EXERCISE] Wrong exercise detected", {
        detected: detectedExercise,
        expected: expectedExercise,
        sessionId,
        socketId: socket.id,
        component: "mediaSocket",
      });

      // Generate correction message
      const correctionContext = `User is doing ${detectedExercise} but should be doing ${expectedExercise} according to the workout plan. Give a brief, friendly correction to guide them to the right exercise (15-20 words).`;

      try {
        const avatarData = await getAvatarPersona(avatarId);

        await publishStreamingResponse(
          correctionContext,
          avatarData,
          sessionId,
          socket,
          true,
          data.userId,
        );
      } catch (error) {
        logger.error("[EXERCISE] Error sending wrong exercise correction", {
          error: error.message,
          sessionId,
          component: "mediaSocket",
        });
      }
    });

    // **ANNOUNCE NEXT EXERCISE**: Handle succinct next exercise announcement
    socket.on("announce_next_exercise", async (data) => {
      const { currentExercise, nextExercise, sessionId } = data;

      logger.info("[EXERCISE] Announcing next exercise", {
        current: currentExercise,
        next: nextExercise,
        sessionId,
        socketId: socket.id,
        component: "mediaSocket",
      });

      // Get the workout plan to find target reps
      let targetReps = 10; // default
      if (workoutPlan && workoutPlan.exercises) {
        const nextExerciseData = workoutPlan.exercises.find(
          (ex) => ex.exerciseType.toLowerCase() === nextExercise.toLowerCase(),
        );
        if (nextExerciseData) {
          targetReps = nextExerciseData.targetReps;
        }
      }

      // Very succinct announcement - exactly 5 words or less
      const announcementContext = `Next: ${nextExercise}, ${targetReps} reps`;

      try {
        const avatarData = await getAvatarPersona(avatarId);

        // Send directly as a simple message, not through LLM
        socket.emit("simple_message", {
          message: announcementContext,
          avatarId: avatarId,
          sessionId: sessionId,
        });
      } catch (error) {
        logger.error("[EXERCISE] Error announcing next exercise", {
          error: error.message,
          sessionId,
          component: "mediaSocket",
        });
      }
    });

    // **EXERCISE START**: Handle when user selects and starts an exercise
    socket.on("exercise_start", async (data) => {
      const { exercise, sessionId, timestamp } = data;

      logger.info("[EXERCISE] Exercise started", {
        exercise,
        sessionId,
        socketId: socket.id,
        component: "mediaSocket",
      });

      // Initialize or reset coach tracking for new exercise session
      if (!socket.coachTracking) {
        socket.coachTracking = {
          lastFormFeedbackTime: 0,
          lastPlankEncouragementTime: 0,
          completedSets: new Set(),
        };
      }

      // Create unique session ID and reset milestones
      socket.coachTracking.currentExerciseSessionId = `${exercise}-${timestamp}`;
      socket.coachTracking.announcedMilestones = new Set();
      socket.coachTracking.exerciseStartTime = Date.now();
      socket.coachTracking.lastPeriodicFeedbackTime = Date.now();
      socket.coachTracking.totalReps = 0;
      socket.coachTracking.recentFormScores = [];

      logger.info("[EXERCISE] Coach tracking initialized", {
        sessionId: socket.coachTracking.currentExerciseSessionId,
        component: "mediaSocket",
      });

      try {
        if (!currentCallSessionId) {
          socket.emit("exercise_error", { error: "No active session" });
          return;
        }

        // Skip the congratulatory message - just acknowledge the exercise start silently
        logger.info("[EXERCISE] Exercise started, tracking initialized", {
          exercise,
          sessionId,
          component: "mediaSocket",
        });

        // Simply emit acknowledgment without generating any LLM response
        socket.emit("exercise_start_ack", {
          exercise,
          sessionId,
          timestamp,
        });
      } catch (error) {
        logger.error("Error processing exercise start", {
          error: error.message,
          exercise,
          socketId: socket.id,
          component: "mediaSocket",
        });
      }
    });

    // **WORKOUT COMPLETION**: Handle workout completion and adaptive adjustments
    socket.on("workout_complete", async (data) => {
      const { sessionId, summary } = data;

      logger.info("[WORKOUT] Workout completed", {
        sessionId,
        socketId: socket.id,
        summary,
        component: "mediaSocket",
      });

      try {
        if (!currentCallSessionId || !userId) {
          socket.emit("workout_error", { error: "No active session" });
          return;
        }

        // Get session performance summary
        const performanceSummary =
          await getSessionPerformanceSummary(currentCallSessionId);

        if (performanceSummary && workoutPlan) {
          // Calculate performance vs plan
          const performanceData = {
            plannedReps: workoutPlan.exercises.reduce(
              (sum, ex) => sum + ex.targetReps * ex.sets,
              0,
            ),
            actualReps: performanceSummary.totalReps,
            plannedSets: workoutPlan.exercises.reduce(
              (sum, ex) => sum + ex.sets,
              0,
            ),
            actualSets: performanceSummary.totalSets,
            formScore: performanceSummary.averageFormScore,
          };

          // Apply adaptive adjustments
          const adjustments = await adjustFuturePlans(
            userId,
            currentCallSessionId,
            performanceData,
          );

          logger.info("[WORKOUT] Adaptive adjustments calculated", {
            adjustments,
            performanceData,
            component: "mediaSocket",
          });

          // Generate comprehensive completion feedback
          let completionMessage = `Great job completing your workout! 🎉\n\n`;

          // Add performance summary
          if (summary) {
            completionMessage += `Here's your summary:\n`;
            completionMessage += `- Completed ${summary.completedExercises} out of ${summary.totalExercises} exercises\n`;
            completionMessage += `- Total reps: ${summary.totalReps}\n`;
            completionMessage += `- Average form score: ${Math.round(summary.averageFormScore * 100)}%\n`;

            if (summary.achievements && summary.achievements.length > 0) {
              completionMessage += `\nAchievements:\n${summary.achievements.join("\n")}\n`;
            }
          }

          // Add adaptive feedback
          if (adjustments && adjustments.performanceNotes.length > 0) {
            completionMessage += `\n${adjustments.performanceNotes[0]}\n`;
          }

          // Add options for next steps
          completionMessage += `\nWhat would you like to do next?\n`;
          completionMessage += `- Say "different workout" if you'd like to try a different routine\n`;
          completionMessage += `- Say "show progress" to review your fitness journey\n`;
          completionMessage += `- Or simply say "goodbye" and come back tomorrow for another great workout!\n`;
          completionMessage += `\nRemember to stay hydrated and stretch properly. Recovery is just as important as the workout itself!`;

          // Mark session as workout completed to prevent regeneration
          socket.workoutCompleted = true;
          socket.lastWorkoutCompletionTime = Date.now();

          const ttsCallback = createStreamingTTSCallback(avatarId, socket);

          await generateLLMResponse(
            completionMessage,
            avatarId,
            socket,
            currentCallSessionId,
            ttsCallback,
            [],
            true, // isProactive
          );
        }

        // Log workout summary to transcript
        const summaryMessage = {
          role: "system",
          content: {
            type: "workout_summary",
            data: {
              ...summary,
              performanceSummary,
              timestamp: new Date().toISOString(),
            },
          },
        };

        await pool.query(
          `UPDATE "CallSession" 
           SET transcript = transcript || $1::jsonb 
           WHERE id = $2`,
          [JSON.stringify([summaryMessage]), currentCallSessionId],
        );
      } catch (error) {
        logger.error("Error handling workout completion", {
          error: error.message,
          sessionId,
          component: "mediaSocket",
        });
      }
    });

    // **VISION PROCESSING**: Store image for use in conversation
    socket.on("process_image", async (data) => {
      const { image, sessionId, timestamp } = data;

      logger.info("[VISION] process_image event received", {
        hasImage: !!image,
        imageLength: image?.length,
        sessionId,
        currentAvatarId: avatarId,
        currentVisionEnabled: visionEnabled,
        socketId: socket.id,
        component: "mediaSocket",
      });

      try {
        logger.info("[VISION] Storing image frame for session", {
          sessionId,
          socketId: socket.id,
          visionEnabled,
          hasCallSession: !!currentCallSessionId,
          component: "mediaSocket",
        });

        if (!currentCallSessionId) {
          socket.emit("vision_error", { error: "No active session" });
          return;
        }

        // Upload image to storage and get URL
        const imageKey = `vision-captures/${userId}/${currentCallSessionId}/${timestamp || Date.now()}.jpg`;
        const imageUrl = await storageService.uploadBase64Image(
          image,
          imageKey,
        );

        logger.info("[VISION] Image uploaded to storage", {
          imageKey,
          imageUrl,
          component: "mediaSocket",
        });

        // Store BOTH the base64 data (for immediate OpenAI use) and URL (for persistence)
        socket.lastVisionImage = {
          data: image, // Keep base64 for OpenAI
          url: imageUrl, // Store URL for database persistence
          timestamp: Date.now(),
        };

        // Don't save standalone images to history - they'll be included with user messages
        // This prevents cluttering the conversation with image-only entries
        logger.info(
          "[VISION] Image stored, will be attached to next user message",
          {
            sessionId,
            component: "mediaSocket",
          },
        );

        logger.info("[VISION] Image stored for use in conversation", {
          sessionId,
          component: "mediaSocket",
        });

        // Debug logging for proactive vision
        logger.info("[VISION] Checking proactive vision conditions", {
          avatarId,
          visionEnabled,
          lastVisionCommentTime: socket.lastVisionCommentTime,
          socketId: socket.id,
          component: "mediaSocket",
        });

        // Original rate-limited check (keeping for future use)
        if (
          avatarId &&
          visionEnabled &&
          socket.lastVisionCommentTime !== undefined
        ) {
          const timeSinceLastComment =
            Date.now() - socket.lastVisionCommentTime;
          const MIN_COMMENT_INTERVAL = 30000; // 30 seconds minimum between proactive comments

          // Allow immediate comment if this is the first time (lastVisionCommentTime is 0)
          if (
            socket.lastVisionCommentTime === 0 ||
            timeSinceLastComment > MIN_COMMENT_INTERVAL
          ) {
            const persona = await getAvatarPersona(avatarId);
            // Check if persona has vision enabled at admin level
            if (persona && persona.visionEnabled) {
              // Proactively analyze and comment based on avatar type
              logger.info("[VISION] Triggering proactive vision analysis", {
                sessionId,
                timeSinceLastComment,
                avatarId,
                component: "mediaSocket",
              });

              socket.lastVisionCommentTime = Date.now();

              // Process through LLM with vision context
              const ttsCallback = createStreamingTTSCallback(avatarId, socket);

              // Customize prompt based on avatar category
              let proactivePrompt = "I can see you through the camera. ";
              proactivePrompt =
                "I notice something interesting about what I'm seeing:";

              // Create multimodal message
              const visionMessage = [
                { type: "text", text: proactivePrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${socket.lastVisionImage.data}`,
                  },
                },
              ];

              // Pass a flag to indicate this is a proactive message
              await generateLLMResponse(
                visionMessage,
                avatarId,
                socket,
                currentCallSessionId,
                ttsCallback,
                [], // no additional context
                true, // isProactive flag
                userId, // pass userId for cross-session history
              );
            }
          }
        } else if (
          socket.lastVisionCommentTime === undefined &&
          visionEnabled
        ) {
          // Initialize comment timer when vision is enabled
          socket.lastVisionCommentTime = Date.now();
          logger.info("[VISION] Initialized lastVisionCommentTime", {
            time: socket.lastVisionCommentTime,
            socketId: socket.id,
            component: "mediaSocket",
          });
        } else {
          logger.info("[VISION] Proactive vision not triggered", {
            reason: !avatarId
              ? "no avatarId"
              : !visionEnabled
                ? "vision disabled"
                : "lastVisionCommentTime undefined",
            socketId: socket.id,
            component: "mediaSocket",
          });
        }
      } catch (error) {
        logger.error("[VISION] Processing error", {
          error: error.message,
          socketId: socket.id,
          component: "mediaSocket",
        });
        socket.emit("vision_error", {
          error: error.message || "Failed to process image",
        });
      }
    });
  });

  logger.info("Media namespace configured for real-time transcription", {
    component: "mediaSocket",
  });
}
