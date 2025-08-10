import { useEffect } from "react";
import { X, Download } from "lucide-react";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  description?: string;
}

const ImageModal = ({
  isOpen,
  onClose,
  imageUrl,
  description
}: ImageModalProps) => {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `style-suggestion-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="relative bg-gray-900 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium">
              {description || "Style Suggestion"}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2.5 transition-colors flex items-center gap-2"
                title="Download image"
              >
                <Download className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={onClose}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2.5 transition-colors"
                title="Close"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Image Container */}
        <div className="flex items-center justify-center bg-black/20">
          <img
            src={imageUrl}
            alt={description || "Style suggestion"}
            className="max-h-[80vh] w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
};

export default ImageModal;