import React from 'react';
import { Upload, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  uploadingImages?: Record<string, boolean>;
  imagePreviewUrls?: Record<string, string>;
  handleImageUpload?: (file: File, personaId?: string) => void;
  removeImagePreview?: (personaId?: string) => void;
  personaId?: string;
  label: string;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({ 
  value, 
  onChange, 
  uploadingImages = {},
  imagePreviewUrls = {},
  handleImageUpload,
  removeImagePreview,
  personaId, 
  label 
}) => {
  const uploadKey = personaId || 'new';
  const isUploading = uploadingImages[uploadKey];
  const previewUrl = imagePreviewUrls[uploadKey] || value;
  
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="space-y-2">
        {previewUrl && (
          <div className="relative inline-block">
            <img 
              src={previewUrl} 
              alt="Avatar preview" 
              className="w-20 h-20 object-cover rounded border border-gray-600"
            />
            {removeImagePreview && (
              <button
                type="button"
                onClick={() => removeImagePreview(personaId)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {handleImageUpload && (
            <>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload(file, personaId);
                  }
                }}
                className="hidden"
                id={`image-upload-${uploadKey}`}
                disabled={isUploading}
              />
              <label
                htmlFor={`image-upload-${uploadKey}`}
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-600 rounded-md cursor-pointer hover:bg-gray-800 ${
                  isUploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Upload size={16} />
                {isUploading ? 'Uploading...' : 'Upload Image'}
              </label>
            </>
          )}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={handleImageUpload ? "Or enter image URL manually" : "Enter image URL"}
            className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 flex-1"
          />
        </div>
      </div>
    </div>
  );
};

export default ImageUploadField;