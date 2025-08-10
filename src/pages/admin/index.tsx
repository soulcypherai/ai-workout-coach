import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Edit, Plus, LogOut, Users, MessageSquare, Coins } from "lucide-react";
import { toast } from "sonner";
import { logError } from "@/lib/errorLogger";
import AdminLoginModal from "./components/AdminLoginModal";
import CommunityFeedAudit from "./components/CommunityFeedAudit";
import CreditManagement from "./components/CreditManagement";
import CreditPricing from "./components/CreditPricing";
import { PersonaFormModal, type Persona } from "./components/PersonaFormModal";


const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';


const AdminPanel = () => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  // URL state management for tabs
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'personas' | 'community' | 'credits') || 'personas';
  
  const setActiveTab = (tab: 'personas' | 'community' | 'credits') => {
    setSearchParams({ tab });
  };

  // Admin auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [admin, setAdmin] = useState<any>(null);


  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    try {
      // Try to verify existing session
      const response = await fetch(`${API_URL}/api/admin/auth/verify`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setAdmin(data.admin);
        await fetchPersonas();
      } else {
        setShowLoginModal(true);
      }
    } catch (error) {
      logError('Auth check failed', error, { section: 'admin' });
      setShowLoginModal(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonas = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/personas`, {
        credentials: 'include',
      });
      
      if (response.status === 401) {
        setIsAuthenticated(false);
        setShowLoginModal(true);
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setPersonas(data);
      }
    } catch (error) {
      logError('Error fetching personas', error, { section: 'admin' });
    }
  };

  const handleLogin = (adminData: any) => {
    setAdmin(adminData);
    setIsAuthenticated(true);
    setShowLoginModal(false);
    fetchPersonas();
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      toast.success('Logged out successfully');
    } catch (error) {
      logError('Logout error', error, { section: 'admin' });
    } finally {
      setIsAuthenticated(false);
      setAdmin(null);
      setPersonas([]);
      setShowLoginModal(true);
    }
  };

  const handleOpenModal = (persona?: Persona) => {
    if (persona) {
      setEditingPersona(persona);
      setIsCreating(false);
    } else {
      setEditingPersona(null);
      setIsCreating(true);
    }
    setIsModalOpen(true);
  };

  const handleSavePersona = async (personaData: Persona) => {
    try {
      if (isCreating) {
        // Create new persona
        const response = await fetch(`${API_URL}/api/admin/personas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(personaData),
        });
        
        if (response.ok) {
          toast.success('Persona created successfully');
          await fetchPersonas();
        } else {
          const errorData = await response.json();
          toast.error(`Failed to create persona: ${errorData.error || 'Unknown error'}`);
          throw new Error(errorData.error || 'Failed to create persona');
        }
      } else {
        // Update existing persona
        const response = await fetch(`${API_URL}/api/admin/personas/${personaData.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(personaData),
        });
        
        if (response.ok) {
          toast.success('Persona updated successfully');
          await fetchPersonas();
        } else {
          const errorData = await response.json();
          toast.error(`Update failed: ${errorData.error || 'Unknown error'}`);
          throw new Error(errorData.error || 'Failed to update persona');
        }
      }
    } catch (error) {
      logError('Error saving persona', error, { section: 'admin', personaId: personaData.id });
      throw error;
    }
  };

  if (loading) {
    return <div className="p-8 bg-black min-h-screen"><div className="text-white">Loading...</div></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-8 bg-black min-h-screen">
        <AdminLoginModal
          isOpen={showLoginModal}
          onLogin={handleLogin}
        />
        <div className="text-center text-white">
          <h1 className="text-3xl font-bold mb-4">Admin Panel</h1>
          <p className="text-gray-400">Authentication required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full mx-auto bg-black min-h-screen">
      <AdminLoginModal
        isOpen={showLoginModal}
        onLogin={handleLogin}
      />
      
      {isAuthenticated && (
        <div className="w-full">
                      <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
                <p className="text-sm text-gray-400 mt-1">Logged in as: {admin?.username}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleLogout}
                  variant="outline"
                  className="flex items-center gap-2 text-red-400 border-red-400 hover:bg-red-400 hover:text-white"
                >
                  <LogOut size={16} />
                  Logout
                </Button>
              </div>
            </div>

          {/* Tabs */}
          <div className="flex space-x-1 mb-8 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('personas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'personas'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Users size={16} />
              Personas
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'community'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <MessageSquare size={16} />
              Community Feed
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'credits'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Coins size={16} />
              Credits
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'personas' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Persona Management</h2>
                <Button 
                  onClick={() => handleOpenModal()}
                  className="flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add New Persona
                </Button>
              </div>

              <div className="space-y-4">
                {personas.map((persona) => (
                  <div key={persona.id} className="bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-lg">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {persona.imageUrl && (
                              <img 
                                src={persona.imageUrl} 
                                alt={persona.name}
                                className="w-12 h-12 object-cover rounded-lg border border-gray-600"
                              />
                            )}
                            <div>
                              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                {persona.name}
                                {persona.is_published && (
                                  <span className="px-2 py-1 text-sm bg-green-600 text-white rounded-full">
                                    Published
                                  </span>
                                )}
                              </h3>
                              <p className="text-gray-400 text-sm">ID: {persona.id}</p>
                            </div>
                        </div>
                        <Button 
                            onClick={() => handleOpenModal(persona)} 
                            className="flex items-center gap-2"
                            size="sm"
                          >
                            <Edit size={14} />
                            Edit
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Description</label>
                            <p className="text-base text-gray-200">{persona.description || 'N/A'}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Pricing (Credits per min)</label>
                            <p className="text-base text-gray-200">{persona.pricingPerMin}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Category</label>
                            <p className="text-base text-gray-200">{persona.category || 'N/A'}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Created</label>
                            <p className="text-base text-gray-200">
                              {persona.createdAt ? new Date(persona.createdAt).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Voice ID</label>
                            <p className="text-base text-gray-200 font-mono break-all">{persona.voiceId}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Model URI</label>
                            <p className="text-base text-gray-200 break-all">{persona.modelUri || 'N/A'}</p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">X/Twitter URL</label>
                            {persona.xUrl ? (
                              <a 
                                href={persona.xUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-base text-blue-400 hover:text-blue-300 break-all"
                              >
                                {persona.xUrl}
                              </a>
                            ) : (
                              <p className="text-base text-gray-200">N/A</p>
                            )}
                          </div>
                      </div>

                      {/* Music Co-Production Display */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Preferred Genres</label>
                            <div className="flex flex-wrap gap-1">
                              {persona.preferredGenres && persona.preferredGenres.length > 0 ? (
                                persona.preferredGenres.map((genre, index) => (
                                  <span key={index} className="px-2 py-1 text-sm bg-blue-600 text-white rounded">
                                    {genre}
                                  </span>
                                ))
                              ) : (
                                <p className="text-base text-gray-200">No genres set</p>
                              )}
                            </div>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Audio References</label>
                            <div className="space-y-1">
                              {persona.audioReferences && persona.audioReferences.length > 0 ? (
                                persona.audioReferences.map((url, index) => (
                                  <a 
                                    key={index}
                                    href={url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="block text-sm text-blue-400 hover:text-blue-300 break-all"
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <p className="text-base text-gray-200">No audio references</p>
                              )}
                            </div>
                          </div>
                      </div>

                      {/* Vision Settings Display */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Vision Enabled</label>
                            <p className="text-base text-gray-200">
                              {persona.vision_enabled ? (
                                <span className="text-green-400">Enabled</span>
                              ) : (
                                <span className="text-red-400">Disabled</span>
                              )}
                            </p>
                          </div>
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400">Vision Capture Interval</label>
                            <p className="text-base text-gray-200">{persona.vision_capture_interval} seconds</p>
                          </div>
                      </div>

                      {/* Reference Outfits Display (for Stylists) */}
                      {persona.category === 'stylist' && persona.referenceOutfits && persona.referenceOutfits.length > 0 && (
                          <div className="bg-gray-800 p-3 rounded-lg">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Reference Outfits ({persona.referenceOutfits.length})</label>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {persona.referenceOutfits.map((outfit: any, index: number) => (
                                <div key={outfit.id || index} className="bg-gray-900 p-2 rounded">
                                  {outfit.imageUrl && (
                                    <img 
                                      src={outfit.imageUrl} 
                                      alt={outfit.name || `Outfit ${index + 1}`}
                                      className="w-full h-20 object-cover rounded mb-1"
                                    />
                                  )}
                                  <p className="text-sm text-white font-medium truncate">{outfit.name || 'Unnamed'}</p>
                                  {outfit.brand && <p className="text-sm text-gray-400 truncate">{outfit.brand}</p>}
                                  {outfit.tags && outfit.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {outfit.tags.slice(0, 2).map((tag: string, i: number) => (
                                        <span key={i} className="text-xs bg-gray-700 text-gray-300 px-1 rounded">
                                          {tag}
                                        </span>
                                      ))}
                                      {outfit.tags.length > 2 && (
                                        <span className="text-xs text-gray-500">+{outfit.tags.length - 2}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                      )}

                      <div className="flex gap-3">
                          <details className="bg-gray-800 rounded-lg flex-1">
                            <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex items-center gap-1">
                              <span className="text-gray-500">▸</span> Personality JSON
                            </summary>
                            <div className="px-3 pb-3">
                              <pre className="text-sm text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto max-h-32">
                                {typeof persona.personality === 'object' 
                                  ? JSON.stringify(persona.personality, null, 2)
                                  : persona.personality || '{}'}
                              </pre>
                            </div>
                          </details>

                          <details className="bg-gray-800 rounded-lg flex-1">
                            <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex items-center gap-1">
                              <span className="text-gray-500">▸</span> Meta JSON
                            </summary>
                            <div className="px-3 pb-3">
                              <pre className="text-sm text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto max-h-32">
                                {typeof persona.meta === 'object' 
                                  ? JSON.stringify(persona.meta, null, 2)
                                  : persona.meta || '{}'}
                              </pre>
                            </div>
                          </details>

                          <details className="bg-gray-800 rounded-lg flex-1">
                            <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex items-center gap-1">
                              <span className="text-gray-500">▸</span> System Prompt
                            </summary>
                            <div className="px-3 pb-3">
                              <div className="text-sm text-gray-300 bg-gray-900 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {persona.systemPrompt || 'No system prompt defined'}
                              </div>
                            </div>
                          </details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {personas.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-400">No personas found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'community' && (
            <CommunityFeedAudit />
          )}

          {activeTab === 'credits' && (
            <div className="space-y-6">
              <CreditPricing />
              <CreditManagement />
            </div>
          )}
        </div>
      )}
      
      {/* Persona Form Modal */}
      <PersonaFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPersona(null);
        }}
        persona={editingPersona}
        onSave={handleSavePersona}
        title={editingPersona ? 'Edit Persona' : 'Create New Persona'}
      />
    </div>
  );
};

export default AdminPanel; 