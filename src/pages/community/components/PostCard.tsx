import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { dispatch } from "@/store";
import { setAuthModal } from "@/store/slices/modal";
import { formatTimeAgo } from "@/utility";
import {
  Bot,
  Heart,
  MessageCircle,
  Play,
  Share,
  Volume2,
  VolumeX,
} from "lucide-react";
import { IoMdInformationCircleOutline } from "react-icons/io";
import { useNavigate } from "react-router-dom";

import InfoDrawer from "./InfoDrawer";
import ShareDrawer from "./ShareDrawer";

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

interface PostCardProps {
  post: CommunityPost;
  isActive: boolean;
  onCommentClick: () => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

function splitNameOnDash(name: string): [string, string] {
  if (!name) return ["", ""];
  const idx = name.indexOf("-");
  if (idx === -1) return [name, ""];
  return [name.slice(0, idx).trim(), name.slice(idx + 1).trim()];
}

const PostCard = ({
  post,
  isActive,
  onCommentClick,
  isMuted,
  setIsMuted,
}: PostCardProps) => {
  const [isShareDrawerOpen, setIsShareDrawerOpen] = useState(false);
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);

  const { user, token } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (user && token) {
      fetchUserReaction();
    }
  }, []);

  // Intersection Observer to detect if card is in view
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new window.IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Auto-play/pause based on isActive and inView
  useEffect(() => {
    if (videoRef.current) {
      if (isActive && inView) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((error) => {
              if (error.name !== "AbortError") {
                logError("Video play failed", error, {
                  section: "community",
                  postId: post.id,
                });
              }
            });
        }
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [isActive, inView]);

  // Fetch user's reaction to this post
  useEffect(() => {
    if (user && token) {
      fetchUserReaction();
    }
  }, [post.id, user, token]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Handler to sync UI state with actual video muted state
    const syncMuteState = () => {
      if (!video) return;
      if (!isMuted && video.muted) {
        // Browser forced mute, update UI
        setIsMuted(true);
      }
      if (isMuted && !video.muted) {
        // UI says muted but video is not, update video
        video.muted = true;
      }
    };

    video.addEventListener("volumechange", syncMuteState);
    video.addEventListener("play", syncMuteState);

    // Initial sync in case autoplay fails
    syncMuteState();

    return () => {
      video.removeEventListener("volumechange", syncMuteState);
      video.removeEventListener("play", syncMuteState);
    };
  }, [isMuted, setIsMuted]);

  // Add effect to update currentTime and duration
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateDuration);

    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateDuration);
    };
  }, []);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const newTime = percent * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(
      Math.max(videoRef.current.currentTime + seconds, 0),
      duration,
    );
  };

  const fetchUserReaction = async () => {
    try {
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const response = await fetch(
        `${serverUrl}/api/feed/posts/${post.id}/reactions/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setIsLiked(
          data.reaction === 1 ? true : data.reaction === -1 ? false : null,
        );
      }
    } catch (error) {
      logError("Error fetching user reaction", error, { section: "community" });
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch((error) => {
              if (error.name !== "AbortError") {
                logError("Video play failed", error, {
                  section: "community",
                  postId: post.id,
                });
              }
            });
        }
      }
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const likeRequestId = useRef(0);

  const handleLike = async () => {
    if (!user || !token) {
      dispatch(
        setAuthModal([
          true,
          undefined,
          {
            title: "Unauthorized",
            description: "🛈 Sign in required to interact with posts.",
          },
        ]),
      );
      return;
    }

    const newRequestId = ++likeRequestId.current;
    const newLikeState = isLiked === true ? null : true;

    setIsLiked(newLikeState);
    setLikeCount((prev) =>
      newLikeState === true ? prev + 1 : isLiked === true ? prev - 1 : prev,
    );

    const serverUrl =
      import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

    try {
      const response = await fetch(
        `${serverUrl}/api/feed/posts/${post.id}/reactions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value: newLikeState === true ? 1 : 0,
          }),
        },
      );

      if (response.ok && newRequestId === likeRequestId.current) {
        const data = await response.json();
        setIsLiked(newLikeState);
        setLikeCount(data.likes_count);
      }
    } catch (error) {
      logError("Error updating like", error, {
        section: "community",
        postId: post.id,
      });

      if (newRequestId === likeRequestId.current) {
        setIsLiked(isLiked);
        setLikeCount((prev) =>
          newLikeState === true ? prev - 1 : isLiked === true ? prev + 1 : prev,
        );
      }
    }
  };

  const handleTalkToJudge = () => {
    if (post.avatar_id) {
      navigate(`/call/${post.avatar_slug}`);
    }
  };

  // const handleTimeUpdate = () => {
  //   if (videoRef.current) {
  //     setCurrentTime(videoRef.current.currentTime);
  //   }
  // };

  // const handleLoadedMetadata = () => {
  //   if (videoRef.current) {
  //     setDuration(videoRef.current.duration);
  //   }
  // };

  // const formatTime = (seconds: number) => {
  //   const mins = Math.floor(seconds / 60);
  //   const secs = Math.floor(seconds % 60);
  //   return `${mins}:${secs.toString().padStart(2, "0")}`;
  // };

  return (
    <>
      <div
        ref={containerRef}
        className="relative h-full w-full flex-shrink-0 snap-start bg-black"
      >
        {/* Video */}
        <video
          ref={videoRef}
          src={post.video_url}
          poster={post.thumbnail_url}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted={isMuted}
          playsInline
          crossOrigin="anonymous"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
        </video>

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        {/* Play/Pause overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <button
              onClick={handlePlayPause}
              className="rounded-full bg-black/50 p-4 backdrop-blur-sm"
            >
              <Play className="ml-1 h-12 w-12 fill-white text-white" />
            </button>
          </div>
        )}

        {/* Double click skip and single click play/pause */}
        <div className="absolute inset-0 z-10 flex">
          <div
            className="pointer-events-auto h-full w-1/2"
            onDoubleClick={() => skipTime(-5)}
            onClick={handlePlayPause}
          />
          <div
            className="pointer-events-auto h-full w-1/2"
            onDoubleClick={() => skipTime(5)}
            onClick={handlePlayPause}
          />
        </div>

        {/* Top controls */}
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <button
            onClick={handleMuteToggle}
            className="rounded-full bg-black/50 p-2 backdrop-blur-sm"
          >
            {isMuted ? (
              <VolumeX className="h-5 w-5 text-white" />
            ) : (
              <Volume2 className="h-5 w-5 text-white" />
            )}
          </button>
        </div>

        <div
          onClick={() => setIsInfoDrawerOpen((prev) => !prev)}
          className="absolute top-4 left-4 z-20 flex cursor-pointer gap-2 rounded-full bg-black/50 p-1.5 backdrop-blur-lg"
        >
          <IoMdInformationCircleOutline className="h-6 w-6 text-white" />
        </div>

        {/* Progress bar */}
        {duration > 0 && (
          <div
            ref={progressRef}
            onClick={handleSeek}
            className="absolute right-0 bottom-0 left-0 z-20 h-1 cursor-pointer bg-white/20"
          >
            <div
              className="h-full bg-white/60 transition-all duration-100"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
        )}

        {/* User info and actions */}
        <div className="absolute right-4 bottom-4 left-4 z-20 flex items-end justify-between">
          {/* User info and transcript */}
          <div className="relative mr-4 flex-1">
            {/* Avatar info & chat button */}
            {post.avatar_name && (
              <div className="flex items-center gap-2">
                <div className="bg-accent/20 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
                  {post.avatar_image_url ? (
                    <img
                      src={post.avatar_image_url}
                      alt={post.avatar_name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <Bot className="text-accent h-3 w-3" />
                  )}
                </div>
                <span className="text-sm font-medium text-white flex flex-col justify-center">
                  {(() => {
                    const [first, second] = splitNameOnDash(
                      post.avatar_name || "",
                    );
                    return second ? (
                      <>
                        <span>{first}</span>
                        <span className="text-xs text-white/70 ">{second}</span>
                      </>
                    ) : (
                      first
                    );
                  })()}
                </span>
                <button
                  onClick={handleTalkToJudge}
                  className="bg-accent hover:bg-accent/90 rounded-full px-2 py-[1px] text-xs font-medium text-black transition-all duration-200 flex items-center justify-center"
                  title="Start a call with this AI judge"
                >
                  Chat
                </button>
              </div>
            )}
            {/* connector icon */}
            <button
              onClick={() => {}}
              className="mt-2.5 mb-0.5 flex items-center gap-2 text-xs"
            >
              <div className="bg-accent flex h-10 w-10 items-center justify-center rounded-full">
                <span className="text-sm font-bold text-black">
                  {post.handle?.charAt(0)?.toUpperCase() || "U"}
                </span>
              </div>
              <span className="relative flex max-h-[1lh] flex-col items-start text-sm font-medium text-white">
                @{post.handle || "Unknown"}
                <span className="ml-0.5 text-xs text-white/65">
                  {formatTimeAgo(post.created_at)}
                </span>
              </span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-4">
            <button
              onClick={handleLike}
              className="flex flex-col items-center gap-1"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  isLiked ? "bg-red-500" : "bg-white/20 backdrop-blur-sm"
                }`}
              >
                <Heart
                  className={`h-6 w-6 ${isLiked ? "fill-white text-white" : "text-white"}`}
                />
              </div>
              <span className="min-h-[16px] text-xs font-medium text-white">
                {likeCount > 0 ? likeCount : ""}
              </span>
            </button>

            <button
              onClick={onCommentClick}
              className="flex flex-col items-center gap-1"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <span className="min-h-[16px] text-xs font-medium text-white">
                {post.comment_count > 0 ? post.comment_count : ""}
              </span>
            </button>

            <button
              onClick={() => setIsShareDrawerOpen((prev) => !prev)}
              className="mb-2 flex flex-col items-center gap-1"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <Share className="h-6 w-6 text-white" />
              </div>
            </button>
          </div>
        </div>
      </div>

      <ShareDrawer
        post={post}
        isShareDrawerOpen={isShareDrawerOpen}
        setIsShareDrawerOpen={setIsShareDrawerOpen}
      />
      <InfoDrawer
        post={post}
        likeCount={likeCount}
        isInfoDrawerOpen={isInfoDrawerOpen}
        setIsInfoDrawerOpen={setIsInfoDrawerOpen}
      />
    </>
  );
};

export default PostCard;
