import { useState } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import useVideoDownload from "@/hooks/useVideoDownload";

interface DownloadButtonProps {
  videoUrl: string;
  fileName?: string;
  className?: string;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
  addWatermark?: boolean;
}

const DownloadButton = ({ 
  videoUrl, 
  fileName, 
  className,
  variant = 'icon',
  size = 'md',
  addWatermark = false
}: DownloadButtonProps) => {
  const { downloadVideo, isProcessing, progress, error, clearError } = useVideoDownload();
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDownload = async () => {
    if (isProcessing) return;

    clearError();
    
    // Generate filename if not provided
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const defaultFileName = fileName || `pitch-${timestamp}.mp4`;
    
    await downloadVideo({
      videoUrl,
      fileName: defaultFileName,
      addWatermark
    });

    if (!error) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }
  };

  const iconSizeMap = {
    sm: 16,
    md: 20,
    lg: 24
  };

  const buttonSizeMap = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4',
    lg: 'h-12 px-6 text-lg'
  };

  if (variant === 'button') {
    return (
      <div className="relative">
        <button
          onClick={handleDownload}
          disabled={isProcessing}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 text-black font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
            buttonSizeMap[size],
            className
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 size={iconSizeMap[size]} className="animate-spin" />
              {progress > 0 && <span>{progress}%</span>}
            </>
          ) : showSuccess ? (
            <>
              <CheckCircle size={iconSizeMap[size]} />
              Downloaded
            </>
          ) : error ? (
            <>
              <AlertCircle size={iconSizeMap[size]} />
              Retry
            </>
          ) : (
            <>
              <Download size={iconSizeMap[size]} />
              Download
            </>
          )}
        </button>
        
        {error && (
          <div className="absolute top-full left-0 mt-1 z-50 rounded-md bg-red-600 px-2 py-1 text-xs text-white shadow-lg">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Icon variant
  return (
    <div className="relative">
      <button
        onClick={handleDownload}
        disabled={isProcessing}
        className={cn(
          "flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all duration-200 hover:bg-black/70 disabled:opacity-50 disabled:cursor-not-allowed",
          size === 'sm' && 'h-8 w-8',
          size === 'md' && 'h-10 w-10',
          size === 'lg' && 'h-12 w-12',
          className
        )}
        title={isProcessing ? `Downloading... ${progress}%` : error ? `Error: ${error}` : 'Download video'}
      >
        {isProcessing ? (
          <Loader2 size={iconSizeMap[size]} className="animate-spin text-white" />
        ) : showSuccess ? (
          <CheckCircle size={iconSizeMap[size]} className="text-green-400" />
        ) : error ? (
          <AlertCircle size={iconSizeMap[size]} className="text-red-400" />
        ) : (
          <Download size={iconSizeMap[size]} className="text-white" />
        )}
      </button>

      {/* Progress indicator for icon variant */}
      {isProcessing && progress > 0 && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 z-50 rounded-md bg-black/80 px-2 py-1 text-xs text-white">
          {progress}%
        </div>
      )}

      {/* Error tooltip for icon variant */}
      {error && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 z-50 rounded-md bg-red-600 px-2 py-1 text-xs text-white">
          {error}
        </div>
      )}
    </div>
  );
};

export default DownloadButton;