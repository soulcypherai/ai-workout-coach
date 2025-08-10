import { RefObject, useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  useAvatarChatState,
  useSharedAvatarChat,
} from "@/contexts/AvatarChatContext";
import { useSelector } from "@/store";
import { Eye, EyeOff } from "lucide-react";
import { useParams } from "react-router-dom";

import ThreeCanvas, { ThreeCanvasRef } from "@/components/ThreeCanvas";

interface AgentScreenProps {
  userVideoRef?: RefObject<HTMLVideoElement | null>;
  avatarName?: string;
  timeRemaining: number;
  personaSlug?: string;
  persona?: any; // Persona data including vision config
  disableRecording?: boolean; // New prop to disable recording logic for UI-only instances
  focusedScreen?: "agent" | "user"|null;
}

// Global switch via .env but also allow per-instance override
const GLOBAL_RECORDING_ENABLED =
  import.meta.env.VITE_ENABLE_SESSION_RECORDING !== "false";

const AgentScreen = ({
  userVideoRef,
  avatarName,
  timeRemaining,
  personaSlug,
  persona,
  disableRecording = false,
  focusedScreen,
}: AgentScreenProps) => {
  // Determine if this instance should perform recording logic
  const recordingEnabled = GLOBAL_RECORDING_ENABLED && !disableRecording;
  const { slug } = useParams();
  const [isAvatarLoaded, setIsAvatarLoaded] = useState(false);
  // Initialize vision state from service to maintain state across component remounts
  const { visionEnabled: serviceVisionEnabled } = useAvatarChatState();
  const [isVisionEnabled, setIsVisionEnabled] = useState(serviceVisionEnabled);
  const canvasRef = useRef<ThreeCanvasRef>(null);
  const recordingStartedRef = useRef(false);
  const { user } = useAuth();
  const { service } = useSharedAvatarChat();

  const isCameraOn = useSelector((state) => state.session.isCameraOn);
  const personas = useSelector((state) => state.app.personas);
  const { error, conversationState, recording, recordingService } =
    useAvatarChatState();
  const isSessionCompleteOpen = useSelector(
    (state) => state.modal.sessionEndedModal.isOpen,
  );

  // Get persona by slug (from prop or route)
  const personaSlugToUse = personaSlug || slug;
  const currentPersona = personas.find((p) => p.slug === personaSlugToUse);
  const avatarId = currentPersona?.id || "jesse-pollak";
  const avatarModelUrl = currentPersona?.model_uri;

  // Sync local vision state with service state when it changes
  useEffect(() => {
    setIsVisionEnabled(serviceVisionEnabled);
  }, [serviceVisionEnabled]);

  // Auto-start recording when avatar is loaded (only if recording enabled)
  useEffect(() => {
    if (!recordingEnabled) return;
    if (
      isAvatarLoaded &&
      !isSessionCompleteOpen &&
      canvasRef.current &&
      user?.id &&
      !recordingStartedRef.current
    ) {
      const canvas = canvasRef.current.getCanvas();
      if (canvas) {
        const userVideo = userVideoRef?.current || undefined;

        // Prepare session info for server recording
        const sessionInfo = {
          sessionId: `session_${Date.now()}_${avatarId}`,
          avatarId: avatarId,
          userId: user.id,
        };

        recordingService.startRecording(
          canvas,
          isCameraOn,
          userVideo,
          sessionInfo,
        );
        recordingStartedRef.current = true;
      }
    }
  }, [
    isAvatarLoaded,
    recordingService,
    user?.id,
    isSessionCompleteOpen,
    avatarId,
    recordingEnabled,
  ]);

  // Handle camera state changes during active recording (recording enabled only)
  useEffect(() => {
    if (!recordingEnabled) return;
    if (recording.isRecording && canvasRef.current) {
      const canvas = canvasRef.current.getCanvas();
      if (canvas) {
        const userVideo = userVideoRef?.current || undefined;

        // Switch recording mode when camera state changes
        recordingService.switchRecordingMode(isCameraOn, userVideo);
      }
    }
  }, [
    isCameraOn,
    recording.isRecording,
    recordingService,
    userVideoRef,
    recordingEnabled,
  ]);

  // Additional effect to retry mode switching when user video becomes ready (recording enabled only)
  useEffect(() => {
    if (!recordingEnabled) return;
    if (
      recording.isRecording &&
      isCameraOn &&
      canvasRef.current &&
      userVideoRef?.current
    ) {
      const canvas = canvasRef.current.getCanvas();
      const userVideo = userVideoRef.current;

      // Check if video is ready and we're in avatar-only mode
      if (
        canvas &&
        userVideo &&
        userVideo.readyState >= 2 &&
        userVideo.videoWidth > 0 &&
        userVideo.videoHeight > 0
      ) {
        // Retry switching to split-screen mode now that video is ready
        recordingService.switchRecordingMode(isCameraOn, userVideo);
      }
    }
  }, [
    recording.isRecording,
    isCameraOn,
    recordingService,
    userVideoRef,
    recordingEnabled,
  ]);

  // Listen for video ready events to trigger mode switching (recording enabled only)
  useEffect(() => {
    if (!recordingEnabled) return;
    const userVideo = userVideoRef?.current;
    if (!userVideo || !recording.isRecording || !isCameraOn) return;

    const handleVideoReady = () => {
      if (
        canvasRef.current &&
        userVideo.readyState >= 2 &&
        userVideo.videoWidth > 0 &&
        userVideo.videoHeight > 0
      ) {
        const canvas = canvasRef.current.getCanvas();
        if (canvas) {
          console.log(
            "[AgentScreen] Video ready, retrying split-screen mode switch",
          );
          recordingService.switchRecordingMode(isCameraOn, userVideo);
        }
      }
    };

    // Listen for loadedmetadata and canplay events
    userVideo.addEventListener("loadedmetadata", handleVideoReady);
    userVideo.addEventListener("canplay", handleVideoReady);

    return () => {
      userVideo.removeEventListener("loadedmetadata", handleVideoReady);
      userVideo.removeEventListener("canplay", handleVideoReady);
    };
  }, [
    recording.isRecording,
    isCameraOn,
    recordingService,
    userVideoRef,
    recordingEnabled,
  ]);

  // Cleanup on unmount (recording enabled only)
  useEffect(() => {
    if (!recordingEnabled) return;
    return () => {
      console.log(
        "[AgentScreen] Cleaning up SessionRecordingService on unmount.",
      );
      recordingService.destroy();
    };
  }, [recordingService, recordingEnabled]);

  const statusLabel = conversationState === "idle" ? null : conversationState;

  // Handle vision toggle
  const handleVisionToggle = () => {
    setIsVisionEnabled(!isVisionEnabled);
    // Update the service with vision state
    service.setVisionEnabled(!isVisionEnabled);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <h1 className={`custom-text-shadow absolute bottom-0 ${focusedScreen!=='user'?'left-5 px-4 px-4 rounded-md':'rounded-sm leading-tight text-sm mx-1 mb-1 px-2'} z-10  bg-black/55  py-0.5 text-center font-medium text-white backdrop-blur-sm ${focusedScreen==="agent"&&"hidden"}`}>
        {avatarName}
      </h1>
      <h1 className={`custom-text-shadow absolute top-0.5 ${focusedScreen!=='user'?'right-0.5 px-4':'w-full'}  z-10 w-[165px] transform rounded-md bg-black/55  py-0.5 text-center text-[16px] text-white backdrop-blur-sm`}>
        Time Left :
        <span className="text-accent font-medium">
          {` ${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60)
            .toString()
            .padStart(2, "0")}`}
        </span>
      </h1>

      {/* Vision Toggle Button - Only show if admin enabled vision for this persona */}
      {isCameraOn && persona?.vision_enabled && (
        <button
          onClick={handleVisionToggle}
          className={`absolute top-16 right-4 z-10 rounded-full p-2 transition-all ${
            isVisionEnabled
              ? "bg-accent hover:bg-accent/80 text-black"
              : "bg-black/50 text-white hover:bg-black/70"
          }`}
          title={isVisionEnabled ? "Disable vision" : "Enable vision"}
        >
          {isVisionEnabled ? (
            <Eye className="h-5 w-5" />
          ) : (
            <EyeOff className="h-5 w-5" />
          )}
        </button>
      )}
      <ThreeCanvas
        ref={canvasRef}
        avatarId={avatarId}
        modelUrl={avatarModelUrl}
        className="h-full w-full"
        onAvatarLoaded={() => setIsAvatarLoaded(true)}
      />

      {/* Loading overlay */}
      {!isAvatarLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
            <div className="text-sm font-medium text-white">Loading...</div>
          </div>
        </div>
      )}

      {/* Status overlay */}
      {statusLabel && isAvatarLoaded && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 transform rounded-full bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-md select-none">
          {statusLabel}
        </div>
      )}

      {/* Error overlay */}
      {error && focusedScreen !=='user' && (
        <div className="absolute top-4 right-4 left-4 rounded-lg bg-red-900/70 p-3 text-white backdrop-blur-sm">
          <p className="text-sm">Error: {error}</p>
        </div>
      )}
    </div>
  );

};

export default AgentScreen;
