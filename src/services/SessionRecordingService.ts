import { TinyEmitter } from "tiny-emitter";

import { logError, logWarn } from "../lib/errorLogger";
import { avatarChatService } from "./AvatarChatService";
import { getGlobalSkeletonCanvas } from "../hooks/useSkeletonCanvas";

export interface RecordingState {
  isRecording: boolean;
  recordedBlob: Blob | null;
  duration: number;
  error: string | null;
  transcript: string;
  recordingId: string | null; // Server-side recording ID
  uploadProgress: number; // 0-100
}

export class SessionRecordingService extends TinyEmitter {
  private state: RecordingState = {
    isRecording: false,
    recordedBlob: null,
    duration: 0,
    error: null,
    transcript: "",
    recordingId: null,
    uploadProgress: 0,
  };

  private mediaRecorder: MediaRecorder | null = null;
  private startTime: number = 0;
  private canvasStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private currentRecordingId: string | null = null;
  private chunkCount: number = 0; // Track chunks for server indexing
  private socket: any = null; // WebSocket connection from AvatarChatService
  private isStopping: boolean = false; // Flag to prevent new chunks during stop
  private isTemporaryStop: boolean = false; // Flag for temporary stops during track swapping
  private lastFinalisedRecordingId: string | null = null; // Last successfully saved recording
  private currentRecordingMode: "avatar-only" | "split-screen" | null = null; // Track current recording mode
  private mainCanvasElement: HTMLCanvasElement | null = null; // New property
  private currentUserVideoElement: HTMLVideoElement | null = null; // Active user video element reference
  // Interval ID for periodic MediaRecorder.requestData calls (forces consistent chunking even when
  // the browser ignores the timeslice parameter for certain MIME types like MP4)
  private requestDataIntervalId: ReturnType<typeof setInterval> | null = null;

  // Low-fidelity constants
  private static readonly CAPTURE_FPS = 15; // lower FPS to cut CPU/bitrate by ~50%
  private static readonly VIDEO_WIDTH = 360; // composite canvas width
  private static readonly VIDEO_HEIGHT = 640; // composite canvas height (9:16)
  private static readonly VIDEO_BITRATE = 1_000_000; // 1 Mbps
  // Interval between MediaRecorder dataavailable events (ms)
  private static readonly CHUNK_TIMESLICE_MS = 1000; // 1 s for more frequent chunks

  constructor() {
    super();
  }

  public getState = (): RecordingState => {
    return this.state;
  };

  private setState(updater: Partial<RecordingState>) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updater };
    this.emit("state-change", this.state, oldState);
  }

  /**
   * Force the MediaRecorder to emit data in regular intervals by calling
   * requestData().  Some browsers (e.g. Chrome) ignore the timeslice parameter
   * for certain MIME types (most notably MP4/H264) which results in very large
   * gaps between dataavailable events (6-7 seconds observed).  By manually
   * polling requestData we guarantee near-real-time chunk generation and avoid
   * losing the last few seconds of the call when the user stops the recording.
   */
  private startRequestDataLoop() {
    // Ensure only one interval exists at a time
    this.stopRequestDataLoop();

    this.requestDataIntervalId = setInterval(() => {
      if (
        this.mediaRecorder &&
        this.mediaRecorder.state === "recording" &&
        !this.isStopping
      ) {
        try {
          this.mediaRecorder.requestData();
        } catch (err) {
          console.warn(
            "[SessionRecording] requestData() failed inside interval",
            err,
          );
        }
      }
    }, SessionRecordingService.CHUNK_TIMESLICE_MS);
  }

  /** Stop the periodic requestData polling interval */
  private stopRequestDataLoop() {
    if (this.requestDataIntervalId !== null) {
      clearInterval(this.requestDataIntervalId);
      this.requestDataIntervalId = null;
    }
  }

  /**
   * Set the WebSocket connection from AvatarChatService
   */
  public setSocket(socket: any): void {
    this.socket = socket;
  }

  // New methods for canvas listeners
  private setupCanvasListeners() {
    if (!this.mainCanvasElement) return;

    this.mainCanvasElement.addEventListener(
      "webglcontextlost",
      this.handleWebGLContextLost,
    );
    this.mainCanvasElement.addEventListener(
      "webglcontextrestored",
      this.handleWebGLContextRestored,
    );
    console.log("[SessionRecording] WebGL context listeners added.");
  }

  private removeCanvasListeners() {
    if (!this.mainCanvasElement) return;

    this.mainCanvasElement.removeEventListener(
      "webglcontextlost",
      this.handleWebGLContextLost,
    );
    this.mainCanvasElement.removeEventListener(
      "webglcontextrestored",
      this.handleWebGLContextRestored,
    );
    console.log("[SessionRecording] WebGL context listeners removed.");
  }

  private handleWebGLContextLost = (event: Event) => {
    event.preventDefault(); // Prevent browser from restoring automatically if we want to handle it
    console.error("[SessionRecording] WebGL Context Lost!", event);
    logError(
      "[SessionRecording] WebGL Context Lost",
      new Error("WebGL context lost"),
      { section: "recording", event },
    );
    // Stop recording gracefully if context is lost, as the video source is now invalid
    if (this.state.isRecording) {
      this.stopRecording();
      this.setState({ error: "Recording stopped: WebGL context lost" });
    }
  };

  private handleWebGLContextRestored = (event: Event) => {
    console.log("[SessionRecording] WebGL Context Restored!", event);
    logWarn("[SessionRecording] WebGL Context Restored", null, {
      section: "recording",
      event,
    });
    // At this point, we might need to re-evaluate recording, but for now, just log.
    // If we stopped, the user would need to restart.
  };

  private _setupMediaRecorder(stream: MediaStream, mimeType: string) {
    // Clean up existing MediaRecorder if it exists
    if (this.mediaRecorder) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.onerror = null;
      // No need to call stop() here, as this is used for re-initialization on error
      // or initial setup, where we assume the previous one is already stopped or null.
      this.mediaRecorder = null;
    }

    let mediaRecorderCreated = false;
    // Reorder mime types to PREFER MP4 (H264/AAC) first, which allows the
    // server to perform a fast "-c copy" remux instead of a costly re-encode
    // when processing the recording.
    const fallbackMimeTypes = [
      mimeType,
      // Additional WebM fallbacks FIRST (maintain same family before jumping to MP4)
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      // MP4 fallbacks (least preferred)
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];

    for (const fallbackType of fallbackMimeTypes) {
      if (MediaRecorder.isTypeSupported(fallbackType)) {
        try {
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: fallbackType,
            videoBitsPerSecond: SessionRecordingService.VIDEO_BITRATE,
            audioBitsPerSecond: 128000,
          });
          mediaRecorderCreated = true;
          console.log(
            "[SessionRecording] MediaRecorder created successfully with:",
            fallbackType,
          );
          break;
        } catch (error) {
          console.warn(
            "[SessionRecording] Failed to create MediaRecorder with:",
            fallbackType,
            error,
          );
          continue;
        }
      }
    }

    if (!mediaRecorderCreated || !this.mediaRecorder) {
      throw new Error(
        "Failed to create MediaRecorder with any supported MIME type",
      );
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.streamChunkToServer(event.data).catch((error) => {
          logError("[SessionRecording] Error streaming chunk", error, {
            section: "recording",
          });
        });
      }
    };

    this.mediaRecorder.onstop = () => {
      const duration = (Date.now() - this.startTime) / 1000;

      console.log("[SessionRecording] Recording stopped:", {
        chunks: this.chunkCount,
        duration,
        serverRecordingId: this.currentRecordingId,
        isTemporaryStop: this.isTemporaryStop,
      });

      // Only end the recording session if this is NOT a temporary stop
      if (!this.isTemporaryStop) {
        this.setState({
          duration: Math.round(duration),
          isRecording: false,
        });

        console.log(
          "[SessionRecording] Recording completed successfully - streamed to server:",
          {
            duration,
            recordingId: this.currentRecordingId,
          },
        );
      } else {
        console.log(
          "[SessionRecording] Temporary stop for track swap - keeping session active",
        );
      }

      // CLEANUP: Stop tracks only after MediaRecorder has fully flushed data
      if (this.combinedStream) {
        this.combinedStream.getTracks().forEach((track) => track.stop());
        this.combinedStream = null;
      }
      if (this.canvasStream) {
        this.canvasStream.getTracks().forEach((track) => track.stop());
        this.canvasStream = null;
      }

      // Finalize WebSocket recording AFTER all chunks are flushed.
      const finalize = () => {
        if (!this.currentRecordingId) {
          this.isStopping = false;
          return;
        }
        this.finishWebSocketRecording()
          .then((videoUrl) => {
            console.log(
              "[SessionRecording] WebSocket recording finalized:",
              videoUrl,
            );
          })
          .catch((error) => {
            logError(
              "[SessionRecording] Failed to finalize WebSocket recording",
              error,
              { section: "recording" },
            );
          })
          .finally(() => {
            this.isStopping = false;
          });
      };

      if (!this.isTemporaryStop && this.currentRecordingId) {
        // Give Socket.IO a brief moment (1s) to deliver the final chunk to the server
        setTimeout(finalize, SessionRecordingService.CHUNK_TIMESLICE_MS * 2);
      } else {
        this.isStopping = false;
      }
    };

    // Modified onerror handler
    this.mediaRecorder.onerror = (event: any) => {
      const errName = event?.error?.name || event?.name;
      // Ignore benign errors that occur when tracks are swapped or ended mid-recording
      if (
        errName === "InvalidStateError" ||
        errName === "InvalidModificationError"
      ) {
        console.warn(
          "[SessionRecording] Ignored benign MediaRecorder error",
          errName,
        );
        return;
      }

      console.error("[SessionRecording] MediaRecorder error details:", {
        error: event,
        errorType: event.type,
        errorMessage: event.message,
        errorName: errName,
        mediaRecorderState: this.mediaRecorder?.state,
        mediaRecorderMimeType: this.mediaRecorder?.mimeType,
        streamActive: stream.active,
        streamTracks: stream.getTracks().map((track) => ({
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
          settings: track.getSettings ? track.getSettings() : "not available",
        })),
        canvasStreamActive: this.canvasStream?.active,
        canvasStreamTracks: this.canvasStream?.getTracks().map((track) => ({
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        })),
        browserInfo: {
          userAgent: navigator.userAgent,
          mediaRecorderSupported: typeof MediaRecorder !== "undefined",
          supportedMimeTypes: this.getSupportedMimeType(),
        },
        recordingState: {
          isRecording: this.state.isRecording,
          chunkCount: this.chunkCount,
          startTime: this.startTime,
          currentRecordingId: this.currentRecordingId,
        },
      });

      logError("[SessionRecording] MediaRecorder error", event, {
        section: "recording",
      });

      // If MediaRecorder errors out, try to restart it immediately
      if (this.combinedStream && this.currentRecordingId) {
        // Ensure we have a stream and a recording ID
        console.warn(
          "[SessionRecording] MediaRecorder error detected, attempting to re-initialize and resume.",
        );
        try {
          this._setupMediaRecorder(
            this.combinedStream,
            this.getSupportedMimeType(),
          );
          this.mediaRecorder!.start(SessionRecordingService.CHUNK_TIMESLICE_MS); // Restart collecting data
          console.log(
            "[SessionRecording] MediaRecorder re-initialized and resumed successfully.",
          );
        } catch (retryError) {
          logError(
            "[SessionRecording] Failed to re-initialize MediaRecorder after error",
            retryError,
            { section: "recording" },
          );
          this.setState({
            error:
              "Recording interrupted: failed to recover from MediaRecorder error",
            isRecording: false, // Only set to false if recovery fails
          });
        }
      } else {
        // If no combinedStream or recordingId, then we can't recover the same session.
        this.setState({
          error: "Recording failed due to technical error and cannot resume.",
          isRecording: false,
        });
      }
    };
  }

  /**
   * Start recording the avatar conversation
   * Captures the actual call screen layout with mixed audio
   */
  public async startRecording(
    canvasElement: HTMLCanvasElement,
    isCameraOn: boolean,
    userVideoElement?: HTMLVideoElement,
    sessionInfo?: { sessionId: string; avatarId: string; userId: string },
  ): Promise<void> {
    console.log(
      "[SessionRecording] startRecording called. Call stack:",
      new Error().stack,
    );

    this.mainCanvasElement = canvasElement; // Assign canvas
    this.setupCanvasListeners(); // Setup listeners

    if (isCameraOn && userVideoElement) {
      await this.startSplitScreenRecording(
        canvasElement,
        userVideoElement,
        sessionInfo,
      );
    } else {
      await this.startAvatarRecording(canvasElement, sessionInfo);
    }
  }

  /**
   * Switch recording mode dynamically without stopping the recording
   * Useful when camera is toggled during an active recording session
   */
  public async switchRecordingMode(
    isCameraOn: boolean,
    userVideoElement?: HTMLVideoElement,
  ): Promise<void> {
    if (!this.state.isRecording) {
      console.warn("[SessionRecording] Cannot switch mode – not recording");
      return;
    }

    const newMode: "avatar-only" | "split-screen" =
      isCameraOn && userVideoElement ? "split-screen" : "avatar-only";

    if (this.currentRecordingMode === newMode) return; // nothing to do

    // Basic readiness check when enabling split-screen
    if (newMode === "split-screen" && userVideoElement) {
      if (
        userVideoElement.readyState < 2 ||
        userVideoElement.videoWidth === 0
      ) {
        console.warn(
          "[SessionRecording] User video not ready – keeping avatar-only mode",
        );
        return;
      }
    }

    this.currentUserVideoElement =
      newMode === "split-screen" ? userVideoElement || null : null;
    this.currentRecordingMode = newMode;

    console.log(
      `[SessionRecording] Mode updated → ${newMode}. Video track remains unchanged.`,
    );
  }

  private async startAvatarRecording(
    canvasElement: HTMLCanvasElement,
    sessionInfo?: { sessionId: string; avatarId: string; userId: string },
  ): Promise<void> {
    try {
      if (this.state.isRecording) {
        return;
      }

      this.mainCanvasElement = canvasElement; // Assign canvas
      // setupCanvasListeners called in startRecording now

      // Reset previous recording state
      this.setState({ error: null, recordedBlob: null });

      // Reset counters/flags for fresh recording session
      this.chunkCount = 0;
      this.isStopping = false;

      // Validate canvas readiness before proceeding
      if (
        !canvasElement ||
        canvasElement.width === 0 ||
        canvasElement.height === 0
      ) {
        console.warn("[SessionRecording] Canvas not ready, waiting...", {
          hasCanvas: !!canvasElement,
          width: canvasElement?.width,
          height: canvasElement?.height,
        });

        // Wait for canvas to be ready (max 5 seconds)
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 seconds

        while (
          attempts < maxAttempts &&
          (!canvasElement ||
            canvasElement.width === 0 ||
            canvasElement.height === 0)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        if (
          !canvasElement ||
          canvasElement.width === 0 ||
          canvasElement.height === 0
        ) {
          throw new Error(
            "Canvas not ready after waiting - cannot start recording",
          );
        }

        console.log(
          "[SessionRecording] Canvas ready after waiting",
          attempts * 100,
          "ms",
        );
      }

      // 1. Create composite video track (avatar-only layout)
      const videoTrack = await this.createCallScreenVideo(canvasElement);
      this.currentRecordingMode = "avatar-only";

      // 2. Set up audio recording with proper initialization
      let audioTracks: MediaStreamTrack[] = [];

      const ensureSilentTrack = () => {
        if (audioTracks.length === 0) {
          try {
            const ac = new (window.AudioContext ||
              (window as any).webkitAudioContext)();
            const dest = ac.createMediaStreamDestination();
            // no source connected -> silence
            const silentTrack = dest.stream.getAudioTracks()[0];
            if (silentTrack) {
              audioTracks.push(silentTrack);
              console.warn(
                "[SessionRecording] Injected silent audio track to avoid server-side ffmpeg errors",
              );
            }
          } catch (err) {
            console.warn(
              "[SessionRecording] Failed to create silent audio track",
              err,
            );
          }
        }
      };

      try {
        const audioComponents =
          await avatarChatService.ensureAudioForRecording();

        if (audioComponents.isReady && audioComponents.audioContext) {
          // Create a destination node for recording
          const recordingDestination =
            audioComponents.audioContext.createMediaStreamDestination();

          // 1. Connect user microphone audio
          if (
            audioComponents.mediaStream &&
            audioComponents.mediaStream.getAudioTracks().length > 0
          ) {
            const userAudioSource =
              audioComponents.audioContext.createMediaStreamSource(
                audioComponents.mediaStream,
              );
            const userGain = audioComponents.audioContext.createGain();
            userGain.gain.value = 1.0; // Full volume for user
            userAudioSource.connect(userGain);
            userGain.connect(recordingDestination);
          }

          // 2. Connect avatar audio (tap into the existing avatarGainNode without disrupting playback)
          if (audioComponents.avatarGainNode) {
            if (
              audioComponents.avatarGainNode.context ===
              audioComponents.audioContext
            ) {
              audioComponents.avatarGainNode.connect(recordingDestination);
              } else {
              console.warn(
                "[SessionRecording] avatarGainNode belongs to different AudioContext – skipping connect",
              );
            }
          } else {
            console.warn("[SessionRecording] No avatar gain node available");
          }

          // Use the mixed audio stream
          const mixedAudioStream = recordingDestination.stream;
          audioTracks = mixedAudioStream.getAudioTracks();
        } else {
          console.warn(
            "[SessionRecording] Audio components not ready, recording video only",
          );
        }
      } catch (error) {
        logError("[SessionRecording] Audio setup failed", error, {
          section: "recording",
        });
      }

      // Ensure at least one audio track so that server ffmpeg always has an audio stream
      ensureSilentTrack();

      // 3. Combine video and audio streams
      this.combinedStream = new MediaStream([videoTrack, ...audioTracks]);

      console.log(
        "[DEBUG] Combined stream tracks",
        this.combinedStream
          .getTracks()
          .map((t) => ({ kind: t.kind, id: t.id, label: t.label })),
      );

      // 4. Set up MediaRecorder
      const mimeType = this.getSupportedMimeType();

      this._setupMediaRecorder(this.combinedStream, mimeType);

      // 5. Start WebSocket recording session if session info provided
      if (sessionInfo && this.socket) {
        await this.startWebSocketRecording(
          sessionInfo.sessionId,
          sessionInfo.avatarId,
          sessionInfo.userId,
          mimeType,
        );
      }

      // 6. Start recording
      this.startTime = Date.now();
      this.mediaRecorder!.start(SessionRecordingService.CHUNK_TIMESLICE_MS); // Collect data every 0.5 s
      this.startRequestDataLoop();
      this.setState({ isRecording: true });
      this.currentRecordingMode = "avatar-only";

      console.log("[SessionRecording] Recording started with:", {
        videoTracks: this.combinedStream!.getVideoTracks().length,
        audioTracks: this.combinedStream!.getAudioTracks().length,
        mimeType,
        webSocketRecording: !!this.currentRecordingId,
      });
    } catch (error) {
      logError("[SessionRecording] Failed to start recording", error, {
        section: "recording",
      });
      this.setState({
        error:
          error instanceof Error ? error.message : "Failed to start recording",
        isRecording: false,
      });
    }
  }

  /**
   * Stop recording the session
   */
  public async stopRecording(): Promise<string | null> {
    if (!this.mediaRecorder || !this.state.isRecording) {
      console.warn("[SessionRecording] No active recording to stop");
      return null;
    }

    console.log(
      "[SessionRecording] stopRecording called – letting final chunks flush",
    );
    // Stop the periodic requestData loop so we don't call it after stopping
    this.stopRequestDataLoop();

    try {
      // Stop animation loop if it exists
      if ((this as any).currentAnimationCleanup) {
        console.log("[SessionRecording] Stopping animation loop");
        (this as any).currentAnimationCleanup();
        (this as any).currentAnimationCleanup = null;
      }

      // Force the MediaRecorder to flush any buffered data immediately before stopping
      try {
        this.mediaRecorder.requestData();
      } catch (err) {
        console.warn(
          "[SessionRecording] requestData() failed (may be unsupported in some browsers)",
          err,
        );
      }

      // Give the recorder a short window (equal to timeslice) to emit the final chunk
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        }
        this.isStopping = true;
      }, SessionRecordingService.CHUNK_TIMESLICE_MS);

      // Clean up streams
      // NOTE: Actual track cleanup now happens in the MediaRecorder onstop handler above

      console.log("[SessionRecording] Recording stopped");

      // Update state immediately for responsive UI
      this.setState({ isRecording: false });

      // WebSocket recording finalization is now handled in the MediaRecorder
      // onstop callback to ensure all remaining chunks are flushed before we
      // notify the server.

      // Return immediately - don't wait for WebSocket finalization
      return null;
    } catch (error) {
      logError("[SessionRecording] Error stopping recording", error, {
        section: "recording",
      });
      this.setState({
        error: "Error stopping recording",
        isRecording: false,
      });
      this.isStopping = false;
      return null;
    }
  }

  /**
   * Get the recorded video blob for upload
   */
  public getRecordedBlob(): Blob | null {
    return this.state.recordedBlob;
  }

  /**
   * Clear the recorded data
   */
  public clearRecording(): void {
    this.setState({
      recordedBlob: null,
      duration: 0,
      error: null,
      recordingId: null,
    });
  }

  /**
   * Stream a chunk to server via WebSocket
   */
  private async streamChunkToServer(chunk: Blob): Promise<void> {
    if (!this.socket || !this.currentRecordingId) {
      console.warn(
        "[SessionRecording] Skipping chunk - socket/recording not available:",
        {
          hasSocket: !!this.socket,
          hasRecordingId: !!this.currentRecordingId,
          isStopping: this.isStopping,
        },
      );
      return;
    }
    
    // Additional check for socket connection state
    if (!this.socket.connected) {
      console.warn(
        "[SessionRecording] Socket disconnected - skipping chunk:",
        {
          recordingId: this.currentRecordingId,
          chunkIndex: this.chunkCount,
          socketId: this.socket.id,
        },
      );
      return;
    }
    // Check if chunk is suspiciously small
    if (chunk.size < 100) {
      console.warn("[SessionRecording] SUSPICIOUSLY SMALL CHUNK:", {
        size: chunk.size,
        type: chunk.type,
        chunkCount: this.chunkCount,
      });

      // Log canvas state if available
      if (this.canvasStream) {
        const videoTrack = this.canvasStream.getVideoTracks()[0];
        if (videoTrack) {
          console.warn("[SessionRecording] Canvas video track state:", {
            readyState: videoTrack.readyState,
            enabled: videoTrack.enabled,
            settings: videoTrack.getSettings
              ? videoTrack.getSettings()
              : "not available",
          });
        }
      }
    }
    // --- END DIAGNOSTIC LOGGING ---

    try {
      // Convert blob to base64 for WebSocket transmission - NON-BLOCKING APPROACH
      const arrayBuffer = await chunk.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Emit metadata + binary payload (second argument treated as attachment by Socket.IO)
      this.socket.emit(
        "recording_chunk",
        {
          recordingId: this.currentRecordingId,
          chunkIndex: this.chunkCount,
        },
        uint8Array,
      );

      this.chunkCount++;

      // Update progress (placeholder until we know total size)
      const progress = 0;
      this.setState({ uploadProgress: progress });
    } catch (error) {
      logError("[SessionRecording] Error streaming chunk", error, {
        section: "recording",
      });
    }
  }

  /**
   * Start a WebSocket recording session
   */
  private async startWebSocketRecording(
    sessionId: string,
    avatarId: string,
    userId: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.socket) {
      throw new Error("No WebSocket connection available");
    }

    return new Promise((resolve, reject) => {
      this.socket.emit("recording_start", {
        sessionId,
        avatarId,
        userId,
        mimeType,
      });

      const onRecordingStarted = (data: { recordingId: string }) => {
        this.currentRecordingId = data.recordingId;
        this.setState({ recordingId: data.recordingId });
        this.socket.off("recording_started", onRecordingStarted);
        this.socket.off("recording_error", onRecordingError);
        console.log(
          "[SessionRecording] WebSocket recording started:",
          data.recordingId,
        );
        resolve(data.recordingId);
      };

      const onRecordingError = (data: { error: string }) => {
        this.socket.off("recording_started", onRecordingStarted);
        this.socket.off("recording_error", onRecordingError);
        reject(new Error(data.error));
      };

      this.socket.on("recording_started", onRecordingStarted);
      this.socket.on("recording_error", onRecordingError);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.socket.off("recording_started", onRecordingStarted);
        this.socket.off("recording_error", onRecordingError);
        reject(new Error("Recording start timeout"));
      }, 5000);
    });
  }

  /**
   * Finalize the WebSocket recording
   */
  private async finishWebSocketRecording(): Promise<string | null> {
    if (!this.currentRecordingId || !this.socket) {
      return null;
    }

    return new Promise((resolve, reject) => {
      this.socket.emit("recording_finish", {
        recordingId: this.currentRecordingId,
        lastChunkIndex: this.chunkCount - 1,
        duration: Math.round((Date.now() - this.startTime) / 1000),
      });

      const onRecordingFinished = (data: {
        recordingId: string;
        videoUrl: string;
        thumbnailUrl: string;
        duration: number;
      }) => {
        this.socket.off("recording_finished", onRecordingFinished);
        this.socket.off("recording_error", onRecordingError);
        console.log(
          "[SessionRecording] WebSocket recording finished:",
          data.videoUrl,
        );
        this.lastFinalisedRecordingId = data.recordingId;
        this.currentRecordingId = null; // prevent further chunks from using old ID
        this.isStopping = false; // cleanup complete
        // Notify UI listeners that the recording row now exists in DB
        this.emit("recording-finalised", data.recordingId);
        resolve(data.videoUrl);
      };

      const onRecordingError = (data: { error: string }) => {
        this.socket.off("recording_finished", onRecordingFinished);
        this.socket.off("recording_error", onRecordingError);
        reject(new Error(data.error));
      };

      this.socket.on("recording_finished", onRecordingFinished);
      this.socket.on("recording_error", onRecordingError);

      // Timeout after 5 minutes – longer videos need more processing time on
      // the server (FFmpeg encoding, thumbnail generation, DB writes). Adjust
      // to 300 000 ms to avoid premature failure on multi-minute recordings.
      setTimeout(() => {
        this.socket.off("recording_finished", onRecordingFinished);
        this.socket.off("recording_error", onRecordingError);
        reject(new Error("Recording finish timeout"));
      }, 300000);
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopRecording(); // This will call removeCanvasListeners
    this.clearRecording();
    this.off("state-change");
    this.removeCanvasListeners(); // Ensure listeners are removed
    this.stopRequestDataLoop(); // Clear any leftover interval
    this.mainCanvasElement = null; // Clear reference
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    // For reliability of chunk concatenation we PREFER WebM first. MP4 chunks
    // lack repeated moov atoms and frequently break FFmpeg stdin processing on
    // the server, resulting in missing videoUrl. The server will transcode to
    // MP4 afterwards.
    const types = [
      // WebM (most compatible with MediaRecorder streaming)
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      // MP4 fallbacks (may cause concat issues, used only if WebM unsupported)
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "video/webm"; // Fallback
  }

  /**
   * Create a preview URL for the recorded video
   */
  public createPreviewUrl(): string | null {
    if (!this.state.recordedBlob) return null;
    return URL.createObjectURL(this.state.recordedBlob);
  }

  /**
   * Convert recording to MP4 if needed (for upload compatibility)
   */
  public async convertToMP4(): Promise<Blob> {
    if (!this.state.recordedBlob) {
      throw new Error("No recording available to convert");
    }

    // Validate blob before upload
    if (this.state.recordedBlob.size === 0) {
      throw new Error("Recording is empty - no video data captured");
    }

    if (this.state.recordedBlob.size < 1000) {
      throw new Error(
        `Recording too small (${this.state.recordedBlob.size} bytes) - likely corrupted`,
      );
    }

    // Check if blob contains valid video data by examining header
    const headerBuffer = await this.state.recordedBlob
      .slice(0, 32)
      .arrayBuffer();
    const headerView = new Uint8Array(headerBuffer);

    // Check for WebM signature (1a 45 df a3) or MP4 signature (ftyp)
    const webmSignature = [0x1a, 0x45, 0xdf, 0xa3];
    const ftypSignature = [0x66, 0x74, 0x79, 0x70]; // 'ftyp'

    const hasWebMSignature = webmSignature.every(
      (byte, i) => headerView[i] === byte,
    );
    const hasFtypSignature = Array.from(headerView)
      .join(",")
      .includes(ftypSignature.join(","));

    if (!hasWebMSignature && !hasFtypSignature) {
      console.warn(
        "[SessionRecording] Invalid video header:",
        Array.from(headerView.slice(0, 16)),
      );
      throw new Error(
        "Recording appears corrupted - invalid video format detected",
      );
    }

    console.log("[SessionRecording] Video validation passed:", {
      size: this.state.recordedBlob.size,
      type: this.state.recordedBlob.type,
      hasWebM: hasWebMSignature,
      hasMP4: hasFtypSignature,
    });

    // If already MP4, return as-is
    if (this.state.recordedBlob.type.includes("mp4")) {
      return this.state.recordedBlob;
    }

    // For now, return the original blob (WebM is supported on backend)
    // In production, you might want to use FFmpeg.js for client-side conversion
    // or handle conversion on the server side
    return this.state.recordedBlob;
  }

  private async startSplitScreenRecording(
    canvasElement: HTMLCanvasElement,
    userVideoElement: HTMLVideoElement,
    sessionInfo?: { sessionId: string; avatarId: string; userId: string },
  ): Promise<void> {
    try {
      if (this.state.isRecording) {
        console.warn("[SessionRecording] Already recording");
        return;
      }

      this.mainCanvasElement = canvasElement; // Assign canvas
      // setupCanvasListeners called in startRecording now

      // Reset previous recording
      this.chunkCount = 0;
      this.setState({ error: null });

      // Validate canvas readiness before proceeding
      if (
        !canvasElement ||
        canvasElement.width === 0 ||
        canvasElement.height === 0
      ) {
        console.warn(
          "[SessionRecording] Canvas not ready for split-screen, waiting...",
          {
            hasCanvas: !!canvasElement,
            width: canvasElement?.width,
            height: canvasElement?.height,
          },
        );

        // Wait for canvas to be ready (max 5 seconds)
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 seconds

        while (
          attempts < maxAttempts &&
          (!canvasElement ||
            canvasElement.width === 0 ||
            canvasElement.height === 0)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        if (
          !canvasElement ||
          canvasElement.width === 0 ||
          canvasElement.height === 0
        ) {
          throw new Error(
            "Canvas not ready after waiting - cannot start split-screen recording",
          );
        }

        console.log(
          "[SessionRecording] Canvas ready for split-screen after waiting",
          attempts * 100,
          "ms",
        );
      }

      console.log("[SessionRecording] Starting split-screen recording with:", {
        hasCanvas: !!canvasElement,
        canvasSize: canvasElement
          ? `${canvasElement.width}x${canvasElement.height}`
          : "none",
        hasUserVideo: !!userVideoElement,
        userVideoSize: userVideoElement
          ? `${userVideoElement.videoWidth}x${userVideoElement.videoHeight}`
          : "none",
        userVideoReadyState: userVideoElement?.readyState,
      });

      // 1. Create split-screen video track
      const videoTrack = await this.createCallScreenVideo(
        canvasElement,
        userVideoElement,
      );

      // 2. Set up audio recording with proper initialization
      let audioTracks: MediaStreamTrack[] = [];

      const ensureSilentTrack = () => {
        if (audioTracks.length === 0) {
          try {
            const ac = new (window.AudioContext ||
              (window as any).webkitAudioContext)();
            const dest = ac.createMediaStreamDestination();
            const silentTrack = dest.stream.getAudioTracks()[0];
            if (silentTrack) {
              audioTracks.push(silentTrack);
              console.warn(
                "[SessionRecording] Injected silent audio track (split-screen)",
              );
            }
          } catch (err) {
            console.warn(
              "[SessionRecording] Failed to create silent audio track (split-screen)",
              err,
            );
          }
        }
      };

      try {
        const audioComponents =
          await avatarChatService.ensureAudioForRecording();

        if (audioComponents.isReady && audioComponents.audioContext) {
          // Create a destination node for recording
          const recordingDestination =
            audioComponents.audioContext.createMediaStreamDestination();

          // 1. Connect user microphone audio
          if (
            audioComponents.mediaStream &&
            audioComponents.mediaStream.getAudioTracks().length > 0
          ) {
            const userAudioSource =
              audioComponents.audioContext.createMediaStreamSource(
                audioComponents.mediaStream,
              );
            const userGain = audioComponents.audioContext.createGain();
            userGain.gain.value = 1.0; // Full volume for user
            userAudioSource.connect(userGain);
            userGain.connect(recordingDestination);
          }

          // 2. Connect avatar audio (tap into the existing avatarGainNode without disrupting playback)
          if (audioComponents.avatarGainNode) {
            if (
              audioComponents.avatarGainNode.context ===
              audioComponents.audioContext
            ) {
              audioComponents.avatarGainNode.connect(recordingDestination);
              } else {
              console.warn(
                "[SessionRecording] avatarGainNode belongs to different AudioContext – skipping connect",
              );
            }
          } else {
            console.warn("[SessionRecording] No avatar gain node available");
          }

          // Use the mixed audio stream
          const mixedAudioStream = recordingDestination.stream;
          audioTracks = mixedAudioStream.getAudioTracks();
        } else {
          console.warn(
            "[SessionRecording] Audio components not ready, recording video only",
          );
        }
      } catch (error) {
        logError("[SessionRecording] Audio setup failed", error, {
          section: "recording",
        });
      }

      // Ensure at least one audio track so that server ffmpeg always has an audio stream
      ensureSilentTrack();

      // 3. Combine video and audio streams
      this.combinedStream = new MediaStream([videoTrack, ...audioTracks]);

      console.log(
        "[DEBUG] Combined stream tracks",
        this.combinedStream!.getTracks().map((t) => ({
          kind: t.kind,
          id: t.id,
          label: t.label,
        })),
      );

      // 4. Set up MediaRecorder (same as avatar-only)
      const mimeType = this.getSupportedMimeType();

      this._setupMediaRecorder(this.combinedStream, mimeType);

      // 5. Start WebSocket recording session if session info provided
      if (sessionInfo && this.socket) {
        await this.startWebSocketRecording(
          sessionInfo.sessionId,
          sessionInfo.avatarId,
          sessionInfo.userId,
          mimeType,
        );
      }

      // 6. Start recording
      this.startTime = Date.now();
      this.mediaRecorder!.start(SessionRecordingService.CHUNK_TIMESLICE_MS);
      this.startRequestDataLoop();
      this.setState({ isRecording: true });
      this.currentRecordingMode = "split-screen";

      console.log("[SessionRecording] Split-screen recording started with:", {
        videoTracks: this.combinedStream!.getVideoTracks().length,
        audioTracks: this.combinedStream!.getAudioTracks().length,
        mimeType,
        webSocketRecording: !!this.currentRecordingId,
      });
    } catch (error) {
      logError(
        "[SessionRecording] Failed to start split-screen recording",
        error,
        { section: "recording" },
      );
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : "Failed to start split-screen recording",
        isRecording: false,
      });
    }
  }

  /**
   * Create call screen video that matches the actual call layout (50/50 split)
   */
  private async createCallScreenVideo(
    canvasElement: HTMLCanvasElement,
    userVideoElement?: HTMLVideoElement,
  ): Promise<MediaStreamTrack> {
    // Store the current user video element reference (can be null)
    this.currentUserVideoElement = userVideoElement || null;
    // Create a new canvas for compositing the split-screen layout
    const compositeCanvas = document.createElement("canvas");
    const ctx = compositeCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get 2D context for composite canvas");
    }

    // Set canvas dimensions to match mobile call screen (9:16 aspect ratio)
    const width = SessionRecordingService.VIDEO_WIDTH;
    const height = SessionRecordingService.VIDEO_HEIGHT;
    compositeCanvas.width = width;
    compositeCanvas.height = height;

    // Calculate layout dimensions - 50/50 split like actual call screen
    const halfHeight = height / 2;

    // Avatar (top half)
    const avatarWidth = width;
    const avatarHeight = halfHeight;
    const avatarX = 0;
    const avatarY = 0;

    // User camera (bottom half)
    const userWidth = width;
    const userHeight = halfHeight;
    const userX = 0;
    const userY = halfHeight;

    // Store animation frame ID for cleanup
    let animationFrameId: number;
    let isAnimating = true; // Local flag to control animation loop independently

    // Animation loop to composite the video
    let frameCount = 0;
    const animate = () => {
      if (!isAnimating) {
        console.log(
          "[SessionRecording] Animation stopped - local flag set to false",
        );
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        return;
      }

      frameCount++;

      // Clear canvas with black background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Draw avatar canvas (top half)
      try {
        if (
          canvasElement &&
          canvasElement.width > 0 &&
          canvasElement.height > 0
        ) {
          ctx.drawImage(
            canvasElement,
            avatarX,
            avatarY,
            avatarWidth,
            avatarHeight,
          );
        } else {
          // Avatar canvas not ready - draw dark placeholder
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(avatarX, avatarY, avatarWidth, avatarHeight);
        }
      } catch (error) {
        // If canvas drawing fails, fill with dark placeholder
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(avatarX, avatarY, avatarWidth, avatarHeight);
      }

      // Draw user video (bottom half)
      try {
        const uvid = this.currentUserVideoElement;
        if (uvid && uvid.readyState >= 2 && uvid.videoWidth > 0) {
          ctx.drawImage(uvid, userX, userY, userWidth, userHeight);
          
          // Draw skeleton overlay if available (dynamically get current skeleton canvas)
          const currentSkeletonCanvas = getGlobalSkeletonCanvas();
          if (currentSkeletonCanvas && currentSkeletonCanvas.width > 0 && currentSkeletonCanvas.height > 0) {
            ctx.save();
            // Scale skeleton canvas to fit the user video area
            ctx.drawImage(
              currentSkeletonCanvas,
              0, 0, currentSkeletonCanvas.width, currentSkeletonCanvas.height,
              userX, userY, userWidth, userHeight
            );
            ctx.restore();
          }
        } else {
          // No user video or camera off - draw dark placeholder
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(userX, userY, userWidth, userHeight);
        }
      } catch (error) {
        logWarn("[SessionRecording] Error drawing user video", error, {
          section: "recording",
        });
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(userX, userY, userWidth, userHeight);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    // Draw an initial blank frame before starting capture
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Capture the canvas to a MediaStream and keep a reference on the instance
    // so it is not garbage-collected. Losing the owning stream reference can
    // cause some browsers to stop delivering frames after ~1 s, which
    // manifested as the recorded video being truncated. Retaining the stream
    // guarantees continuous frame delivery for the whole recording session.

    const compositeStream = compositeCanvas.captureStream(
      SessionRecordingService.CAPTURE_FPS,
    );

    // IMPORTANT: keep a strong reference so the stream stays alive
    this.canvasStream = compositeStream;

    const compositeVideoTrack = compositeStream.getVideoTracks()[0];

    if (!compositeVideoTrack) {
      throw new Error("Failed to capture composite video stream");
    }

    console.log(
      "[SessionRecording] Created call screen video layout (50/50 split)",
      {
        canvasDimensions: `${compositeCanvas.width}x${compositeCanvas.height}`,
        trackReady: compositeVideoTrack.readyState,
        trackEnabled: compositeVideoTrack.enabled,
        trackSettings: compositeVideoTrack.getSettings
          ? compositeVideoTrack.getSettings()
          : "not available",
      },
    );

    // Store cleanup function for this specific recording
    const stopAnimation = () => {};

    // Store reference to cleanup function for external stopping
    (this as any).currentAnimationCleanup = stopAnimation;

    // Start the animation loop AFTER setting up capture
    console.log("[SessionRecording] Starting animation loop");
    animate();

    return compositeVideoTrack;
  }
  /**
   * Get the ID of the last successfully finalised recording (saved in DB)
   */
  public getLastRecordingId(): string | null {
    return this.lastFinalisedRecordingId;
  }
}

export const sessionRecordingService = new SessionRecordingService();
