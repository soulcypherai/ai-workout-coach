import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { dispatch } from "@/store";
import { setAuthModal } from "@/store/slices/modal";
import { Send, X } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface Comment {
  id: string;
  body: string;
  handle: string;
  wallet_address: string;
  created_at: string;
}

interface CommentsDrawerProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded?: (postId: string) => void;
}

const CommentsDrawer = ({
  postId,
  isOpen,
  onClose,
  onCommentAdded,
}: CommentsDrawerProps) => {
  const { user, token } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && postId) {
      fetchComments();
    }
  }, [isOpen, postId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const response = await fetch(
        `${serverUrl}/api/feed/posts/${postId}/comments`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch comments");
      }

      const data = await response.json();
      setComments(data.comments || []);
    } catch (err) {
      logError("Error fetching comments", err, {
        section: "community",
        postId,
      });
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim() || !user || !token || submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const response = await fetch(
        `${serverUrl}/api/feed/posts/${postId}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: newComment.trim(),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to post comment");
      }

      const data = await response.json();

      // Add the new comment to the top of the list
      setComments((prev) => [data.comment, ...prev]);
      if (onCommentAdded) {
        onCommentAdded(postId);
      }

      setNewComment("");

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      logError("Error posting comment", err, { section: "community", postId });
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTextareaResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const now = new Date();
    const commentTime = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - commentTime.getTime()) / 1000,
    );

    if (diffInSeconds < 60) {
      return "just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="flex h-[85vh] flex-col bg-black text-white">
        <DrawerHeader className="flex flex-row items-center justify-between border-b border-gray-800 pb-4">
          <DrawerTitle className="text-lg font-semibold">Comments</DrawerTitle>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </DrawerHeader>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="mb-4 text-red-400">{error}</p>
              <button
                onClick={fetchComments}
                className="text-accent hover:text-accent/80"
              >
                Try again
              </button>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              <p>No comments yet</p>
              <p className="mt-1 text-sm">Be the first to comment!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="bg-accent flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
                    <span className="text-xs font-bold text-black">
                      {comment.handle?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium">
                        @{comment.handle || "Unknown"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed break-words">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comment input */}
        {user ? (
          <div className="border-t border-gray-800 p-4">
            <form
              onSubmit={handleSubmitComment}
              className="flex items-center gap-3"
            >
              <div className="bg-accent flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
                <span className="text-xs font-bold text-black">
                  {user.handle?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value);
                      handleTextareaResize();
                    }}
                    placeholder="Add a comment..."
                    className="focus:border-accent max-h-20 flex-1 resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
                    rows={1}
                    disabled={submitting}
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submitting}
                    className="bg-accent flex min-w-[40px] items-center justify-center rounded-lg px-3 py-2 text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"></div>
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              </div>
            </form>
          </div>
        ) : (
          <div className="border-t border-gray-800 p-4 text-center">
            <p className="text-sm text-gray-400">
              <span
                className="text-accent cursor-pointer underline underline-offset-2"
                onClick={() => {
                  onClose();
                  dispatch(setAuthModal([true]));
                }}
              >
                Sign in
              </span>{" "}
              to leave a comment
            </p>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default CommentsDrawer;
