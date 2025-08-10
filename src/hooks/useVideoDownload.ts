import { useState } from "react";

interface DownloadOptions {
  videoUrl: string;
  fileName?: string;
  addWatermark?: boolean;
}

export const useVideoDownload = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Simple download without watermark (reusing community post pattern)
  const downloadVideoSimple = async ({ videoUrl, fileName = 'video.mp4' }: DownloadOptions) => {
    try {
      setIsProcessing(true);
      setError(null);
      setProgress(20);

      const response = await fetch(videoUrl, { mode: "cors" });
      if (!response.ok) throw new Error('Failed to fetch video');
      
      setProgress(50);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      setProgress(80);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setProgress(100);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 20000);

    } catch (err) {
      console.error('Download failed:', err);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  // Server-side watermarking download
  const downloadVideoWithWatermark = async ({ videoUrl, fileName = 'pitch-video.mp4' }: DownloadOptions) => {
    try {
      setIsProcessing(true);
      setError(null);
      setProgress(20);

      // Call server endpoint to add watermark
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';
      const response = await fetch(`${serverUrl}/api/watermark-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl,
          watermarkText: 'AI Shark Tank\nAISharktank.com',
          position: 'bottom-right'
        }),
      });

      if (!response.ok) throw new Error('Watermarking failed');

      setProgress(60);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      setProgress(80);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setProgress(100);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 20000);

    } catch (err) {
      console.error('Watermark download failed:', err);
      setError(err instanceof Error ? err.message : 'Watermarking failed');
      
      // Fallback to simple download
      console.log('Falling back to simple download...');
      await downloadVideoSimple({ videoUrl, fileName });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  // Main download function
  const downloadVideo = async (options: DownloadOptions) => {
    if (options.addWatermark) {
      await downloadVideoWithWatermark(options);
    } else {
      await downloadVideoSimple(options);
    }
  };

  return {
    downloadVideo,
    downloadVideoSimple,
    downloadVideoWithWatermark,
    isProcessing,
    progress,
    error,
    clearError: () => setError(null)
  };
};

export default useVideoDownload;