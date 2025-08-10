import express from 'express';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * Add watermark to video
 */
router.post('/watermark-video', async (req, res) => {
  const { videoUrl, watermarkText = 'AI Shark Tank\nAISharktank.com', position = 'bottom-right' } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  const tempId = uuidv4();
  const tempDir = path.join(tmpdir(), 'watermark', tempId);
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPath = path.join(tempDir, 'output.mp4');

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Define paths first
    const logoPath = path.resolve(__dirname, '../../public/watermark-logo.png');
    const textPath = path.resolve(__dirname, '../../public/watermark-text.png');

    console.log(`[Watermark] Processing video: ${videoUrl}`);
    console.log(`[Watermark] Logo path: ${logoPath}`);
    console.log(`[Watermark] Text path: ${textPath}`);

    // Download video to temp file
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error('Failed to fetch video');
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(inputPath, Buffer.from(buffer));
    
    const filterComplex = `
      [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[scaled];
      [1:v]scale=150:150[logo];
      [2:v]scale=200:-1[text];
      [scaled][logo]overlay=main_w-overlay_w-20:80:format=auto:alpha=0.7[with_logo];
      [with_logo][text]overlay=main_w-overlay_w-20:240:format=auto:alpha=0.7[final]
    `.replace(/\s+/g, '');

    // Add watermark using FFmpeg with QuickTime-compatible settings
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(ffmpegPath, [
        '-i', inputPath,
        '-i', logoPath,           // Logo input
        '-i', textPath,           // Text image input
        '-filter_complex', filterComplex,
        '-map', '[final]',        // Use the final video output
        '-map', '0:a?',           // Map audio if it exists
        '-c:v', 'libx264',        // H.264 codec for better compatibility
        '-profile:v', 'baseline', // Baseline profile for maximum compatibility
        '-level', '3.1',          // Level 3.1 for wide device compatibility
        '-pix_fmt', 'yuv420p',    // Pixel format required for QuickTime
        '-c:a', 'aac',            // AAC audio codec for better compatibility
        '-ac', '2',               // Stereo audio
        '-ar', '48000',           // 48kHz sample rate
        '-b:a', '128k',           // Audio bitrate
        '-movflags', '+faststart', // Move moov atom to beginning for streaming
        '-f', 'mp4',              // Force MP4 container format
        '-y', // Overwrite output file
        outputPath
      ]);

      let errorOutput = '';
      
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        // Log video info and filter progress
        if (output.includes('Input #0') || output.includes('Stream #0:0')) {
          console.log(`[Watermark] Input video info: ${output.split('\n')[0]}`);
        }
        if (output.includes('overlay')) {
          console.log(`[Watermark] Filter progress: ${output.split('\n')[0]}`);
        }
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[Watermark] Video processed successfully');
          resolve();
        } else {
          console.error('[Watermark] FFmpeg error:', errorOutput);
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        console.error('[Watermark] FFmpeg spawn error:', error);
        reject(error);
      });
    });

    // Stream the watermarked video back to client
    const outputBuffer = await fs.readFile(outputPath);
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', outputBuffer.length);
    res.setHeader('Content-Disposition', 'attachment; filename="watermarked-video.mp4"');
    
    res.send(outputBuffer);

  } catch (error) {
    console.error('[Watermark] Processing failed:', error);
    res.status(500).json({ 
      error: 'Video watermarking failed',
      details: error.message 
    });
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('[Watermark] Cleanup failed:', cleanupError);
    }
  }
});

export default router;