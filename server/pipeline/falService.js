import { fal } from '@fal-ai/client';
import { logger } from '../lib/cloudwatch-logger.js';
import storageService from '../services/storage.js';
import fetch from 'node-fetch';

// Configure FAL.ai client once
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
} else {
  logger.warn('[FAL] No FAL_KEY found in environment variables');
}

/**
 * Helper function to copy media from FAL URL to our persistent storage
 */
async function copyToPersistentStorage(falUrl, key, contentType) {
  try {
    const response = await fetch(falUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const publicUrl = await storageService.uploadFile(key, buffer, contentType);
    return publicUrl;
  } catch (error) {
    logger.error('[FAL] Failed to copy to persistent storage', {
      error: error.message,
      key,
      component: 'falService'
    });
    return null;
  }
}

/**
 * Generate music from text prompt
 */
export async function generateMusicFromText(prompt, genres = [], sessionId, referenceAudioUrl, duration = 30, topK = 250, topP = 0.95, temperature = 1.0) {
  try {
    logger.info('[FAL] Generating music from text', {
      promptLength: prompt.length,
      genres,
      sessionId,
      referenceAudioUrl,
      duration,
      topK,
      topP,
      temperature,
      component: 'falService'
    });

    const input = {
      prompt,
      duration,
      top_k: topK,
      top_p: topP,
      temperature
    };

    // Add reference_audio_url if provided
    if (referenceAudioUrl) {
      input.reference_audio_url = referenceAudioUrl;
    }

    const result = await fal.subscribe('fal-ai/minimax-music', {
      input
    });

    // Handle both old format (audio_url) and new format (audio.url)
    const audioUrl = result.data?.audio_url || result.data?.audio?.url;
    
    if (!audioUrl) {
      logger.error('[FAL] No audio URL found in response', {
        resultData: result.data,
        component: 'falService'
      });
      throw new Error('No audio generated from fal-ai');
    }

    // Copy to persistent storage
    const timestamp = Date.now();
    const key = `music-generated/text-to-music/${sessionId}-${timestamp}.mp3`;
    const publicUrl = await copyToPersistentStorage(audioUrl, key, 'audio/mpeg');

    return {
      audioUrl: publicUrl || audioUrl,
      falUrl: audioUrl,
      duration: result.data.duration
    };
  } catch (error) {
    logger.error('[FAL] Failed to generate music from text', {
      error: error.message,
      sessionId,
      component: 'falService'
    });
    throw error;
  }
}

/**
 * Remix audio file
 */
export async function remixAudio(audioUrl, referenceAudioUrl, remixStrength = 0.5, sessionId) {
  try {
    logger.info('[FAL] Remixing audio', {
      audioUrl,
      referenceAudioUrl,
      remixStrength,
      sessionId,
      component: 'falService'
    });

    const result = await fal.subscribe('fal-ai/ace-step/audio-to-audio', {
      input: {
        audio_url: audioUrl,
        reference_audio_url: referenceAudioUrl,
        remix_strength: remixStrength
      }
    });

    if (!result.data?.audio_url) {
      throw new Error('No audio generated from remix');
    }

    // Copy to persistent storage
    const timestamp = Date.now();
    const key = `music-generated/audio-remix/${sessionId}-${timestamp}.mp3`;
    const publicUrl = await copyToPersistentStorage(result.data.audio_url, key, 'audio/mpeg');

    return {
      audioUrl: publicUrl || result.data.audio_url,
      falUrl: result.data.audio_url
    };
  } catch (error) {
    logger.error('[FAL] Failed to remix audio', {
      error: error.message,
      sessionId,
      component: 'falService'
    });
    throw error;
  }
}

/**
 * Generate style suggestion using Flux Pro or FASHN try-on
 * @param {string} imageUrl - User's captured image URL
 * @param {string} prompt - Style transformation prompt
 * @param {string} avatarId - Avatar ID for tracking
 * @param {string} sessionId - Session ID for tracking
 * @param {string[]} referenceImageUrls - Optional reference outfit images (for virtual try-on)
 */
export async function generateStyleSuggestion(imageUrl, prompt, avatarId, sessionId, referenceImageUrls = []) {
  try {
    logger.info('[FAL] Generating style suggestion', {
      avatarId,
      sessionId,
      promptLength: prompt.length,
      hasReferenceImages: referenceImageUrls.length > 0,
      referenceImageCount: referenceImageUrls.length,
      component: 'falService'
    });

    // Helper function to handle localhost URLs
    const prepareImageUrl = async (url) => {
      if (url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
        try {
          const response = await fetch(url);
          const buffer = await response.buffer();
          const falUrl = await uploadToFalStorage(buffer);
          logger.info('[FAL] Uploaded localhost image to FAL storage', {
            originalUrl: url,
            falUrl: falUrl,
            component: 'falService'
          });
          return falUrl;
        } catch (error) {
          logger.error('[FAL] Failed to upload localhost image to FAL', {
            url,
            error: error.message,
            component: 'falService'
          });
          throw new Error(`Cannot upload local image to FAL: ${error.message}`);
        }
      }
      return url;
    };

    // If we have reference images, use the FASHN virtual try-on model
    if (referenceImageUrls.length > 0) {
      // Prepare URLs - upload to FAL if they're localhost URLs
      const preparedModelImage = await prepareImageUrl(imageUrl);
      const preparedGarmentImage = await prepareImageUrl(referenceImageUrls[0]);


      const result = await fal.subscribe('fal-ai/fashn/tryon/v1.6', {
        input: {
          model_image: preparedModelImage,          // User's photo
          garment_image: preparedGarmentImage  // Reference outfit/garment
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            logger.info('[FAL] FASHN try-on progress', {
              logs: update.logs.map((log) => log.message),
              component: 'falService'
            });
          }
        }
      });

      if (!result.data?.images?.[0]?.url) {
        throw new Error('No image generated from FASHN try-on model');
      }

      // Copy to persistent storage
      const generatedImageUrl = result.data.images[0].url;
      const timestamp = Date.now();
      const key = `style-suggestions/${avatarId}/${sessionId}-${timestamp}.png`;
      const publicUrl = await copyToPersistentStorage(generatedImageUrl, key, 'image/png');

      return {
        generatedImageUrl: publicUrl || generatedImageUrl,
        falUrl: generatedImageUrl,
        originalImageUrl: imageUrl,
        referenceImageUrl: referenceImageUrls[0],
        prompt,
        modelUsed: 'fashn-tryon-v1.6'
      };
    } else {
      // Use original single-image model if no reference images
      const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
        input: {
          prompt,
          image_url: imageUrl,
          strength: 0.7, // Moderate changes to preserve person's identity
          num_inference_steps: 28,
          guidance_scale: 3.5,
          image_size: 'square_hd',
          safety_tolerance: "6",
        }
      });

      if (!result.data?.images?.[0]?.url) {
        throw new Error('No image generated from fal-ai');
      }

      // Copy to persistent storage
      const generatedImageUrl = result.data.images[0].url;
      const timestamp = Date.now();
      const key = `style-suggestions/${avatarId}/${sessionId}-${timestamp}.png`;
      const publicUrl = await copyToPersistentStorage(generatedImageUrl, key, 'image/png');

      return {
        generatedImageUrl: publicUrl || generatedImageUrl,
        falUrl: generatedImageUrl,
        originalImageUrl: imageUrl,
        prompt,
        modelUsed: 'flux-pro-kontext'
      };
    }
  } catch (error) {
    logger.error('[FAL] Failed to generate style suggestion', {
      error: error.message,
      avatarId,
      sessionId,
      hasReferenceImages: referenceImageUrls.length > 0,
      component: 'falService'
    });
    throw error;
  }
}

/**
 * Upload file to FAL storage (for processing)
 */
export async function uploadToFalStorage(buffer) {
  try {
    const falUrl = await fal.storage.upload(buffer);
    return falUrl;
  } catch (error) {
    logger.error('[FAL] Failed to upload to FAL storage', {
      error: error.message,
      component: 'falService'
    });
    throw error;
  }
}

/**
 * Get queue status for a FAL request
 */
export async function getQueueStatus(modelName, options) {
  try {
    return await fal.queue.status(modelName, options);
  } catch (error) {
    logger.error('[FAL] Failed to get queue status', {
      error: error.message,
      modelName,
      component: 'falService'
    });
    throw error;
  }
}

/**
 * Get queue result for a FAL request
 */
export async function getQueueResult(modelName, options) {
  try {
    return await fal.queue.result(modelName, options);
  } catch (error) {
    logger.error('[FAL] Failed to get queue result', {
      error: error.message,
      modelName,
      component: 'falService'
    });
    throw error;
  }
}

export default {
  generateMusicFromText,
  remixAudio,
  generateStyleSuggestion,
  uploadToFalStorage,
  getQueueStatus,
  getQueueResult
};