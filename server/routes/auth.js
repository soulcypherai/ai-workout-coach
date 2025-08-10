import "dotenv/config";
import { ethers } from "ethers";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { SiweMessage } from "siwe";

import pool from "../db/index.js";
import { systemAlerts } from "../lib/alerting.js";
import { verifySupabaseToken } from "../lib/supabaseClient.js";
import { verifyJWTMiddleware } from "../middleware/auth.js";

const router = Router();

// JWT secret for MiniKit tokens
const MINIKIT_JWT_SECRET =
  process.env.MINIKIT_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "your-secret-key-change-in-production";

/**
 * MiniKit wallet-based login endpoint
 */
router.post("/minikit-login", async (req, res, next) => {
  try {
    const { authMethod, message, signature, walletAddress, userInfo } =
      req.body;

    if (!authMethod || !message || !signature || !walletAddress) {
      return res.status(400).json({
        error:
          "Missing required fields: authMethod, message, signature, walletAddress",
      });
    }

    console.log("[Auth] Attempting MiniKit wallet login for:", walletAddress);

    // Verify the signature using SIWE
    // Already being verified internally by MiniKit
    // try {
    //   const siweMessage = new SiweMessage(message);
    //   const fields = await siweMessage.verify({ signature });
    //   console.log("[Auth] SIWE fields:", fields);
    //   if (fields.data.address.toLowerCase() !== walletAddress.toLowerCase()) {
    //     return res.status(401).json({ error: "Invalid signature" });
    //   }
    // } catch (error) {
    //   console.error("[Auth] SIWE signature verification failed:", error);
    //   return res.status(401).json({ error: "Signature verification failed" });
    // }

    // Check if user exists by wallet address
    let existingUser = await pool.query(
      'SELECT * FROM "User" WHERE wallet_address = $1',
      [walletAddress.toLowerCase()],
    );

    let dbUser;
    if (existingUser.rows.length > 0) {
      // User exists, update if needed
      dbUser = existingUser.rows[0];
      console.log(`[Auth] Found existing user by wallet: ${dbUser.id}`);
    } else {
      // Create new user
      try {
        // Generate default handle from wallet address
        const handle = userInfo.username || `user_${walletAddress.slice(2, 8)}`;

        const result = await pool.query(
          `INSERT INTO "User" (wallet_address, handle, pfp_url, meta, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, NOW(), NOW()) 
           RETURNING *`,
          [
            walletAddress.toLowerCase(),
            handle,
            userInfo.pfp,
            JSON.stringify({
              fid: userInfo.fid,
              authMethod: authMethod,
              signInMessage: message,
              signInTimestamp: new Date().toISOString(),
            }),
          ],
        );

        dbUser = result.rows[0];
        console.log(`[Auth] Created new user: ${dbUser.id}`);
      } catch (error) {
        console.error("[Auth] Failed to create user:", error);
        return res.status(500).json({ error: "Failed to create user" });
      }
    }

    // Fetch user pitches
    const recordingsResult = await pool.query(
      `SELECT sr.*, 
              ap.name AS avatar_name,
              ap.image_url AS avatar_image_url,
              ap.slug AS avatar_slug
       FROM "SessionRecording" sr
       JOIN "AvatarPersona" ap ON sr.avatar_id = ap.id
       WHERE sr.user_id = $1
       ORDER BY sr.created_at DESC`,
      [dbUser.id],
    );
    const userPitches = recordingsResult.rows;

    // Generate JWT token
    const jwtPayload = {
      userId: dbUser.id,
      walletAddress: dbUser.wallet_address,
      type: "minikit",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    };

    const jwtToken = jwt.sign(jwtPayload, MINIKIT_JWT_SECRET);

    // Set HTTP-only cookie
    res.cookie("minikit_token", jwtToken, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production", // HTTPS only in production
      secure: true,
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    });

    res.status(200).json({
      message: "MiniKit login successful",
      user: {
        id: dbUser.id,
        supabaseUserId: dbUser.supabase_user_id,
        wallet_address: dbUser.wallet_address,
        handle: dbUser.handle,
        role: dbUser.role,
        credits: dbUser.credits || 0,
        meta: dbUser.meta,
        created_at: dbUser.created_at,
        pitches: userPitches,
        email: dbUser.email,
        pfp_url: dbUser.pfp_url,
      },
    });
  } catch (error) {
    console.error("[Auth] MiniKit login error:", error);
    systemAlerts.authenticationFailures(1, 1);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * MiniKit logout endpoint
 */
router.post("/minikit-logout", (req, res) => {
  res.clearCookie("minikit_token", {
    httpOnly: true,
    // secure: process.env.NODE_ENV === "production",
    secure: true,
    sameSite: "None",
    path: "/",
  });
  res.json({ message: "Logged out successfully" });
});

/**
 * Supabase-based login endpoint
 */
router.post("/login", async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization header is missing or invalid." });
  }

  const supabaseAccessToken = authHeader.split(" ")[1];
  const { walletAddress } = req.body; // Optional wallet address from frontend

  console.log("[Auth] Attempting Supabase login");

  // Verify Supabase token and get user
  const supabaseUser = await verifySupabaseToken(supabaseAccessToken);
  if (!supabaseUser) {
    // Alert on authentication failure
    systemAlerts.authenticationFailures(1, 1);
    return res.status(401).json({ error: "Invalid Supabase access token." });
  }

  console.log("[Auth] Supabase token verified for user:", supabaseUser.id);

  const supabaseUserId = supabaseUser.id;
  const email = supabaseUser.email;

  // Upsert user in our database
  let existingUser = await pool.query(
    'SELECT * FROM "User" WHERE supabase_user_id = $1',
    [supabaseUserId],
  );

  if (existingUser.rows.length === 0 && email) {
    // Also check by email for existing Privy users to merge accounts
    existingUser = await pool.query(
      "SELECT * FROM \"User\" WHERE meta->>'email' = $1",
      [email],
    );
  }

  let dbUser;
  if (existingUser.rows.length > 0) {
    // Update existing user with Supabase ID
    const row = existingUser.rows[0];
    const needsUpdate =
      !row.supabase_user_id ||
      (walletAddress && !row.wallet_address) ||
      (email && !row.email);

    if (needsUpdate) {
      const updateFields = ["supabase_user_id = $1", "updated_at = NOW()"];
      const updateValues = [supabaseUserId];
      let paramIndex = 2;

      if (walletAddress && !row.wallet_address) {
        updateFields.push(`wallet_address = $${paramIndex}`);
        updateValues.push(walletAddress);
        paramIndex++;
      }

      if (email && !row.email) {
        updateFields.push(`email = $${paramIndex}`);
        updateValues.push(email);
        paramIndex++;
      }

      updateValues.push(row.id);

      const updated = await pool.query(
        `UPDATE "User" SET ${updateFields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        updateValues,
      );
      dbUser = updated.rows[0];
      console.log(`[Auth] Updated existing user: ${dbUser.id}`);
    } else {
      dbUser = row;
      console.log(`[Auth] Found existing user: ${dbUser.id}`);
    }
  } else {
    try {
      // Generate default handle from email or Supabase ID
      const emailPrefix = email
        ? email.split("@")[0]
        : `user_${supabaseUserId.slice(0, 8)}`;
      const defaultHandle = `${emailPrefix}_${supabaseUserId.slice(-4)}`;

      const insertValues = [supabaseUserId, "user", defaultHandle];
      let insertFields = ["supabase_user_id", "role", "handle"];

      if (walletAddress) {
        insertFields.push("wallet_address");
        insertValues.push(walletAddress);
      }

      if (email) {
        insertFields.push("email", "meta");
        insertValues.push(email, JSON.stringify({ email }));
      }

      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", ");

      const newUser = await pool.query(
        `INSERT INTO "User" (${insertFields.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        insertValues,
      );
      dbUser = newUser.rows[0];
      console.log(
        `[Auth] Created new user: ${dbUser.id} with handle: ${defaultHandle}`,
      );
    } catch (insertError) {
      // Handle race condition where user was created between our checks
      if (insertError.code === "23505") {
        console.log(
          "[Auth] User created by concurrent request, fetching existing user",
        );
        const retry = await pool.query(
          'SELECT * FROM "User" WHERE supabase_user_id = $1',
          [supabaseUserId],
        );
        dbUser = retry.rows[0];
      } else {
        throw insertError;
      }
    }
  }

  // --- Fetch User Pitches
  const recordingsResult = await pool.query(
    `
      SELECT sr.*, 
             ap.name AS avatar_name,
             ap.image_url AS avatar_image_url,
             ap.slug AS avatar_slug
      FROM "SessionRecording" sr
      JOIN "AvatarPersona" ap ON sr.avatar_id = ap.id
      WHERE sr.user_id = $1
      ORDER BY sr.created_at DESC
      
      `,
    [dbUser.id],
  );

  const userPitches = recordingsResult.rows;

  res.status(200).json({
    message: "Login successful",
    token: supabaseAccessToken, // Use Supabase token directly
    user: {
      id: dbUser.id,
      supabaseUserId: dbUser.supabase_user_id,
      wallet_address: dbUser.wallet_address,
      handle: dbUser.handle,
      role: dbUser.role,
      credits: dbUser.credits || 0,
      meta: dbUser.meta,
      created_at: dbUser.created_at,
      pitches: userPitches,
      email: email,
      pfp_url: dbUser.pfp_url,
    },
  });
});

/**
 * Verifies the app's own JWT and returns user data.
 */
router.get("/verify", verifyJWTMiddleware, async (req, res, next) => {
  // The user's JWT payload is attached to req.user by the middleware
  const { userId } = req.user;

  const result = await pool.query('SELECT * FROM "User" WHERE id = $1', [
    userId,
  ]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found." });
  }

  const dbUser = result.rows[0];
  // --- Fetch User Pitches
  const recordingsResult = await pool.query(
    `
    SELECT sr.*, 
           ap.name AS avatar_name,
           ap.image_url AS avatar_image_url,
           ap.slug AS avatar_slug
    FROM "SessionRecording" sr
    JOIN "AvatarPersona" ap ON sr.avatar_id = ap.id
    WHERE sr.user_id = $1
    ORDER BY sr.created_at DESC

    `,
    [dbUser.id],
  );
  const userPitches = recordingsResult.rows;

  res.status(200).json({
    user: {
      id: dbUser.id,
      supabaseUserId: dbUser.supabase_user_id,
      wallet_address: dbUser.wallet_address,
      handle: dbUser.handle,
      role: dbUser.role,
      credits: dbUser.credits || 0,
      meta: dbUser.meta,
      created_at: dbUser.created_at,
      pitches: userPitches,
      email: dbUser.email,
      pfp_url: dbUser.pfp_url,
    },
  });
});

/**
 * Get all available avatar personas/judges
 */
router.get("/personas", async (req, res, next) => {
  const result = await pool.query(
    'SELECT id,slug, name, description, x_url, pricing_per_min, is_published, image_url, model_uri, category, meta, preferred_genres as "preferredGenres", audio_references as "audioReferences", vision_enabled, vision_capture_interval FROM "AvatarPersona" WHERE is_published = TRUE ORDER BY name',
  );

  res.json({
    personas: result.rows,
  });
});

// Get conversation history for user-avatar pair
router.get(
  "/conversation-history/:avatarId",
  verifyJWTMiddleware,
  async (req, res, next) => {
    try {
      const { avatarId } = req.params;
      const userId = req.user.userId;
      const limit = parseInt(req.query.limit) || 50; // Default to 50 messages
      const days = parseInt(req.query.days) || 7; // Default to last 7 days

      console.log("[API] Fetching conversation history:", {
        userId,
        avatarId,
        limit,
        days,
      });

      // Fetch recent call sessions for this user-avatar pair
      const sessionResult = await pool.query(
        `
      SELECT 
        cs.transcript,
        cs.started_at,
        cs.ended_at
      FROM "CallSession" cs
      WHERE cs.user_id = $1 
        AND cs.avatar_id = $2 
        AND cs.transcript IS NOT NULL 
        AND jsonb_array_length(cs.transcript) > 0
      ORDER BY cs.started_at DESC
      LIMIT 10  -- Limit to last 10 sessions
    `,
        [userId, avatarId],
      );

      console.log("[API] Found sessions:", sessionResult.rows.length);

      // Debug: Log transcript content structure for first session
      if (sessionResult.rows.length > 0 && sessionResult.rows[0].transcript) {
        const firstTranscript = sessionResult.rows[0].transcript;
        console.log("[API] First session transcript sample:", {
          messageCount: firstTranscript.length,
          firstMessage: firstTranscript[0],
          hasMultimodalMessages: firstTranscript.some((msg) =>
            Array.isArray(msg.content),
          ),
        });
      }

      // Fetch completed music generations for this user-avatar pair
      const musicResult = await pool.query(
        `
      SELECT 
        mg.id,
        mg.generation_type,
        mg.input_lyrics,
        mg.input_genres,
        mg.output_audio_url,
        mg.created_at,
        mg.completed_at
      FROM music_generations mg
      WHERE mg.user_id = $1 
        AND mg.avatar_id = $2 
        AND mg.status = 'completed'
        AND mg.output_audio_url IS NOT NULL
        AND mg.created_at >= NOW() - INTERVAL '1 day' * $3
      ORDER BY mg.created_at DESC
      LIMIT 20  -- Limit to last 20 music generations
    `,
        [userId, avatarId, days],
      );

      console.log("[API] Found music generations:", musicResult.rows.length);

      // Process text messages from sessions
      const allMessages = [];
      const messageHash = new Set();
      let imageMessageCount = 0;

      for (const session of sessionResult.rows) {
        if (session.transcript && Array.isArray(session.transcript)) {
          session.transcript.forEach((message) => {
            if (message.role === "user" || message.role === "assistant") {
              // Handle both string content and multimodal content (array with text/images)
              let textContent = message.content;
              let imageData = null;
              let imageUrl = null;

              if (Array.isArray(message.content)) {
                // Extract text and image from multimodal message
                const textPart = message.content.find(
                  (part) => part.type === "text",
                );
                const imagePart = message.content.find(
                  (part) => part.type === "image_url",
                );

                textContent = textPart ? textPart.text : "[Image]";

                // Extract image data if present
                if (
                  imagePart &&
                  imagePart.image_url &&
                  imagePart.image_url.url
                ) {
                  imageUrl = imagePart.image_url.url;
                  imageData = {
                    url: imageUrl,
                    description: textContent, // Use the text as description for context
                  };
                }
              } else if (message.imageUrl && message.type === "image") {
                // Handle style generation messages that have imageUrl field
                imageData = {
                  url: message.imageUrl,
                  description: "AI-generated style suggestion",
                };
                // Remove markdown from text content
                textContent = textContent
                  .replace(/!\[.*?\]\(.*?\)/g, "")
                  .trim();
              }

              // Skip user-sent images (vision captures) from chat history
              if (message.role === "user" && (imageData || imageUrl)) {
                return; // Don't include user's captured images
              }

              // Create a more unique hash key that includes image information
              let hashKey;
              if (imageUrl || message.imageUrl) {
                // For image messages, use the full image URL as the unique identifier
                hashKey = `${message.role}-image-${imageUrl || message.imageUrl}`;
              } else {
                // For text messages, use role and text content
                hashKey = `${message.role}-${textContent.trim()}`;
              }

              if (messageHash.has(hashKey)) {
                return; // skip duplicate
              }
              messageHash.add(hashKey);

              const messageObj = {
                id: `history-${session.started_at}-${allMessages.length}`,
                text: textContent,
                sender: message.role === "user" ? "user" : "avatar",
                timestamp:
                  new Date(session.started_at).getTime() +
                  allMessages.length * 1000, // Approximate timing
                type: imageData ? "image" : "text",
              };

              // Add imageData if present (only for assistant/avatar messages now)
              if (imageData) {
                messageObj.imageData = imageData;
                imageMessageCount++;
              }

              allMessages.push(messageObj);
            }
          });
        }
      }

      // Process music generations
      for (const generation of musicResult.rows) {
        // Add user request message (lyrics generation)
        if (
          generation.generation_type === "lyrics" &&
          generation.input_lyrics
        ) {
          const lyricsHash = `user-${generation.input_lyrics.trim()}`;
          if (!messageHash.has(lyricsHash)) {
            allMessages.push({
              id: `music-request-${generation.id}`,
              text: generation.input_lyrics,
              sender: "user",
              timestamp: new Date(generation.created_at).getTime(),
              type: "text",
            });
            messageHash.add(lyricsHash);
          }
        }

        // Add music result message if available
        if (generation.output_audio_url) {
          const musicResultMessage = {
            id: `music-result-${generation.id}`,
            text: `Created a ${generation.generation_type} track`,
            sender: "avatar",
            timestamp: new Date(
              generation.completed_at || generation.created_at,
            ).getTime(),
            type: "music_result",
            musicData: {
              audioUrl: generation.output_audio_url,
              title: `Generated ${generation.generation_type}`,
              lyrics: generation.input_lyrics,
              genres: generation.input_genres || [],
            },
          };
          allMessages.push(musicResultMessage);
        }
      }

      // Sort messages by timestamp
      allMessages.sort((a, b) => a.timestamp - b.timestamp);

      // Limit messages
      const recentMessages = allMessages.slice(-limit);

      console.log("[API] Returning messages:", {
        messageCount: recentMessages.length,
        imageMessageCount: imageMessageCount,
        totalSessions: sessionResult.rows.length,
        totalMusicGenerations: musicResult.rows.length,
      });

      res.json({
        success: true,
        messages: recentMessages,
        totalSessions: sessionResult.rows.length,
        totalMusicGenerations: musicResult.rows.length,
      });
    } catch (error) {
      console.error("[API] Error fetching conversation history:", error);
      res.status(500).json({ error: "Failed to fetch conversation history" });
    }
  },
);

// Debug endpoint to check multimodal messages
router.get(
  "/debug/multimodal-messages/:avatarId",
  verifyJWTMiddleware,
  async (req, res, next) => {
    const userId = req.user.userId;
    const { avatarId } = req.params;

    try {
      // Get the most recent session with multimodal content
      const result = await pool.query(
        `
      SELECT 
        cs.id,
        cs.started_at,
        cs.transcript
      FROM "CallSession" cs
      WHERE cs.user_id = $1 
        AND cs.avatar_id = $2 
        AND cs.transcript IS NOT NULL
      ORDER BY cs.started_at DESC
      LIMIT 1
    `,
        [userId, avatarId],
      );

      if (result.rows.length === 0) {
        return res.json({
          message: "No sessions found",
          hasMultimodalMessages: false,
        });
      }

      const session = result.rows[0];
      const transcript = session.transcript || [];

      // Analyze the transcript for multimodal messages
      const multimodalMessages = transcript.filter(
        (msg) =>
          Array.isArray(msg.content) &&
          msg.content.some((part) => part.type === "image_url"),
      );

      const analysis = {
        sessionId: session.id,
        startedAt: session.started_at,
        totalMessages: transcript.length,
        multimodalMessageCount: multimodalMessages.length,
        multimodalMessages: multimodalMessages.map((msg, idx) => ({
          index: transcript.indexOf(msg),
          role: msg.role,
          hasText: msg.content.some((part) => part.type === "text"),
          hasImage: msg.content.some((part) => part.type === "image_url"),
          textContent:
            msg.content.find((part) => part.type === "text")?.text ||
            "[No text]",
          imageUrlLength:
            msg.content.find((part) => part.type === "image_url")?.image_url
              ?.url?.length || 0,
        })),
      };

      res.json(analysis);
    } catch (error) {
      console.error("[Debug] Error analyzing multimodal messages:", error);
      res.status(500).json({ error: "Failed to analyze messages" });
    }
  },
);

// Debug endpoint to check CallSession data
router.get("/debug/sessions", verifyJWTMiddleware, async (req, res, next) => {
  const userId = req.user.userId;

  // Get count of all sessions for this user
  const totalCount = await pool.query(
    'SELECT COUNT(*) FROM "CallSession" WHERE user_id = $1',
    [userId],
  );

  // Get count of sessions with transcripts
  const withTranscripts = await pool.query(
    'SELECT COUNT(*) FROM "CallSession" WHERE user_id = $1 AND transcript IS NOT NULL',
    [userId],
  );

  // Get recent sessions
  const recentSessions = await pool.query(
    `
    SELECT 
      id,
      avatar_id,
      started_at,
      ended_at,
      CASE 
        WHEN transcript IS NOT NULL THEN jsonb_array_length(transcript)
        ELSE 0
      END as transcript_length
    FROM "CallSession" 
    WHERE user_id = $1 
    ORDER BY started_at DESC 
    LIMIT 5
  `,
    [userId],
  );

  res.json({
    userId,
    totalSessions: parseInt(totalCount.rows[0].count),
    sessionsWithTranscripts: parseInt(withTranscripts.rows[0].count),
    recentSessions: recentSessions.rows,
  });
});

export default router;
