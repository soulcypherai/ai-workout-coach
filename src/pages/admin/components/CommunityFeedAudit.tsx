import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, MessageCircle, Heart, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmationModal from "@/components/ui/confirmation-modal";
import { logError } from "@/lib/errorLogger";

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3005';

interface CommunityPost {
  id: string;
  video_url: string;
  thumbnail_url: string;
  duration_sec: number;
  transcript: string;
  handle: string;
  wallet_address: string;
  likes_count: number;
  dislikes_count: number;
  score: number;
  comment_count: number;
  created_at: string;
  hidden?: boolean;
  avatar_id?: string;
  avatar_name?: string;
  avatar_description?: string;
  avatar_image_url?: string;
}

interface Comment {
  id: string;
  body: string;
  handle: string;
  wallet_address: string;
  created_at: string;
}

const CommunityFeedAudit = () => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [videoModal, setVideoModal] = useState<{ postId: string; videoUrl: string; handle: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText: string;
    loading: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    loading: false,
  });

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      // Reuse existing feed endpoint but include hidden posts for admin
      const response = await fetch(`${API_URL}/api/feed?limit=50&includeHidden=true`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      logError('Error fetching posts', error, { section: 'admin_audit' });
      toast.error('Failed to load community posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (postId: string) => {
    if (comments[postId] || loadingComments[postId]) return;

    try {
      setLoadingComments(prev => ({ ...prev, [postId]: true }));
      // Reuse existing comments endpoint
      const response = await fetch(`${API_URL}/api/feed/posts/${postId}/comments`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setComments(prev => ({ ...prev, [postId]: data.comments || [] }));
      }
    } catch (error) {
      logError('Error fetching comments', error, { section: 'admin_audit', postId });
      toast.error('Failed to load comments');
    } finally {
      setLoadingComments(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleExpandPost = (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
    } else {
      setExpandedPost(postId);
      fetchComments(postId);
    }
  };

  const handlePlayVideo = (post: CommunityPost) => {
    setVideoModal({
      postId: post.id,
      videoUrl: post.video_url,
      handle: post.handle || 'Unknown'
    });
  };

  const handleHidePost = (postId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hide Post',
      message: 'Are you sure you want to hide this post? It will be removed from public view but can be restored.',
      confirmText: 'Hide Post',
      loading: false,
      onConfirm: () => confirmHidePost(postId),
    });
  };

  const confirmHidePost = async (postId: string) => {
    setConfirmModal(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`${API_URL}/api/admin/community/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Update post to show as hidden instead of removing it
        setPosts(prev => prev.map(p => 
          p.id === postId ? { ...p, hidden: true } : p
        ));
        setVideoModal(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false, loading: false }));
        toast.success('Post hidden successfully');
      } else {
        const error = await response.json();
        setConfirmModal(prev => ({ ...prev, loading: false }));
        toast.error(error.error || 'Failed to hide post');
      }
    } catch (error) {
      logError('Error hiding post', error, { section: 'admin_audit', postId });
      setConfirmModal(prev => ({ ...prev, loading: false }));
      toast.error('Failed to hide post');
    }
  };

  const handleRestorePost = async (postId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/community/posts/${postId}/restore`, {
        method: 'PATCH',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Update post to show as not hidden
        setPosts(prev => prev.map(p => 
          p.id === postId ? { ...p, hidden: false } : p
        ));
        toast.success('Post restored successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to restore post');
      }
    } catch (error) {
      logError('Error restoring post', error, { section: 'admin_audit', postId });
      toast.error('Failed to restore post');
    }
  };

  const handleDeleteComment = (commentId: string, postId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment? This action cannot be undone.',
      confirmText: 'Delete Comment',
      loading: false,
      onConfirm: () => confirmDeleteComment(commentId, postId),
    });
  };

  const confirmDeleteComment = async (commentId: string, postId: string) => {
    setConfirmModal(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`${API_URL}/api/admin/community/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        setComments(prev => ({
          ...prev,
          [postId]: prev[postId]?.filter(c => c.id !== commentId) || []
        }));
        setConfirmModal(prev => ({ ...prev, isOpen: false, loading: false }));
        toast.success('Comment deleted successfully');
      } else {
        const error = await response.json();
        setConfirmModal(prev => ({ ...prev, loading: false }));
        toast.error(error.error || 'Failed to delete comment');
      }
    } catch (error) {
      logError('Error deleting comment', error, { section: 'admin_audit', commentId, postId });
      setConfirmModal(prev => ({ ...prev, loading: false }));
      toast.error('Failed to delete comment');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Loading community posts...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Community Feed Audit</h2>
        <Button onClick={fetchPosts} variant="outline">
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {!posts || posts.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            No community posts found
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="bg-gray-900 rounded-lg p-4 space-y-3">
              {/* Post Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-black font-bold text-sm">
                      {post.handle?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-white font-medium">@{post.handle || 'Unknown'}</div>
                      {post.hidden && (
                        <span className="px-2 py-1 text-xs bg-red-800 text-red-200 rounded">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm">{formatDate(post.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {post.hidden ? (
                    <Button
                      onClick={() => handleRestorePost(post.id)}
                      variant="outline"
                      size="sm"
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleHidePost(post.id)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Video Preview */}
              <div className="flex gap-4">
                <div className="relative cursor-pointer" onClick={() => handlePlayVideo(post)}>
                  {post.thumbnail_url ? (
                    <img
                      src={post.thumbnail_url}
                      alt="Video thumbnail"
                      className="w-32 h-24 object-cover rounded"
                    />
                  ) : (
                    <div className="w-32 h-24 bg-gray-700 rounded flex items-center justify-center">
                      <PlayCircle className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded hover:bg-black/50 transition-colors">
                    <PlayCircle className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                    {formatTime(post.duration_sec)}
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="text-white text-sm mb-2">
                    <strong>Transcript:</strong>
                  </div>
                  <div className="text-gray-300 text-sm max-h-16 overflow-hidden">
                    {post.transcript || 'No transcript available'}
                  </div>
                </div>
              </div>

              {/* Post Stats */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-gray-400">
                  <Heart className="w-4 h-4" />
                  <span>{post.likes_count}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <MessageCircle className="w-4 h-4" />
                  <span>{post.comment_count}</span>
                </div>
                <div className="text-gray-400">
                  Score: {post.score}
                </div>
              </div>

              {/* Comments Toggle */}
              {post.comment_count > 0 && (
                <Button
                  onClick={() => handleExpandPost(post.id)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {expandedPost === post.id ? 'Hide' : 'Show'} Comments ({post.comment_count})
                </Button>
              )}

              {/* Comments Section */}
              {expandedPost === post.id && (
                <div className="mt-4 space-y-3 border-t border-gray-700 pt-4">
                  {loadingComments[post.id] ? (
                    <div className="text-gray-400 text-center py-4">Loading comments...</div>
                  ) : !comments[post.id] || comments[post.id]?.length === 0 ? (
                    <div className="text-gray-400 text-center py-4">No comments</div>
                  ) : (
                    comments[post.id]?.map((comment) => (
                      <div key={comment.id} className="bg-gray-800 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                              <span className="text-black font-bold text-xs">
                                {comment.handle?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <span className="text-white text-sm font-medium">@{comment.handle || 'Unknown'}</span>
                            <span className="text-gray-400 text-xs">{formatDate(comment.created_at)}</span>
                          </div>
                          <Button
                            onClick={() => handleDeleteComment(comment.id, post.id)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-gray-300 text-sm">{comment.body}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Video Modal */}
      {videoModal && (
        <div 
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
          onClick={() => setVideoModal(null)}
        >
          <div 
            className="bg-gray-900 rounded-lg p-4 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">
                Video by @{videoModal.handle}
              </h3>
              <button
                onClick={() => setVideoModal(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Video Player */}
            <div className="relative">
              <video
                src={videoModal.videoUrl}
                controls
                autoPlay
                className="w-full max-h-[70vh] object-contain rounded"
                onEnded={() => setVideoModal(null)}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between mt-4">
              <Button
                onClick={() => {
                  setVideoModal(null);
                  handleHidePost(videoModal.postId);
                }}
                variant="destructive"
                size="sm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Hide Post
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant="destructive"
        loading={confirmModal.loading}
      />
    </div>
  );
};

export default CommunityFeedAudit; 