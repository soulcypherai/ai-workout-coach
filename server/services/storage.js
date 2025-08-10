import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class StorageService {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.localStoragePath = path.join(__dirname, '../uploads');
    
    if (this.isProduction) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      this.bucketName = process.env.S3_BUCKET_NAME;
      this.cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;
    } else {
      this.ensureLocalStorageExists();
    }
  }

  async ensureLocalStorageExists() {
    try {
      await fs.access(this.localStoragePath);
    } catch {
      await fs.mkdir(this.localStoragePath, { recursive: true });
      await fs.mkdir(path.join(this.localStoragePath, 'community-posts'), { recursive: true });
      await fs.mkdir(path.join(this.localStoragePath, 'thumbnails'), { recursive: true });
      await fs.mkdir(path.join(this.localStoragePath, 'avatar-images'), { recursive: true });
    }
  }

  /**
   * Generate a signed URL for uploading content
   */
  async generateUploadUrl(userId, fileExtension = 'mp4') {
    const timestamp = Date.now();
    // Auto-detect WebM extension if not specified
    if (fileExtension === 'mp4') {
      fileExtension = 'webm'; // Default to webm since most recordings are WebM
    }
    const key = `community-posts/${userId}/${timestamp}.${fileExtension}`;

    if (this.isProduction) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: fileExtension === 'mp4' ? 'video/mp4' : 
                    fileExtension === 'webm' ? 'video/webm' : 
                    'application/octet-stream',
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        uploadUrl: signedUrl,
        key,
        publicUrl: `https://${this.cloudFrontDomain}/${key}`,
        expiresIn: 3600
      };
    } else {
      // For local development, return a local file path
      const localPath = path.join(this.localStoragePath, key);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      
      const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3005}`;
      return {
        uploadUrl: `${serverUrl}/api/feed/upload/${encodeURIComponent(key)}`,
        key,
        publicUrl: `${serverUrl}/uploads/${key}`,
        expiresIn: 3600
      };
    }
  }

  /**
   * Get the public URL for a stored file
   */
  getPublicUrl(key) {
    if (this.isProduction) {
      return `https://${this.cloudFrontDomain}/${key}`;
    } else {
      return `http://localhost:${process.env.PORT || 3005}/uploads/${key}`;
    }
  }

  /**
   * Save file locally (for development)
   */
  async saveFileLocally(key, buffer) {
    if (this.isProduction) {
      throw new Error('saveFileLocally should not be called in production');
    }
    
    const filePath = path.join(this.localStoragePath, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Read file locally (for development)
   */
  async readFileLocally(key) {
    if (this.isProduction) {
      throw new Error('readFileLocally should not be called in production');
    }
    
    const filePath = path.join(this.localStoragePath, key);
    return await fs.readFile(filePath);
  }

  /**
   * Process uploaded video file
   */
  async processVideo(key, originalBuffer = null) {
    if (this.isProduction) {
      return this.processVideoS3(key);
    } else {
      return this.processVideoLocal(key, originalBuffer);
    }
  }

  async processVideoS3(key) {
    // Get the original video from S3
    const getCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(getCommand);
    const buffer = Buffer.from(await response.Body.transformToByteArray());

    // Process video and generate thumbnail
    const { thumbnailBuffer, duration, transcript } = await this.processVideoBuffer(buffer);

    // Upload thumbnail to S3
    const thumbnailKey = key.replace('.mp4', '_thumb.jpg').replace('community-posts/', 'thumbnails/');
    const putThumbnailCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
    });

    await this.s3Client.send(putThumbnailCommand);

    return {
      videoUrl: this.getPublicUrl(key),
      thumbnailUrl: this.getPublicUrl(thumbnailKey),
      duration,
      transcript
    };
  }

  async processVideoLocal(key, buffer) {
    // If buffer not provided, read from local storage
    if (!buffer) {
      buffer = await this.readFileLocally(key);
    }

    // Process video and generate thumbnail
    const { thumbnailBuffer, duration, transcript } = await this.processVideoBuffer(buffer);

    // Save thumbnail locally
    const thumbnailKey = key.replace('.mp4', '_thumb.jpg').replace('community-posts/', 'thumbnails/');
    await this.saveFileLocally(thumbnailKey, thumbnailBuffer);

    return {
      videoUrl: this.getPublicUrl(key),
      thumbnailUrl: this.getPublicUrl(thumbnailKey),
      duration,
      transcript
    };
  }

  /**
   * Process video buffer to extract thumbnail, duration, and transcript
   */
   async processVideoBuffer(buffer) {
    const ffmpeg = await import('ffmpeg-static');
    const ffprobe = await import('ffprobe-static');
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const { pipeline } = await import('stream');
    const pipelineAsync = promisify(pipeline);
    
    // Extract the actual path from the ffprobe import
    const ffprobePath = typeof ffprobe.default === 'string' ? ffprobe.default : ffprobe.default.path;
    
    console.log('[Storage] ffmpeg path:', ffmpeg.default);
    console.log('[Storage] ffprobe path:', ffprobePath);
    
    // Validate video buffer
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty or invalid video buffer');
    }
    
    // Check for minimum MP4 file size (should be at least a few KB for valid video)
    if (buffer.length < 1000) {
      throw new Error(`Video buffer too small: ${buffer.length} bytes - likely corrupted`);
    }
    
    // Check for video format signatures
    const headerHex = buffer.slice(0, 32).toString('hex');
    const hasMP4Signature = headerHex.includes('66747970'); // 'ftyp' in hex
    const hasWebMSignature = headerHex.startsWith('1a45dfa3'); // WebM signature
    
    if (!hasMP4Signature && !hasWebMSignature) {
      console.error('[Storage] Invalid video format - missing MP4/WebM signature');
      console.log('[Storage] Header hex:', headerHex);
      throw new Error('Invalid video format - file appears corrupted');
    }
    
    const videoFormat = hasMP4Signature ? 'MP4' : 'WebM';
    console.log('[Storage] Detected video format:', videoFormat);
    
    console.log('[Storage] Processing video buffer of size:', buffer.length);

    // Create temporary files for processing using OS temp directory
    const tempDir = tmpdir();
    
    const tempVideoPath = path.join(tempDir, `temp_${Date.now()}.mp4`);
    const tempThumbnailPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

    try {
      // Write video buffer to temp file
      await fs.writeFile(tempVideoPath, buffer);

      // Generate thumbnail using FFmpeg with fallback for corrupted videos
      await new Promise((resolve, reject) => {
        const ffmpegProcess = spawn(ffmpeg.default, [
          '-i', tempVideoPath,
          '-ss', '00:00:00.5',     // Try earlier timestamp for corrupted videos
          '-vframes', '1',          // Extract exactly 1 frame
          '-vf', 'scale=320:240',   // Scale to thumbnail size
          '-f', 'image2',           // Output format
          '-y',                     // Overwrite output file
          '-loglevel', 'error',     // Reduce verbose output
          tempThumbnailPath
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let errorOutput = '';
        
        ffmpegProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
          if (code === 0) {
            console.log('[Storage] Thumbnail generated successfully');
            resolve();
          } else {
            console.error('[Storage] FFmpeg thumbnail error output:', errorOutput);
            
            // Check for specific corrupted video errors
            if (errorOutput.includes('moov atom not found') || 
                errorOutput.includes('Invalid data found when processing input')) {
              console.warn('[Storage] Video appears corrupted, creating placeholder thumbnail');
              resolve(); // Don't fail, create placeholder instead
            } else {
              reject(new Error(`FFmpeg thumbnail generation failed with code ${code}: ${errorOutput}`));
            }
          }
        });
      });

      // Get video duration
      const duration = await new Promise((resolve, reject) => {
        const ffprobeProcess = spawn(ffprobePath, [
          '-v', 'quiet',
          '-show_entries', 'format=duration',
          '-of', 'csv=p=0',
          tempVideoPath
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let output = '';
        let errorOutput = '';
        
        ffprobeProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        ffprobeProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ffprobeProcess.on('close', (code) => {
          if (code === 0) {
            const outputText = output.trim();
            console.log('[Storage] Raw ffprobe output:', outputText);
            
            if (outputText === 'N/A' || outputText === '') {
              console.warn('[Storage] FFprobe returned N/A or empty duration, defaulting to 10 seconds');
              resolve(10); // Default to 10 seconds for valid but unknown duration videos
            } else {
              const durationValue = parseFloat(outputText);
              if (isNaN(durationValue)) {
                console.warn('[Storage] Invalid duration from ffprobe:', outputText);
                resolve(10); // Default to 10 seconds if duration can't be determined
              } else {
                resolve(Math.round(durationValue));
              }
            }
          } else {
            console.error('[Storage] FFprobe error output:', errorOutput);
            console.warn('[Storage] FFprobe failed, defaulting duration to 10 seconds');
            resolve(10); // Don't fail the entire process for duration
          }
        });
      });

      // Skip audio extraction and transcript generation 
      // We'll use the existing transcript from CallSession table
      const transcript = '';

      // Read generated thumbnail (with fallback)
      let thumbnailBuffer;
      try {
        thumbnailBuffer = await fs.readFile(tempThumbnailPath);
      } catch (error) {
        console.warn('[Storage] Failed to read thumbnail, creating placeholder');
        // Create a simple black placeholder image
        thumbnailBuffer = Buffer.alloc(0); // Empty buffer as fallback
      }

      return {
        thumbnailBuffer,
        duration,
        transcript
      };

    } finally {
      // Clean up temp files
      const filesToCleanup = [tempVideoPath, tempThumbnailPath];
      for (const filePath of filesToCleanup) {
        try {
          await fs.unlink(filePath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.warn(`Failed to clean up temp file ${filePath}:`, err);
          }
        }
      }
    }
  }

  /**
   * Process video after upload (both local and production)
   */
  async processVideoAfterUpload(key, originalBuffer) {
    console.log('[Storage] Processing video for key:', key);
    
    try {
      // Process the video we just saved
      const result = await this.processVideo(key, originalBuffer);
      
      // Update database with processed info
      await this.updatePostAfterProcessing(key, result.videoUrl, result.thumbnailUrl, result.duration);
      
      console.log('[Storage] Video processing completed successfully');
    } catch (error) {
      console.error('[Storage] Video processing failed:', error);
      
      // Try to update with basic info even if processing failed
      try {
        const fallbackVideoUrl = this.getPublicUrl(key);
        const fallbackDuration = 10; // Default duration
        await this.updatePostAfterProcessing(key, fallbackVideoUrl, null, fallbackDuration);
        console.log('[Storage] Updated post with fallback info after processing failure');
      } catch (updateError) {
        console.error('[Storage] Failed to update post with fallback info:', updateError);
      }
      
      // Don't throw - let the post exist with original video
    }
  }


  /**
   * Update database after video processing
   */
  async updatePostAfterProcessing(originalKey, videoUrl, thumbnailUrl, duration) {
    try {
      const pool = (await import('../db/index.js')).default;
      
      // Find the post by video_url pattern
      const findQuery = `
        SELECT cp.id, cs.transcript 
        FROM "CommunityPost" cp
        LEFT JOIN "CallSession" cs ON cp.call_id = cs.id
        WHERE cp.video_url LIKE $1 
        ORDER BY cp.created_at DESC 
        LIMIT 1
      `;
      
      const findResult = await pool.query(findQuery, [`%${originalKey}%`]);
      
      if (findResult.rows.length === 0) {
        console.warn('[Storage] No matching post found for key:', originalKey);
        return;
      }
      
      const { id: postId, transcript } = findResult.rows[0];
      
      // Update with processed URLs and transcript from CallSession
      const updateQuery = `
        UPDATE "CommunityPost" 
        SET 
          video_url = $1,
          thumbnail_url = $2,
          duration_sec = $3,
          transcript = $4
        WHERE id = $5
      `;
      
      await pool.query(updateQuery, [
        videoUrl,
        thumbnailUrl,
        duration,
        transcript || '', // Use transcript from CallSession or empty string
        postId
      ]);
      
      console.log('[Storage] Database updated successfully for post:', postId, 'with transcript length:', (transcript || '').length);
      
    } catch (error) {
      console.error('[Storage] Failed to update database:', error);
    }
  }

  /**
   * Upload a base64 image to storage (S3 in production, filesystem in development)
   * @param {string} base64Data - Base64 encoded image data (without data URL prefix)
   * @param {string} key - The storage key/path for the image
   * @returns {Promise<string>} The public URL of the uploaded image
   */
  async uploadBase64Image(base64Data, key) {
    const buffer = Buffer.from(base64Data, 'base64');
    // Use existing uploadFile method with proper content type
    return await this.uploadFile(key, buffer, 'image/jpeg');
  }

  /**
   * Generate a signed URL for uploading avatar images
   */
  async generateAvatarImageUploadUrl(userId, fileExtension = 'jpg') {
    const timestamp = Date.now();
    // Use different path for 3D models
    const is3DModel = fileExtension === 'glb' || fileExtension === 'gltf';
    const key = is3DModel 
      ? `avatars/models/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`
      : `avatar-images/${userId}/${timestamp}.${fileExtension}`;

    if (this.isProduction) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: fileExtension === 'jpg' || fileExtension === 'jpeg' ? 'image/jpeg' : 
                    fileExtension === 'png' ? 'image/png' : 
                    fileExtension === 'webp' ? 'image/webp' : 
                    fileExtension === 'glb' ? 'model/gltf-binary' :
                    fileExtension === 'gltf' ? 'model/gltf+json' :
                    'image/jpeg',
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        uploadUrl: signedUrl,
        key,
        publicUrl: `https://${this.cloudFrontDomain}/${key}`,
        expiresIn: 3600
      };
    } else {
      // For local development, return a local file path
      const localPath = path.join(this.localStoragePath, key);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      
      const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3005}`;
      return {
        uploadUrl: `${serverUrl}/api/admin/upload-avatar-image/${encodeURIComponent(key)}`,
        key,
        publicUrl: `${serverUrl}/uploads/${key}`,
        expiresIn: 3600
      };
    }
  }

  async uploadFile(key, buffer, contentType = 'application/octet-stream') {
    if (this.isProduction) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      await this.s3Client.send(command);
      return this.getPublicUrl(key);
    } else {
      await this.saveFileLocally(key, buffer);
      return this.getPublicUrl(key);
    }
  }

  async createTempRecordingDir(recordingId) {
    const dir = path.join(tmpdir(), 'pitchroom_recordings', recordingId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async cleanupTempDir(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (err) {
      console.warn('[Storage] Failed to cleanup temp dir', dirPath, err);
    }
  }
}

export default new StorageService();