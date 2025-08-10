import { useEffect, useRef, useState } from "react";

import PageHeader from "@/layouts/pageHeader";
import { logError } from "@/lib/errorLogger";
import { useNavigate, useParams } from "react-router-dom";

import CommentsDrawer from "./components/CommentsDrawer";
import PostCard from "./components/PostCard";

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
  avatar_id?: string;
  avatar_name?: string;
  avatar_slug?: string;
  avatar_description?: string;
  avatar_image_url?: string;
}

const CommunityPage = () => {
  const navigate = useNavigate();
  const { postId: targetPostId } = useParams<{ postId?: string }>();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [hasMoreNewer, setHasMoreNewer] = useState(true);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false); // Global mute state
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch community posts
  useEffect(() => {
    if (targetPostId) {
      fetchSpecificPost();
    } else {
      loadInitialFeed();
    }
  }, [targetPostId]);

  // Clean up URL when not focused on a specific post

  useEffect(() => {
    if (
      !targetPostId &&
      posts.length > 0 &&
      window.location.pathname !== "/community"
    ) {
      window.history.replaceState(null, "", "/community");
    }
  }, [targetPostId, posts]);

  const fetchPosts = async (
    cursor: string | null = null,
    before: string | null = null,
    limit: number = 3,
  ): Promise<{
    posts: CommunityPost[];
    hasMore: boolean;
    nextCursor: string | null;
  } | null> => {
    try {
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const params = new URLSearchParams({ limit: limit.toString() });
      if (cursor) params.append("cursor", cursor);
      if (before) params.append("before", before);

      const response = await fetch(`${serverUrl}/api/feed?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }

      const data = await response.json();
      return {
        posts: data.posts,
        hasMore: data.hasMore,
        nextCursor: data.nextCursor,
      };
    } catch (err) {
      logError("Error fetching posts", err, { section: "community" });
      setError(
        err instanceof Error ? err.message : "Failed to load community feed",
      );
      return null;
    }
  };

  const loadOlderPosts = async () => {
    if (!hasMoreOlder || loadingOlder) return;

    try {
      setLoadingOlder(true);
      const result = await fetchPosts(olderCursor, null, 5);

      if (result && result.posts.length > 0) {
        setPosts((prevPosts) => {
          // Filter out posts that already exist
          const existingIds = new Set(prevPosts.map((p) => p.id));
          const newPosts = result.posts.filter(
            (post) => !existingIds.has(post.id),
          );

          return newPosts.length > 0 ? [...prevPosts, ...newPosts] : prevPosts;
        });
        setHasMoreOlder(result.hasMore);
        setOlderCursor(result.nextCursor);
      } else {
        setHasMoreOlder(false);
      }
    } catch (error) {
      logError("Error loading older posts", error, { section: "community" });
      setHasMoreOlder(false);
    } finally {
      setLoadingOlder(false);
    }
  };

  const loadNewerPosts = async () => {
    if (!hasMoreNewer || loadingNewer || posts.length === 0) {
      return;
    }

    try {
      setLoadingNewer(true);

      // Get the newest post we currently have
      const newestPost = posts[0];
      const newestTimestamp = newestPost.created_at;

      // Use the efficient 'before' parameter to get posts newer than our newest
      const result = await fetchPosts(null, newestTimestamp, 5);

      if (result && result.posts.length > 0) {
        setPosts((prevPosts) => {
          // Filter out posts that already exist
          const existingIds = new Set(prevPosts.map((p) => p.id));
          const newPosts = result.posts.filter(
            (post) => !existingIds.has(post.id),
          );

          if (newPosts.length > 0) {
            // Adjust current index since we added posts at the beginning
            setCurrentPostIndex((prevIndex) => prevIndex + newPosts.length);
            return [...newPosts, ...prevPosts];
          } else {
            // No new posts after filtering - we've reached the top
            setHasMoreNewer(false);
          }
          return prevPosts;
        });
      } else {
        // No newer posts found, we're at the top of the feed
        setHasMoreNewer(false);
      }
    } catch (error) {
      logError("Error loading newer posts", error, { section: "community" });
      setHasMoreNewer(false);
    } finally {
      setLoadingNewer(false);
    }
  };

  const loadInitialFeed = async () => {
    try {
      setLoading(true);
      const result = await fetchPosts(null, null, 3);

      if (result) {
        setPosts(result.posts);
        setHasMoreOlder(result.hasMore);
        setOlderCursor(result.nextCursor);
        // For newer posts, assume there might be more (until we hit the newest)
        setHasMoreNewer(false); // Start of feed, no newer posts
      }
    } catch (error) {
      logError("Error loading initial feed", error, { section: "community" });
    } finally {
      setLoading(false);
    }
  };

  // Scroll to specific post
  const scrollToPost = (index: number) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const itemHeight = container.clientHeight;
    container.scrollTo({
      top: index * itemHeight,
      behavior: "smooth",
    });
  };

  const fetchSpecificPost = async () => {
    if (!targetPostId) return;

    try {
      setLoading(true);
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

      // 1. Fetch the specific target post
      const postResponse = await fetch(
        `${serverUrl}/api/feed/posts/${targetPostId}`,
      );

      if (!postResponse.ok) {
        if (postResponse.status === 404) {
          setError("Post not found");
          navigate("/community", { replace: true });
        } else {
          setError("Failed to load post");
        }
        return;
      }

      const responseData = await postResponse.json();
      const targetPost = responseData.post;

      // 2. Fetch the regular feed (latest to oldest)
      const feedResult = await fetchPosts(null, null, 3);
      let feedPosts = feedResult?.posts || [];
      // Remove the targeted post if present
      feedPosts = feedPosts.filter((p) => p.id !== targetPostId);

      // 3. Combine: targeted post at index 0, then rest of feed
      const combinedPosts = [targetPost, ...feedPosts];

      setPosts(combinedPosts);
      setCurrentPostIndex(0);
      setOlderCursor(feedResult?.nextCursor || targetPost.created_at);
      setHasMoreOlder(feedResult?.hasMore !== false);
      setHasMoreNewer(false);

      // Scroll to the top (target post)
      setTimeout(() => {
        scrollToPost(0);
      }, 100);
    } catch (error) {
      logError("Error fetching specific post", error, {
        section: "community",
        targetPostId,
      });
      setError("Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  // Handle scroll to change current post and bidirectional infinite loading
  const handleScroll = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);

    // Update current post index and URL
    if (
      newIndex !== currentPostIndex &&
      newIndex >= 0 &&
      newIndex < posts.length
    ) {
      setCurrentPostIndex(newIndex);

      // Update URL to reflect current post
      const currentPost = posts[newIndex];
      if (currentPost) {
        const newUrl = `/community/${currentPost.id}`;
        const currentUrl = window.location.pathname;
        if (currentUrl !== newUrl) {
          window.history.replaceState(null, "", newUrl);
        }
      }
    }

    // Bidirectional infinite scroll
    const totalHeight = posts.length * itemHeight;
    const containerHeight = container.clientHeight;
    const scrollProgress = (scrollTop + containerHeight) / totalHeight;

    // Load older posts when scrolling down (80% through current posts)
    if (scrollProgress > 0.8 && hasMoreOlder && !loadingOlder && !loading) {
      loadOlderPosts();
    }

    // Load newer posts when scrolling up (within first 30% of first post OR at very top)
    const isNearTop = scrollTop < itemHeight * 0.3 || scrollTop === 0;
    if (
      isNearTop &&
      hasMoreNewer &&
      !loadingNewer &&
      !loading &&
      posts.length > 0
    ) {
      loadNewerPosts();
    }
  };

  if (loading && posts.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
          <div className="text-sm font-medium">
            {targetPostId
              ? "Loading your post..."
              : "Loading community feed..."}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white">
        <div className="mb-4 text-red-400">Error: {error}</div>
        <button
          onClick={() =>
            targetPostId ? fetchSpecificPost() : loadInitialFeed()
          }
          className="bg-accent rounded-lg px-4 py-2 font-medium text-black"
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0 && !loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white">
        <div className="mb-4 text-lg">No posts yet</div>
        <div className="text-sm text-gray-400">
          Be the first to share your conversation!
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-full w-full max-w-md flex flex-col bg-black">
      {/* Sticky Header */}
      <PageHeader
        pageName="Community"
        onBackClick={() => {
          window.history.replaceState(null, "", "/community");
          navigate("/");
        }}
      />

      {/* Feed Container */}
      <div
        ref={containerRef}
        className="hide-scrollbar w-full flex-grow snap-y snap-mandatory overflow-y-auto"
        onScroll={handleScroll}
        style={{
          scrollBehavior: "smooth",
          height: "calc(100vh - 57px - 43px)",
        }}
      >
        {/* Loading newer indicator */}
        {loadingNewer && (
          <div className="flex h-full w-full snap-start items-center justify-center bg-black text-white">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              <div className="text-sm font-medium">Loading newer posts...</div>
            </div>
          </div>
        )}

        {posts
          .filter((post) => post && post.id)
          .map((post, index) => (
            <PostCard
              key={`post-${post.id}`}
              post={post}
              isActive={index === currentPostIndex}
              onCommentClick={() => setSelectedPostId(post.id)}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
            />
          ))}

        {/* Loading older indicator */}
        {loadingOlder && (
          <div className="flex h-full w-full snap-start items-center justify-center bg-black text-white">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              <div className="text-sm font-medium">Loading older posts...</div>
            </div>
          </div>
        )}

        {/* End of feed indicator */}
        {!hasMoreOlder && posts.length > 0 && (
          <div className="flex h-full w-full snap-start items-center justify-center bg-black text-white">
            <div className="flex flex-col items-center gap-3">
              <div className="text-lg">🎉</div>
              <div className="text-sm text-gray-400">
                You've reached the end!
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comments Drawer */}
      {selectedPostId && (
        <CommentsDrawer
          postId={selectedPostId}
          isOpen={!!selectedPostId}
          onClose={() => setSelectedPostId(null)}
          onCommentAdded={(postId) => {
            setPosts((prevPosts) =>
              prevPosts.map((post) =>
                post.id === postId
                  ? { ...post, comment_count: post.comment_count + 1 }
                  : post,
              ),
            );
          }}
        />
      )}
    </div>
  );
};

export default CommunityPage;
