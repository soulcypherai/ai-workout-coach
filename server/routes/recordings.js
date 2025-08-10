import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import pool from '../db/index.js';
import storageService from '../services/storage.js';
import { v4 as uuidv4 } from 'uuid';
import { verifyJWTMiddleware } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), 'uploads') });

// Active recording sessions
const activeRecordings = new Map();

/**
 * Start a new recording session
 */
router.post('/start', async (req, res, next) => {
  const { sessionId, avatarId, userId, mimeType } = req.body;
  
  if (!sessionId || !avatarId || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const recordingId = uuidv4();
  const tempDir = path.join(os.tmpdir(), 'recordings', recordingId);
  
  // Create temp directory for chunks
  await fs.mkdir(tempDir, { recursive: true });
  
  // Store recording metadata
  activeRecordings.set(recordingId, {
    sessionId,
    avatarId,
    userId,
    mimeType,
    tempDir,
    chunks: [],
    startTime: Date.now()
  });

  console.log(`[Recordings] Started recording session: ${recordingId}`);
  
  res.json({ recordingId });
});

/**
 * Upload a recording chunk
 */
router.post('/chunk', upload.single('chunk'), async (req, res, next) => {
  const { recordingId, chunkIndex } = req.body;
  const chunkFile = req.file;
  
  if (!recordingId || !chunkFile) {
    return res.status(400).json({ error: 'Missing recording ID or chunk' });
  }

  const recording = activeRecordings.get(recordingId);
  if (!recording) {
    return res.status(404).json({ error: 'Recording session not found' });
  }

  // Move chunk to recording directory
  const chunkPath = path.join(recording.tempDir, `chunk_${chunkIndex.padStart(6, '0')}.webm`);
  await fs.rename(chunkFile.path, chunkPath);
  
  // Track chunk
  recording.chunks.push({
    index: parseInt(chunkIndex),
    path: chunkPath,
    size: chunkFile.size
  });

  console.log(`[Recordings] Received chunk ${chunkIndex} for recording ${recordingId}`);
  
  res.json({ success: true });
});

/**
 * Finalize recording and create video
 */
router.post('/finish', async (req, res, next) => {
  const { recordingId, totalChunks, duration } = req.body;
  
  const recording = activeRecordings.get(recordingId);
  if (!recording) {
    return res.status(404).json({ error: 'Recording session not found' });
  }

  console.log(`[Recordings] Finalizing recording ${recordingId} with ${recording.chunks.length} chunks`);

  let videoUrl = null;
  let thumbnailUrl = null;
  let processedDuration = duration || 0;
  let fileSize = 0;

  try {
    // Sort chunks by index
    recording.chunks.sort((a, b) => a.index - b.index);
    
    // Concatenate chunks into single video file
    const outputPath = path.join(recording.tempDir, 'final_video.webm');
    await concatenateChunks(recording.chunks, outputPath);
    
    // Read the final video buffer
    const videoBuffer = await fs.readFile(outputPath);
    fileSize = videoBuffer.length;
    
    // Process video (generate thumbnail, validate, etc.)
    const processedData = await storageService.processVideoBuffer(videoBuffer);
    processedDuration = processedData.duration || duration || 0;
    
    // For now, save video locally and use local URLs
    const videoKey = `recordings/${recordingId}/video.mp4`;
    const thumbnailKey = `recordings/${recordingId}/thumbnail.jpg`;
    
    await storageService.saveFileLocally(videoKey, videoBuffer);
    videoUrl = storageService.getPublicUrl(videoKey);
    
    if (processedData.thumbnailBuffer && processedData.thumbnailBuffer.length > 0) {
      await storageService.saveFileLocally(thumbnailKey, processedData.thumbnailBuffer);
      thumbnailUrl = storageService.getPublicUrl(thumbnailKey);
    }
    
  } catch (videoError) {
    console.error('[Recordings] Video processing failed, saving recording without video:', videoError);
    // Continue without video - save recording metadata only
  }
    
    // Always save recording to database (even if video processing failed)
    await pool.query(`
      INSERT INTO "SessionRecording" 
      (id, session_id, call_session_id, user_id, avatar_id, video_url, thumbnail_url, duration_sec, created_at, file_size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
      RETURNING *
    `, [
      recordingId,
      recording.sessionId,
      recording.callSessionId || null, // Include the real CallSession ID
      recording.userId,
      recording.avatarId,
      videoUrl,
      thumbnailUrl,
      processedDuration,
      fileSize
    ]);

  // Cleanup temp files
  try {
    await fs.rm(recording.tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.warn('[Recordings] Failed to cleanup temp files:', cleanupError);
  }
  
  activeRecordings.delete(recordingId);
  
  console.log(`[Recordings] Recording ${recordingId} finalized and saved`);
  
  res.json({ 
    recordingId,
    videoUrl,
    thumbnailUrl,
    duration: processedDuration 
  });
});

/**
 * Get user's recordings
 */
router.get('/user/:userId', async (req, res, next) => {
  const { userId } = req.params;
  const { limit = 20, offset = 0 } = req.query;
  
  const result = await pool.query(`
    SELECT 
      sr.*,
      ap.name as avatar_name
    FROM "SessionRecording" sr
    LEFT JOIN "AvatarPersona" ap ON sr.avatar_id = ap.id
    WHERE sr.user_id = $1
    ORDER BY sr.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, parseInt(limit), parseInt(offset)]);
  
  res.json({ recordings: result.rows });
});

/**
 * Publish recording to community
 */
router.post('/publish/:recordingId', async (req, res, next) => {
  const { recordingId } = req.params;
  const { transcript } = req.body;
  
  // Get recording details
  const recordingResult = await pool.query(`
    SELECT * FROM "SessionRecording" WHERE id = $1
  `, [recordingId]);
  
  if (recordingResult.rows.length === 0) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  
  const recording = recordingResult.rows[0];
  
  // Use call_session_id from SessionRecording (added in migration 016) 
  // This directly links to the exact CallSession instead of guessing
  const callId = recording.call_session_id || null;
  // Create community post with proper call_id linkage
  const postResult = await pool.query(`
    INSERT INTO "CommunityPost" 
    (call_id, video_url, thumbnail_url, duration_sec, transcript, handle, wallet_address, posted_by, recording_id)
    SELECT $1, $2, $3, $4, $5, u.handle, u.wallet_address, u.id, $6
    FROM "User" u WHERE u.id = $7
    RETURNING *
  `, [
    callId,
    recording.video_url,
    recording.thumbnail_url,
    recording.duration_sec,
    transcript || '',
    recordingId,
    recording.user_id
  ]);
  
  // --- Move: Mark the recording as published only after successful post creation ---
  await pool.query(
    `UPDATE "SessionRecording" SET is_published = TRUE WHERE id = $1`,
    [recordingId]
  );
  // --- END Move ---
  
  console.log(`[Recordings] Published recording ${recordingId} to community`);
  
  res.json({ 
    success: true,
    post: postResult.rows[0]
  });
});

/**
 * Toggle visibility (hidden flag) of a CommunityPost by sessionRecordingId
 */
router.post('/toggle-visibility/:sessionRecordingId', verifyJWTMiddleware, async (req, res, next) => {
  const { sessionRecordingId } = req.params;
  const userId = req.user.userId;

  // Accept state from body or query param (default: toggle)
  let { state } = req.body;
  if (!state && req.query.state) {
    state = req.query.state;
  }
  // Normalize state
  if (state) state = state.toLowerCase();

  // Find the CommunityPost for this recording and user
  let postResult = await pool.query(
    `SELECT * FROM "CommunityPost" WHERE recording_id = $1 AND posted_by = $2`,
    [sessionRecordingId, userId]
  );

  // If not found, check if SessionRecording exists and create CommunityPost if so
  if (postResult.rows.length === 0) {
    const recordingResult = await pool.query(
      `SELECT * FROM "SessionRecording" WHERE id = $1 AND user_id = $2`,
      [sessionRecordingId, userId]
    );
    if (recordingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found for this user.' });
    }
    const recording = recordingResult.rows[0];
    // Try to get transcript from CallSession
    let transcript = '';
    if (recording.call_session_id) {
      const callSessionResult = await pool.query(
        `SELECT transcript FROM "CallSession" WHERE id = $1`,
        [recording.call_session_id]
      );
      if (callSessionResult.rows.length > 0 && callSessionResult.rows[0].transcript) {
        transcript = callSessionResult.rows[0].transcript;
      }
    }
    // Create CommunityPost (reference: publish route)
    const postInsertResult = await pool.query(
      `INSERT INTO "CommunityPost" 
        (call_id, video_url, thumbnail_url, duration_sec, transcript, handle, wallet_address, posted_by, recording_id)
        SELECT $1, $2, $3, $4, $5, u.handle, u.wallet_address, u.id, $6
        FROM "User" u WHERE u.id = $7
        RETURNING *`,
      [
        recording.call_session_id || null,
        recording.video_url,
        recording.thumbnail_url,
        recording.duration_sec,
        transcript || '',
        sessionRecordingId,
        userId
      ]
    );
    // Mark as published in SessionRecording
    await pool.query(
      `UPDATE "SessionRecording" SET is_published = TRUE WHERE id = $1`,
      [sessionRecordingId]
    );
    postResult = postInsertResult;
  }

  const post = postResult.rows[0];
  let newHidden;
  let newIsPublished;

  if (state === 'private') {
    newHidden = true;
    newIsPublished = false;
  } else if (state === 'public') {
    newHidden = false;
    newIsPublished = true;
  } else {
    // Default: toggle
    newHidden = !post.hidden;
    newIsPublished = !post.hidden; // If hidden, not published; if unhidden, published
  }

  // Update the hidden flag in CommunityPost
  await pool.query(
    `UPDATE "CommunityPost" SET hidden = $1 WHERE id = $2`,
    [newHidden, post.id]
  );

  // Update is_published in SessionRecording
  await pool.query(
    `UPDATE "SessionRecording" SET is_published = $1 WHERE id = $2`,
    [newIsPublished, sessionRecordingId]
  );

  res.json({
    success: true,
    hidden: newHidden,
    is_published: newIsPublished
  });
});

/**
 * Concatenate video chunks into single file
 */
async function concatenateChunks(chunks, outputPath) {
  const chunkPaths = chunks.map(chunk => chunk.path);
  
  // Create file list for ffmpeg
  const fileListPath = path.join(path.dirname(outputPath), 'filelist.txt');
  const fileListContent = chunkPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(fileListPath, fileListContent);
  
  // Use ffmpeg to concatenate
  const { spawn } = await import('child_process');
  const ffmpegPath = (await import('ffmpeg-static')).default;
  
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-f', 'concat',
      '-safe', '0',
      '-i', fileListPath,
      '-c', 'copy',
      outputPath
    ]);
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });
    
    ffmpeg.on('error', reject);
  });
}

export default router; 