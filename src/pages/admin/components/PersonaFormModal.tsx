import { useEffect, useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/ui/TagInput';
import { ReferenceOutfitsManager } from './ReferenceOutfitsManager';
import { EXERCISE } from '@/lib/exercises';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';
const IS_PRODUCTION = import.meta.env.PROD;

export interface Persona {
  id?: string;
  slug?: string;
  name: string;
  description?: string;
  voiceId: string;
  modelUri?: string;
  imageUrl?: string;
  xUrl?: string;
  pricingPerMin: number;
  is_published: boolean;
  category?: string;
  preferredGenres?: string[];
  audioReferences?: string[];
  vision_enabled?: boolean;
  vision_capture_interval?: number;
  systemPrompt: string;
  personality?: string | any;
  meta?: any;
  referenceOutfits?: any[];
  createdAt?: string;
  updatedAt?: string;
}

interface PersonaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  persona?: Persona | null;
  onSave: (persona: Persona) => Promise<void>;
  title?: string;
}

export const PersonaFormModal: React.FC<PersonaFormModalProps> = ({
  isOpen,
  onClose,
  persona,
  onSave,
  title = 'Persona Form'
}) => {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Persona>({
    name: '',
    description: '',
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    modelUri: '',
    imageUrl: '',
    xUrl: '',
    pricingPerMin: 30,
    is_published: false,
    category: '',
    preferredGenres: [],
    audioReferences: [],
    vision_enabled: false,
    vision_capture_interval: 5,
    systemPrompt: '',
    personality: '{}',
    meta: {},
    referenceOutfits: []
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (persona) {
      setFormData({
        ...persona,
        personality: typeof persona.personality === 'object' 
          ? JSON.stringify(persona.personality, null, 2) 
          : persona.personality || '{}',
        meta: typeof persona.meta === 'object' 
          ? persona.meta 
          : (persona.meta ? JSON.parse(persona.meta) : {}),
        referenceOutfits: persona.referenceOutfits || []
      });
    } else {
      // Reset to default values for new persona
      setFormData({
        name: '',
        description: '',
        voiceId: 'pNInz6obpgDQGcFmaJgB',
        modelUri: '',
        imageUrl: '',
        xUrl: '',
        pricingPerMin: 30,
        is_published: false,
        category: '',
        preferredGenres: [],
        audioReferences: [],
        vision_enabled: false,
        vision_capture_interval: 5,
        systemPrompt: '',
        personality: '{}',
        meta: {},
        referenceOutfits: []
      });
    }
  }, [persona]);

  const handleFileUpload = async (
    file: File,
    type: 'image' | 'model',
    setUploading: (value: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    setUploading(true);
    try {
      // Get file extension
      const fileExtension = file.name.split('.').pop() || (type === 'image' ? 'jpg' : 'glb');
      
      // Get upload URL from backend
      const response = await fetch(`${API_URL}/api/admin/avatar-image-upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ fileExtension }),
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await response.json();

      let uploadResponse;
      if (!IS_PRODUCTION) {
        // For local development, use FormData
        const formData = new FormData();
        formData.append('image', file);
        
        uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
      } else {
        // For production, use S3 pre-signed URL
        uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': type === 'image' ? file.type : 'model/gltf-binary',
          },
        });
      }

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${type}`);
      }

      // Update form with the new URL
      if (type === 'image') {
        setFormData({ ...formData, imageUrl: publicUrl });
      } else {
        setFormData({ ...formData, modelUri: publicUrl });
      }
      toast.success(`${type === 'image' ? 'Image' : '3D model'} uploaded successfully`);
    } catch (error) {
      console.error(`Error uploading ${type}:`, error);
      toast.error(`Failed to upload ${type}`);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    await handleFileUpload(file, 'image', setIsUploadingImage, fileInputRef as React.RefObject<HTMLInputElement>);
  };

  const handleModelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file extension
    const fileExtension = file.name.toLowerCase().split('.').pop();
    if (fileExtension !== 'glb' && fileExtension !== 'gltf') {
      toast.error('Please select a .glb or .gltf file');
      return;
    }

    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('3D model size must be less than 50MB');
      return;
    }

    await handleFileUpload(
      file,
      'model',
      setIsUploadingModel,
      modelFileInputRef as React.RefObject<HTMLInputElement>
    );
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving persona:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl h-[90vh] bg-gray-900 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Enter persona name"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Brief description"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Voice ID *</label>
                <Input
                  value={formData.voiceId}
                  onChange={(e) => setFormData({...formData, voiceId: e.target.value})}
                  placeholder="ElevenLabs voice ID"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Model URI</label>
                <div className="flex gap-2">
                  <Input
                    value={formData.modelUri}
                    onChange={(e) => setFormData({...formData, modelUri: e.target.value})}
                    placeholder="Enter 3D model URL or upload"
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 flex-1"
                    disabled={isUploadingModel}
                  />
                  <input
                    ref={modelFileInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    onChange={handleModelUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => modelFileInputRef.current?.click()}
                    disabled={isUploadingModel}
                    className="flex items-center gap-2"
                    variant="outline"
                  >
                    <Upload size={16} />
                    {isUploadingModel ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Avatar Image</label>
              <div className="flex gap-2">
                <Input
                  value={formData.imageUrl || ''}
                  onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                  placeholder="Enter image URL or upload"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 flex-1"
                  disabled={isUploadingImage}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Upload size={16} />
                  {isUploadingImage ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
              {formData.imageUrl && (
                <div className="mt-2">
                  <img 
                    src={formData.imageUrl} 
                    alt="Avatar preview" 
                    className="w-20 h-20 object-cover rounded-lg border border-gray-600"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">X (Twitter) URL</label>
                <Input
                  value={formData.xUrl}
                  onChange={(e) => setFormData({...formData, xUrl: e.target.value})}
                  placeholder="https://x.com/username"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Pricing (Credits per min)</label>
                <Input
                  type="number"
                  value={formData.pricingPerMin}
                  onChange={(e) => setFormData({...formData, pricingPerMin: parseInt(e.target.value)})}
                  min="1"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
            </div>

            {/* Category and Publishing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full p-2 border border-gray-600 rounded-md bg-gray-800 text-white"
                >
                  <option value="">Select Category</option>
                  <option value="vc">Venture Capital</option>
                  <option value="creator">Creator</option>
                  <option value="fitness">Fitness Coach</option>
                </select>
              </div>
              <div className="flex items-center space-x-2 mt-6">
                <input
                  type="checkbox"
                  id="published"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({...formData, is_published: e.target.checked})}
                  className="rounded border-gray-600 bg-gray-800 text-blue-600"
                />
                <label htmlFor="published" className="text-sm font-medium text-gray-300 cursor-pointer">
                  Published (visible on homepage)
                </label>
              </div>
            </div>

            {/* Reference Outfits - Only for Stylists */}

            {/* Music Production Fields - Only for Producers */}
            {formData.category === 'producer' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-200">Music Production Settings</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Preferred Genres</label>
                  <TagInput
                    value={formData.preferredGenres || []}
                    onChange={(tags) => setFormData({...formData, preferredGenres: tags})}
                    placeholder="Add genres (e.g., hip-hop, electronic)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Audio References</label>
                  <TagInput
                    value={formData.audioReferences || []}
                    onChange={(urls) => setFormData({...formData, audioReferences: urls})}
                    placeholder="Add audio reference URLs"
                  />
                </div>
              </div>
            )}

            {/* Exercise Configuration - Only for Fitness/Coach */}
            {formData.category === 'fitness' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-200">Available Exercises</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: EXERCISE.SQUATS, defaultSets: 3, defaultReps: 10 },
                    { name: EXERCISE.PUSH_UPS, defaultSets: 3, defaultReps: 8 },
                    { name: EXERCISE.LUNGES, defaultSets: 3, defaultReps: 10 },
                    { name: EXERCISE.JUMPING_JACKS, defaultSets: 3, defaultReps: 15 },
                    { name: EXERCISE.PLANKS, defaultSets: 3, defaultReps: 30 },
                    { name: EXERCISE.CHIN_UPS, defaultSets: 3, defaultReps: 5 }
                  ].map((exercise) => {
                    const exercises = formData.meta?.exercises || [];
                    const isEnabled = exercises.some((e: any) => e.name === exercise.name && e.enabled);
                    
                    return (
                      <div key={exercise.name} className="flex items-center space-x-2 p-3 bg-gray-800 rounded-lg">
                        <input
                          type="checkbox"
                          id={`exercise-${exercise.name}`}
                          checked={isEnabled}
                          onChange={(e) => {
                            const newExercises = [...exercises];
                            const existingIndex = newExercises.findIndex((ex: any) => ex.name === exercise.name);
                            
                            if (e.target.checked) {
                              if (existingIndex >= 0) {
                                newExercises[existingIndex] = { ...newExercises[existingIndex], enabled: true };
                              } else {
                                newExercises.push({
                                  name: exercise.name,
                                  enabled: true,
                                  sets: exercise.defaultSets,
                                  reps: exercise.defaultReps,
                                  rest: 60
                                });
                              }
                            } else {
                              if (existingIndex >= 0) {
                                newExercises[existingIndex] = { ...newExercises[existingIndex], enabled: false };
                              }
                            }
                            
                            setFormData({
                              ...formData,
                              meta: {
                                ...formData.meta,
                                exercises: newExercises
                              }
                            });
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600"
                        />
                        <label htmlFor={`exercise-${exercise.name}`} className="text-sm font-medium text-gray-300 cursor-pointer">
                          {exercise.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vision Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-200">Vision Settings</h3>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="vision-enabled"
                  checked={formData.vision_enabled || false}
                  onChange={(e) => setFormData({...formData, vision_enabled: e.target.checked})}
                  className="rounded border-gray-600 bg-gray-800 text-blue-600"
                />
                <label htmlFor="vision-enabled" className="text-sm font-medium text-gray-300 cursor-pointer">
                  Enable Vision Capabilities
                </label>
              </div>
              {formData.vision_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Vision Capture Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    value={formData.vision_capture_interval || 5}
                    onChange={(e) => setFormData({...formData, vision_capture_interval: parseInt(e.target.value) || 5})}
                    min="1"
                    max="60"
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-200">Advanced Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Personality JSON</label>
                  <textarea
                    className="w-full p-3 border border-gray-600 rounded-md h-24 bg-gray-800 text-white placeholder-gray-400"
                    value={formData.personality || ''}
                    onChange={(e) => setFormData({...formData, personality: e.target.value})}
                    placeholder='{"tone": "friendly", "style": "casual"}'
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Meta JSON</label>
                  <textarea
                    className="w-full p-3 border border-gray-600 rounded-md h-24 bg-gray-800 text-white placeholder-gray-400"
                    value={typeof formData.meta === 'object' ? JSON.stringify(formData.meta, null, 2) : formData.meta}
                    onChange={(e) => setFormData({...formData, meta: e.target.value})}
                    placeholder='{"additionalInfo": "custom metadata"}'
                  />
                </div>
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">System Prompt *</label>
              <textarea
                className="w-full p-3 border border-gray-600 rounded-md h-48 bg-gray-800 text-white placeholder-gray-400"
                value={formData.systemPrompt}
                onChange={(e) => setFormData({...formData, systemPrompt: e.target.value})}
                placeholder="Enter the system prompt for this persona..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 flex-shrink-0 bg-gray-900">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !formData.name || !formData.voiceId || !formData.systemPrompt}
          >
            {isSaving ? 'Saving...' : (persona ? 'Update Persona' : 'Create Persona')}
          </Button>
        </div>
      </div>
    </div>
  );
};