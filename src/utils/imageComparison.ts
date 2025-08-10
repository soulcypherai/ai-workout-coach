import pixelmatch from 'pixelmatch';

/**
 * Compare two base64 images using pixelmatch
 * Returns true if images are similar (below difference threshold)
 */
export async function areImagesSimilar(
  imageData1: string | null, 
  imageData2: string | null,
  threshold: number = 0.15 // 15% difference threshold
): Promise<boolean> {
  if (!imageData1 || !imageData2) return false;
  
  try {
    // Create temporary canvases for comparison
    const canvas1 = document.createElement('canvas');
    const canvas2 = document.createElement('canvas');
    const ctx1 = canvas1.getContext('2d', { willReadFrequently: true });
    const ctx2 = canvas2.getContext('2d', { willReadFrequently: true });
    
    if (!ctx1 || !ctx2) return false;
    
    // Load images
    const img1 = new Image();
    const img2 = new Image();
    
    await Promise.all([
      new Promise<void>((resolve) => {
        img1.onload = () => resolve();
        img1.src = imageData1;
      }),
      new Promise<void>((resolve) => {
        img2.onload = () => resolve();
        img2.src = imageData2;
      })
    ]);
    
    // Resize to small size for faster comparison
    const compareWidth = 320;
    const compareHeight = 240;
    
    canvas1.width = compareWidth;
    canvas1.height = compareHeight;
    canvas2.width = compareWidth;
    canvas2.height = compareHeight;
    
    ctx1.drawImage(img1, 0, 0, compareWidth, compareHeight);
    ctx2.drawImage(img2, 0, 0, compareWidth, compareHeight);
    
    // Get image data
    const imageData1Obj = ctx1.getImageData(0, 0, compareWidth, compareHeight);
    const imageData2Obj = ctx2.getImageData(0, 0, compareWidth, compareHeight);
    
    // Create diff buffer
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = compareWidth;
    diffCanvas.height = compareHeight;
    const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true });
    if (!diffCtx) return false;
    
    const diffImageData = diffCtx.createImageData(compareWidth, compareHeight);
    
    // Calculate pixel difference using pixelmatch
    const numDiffPixels = pixelmatch(
      imageData1Obj.data,
      imageData2Obj.data,
      diffImageData.data,
      compareWidth,
      compareHeight,
      { threshold: 0.1 } // Pixel-level threshold for color difference
    );
    
    // Calculate difference percentage
    const totalPixels = compareWidth * compareHeight;
    const differencePercentage = numDiffPixels / totalPixels;
    
    // Log for debugging
    if (differencePercentage > 0.01) {
      console.log(`[Image Comparison] Difference: ${(differencePercentage * 100).toFixed(2)}%`);
    }
    
    // Return true if images are similar (difference is below threshold)
    return differencePercentage < threshold;
    
  } catch (error) {
    console.error('Image comparison error:', error);
    return false;
  }
}