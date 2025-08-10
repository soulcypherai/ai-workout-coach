import { useEffect, useRef, useState } from "react";

import { formatJudgeName } from "@/utility";
import { Bot, Play, Volume2, VolumeX } from "lucide-react";
import DownloadButton from "@/components/DownloadButton";
import {dispatch} from "@/store";
import {setPitchVisibility} from "@/store/slices/pitches";
import { useAuth } from "@/contexts/AuthContext";
import VisibilityDropdown from "./components/VisibilityDropdown";

interface PitchData {
  id: string;
  video_url: string;
  thumbnail_url: string;
  avatar_image_url?: string;
  avatar_name?: string;
  is_published: boolean;
}

interface PitchVideoProps {
  pitch: PitchData | null;
  sessionRecordingId?: string;
}

const PitchVideo = ({ pitch, sessionRecordingId }: PitchVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPublic, setIsPublic] = useState(pitch?.is_published ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();


  useEffect(() => {
    setIsPublic(pitch?.is_published ?? false);
  }, [pitch?.is_published]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.muted = isMuted;
      video.play().catch((err) => console.error("Play failed:", err));
    }
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

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


  const handleToggleVisibility =  async (nextState: "public" | "private") => {
    setLoading(true);
    setError(null);
    try {
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const resp = await fetch(`${serverUrl}/api/recordings/toggle-visibility/${sessionRecordingId}`, {
        method: 'POST',        
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: nextState }),
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Failed to update visibility');

      dispatch(setPitchVisibility({ id: pitch?.id ?? "", visibility: nextState }));
      const data = await resp.json();
      setIsPublic(data.is_published);
    } catch (e: any) {
      setError(e.message || 'Error updating visibility');
    } finally {
      setLoading(false);
    }
  }

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

  useEffect(() => {
    if (!error) return;
    const timeout = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timeout);
  }, [error]);

  if (!pitch) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center bg-black">
        <div className="h-20 w-20 animate-pulse rounded-full bg-white/10" />
        <p className="mt-4 text-sm text-white/80">Loading video...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        src={pitch.video_url}
        poster={pitch.thumbnail_url}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted={isMuted}
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

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

      <div className="absolute top-2 right-2 z-20 flex gap-2">
        <DownloadButton 
          videoUrl={pitch.video_url} 
          fileName={`pitch-${pitch.avatar_name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.mp4`}
          variant="icon"
          size="md"
          addWatermark={true}
        />
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
      <VisibilityDropdown
        isPublic={isPublic}
        loading={loading}
        onApply={handleToggleVisibility}
      />

      {error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-red-600/50 backdrop-blur-md text-white px-2 py-1 rounded text-xs">{error}</div>
      )}

      <div className="absolute bottom-6 left-5 z-30 flex items-end justify-between">
        <div className="relative mr-4 flex-1 space-y-2">
          {pitch.avatar_name && (
            <div className="flex items-center gap-4">
              <div className="bg-accent/20 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full">
                {pitch.avatar_image_url ? (
                  <img
                    src={pitch.avatar_image_url}                    
                    className="h-12 w-12 bg-secondary rounded-full object-cover"
                  />
                ) : (
                  <Bot className="text-accent h-3 w-3" />
                )}
              </div>
              <span className="text-xl font-medium text-white flex flex-col  ">
                <p>{formatJudgeName(pitch.avatar_name)}</p>
                <button className="bg-accent hover:bg-accent/90 rounded-full mr-auto px-3 py-0.5 text-xs font-medium text-black transition-all duration-200">
                  Chat
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {duration > 0 && (
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="absolute right-0 bottom-0 left-0 z-20 h-1 cursor-pointer bg-white/20"
        >
          <div
            className="bg-white/80 h-full transition-all duration-100"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default PitchVideo;
