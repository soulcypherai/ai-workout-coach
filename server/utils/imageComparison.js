import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Calculate the difference between two base64 images
 * @param {string} base64Image1 - First image in base64 format
 * @param {string} base64Image2 - Second image in base64 format
 * @param {number} threshold - Difference threshold (0-1, default 0.1 = 10% difference)
 * @returns {Promise<{isDifferent: boolean, differencePercentage: number}>}
 */
export async function compareImages(base64Image1, base64Image2, threshold = 0.1) {
  try {
    // Convert base64 to buffer
    const buffer1 = Buffer.from(base64Image1, 'base64');
    const buffer2 = Buffer.from(base64Image2, 'base64');
    
    // Resize images to a standard size for comparison (to save processing time)
    const targetWidth = 320;
    const targetHeight = 240;
    
    // Convert to PNG and resize
    const [img1, img2] = await Promise.all([
      sharp(buffer1)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .png()
        .toBuffer(),
      sharp(buffer2)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .png()
        .toBuffer()
    ]);
    
    // Parse PNG data
    const png1 = PNG.sync.read(img1);
    const png2 = PNG.sync.read(img2);
    
    // Create diff buffer
    const diff = new PNG({ width: targetWidth, height: targetHeight });
    
    // Calculate pixel difference
    const numDiffPixels = pixelmatch(
      png1.data,
      png2.data,
      diff.data,
      targetWidth,
      targetHeight,
      { threshold: 0.1 } // Pixel-level threshold
    );
    
    // Calculate difference percentage
    const totalPixels = targetWidth * targetHeight;
    const differencePercentage = numDiffPixels / totalPixels;
    
    return {
      isDifferent: differencePercentage > threshold,
      differencePercentage: Math.round(differencePercentage * 100) / 100
    };
  } catch (error) {
    // If comparison fails, assume images are different
    console.error('Image comparison error:', error.message);
    return {
      isDifferent: true,
      differencePercentage: 1
    };
  }
}

/**
 * Simple hash function for image deduplication
 * @param {string} base64Image - Image in base64 format
 * @returns {Promise<string>} - Hash of the image
 */
export async function hashImage(base64Image) {
  try {
    const buffer = Buffer.from(base64Image, 'base64');
    
    // Resize to very small size and get buffer
    const thumbnail = await sharp(buffer)
      .resize(64, 64, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
    
    // Simple hash based on pixel values
    let hash = 0;
    for (let i = 0; i < thumbnail.length; i += 10) {
      hash = ((hash << 5) - hash) + thumbnail[i];
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  } catch (error) {
    // Fallback to timestamp-based hash
    return Date.now().toString(36);
  }
}