import { useEffect } from "react";
import { useState } from "react";

// import chatIcon from "@/assets/svg/chat-minus.svg";
// import chatActiveIcon from "@/assets/svg/chat-active.svg";
import endCallIcon from "@/assets/svg/end-call.svg";
import micWhiteIcon from "@/assets/svg/mic-white.svg";
import micIcon from "@/assets/svg/mic.svg";
import videoCamBlackIcon from "@/assets/svg/video-black.svg";
import videoCamWhiteIcon from "@/assets/svg/video.svg";
import {
  useAvatarChatState,
  useSharedAvatarChat,
} from "@/contexts/AvatarChatContext";
import { dispatch, useSelector } from "@/store";
import { setSessionEndModal } from "@/store/slices/modal";
import {
  setSelectedAudioDevice,
  setSelectedVideoDevice,
  toggleCameraForCall,
  toggleChatOpen,
  toggleSessionEnded,
} from "@/store/slices/session";
import { Sparkles } from "lucide-react";
import { MdOutlineChatBubbleOutline } from "react-icons/md";

import { DeviceSelector } from "@/components/DeviceSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ControlBar = () => {
  const isCameraOn = useSelector((state) => state.session.isCameraOn);
  const isAvatarMuted = useSelector((state) => state.session.isAvatarMuted);
  const isChatOpen = useSelector((state) => state.session.isChatOpen);
  const selectedAudioDeviceId = useSelector(
    (state) => state.session.selectedAudioDeviceId,
  );
  const selectedVideoDeviceId = useSelector(
    (state) => state.session.selectedVideoDeviceId,
  );
  const { service, recordingService } = useSharedAvatarChat();
  const { isRecording, recording } = useAvatarChatState();
  const [hasNewStyle, setHasNewStyle] = useState(false);

  // Effect to mute/unmute audio based on isAvatarMuted state
  useEffect(() => {
    console.log("[ControlBar] isAvatarMuted changed to:", isAvatarMuted);
    service.setAvatarMuted(isAvatarMuted);
  }, [isAvatarMuted, service]);

  useEffect(() => {
    if (isChatOpen) {
      console.log(
        "[ControlBar] Chat is open, disabling mic and video controls",
      );
      dispatch(toggleCameraForCall(false));
      service.stopRecording();
      // Clear the sparkle when chat is opened
      setHasNewStyle(false);
    }
  }, [isChatOpen]);

  // Listen for style generation completion
  useEffect(() => {
    const handleStyleReady = () => {
      console.log(
        "[ControlBar] Style is ready - showing sparkle on chat button",
      );
      setHasNewStyle(true);
    };

    window.addEventListener("style-ready", handleStyleReady);
    return () => window.removeEventListener("style-ready", handleStyleReady);
  }, []);
  // Handler functions for each button
  const handleMicToggle = async () => {
    console.log("[UI] mic button – isRecording was", isRecording);
    if (isRecording) {
      console.log("[ControlBar] Stopping recording");
      service.stopRecording();
    } else {
      console.log("[ControlBar] Starting recording");
      service.startRecording();
    }
  };

  const handleVideoToggle = () => {
    dispatch(toggleCameraForCall(!isCameraOn));
  };

  // const handleVolumeToggle = () => {
  //   console.log("[ControlBar] Volume button clicked, current isAvatarMuted:", isAvatarMuted);
  //   dispatch(toggleAvatarMute(!isAvatarMuted));
  // };

  const handleChatToggle = () => {
    console.log("Chat button clicked - current state:", isChatOpen);
    dispatch(toggleChatOpen(!isChatOpen));
  };

  const handleAudioDeviceChange = async (deviceId: string) => {
    console.log("[ControlBar] Audio device changed to:", deviceId);
    dispatch(setSelectedAudioDevice(deviceId));

    // Switch the audio device in the service
    if (service) {
      await service.switchAudioDevice(deviceId);
    }
  };

  const handleVideoDeviceChange = (deviceId: string) => {
    console.log("[ControlBar] Video device changed to:", deviceId);
    dispatch(setSelectedVideoDevice(deviceId));
    // The video device change will be picked up by the camera setup effect in the parent component
    // No need to manually restart - the effect will handle it
  };

  const handleEndCall = () => {
    console.log(
      "[ControlBar] End call button clicked - starting non-blocking cleanup",
    );

    // Show session complete modal immediately for responsive UI
    dispatch(toggleSessionEnded(true));
    dispatch(setSessionEndModal([true]));

    // Defer heavy cleanup operations to prevent UI blocking
    setTimeout(() => {
      // Stop session recording if active
      if (recording.isRecording) {
        console.log("[ControlBar] Stopping session recording");
        recordingService.stopRecording();
      }

      // Turn off camera and cleanup streams
      if (isCameraOn) {
        console.log("[ControlBar] Turning off camera on call end");
        dispatch(toggleCameraForCall(false));
      }

      // End the session
      service.endSession();
    }, 0); // Use setTimeout(0) to defer to next tick
  };

  return (
    <>
      <div className="absolute bottom-3 left-1/2 z-50 w-full max-w-md -translate-x-1/2 transform px-4">
        <div className="border-border mx-auto flex w-full max-w-2xl items-center justify-between gap-2 rounded-full border bg-black/30 px-4 py-3 backdrop-blur-md">
          {/* Microphone controls */}
          <div className="flex items-center">
            <div
              className={`border-border flex items-center rounded-full border ${
                isRecording ? "bg-accent" : "bg-black/50"
              }`}
            >
              <Tooltip open={isChatOpen ? undefined : false}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleMicToggle}
                    disabled={isChatOpen}
                    className={`flex h-12 items-center justify-center rounded-l-full px-3 ${
                      isChatOpen ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <img
                      src={isRecording ? micIcon : micWhiteIcon}
                      alt="Microphone"
                      className="h-6 w-6"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Feature disabled in chat</p>
                </TooltipContent>
              </Tooltip>
              {!isChatOpen && (
                <DeviceSelector
                  type="audio"
                  selectedDeviceId={selectedAudioDeviceId}
                  onDeviceChange={handleAudioDeviceChange}
                  isRecording={isRecording}
                />
              )}
            </div>
          </div>

          {/* Video controls */}
          <div className="flex items-center">
            <div
              className={`border-border flex items-center rounded-full border ${
                isCameraOn ? "bg-accent" : "bg-black/50"
              }`}
            >
              <Tooltip open={isChatOpen ? undefined : false}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleVideoToggle}
                    disabled={isChatOpen}
                    className={`flex h-12 items-center justify-center rounded-l-full px-3 ${
                      isChatOpen ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <img
                      src={isCameraOn ? videoCamBlackIcon : videoCamWhiteIcon}
                      alt="Video"
                      className="h-6 w-6"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Feature disabled in chat</p>
                </TooltipContent>
              </Tooltip>
              {!isChatOpen && (
                <DeviceSelector
                  type="video"
                  selectedDeviceId={selectedVideoDeviceId}
                  onDeviceChange={handleVideoDeviceChange}
                  isRecording={isCameraOn}
                />
              )}
            </div>
          </div>

          {/* <button
          onClick={handleVolumeToggle}
          className={`border-border flex h-12 max-w-[70px] flex-1 items-center justify-center rounded-full border ${
            isAvatarMuted ? "bg-black/50" : "bg-accent"
          }`}
        >
          <img
            src={isAvatarMuted ? volumeIcon : volumeBlackIcon}
            alt="Volume"
            className="h-6 w-6"
          />
        </button> */}

          <button
            onClick={handleChatToggle}
            className={`border-border relative flex h-12 max-w-[70px] flex-1 items-center justify-center rounded-full border ${
              isChatOpen ? "bg-accent" : "bg-black/50"
            }`}
          >
            {/* <img 
            src={isChatOpen ? chatActiveIcon : chatIcon} 
            alt="Chat" 
            className="h-6 w-6" 
          /> */}
            {isChatOpen ? (
              <MdOutlineChatBubbleOutline size={"20px"} color="black" />
            ) : (
              <MdOutlineChatBubbleOutline color="white" size={"20px"} />
            )}
            {/* Sparkle indicator for new style */}
            {hasNewStyle && !isChatOpen && (
              <div className="bg-accent absolute -top-2 -right-2 animate-bounce rounded-full p-1.5 shadow-lg">
                <Sparkles className="h-4 w-4 text-black" />
              </div>
            )}
          </button>

          {/* Music Lab button removed (now accessible via attachment icon in Chat) */}

          <button
            onClick={handleEndCall}
            className="border-border flex h-12 max-w-[70px] flex-1 items-center justify-center rounded-full border bg-[#FF5454]"
          >
            <img src={endCallIcon} alt="End Call" className="h-6 w-6" />
          </button>
        </div>
      </div>
    </>
  );
};

export default ControlBar;
