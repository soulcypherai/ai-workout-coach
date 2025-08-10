import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  loading?: boolean;
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  confirmVariant = "default",
  loading = false
}: ConfirmationModalProps) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-lg font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="mb-6">
          <p className="text-gray-300 text-sm leading-relaxed">
            {message}
          </p>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            variant={confirmVariant}
            size="sm"
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal; 