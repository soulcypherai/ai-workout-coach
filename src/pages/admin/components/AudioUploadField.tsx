import React from 'react';
import { Upload, X } from 'lucide-react';
import { TagInput } from '@/components/ui/TagInput';

interface AudioUploadFieldProps {
  value: string[];
  onChange: (urls: string[]) => void;
  uploadingAudios?: Record<string, boolean>;
  audioPreviewUrls?: Record<string, string>;
  handleAudioUpload?: (file: File, personaId?: string) => void;
  removeAudioPreview?: (personaId?: string) => void;
  personaId?: string;
  label: string;
}

export const AudioUploadField: React.FC<AudioUploadFieldProps> = ({ 
  value, 
  onChange, 
  uploadingAudios = {},
  audioPreviewUrls = {},
  handleAudioUpload,
  removeAudioPreview,
  personaId, 
  label 
}) => {
  const uploadKey = personaId || 'new';
  const isUploading = uploadingAudios[uploadKey];
  const previewUrl = audioPreviewUrls[uploadKey];
  
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="space-y-2">
        {previewUrl && (
          <div className="relative inline-block">
            <audio 
              src={previewUrl} 
              controls
              className="w-64 h-12"
            />
            {removeAudioPreview && (
              <button
                type="button"
                onClick={() => removeAudioPreview(personaId)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
        {handleAudioUpload && (
          <div className="flex gap-2">
            <input
              type="file"
              accept="audio/mp3,audio/wav,audio/ogg,audio/m4a"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleAudioUpload(file, personaId);
                }
              }}
              className="hidden"
              id={`audio-upload-${uploadKey}`}
              disabled={isUploading}
            />
            <label
              htmlFor={`audio-upload-${uploadKey}`}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-600 rounded-md cursor-pointer hover:bg-gray-800 ${
                isUploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Upload size={16} />
              {isUploading ? 'Uploading...' : 'Upload Audio'}
            </label>
          </div>
        )}
        <TagInput
          value={value || []}
          onChange={onChange}
          placeholder={handleAudioUpload ? "Or add audio URL manually..." : "Add audio URL..."}
        />
      </div>
    </div>
  );
};

export default AudioUploadField;