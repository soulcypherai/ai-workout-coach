import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';

interface ReferenceOutfit {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  description: string;
}

interface EditedOutfit extends Partial<ReferenceOutfit> {
  isNew?: boolean;
}

interface ReferenceOutfitsManagerProps {
  value: ReferenceOutfit[];
  onChange: (outfits: ReferenceOutfit[]) => void;
  personaId: string;
}

export const ReferenceOutfitsManager: React.FC<ReferenceOutfitsManagerProps> = ({ 
  value = [], 
  onChange, 
  personaId 
}) => {
  const [uploadingStates, setUploadingStates] = useState<Record<string, boolean>>({});
  const [editedOutfits, setEditedOutfits] = useState<Record<string, EditedOutfit>>({});
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({});
  
  const handleAddOutfit = () => {
    const newOutfit: ReferenceOutfit = {
      id: `outfit-${Date.now()}`,
      name: '',
      brand: '',
      imageUrl: '',
      description: ''
    };
    
    // Just add to local state - don't save to backend yet
    onChange([...value, newOutfit]);
    
    // Mark this outfit as new and unsaved
    setEditedOutfits(prev => ({
      ...prev,
      [newOutfit.id]: {
        name: '',
        brand: '',
        imageUrl: '',
        description: '',
        isNew: true
      }
    }));
  };

  const handleFieldChange = (id: string, field: keyof ReferenceOutfit, value: string) => {
    setEditedOutfits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveOutfit = async (id: string) => {
    const edits = editedOutfits[id];
    const outfit = value.find(o => o.id === id);
    
    if (!outfit) return;

    setSavingStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Check if this is a new outfit
      if (edits?.isNew) {
        // Merge the original outfit data with any edits
        const outfitToSave = { ...outfit, ...edits };
        delete outfitToSave.isNew; // Remove the isNew flag
        
        // Create new outfit in backend
        const response = await fetch(`${API_URL}/api/admin/personas/${personaId}/outfits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ outfit: outfitToSave })
        });

        if (!response.ok) {
          throw new Error('Failed to create outfit');
        }
        
        toast.success('Outfit created');
      } else {
        // Update existing outfit
        const updates = { ...edits };
        delete updates.isNew; // Remove the isNew flag
        
        if (Object.keys(updates).length === 0) {
          return;
        }
        
        const response = await fetch(`${API_URL}/api/admin/personas/${personaId}/outfits/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ updates })
        });

        if (!response.ok) {
          throw new Error('Failed to update outfit');
        }
        
        toast.success('Outfit saved');
      }
      
      // Update local state with the saved values
      const updatedOutfits = value.map(o => 
        o.id === id ? { ...o, ...edits, isNew: undefined } : o
      );
      onChange(updatedOutfits.filter(o => o.id)); // Filter out any invalid outfits
      
      // Clear edited state for this outfit
      setEditedOutfits(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      
    } catch (error) {
      console.error('Error saving outfit:', error);
      toast.error('Failed to save outfit');
    } finally {
      setSavingStates(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteOutfit = async (id: string) => {
    // Check if this is a new outfit that hasn't been saved yet
    if (editedOutfits[id]?.isNew) {
      // Just remove from local state
      onChange(value.filter(outfit => outfit.id !== id));
      setEditedOutfits(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/admin/personas/${personaId}/outfits/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete outfit');
      }

      // Update local state
      onChange(value.filter(outfit => outfit.id !== id));
      toast.success('Outfit deleted');
    } catch (error) {
      console.error('Error deleting outfit:', error);
      toast.error('Failed to delete outfit');
    }
  };

  const handleImageUpload = async (file: File, outfitId: string) => {
    setUploadingStates(prev => ({ ...prev, [outfitId]: true }));
    
    try {
      // Get signed URL
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const signedUrlResponse = await fetch(`${API_URL}/api/admin/avatar-image-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileExtension: fileExtension
        })
      });

      if (!signedUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await signedUrlResponse.json();

      // Upload to S3 or local storage based on environment
      const isProduction = import.meta.env.PROD;
      let uploadResponse;
      
      if (isProduction) {
        // For production: direct S3 upload
        uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
      } else {
        // For local development: upload through backend
        const formData = new FormData();
        formData.append('image', file);
        
        // Extract key from uploadUrl
        const urlParts = uploadUrl.split('/');
        const key = urlParts[urlParts.length - 1];
        
        uploadResponse = await fetch(`${API_URL}/api/admin/upload-avatar-image/${key}`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
      }

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const outfit = value.find(o => o.id === outfitId);
      const updates: Partial<ReferenceOutfit> = { imageUrl: publicUrl };
      
      // If name is empty, use filename
      if (outfit && !outfit.name) {
        const fileName = file.name.split('.')[0].replace(/[-_]/g, ' ');
        updates.name = fileName;
      }
      
      // Update the outfit directly since this is an immediate action
      try {
        const response = await fetch(`${API_URL}/api/admin/personas/${personaId}/outfits/${outfitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ updates })
        });

        if (!response.ok) {
          throw new Error('Failed to update outfit after image upload');
        }

        const updatedOutfits = value.map(outfit => 
          outfit.id === outfitId ? { ...outfit, ...updates } : outfit
        );
        onChange(updatedOutfits);
      } catch (error) {
        console.error('Error updating outfit after image upload:', error);
        throw error;
      }
      
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploadingStates(prev => ({ ...prev, [outfitId]: false }));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-300">Reference Outfits</label>
        <Button
          type="button"
          onClick={handleAddOutfit}
          size="sm"
          variant="outline"
          className="flex items-center gap-1 px-2 py-1 text-xs"
        >
          <Plus size={14} />
          Add Outfit
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="text-xs text-gray-500 italic">No reference outfits added. Click "Add Outfit" to start.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {value.map((outfit) => (
            <div key={outfit.id} className="bg-gray-800 rounded-lg overflow-hidden">
              {/* Image Section */}
              <div className="relative aspect-[3/4] bg-gray-900">
                {outfit.imageUrl && outfit.imageUrl.trim() !== '' ? (
                  <div className="relative group h-full">
                    <img 
                      src={outfit.imageUrl} 
                      alt={outfit.name || 'Outfit preview'}
                      className="w-full h-full object-cover"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      id={`image-upload-${outfit.id}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, outfit.id);
                      }}
                      className="hidden"
                      disabled={uploadingStates[outfit.id]}
                    />
                    <label
                      htmlFor={`image-upload-${outfit.id}`}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                    >
                      <Upload size={20} className="text-white" />
                    </label>
                    <Button
                      type="button"
                      onClick={() => handleDeleteOutfit(outfit.id)}
                      size="sm"
                      variant="ghost"
                      className="absolute top-1 right-1 text-white bg-black/50 hover:bg-black/70 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ) : (
                  <div className="relative h-full">
                    <input
                      type="file"
                      accept="image/*"
                      id={`image-upload-${outfit.id}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, outfit.id);
                      }}
                      className="hidden"
                      disabled={uploadingStates[outfit.id]}
                    />
                    <label
                      htmlFor={`image-upload-${outfit.id}`}
                      className="w-full h-full flex flex-col items-center justify-center bg-gray-700 hover:bg-gray-600 cursor-pointer"
                    >
                      <Upload size={24} className="text-gray-400 mb-2" />
                      <span className="text-xs text-gray-400">Upload Image</span>
                    </label>
                    <Button
                      type="button"
                      onClick={() => handleDeleteOutfit(outfit.id)}
                      size="sm"
                      variant="ghost"
                      className="absolute top-1 right-1 text-white bg-black/50 hover:bg-black/70 p-1"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>

              {/* Metadata Section */}
              <div className="p-2 space-y-1.5">
                <Input
                  value={editedOutfits[outfit.id]?.name !== undefined ? editedOutfits[outfit.id].name : outfit.name}
                  onChange={(e) => handleFieldChange(outfit.id, 'name', e.target.value)}
                  placeholder="Name"
                  className="bg-gray-700 border-gray-600 text-white text-xs h-7 px-2"
                />
                <Input
                  value={editedOutfits[outfit.id]?.brand !== undefined ? editedOutfits[outfit.id].brand : outfit.brand}
                  onChange={(e) => handleFieldChange(outfit.id, 'brand', e.target.value)}
                  placeholder="Brand"
                  className="bg-gray-700 border-gray-600 text-white text-xs h-7 px-2"
                />
                <Input
                  value={editedOutfits[outfit.id]?.description !== undefined ? editedOutfits[outfit.id].description : outfit.description}
                  onChange={(e) => handleFieldChange(outfit.id, 'description', e.target.value)}
                  placeholder="Description"
                  className="bg-gray-700 border-gray-600 text-white text-xs h-7 px-2"
                />
                
                {/* Save button - always show for new outfits or when there are changes */}
                {(editedOutfits[outfit.id]?.isNew || (editedOutfits[outfit.id] && Object.keys(editedOutfits[outfit.id]).filter(k => k !== 'isNew').length > 0)) && (
                  <Button
                    type="button"
                    onClick={() => handleSaveOutfit(outfit.id)}
                    disabled={savingStates[outfit.id]}
                    size="sm"
                    className="w-full h-7 text-xs bg-accent hover:bg-accent/80 text-black"
                  >
                    {savingStates[outfit.id] ? 'Saving...' : editedOutfits[outfit.id]?.isNew ? 'Save Outfit' : 'Save Changes'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 mt-1">
        Add reference outfits for AI virtual try-on.
      </div>
    </div>
  );
};