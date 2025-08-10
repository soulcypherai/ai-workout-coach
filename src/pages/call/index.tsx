import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { VisionCaptureProvider } from "@/contexts/VisionCaptureContext";
import { logError } from "@/lib/errorLogger";
import { cn } from "@/lib/utils";
import { avatarChatService } from "@/services/AvatarChatService";
import { dispatch, store, useSelector } from "@/store";
import { setPersonas } from "@/store/slices/app";
import {
  setBuyCreditModal,
  setPurchaseModal,
  setSessionEndModal,
} from "@/store/slices/modal";
import {
  addChatMessage,
  clearChatMessages,
  removeChatMessage,
  toggleCameraForCall,
  toggleSessionEnded,
} from "@/store/slices/session";
import { LocalVideoTrack, createLocalVideoTrack } from "livekit-client";
import { useNavigate, useParams } from "react-router-dom";

import SessionEndDrawer from "@/components/drawers/sessionEnd";

import { useCreditsValidation } from "@/hooks/useCreditsValidation";

import type { ChatMessage } from "@/types/slices";

import ProductCards from "./components/ProductCards";
import AgentScreen from "./components/agentScreen";
import CallEndScreen from "./components/callEndScreen";
import ControlBar from "./components/controlBar";
import UserScreen from "./components/userScreen";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

type ScreenType = "agent" | "user";

const CallPage = () => {
  const { slug } = useParams();
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Native stream for local preview
  const isCameraOn = useSelector((state) => state.session.isCameraOn);
  const selectedVideoDeviceId = useSelector(
    (state) => state.session.selectedVideoDeviceId,
  );
  const [callStartTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState(15 * 60); // 15 minutes in seconds
  const [creditBasedTimeRemaining, setCreditBasedTimeRemaining] = useState<
    number | null
  >(null);
  const isRefresh = useRef(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [personasLoading, setPersonasLoading] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [products] = useState<any[]>([]);
  const isChatOpen = useSelector((state) => state.session.isChatOpen);
  const isSessionEnded = useSelector((state) => state.session.isSessionEnded);
  const [focusedScreen, setFocusedScreen] = useState<ScreenType | null>(null);

  // Get avatar name from Redux state instead of URL params
  const personas = useSelector((state) => state.app.personas);
  const currentPersona = personas.find((p) => p.slug === slug);
  // Use null instead of "default" for missing personas to avoid UUID errors
  const avatarId = currentPersona?.id || null;
  const avatarName = currentPersona?.name || "AI Assistant";
  const perMinuteCost = currentPersona?.pricing_per_min || 10;

  // Proper camera cleanup function for both native and LiveKit
  const cleanupCamera = useCallback(async () => {
    console.log("[Camera Cleanup] Starting cleanup");

    try {
      // Stop native stream tracks first (for local preview)
      if (streamRef.current) {
        console.log("[Camera Cleanup] Stopping native media stream");
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }

      // Stop the LiveKit video track (for publishing)
      if (videoTrackRef.current) {
        console.log("[Camera Cleanup] Stopping LiveKit video track");
        await videoTrackRef.current.stop();
        videoTrackRef.current = null;
      }

      // Clean up the video element
      const videoEl = userVideoRef.current;
      if (videoEl) {
        if (videoEl.srcObject) {
          videoEl.srcObject = null;
        }
        videoEl.pause();
        videoEl.load();
      }

      console.log("[Camera Cleanup] Complete");
    } catch (error) {
      console.error("[Camera Cleanup] Error during cleanup:", error);
    }
  }, []);

  // Toggle focus between screens – if the clicked screen is already focused, reset to default (null)
  const handleScreenClick = (screen: ScreenType) => {
    if (focusedScreen === screen || isChatOpen) {
      return;
    }
    setFocusedScreen(focusedScreen ? null : screen);
  };

  const handleProductPurchase = (asin: string, productName: string) => {
    console.log("Purchase initiated for:", { asin, productName });
    // TODO: Implement actual purchase logic with crypto payment
    // For now, just close the modal as requested
    setShowProducts(false);
  };

  useEffect(() => {
    console.log("[CallPage] Focused screen:", focusedScreen);
  }, [focusedScreen]);

  useEffect(() => {
    console.log(
      "[CallPage] showProducts changed:",
      showProducts,
      "products count:",
      products.length,
    );
  }, [showProducts, products]);

  useEffect(() => {
    if (isChatOpen) {
      setFocusedScreen(null);
    }
  }, [isChatOpen]);

  // Set up socket event listeners separately to avoid frequent re-registration
  useEffect(() => {
    const handleProductsDisplay = (data: { products: any[] }) => {
      console.log("Received products-display event:", data);
      console.log("Opening purchase modal with products:", data.products);

      // Debug: Log each product's image URL
      data.products?.forEach((product, index) => {
        console.log(`Product ${index}:`, {
          name: product.name,
          image: product.image,
          imageType: typeof product.image,
          imageLength: product.image?.length,
        });
      });

      // Open the purchase modal with products (no need for fallbacks now)
      dispatch(
        setPurchaseModal([true, "products", { products: data.products }]),
      );

      console.log("Purchase modal opened successfully");
    };

    if (avatarChatService.socket) {
      console.log("[CallPage] Setting up products-display event listener");
      avatarChatService.socket.on("products-display", handleProductsDisplay);

      return () => {
        console.log("[CallPage] Cleaning up products-display event listener");
        avatarChatService.socket?.off(
          "products-display",
          handleProductsDisplay,
        );
      };
    }
  }, [avatarChatService.socket]); // Only depend on socket, not the large dependency array

  // Ensure personas are loaded (in case someone directly navigates to call page)
  useEffect(() => {
    const loadPersonasIfNeeded = async () => {
      if (personas.length === 0 && !personasLoading) {
        setPersonasLoading(true);
        try {
          const response = await fetch(`${API_URL}/api/auth/personas`);
          const data = await response.json();
          dispatch(setPersonas(data.personas || []));
        } catch (error) {
          logError("Failed to fetch personas in call page", error, {
            section: "call_page",
          });
        } finally {
          setPersonasLoading(false);
        }
      }
    };

    loadPersonasIfNeeded();
  }, [personas.length, personasLoading]);

  // Credit validation hook - only validate if we have a valid avatar ID
  const { isValidating, isValid, error, result } = useCreditsValidation(
    avatarId || "", // Pass empty string if no avatar ID
    user?.id || null,
  );

  // Set initial credit-based time remaining
  useEffect(() => {
    if (result && result.currentBalance !== undefined) {
      const minutesRemaining = Math.floor(
        result.currentBalance / perMinuteCost,
      );
      setCreditBasedTimeRemaining(minutesRemaining * 60); // Convert to seconds
    }
  }, [result, perMinuteCost]);

  // Camera setup using native getUserMedia for local preview (low latency)
  // and LiveKit only for publishing to room
  useEffect(() => {
    const setupCamera = async () => {
      if (isCameraOn && userVideoRef.current) {
        try {
          // Clean up any existing streams/tracks first
          await cleanupCamera();

          // STEP 1: Use native getUserMedia for local preview (no lag)
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId:
                selectedVideoDeviceId && selectedVideoDeviceId !== "default"
                  ? { exact: selectedVideoDeviceId }
                  : undefined,
              facingMode,
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30, max: 30 },
            },
            audio: false,
          });

          streamRef.current = stream;

          // Attach native stream to video element for instant local preview
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = stream;
            console.log(
              "[CallPage] Native camera stream attached for local preview",
            );
          }

          // STEP 2: Create LiveKit track for publishing (if room is connected)
          // This runs in background, doesn't affect local preview
          if (
            avatarChatService.room &&
            avatarChatService.room.state === "connected"
          ) {
            try {
              const videoTrack = await createLocalVideoTrack({
                deviceId:
                  selectedVideoDeviceId && selectedVideoDeviceId !== "default"
                    ? selectedVideoDeviceId
                    : undefined,
                facingMode,
                resolution: {
                  width: 640,
                  height: 480,
                  frameRate: 20,
                },
              });

              videoTrackRef.current = videoTrack;

              // Publish to LiveKit room
              const publishOptions = {
                simulcast: false,
                videoEncoding: {
                  maxBitrate: 800_000,
                  maxFramerate: 20,
                },
              } as const;

              console.log(
                "[CallPage] Publishing video track with options:",
                publishOptions,
              );
              await avatarChatService.room.localParticipant.publishTrack(
                videoTrack,
                publishOptions,
              );
              console.log("[CallPage] Published video track to LiveKit room");
            } catch (publishError) {
              console.error(
                "[CallPage] Failed to create/publish LiveKit track:",
                publishError,
              );
              // Local preview still works even if LiveKit fails
            }
          }
        } catch (error) {
          logError("[CallPage] Error accessing camera", error, {
            section: "call",
          });
          dispatch(toggleCameraForCall(false));
        }
      } else if (!isCameraOn) {
        // Unpublish and clean up when camera is turned off
        if (videoTrackRef.current && avatarChatService.room) {
          try {
            avatarChatService.room.localParticipant.unpublishTrack(
              videoTrackRef.current,
            );
            console.log("[CallPage] Unpublished video track from LiveKit room");
          } catch (unpublishError) {
            console.error(
              "[CallPage] Failed to unpublish video track:",
              unpublishError,
            );
          }
        }
        await cleanupCamera();
      }
    };

    setupCamera();

    return () => {
      // Always cleanup camera when unmounting or dependencies change
      cleanupCamera();
    };
  }, [isCameraOn, cleanupCamera, facingMode, selectedVideoDeviceId]);

  // Wait until auth state resolved AND credits are validated AND personas are loaded
  useEffect(() => {
    console.log("[CallPage] Session initialization check:", {
      isAuthenticated,
      hasUser: !!user,
      isValidating,
      isValid,
      personasLoading,
      avatarId,
      slug,
      currentPersona: currentPersona?.name,
      personasCount: personas.length,
    });

    if (
      !isAuthenticated ||
      !user ||
      isValidating ||
      isValid !== true ||
      personasLoading
    )
      return;

    dispatch(toggleSessionEnded(false));

    // Only initialize if we have a valid avatar ID
    if (avatarId) {
      console.log("[CallPage] Initializing session with avatarId:", avatarId);
      avatarChatService.initializeSession({ avatarId, userId: user.id });
    } else {
      console.error("[CallPage] No valid avatar ID found for slug:", slug);
      // Redirect to home after a delay
      setTimeout(() => navigate("/home"), 2000);
    }

    // Set up credit event listeners
    const handleCreditsUpdated = ({
      amount,
      newBalance,
      totalSpent,
    }: {
      amount: number;
      newBalance: number;
      totalSpent: number;
    }) => {
      console.log(
        `[Credits] Updated: ${amount} credits used, new balance: ${newBalance}, total spent: ${totalSpent}`,
      );

      // Calculate time remaining based on current credit balance
      const minutesRemaining = Math.floor(newBalance / perMinuteCost);
      setCreditBasedTimeRemaining(minutesRemaining * 60); // Convert to seconds

      if (newBalance >= amount && newBalance < 2 * amount) {
        dispatch(
          setBuyCreditModal([
            true,
            {
              title: "Low Credits",
              description: `Your session is ending soon due to low credits. You have ${newBalance} credits left. Please buy more credits to continue.`,
            },
          ]),
        );
      }
    };

    const handleInsufficientCredits = () => {
      dispatch(
        setSessionEndModal([
          true,
          {
            title: "Session Ended",
            description: "Session ended due to insufficient credits.",
          },
        ]),
      );
      dispatch(toggleSessionEnded(true));
      cleanupCamera();
      avatarChatService.endSession();
      dispatch(toggleCameraForCall(false));
      dispatch(clearChatMessages());
    };

    const handleSessionForceEnded = () => {
      // Handle force ended session
    };

    avatarChatService.on("credits-updated", handleCreditsUpdated);
    avatarChatService.on("insufficient-credits", handleInsufficientCredits);
    avatarChatService.on("session-force-ended", handleSessionForceEnded);

    // Handle image events
    const handleImageSent = () => {
      // Don't show vision captures in chat - they're only used internally
      console.log("[CallPage] Vision capture received but not shown in chat");
    };

    const handleImageProcessed = (data: {
      description: string;
      response: string;
    }) => {
      const responseMessage: ChatMessage = {
        id: `image-response-${Date.now()}`,
        text: data.response,
        sender: "avatar",
        timestamp: Date.now(),
      };
      dispatch(addChatMessage(responseMessage));
    };

    avatarChatService.on("image-sent", handleImageSent);
    avatarChatService.on("image-processed", handleImageProcessed);

    // Handle music generation WebSocket events at call level (works even when chat isn't open)
    const handleMusicGenerationComplete = (data: {
      fullResponse: string;
      musicGeneration?: {
        type: string;
        generatingMessageId?: string;
        generationType: string;
        requestId: string;
        generationId?: string;
        lyrics?: string;
        genres?: string[];
        audioUrl?: string;
      };
    }) => {
      if (data.musicGeneration?.type === "feedback") {
        const avatarMessage: ChatMessage = {
          id:
            data.musicGeneration.generatingMessageId || `avatar-${Date.now()}`,
          text: data.fullResponse,
          sender: "avatar",
          timestamp: Date.now(),
          type: "music_generation",
          musicData: {
            generationType: data.musicGeneration.generationType as
              | "lyrics"
              | "remix",
            status: "generating",
            requestId: data.musicGeneration.requestId,
            lyrics: data.musicGeneration.lyrics,
            genres: data.musicGeneration.genres,
            generatingMessageId: data.musicGeneration.generatingMessageId,
          },
        };
        dispatch(addChatMessage(avatarMessage));
      } else if (data.musicGeneration?.type === "completion") {
        // Remove the generating message
        if (data.musicGeneration.generatingMessageId) {
          dispatch(removeChatMessage(data.musicGeneration.generatingMessageId));
        }

        // Add completion message
        const completionMessage: ChatMessage = {
          id: `music-completion-${Date.now()}`,
          text: data.fullResponse,
          sender: "avatar",
          timestamp: Date.now(),
        };
        dispatch(addChatMessage(completionMessage));

        // Add the music result message
        const musicMessage: ChatMessage = {
          id: `music-result-${Date.now()}`,
          text: "🎵 Generated Track",
          sender: "avatar",
          timestamp: Date.now(),
          type: "music_result",
          musicData: {
            audioUrl: data.musicGeneration.audioUrl,
            title: `Generated Track - ${data.musicGeneration.genres?.join(", ") || "Music"}`,
            lyrics: data.musicGeneration.lyrics,
            genres: data.musicGeneration.genres,
            generationType: data.musicGeneration.generationType as
              | "lyrics"
              | "remix",
            status: "completed",
            requestId: data.musicGeneration.requestId,
            generationId: data.musicGeneration.generationId,
          },
        };
        dispatch(addChatMessage(musicMessage));

        // For gesture music, ask user if they want to play it
        if (
          data.musicGeneration.generationType === "lyrics" &&
          data.musicGeneration.audioUrl
        ) {
          const playPromptMessage: ChatMessage = {
            id: `play-prompt-${Date.now()}`,
            text: "Would you like me to play your new track?",
            sender: "avatar",
            timestamp: Date.now() + 100, // Slightly later timestamp
          };
          dispatch(addChatMessage(playPromptMessage));
        }
      }
    };

    // Handle style generation completion
    const handleStyleGenerationComplete = (data: {
      fullResponse: string;
      styleGeneration?: {
        type: string;
        imageUrl?: string;
        description?: string;
        prompt?: string;
        generatingMessageId?: string;
      };
    }) => {
      if (data.styleGeneration?.type === "feedback") {
        // Add feedback message while generating
        const feedbackMessage: ChatMessage = {
          id:
            data.styleGeneration.generatingMessageId ||
            `style-feedback-${Date.now()}`,
          text: data.fullResponse,
          sender: "avatar",
          timestamp: Date.now(),
          type: "style_generation",
          imageData: {
            url: "", // Will be filled when generation completes
            status: "generating",
            description: data.styleGeneration.prompt,
          },
        };
        dispatch(addChatMessage(feedbackMessage));
      } else if (data.styleGeneration?.type === "completion") {
        // Remove the generating message if exists
        if (data.styleGeneration.generatingMessageId) {
          dispatch(removeChatMessage(data.styleGeneration.generatingMessageId));
        }

        // Add the style result message with image
        const styleMessage: ChatMessage = {
          id: `style-result-${Date.now()}`,
          text: data.fullResponse,
          sender: "avatar",
          timestamp: Date.now(),
          type: "image",
          imageData: {
            url: data.styleGeneration.imageUrl!,
            description:
              data.styleGeneration.description ||
              "AI-generated style suggestion",
          },
        };
        dispatch(addChatMessage(styleMessage));

        // Show notification if user is in camera mode
        // Get current state from Redux store to avoid stale closure
        const currentState = store.getState();
        const currentIsCameraOn = currentState.session.isCameraOn;
        const currentIsChatOpen = currentState.session.isChatOpen;

        console.log(
          "[CallPage] Style generation complete - checking notification conditions",
          {
            isCameraOn: currentIsCameraOn,
            isChatOpen: currentIsChatOpen,
            shouldShowNotification: currentIsCameraOn && !currentIsChatOpen,
            timestamp: new Date().toISOString(),
          },
        );

        if (currentIsCameraOn && !currentIsChatOpen) {
          console.log("[CallPage] Showing style notification");
          setShowStyleNotification(true);
          // Auto-hide after 2 seconds
          setTimeout(() => {
            console.log("[CallPage] Hiding style notification");
            setShowStyleNotification(false);
          }, 2000);
        }

        // Always dispatch event for chat button sparkle
        window.dispatchEvent(new CustomEvent("style-ready"));
        console.log(
          "[CallPage] Dispatched style-ready event for chat button sparkle",
        );
      }
    };

    // Handle ALL LLM responses at the CallPage level
    const handleLLMResponseComplete = (data: {
      fullResponse: string;
      musicGeneration?: any;
      styleGeneration?: any;
    }) => {
      // Handle music generation messages
      if (data.musicGeneration) {
        handleMusicGenerationComplete(data);
      } else if (data.styleGeneration) {
        handleStyleGenerationComplete(data);
      } else {
        // Handle regular text responses
        const avatarMessage: ChatMessage = {
          id: `avatar-${Date.now()}`,
          text: data.fullResponse,
          sender: "avatar",
          timestamp: Date.now(),
        };
        dispatch(addChatMessage(avatarMessage));
      }
    };

    // Handle user messages from text input
    const handleTranscriptionFinal = (data: { text: string }) => {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        text: data.text,
        sender: "user",
        timestamp: Date.now(),
      };
      dispatch(addChatMessage(userMessage));
    };

    avatarChatService.socket?.on(
      "llm_response_complete",
      handleLLMResponseComplete,
    );
    avatarChatService.socket?.on(
      "transcription_final",
      handleTranscriptionFinal,
    );

    return () => {
      // Remove credit event listeners
      dispatch(toggleSessionEnded(true));
      avatarChatService.off("credits-updated", handleCreditsUpdated);
      avatarChatService.off("insufficient-credits", handleInsufficientCredits);
      avatarChatService.off("session-force-ended", handleSessionForceEnded);
      avatarChatService.off("image-sent", handleImageSent);
      avatarChatService.off("image-processed", handleImageProcessed);
      avatarChatService.socket?.off(
        "llm_response_complete",
        handleLLMResponseComplete,
      );
      avatarChatService.socket?.off(
        "transcription_final",
        handleTranscriptionFinal,
      );

      cleanupCamera();
      avatarChatService.endSession();
      dispatch(toggleCameraForCall(false));
      dispatch(clearChatMessages());
    };
  }, [
    avatarId,
    isAuthenticated,
    user,
    isValidating,
    isValid,
    navigate,
    personasLoading,
    cleanupCamera,
  ]);

  // Check if avatar exists after personas are loaded
  useEffect(() => {
    if (personas.length > 0 && !personasLoading && !currentPersona) {
      navigate("/?error=avatar-not-found");
    }
  }, [personas.length, personasLoading, currentPersona, slug, navigate]);

  // Update time remaining based on both 15-minute limit and credit balance
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const sessionTimeRemaining = Math.max(0, 15 * 60 - elapsed);

      // Use the minimum of session time and credit-based time
      let actualTimeRemaining = sessionTimeRemaining;
      if (creditBasedTimeRemaining !== null) {
        const creditTimeAdjusted = Math.max(
          0,
          creditBasedTimeRemaining - elapsed,
        );
        actualTimeRemaining = Math.min(
          sessionTimeRemaining,
          creditTimeAdjusted,
        );
      }

      setTimeRemaining(actualTimeRemaining);

      if (actualTimeRemaining <= 0) {
        dispatch(toggleSessionEnded(true));
        cleanupCamera();
        avatarChatService.endSession();
        dispatch(toggleCameraForCall(false));
        dispatch(clearChatMessages());
        dispatch(setSessionEndModal([true]));
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [callStartTime, cleanupCamera, creditBasedTimeRemaining]);

  // Handle flip camera event
  useEffect(() => {
    const handleFlipCamera = () => {
      setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    };

    window.addEventListener("flip-camera", handleFlipCamera);
    return () => window.removeEventListener("flip-camera", handleFlipCamera);
  }, []);

  // Detect page refresh and set flag
  useEffect(() => {
    const handleBeforeUnload = () => {
      isRefresh.current = true;
      dispatch(toggleSessionEnded(true));
      cleanupCamera();
      avatarChatService.endSession();
      dispatch(clearChatMessages());
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    sessionStorage.setItem("inCallPage", "true");

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sessionStorage.removeItem("inCallPage");
      // IMPORTANT: Always cleanup camera when component unmounts
      cleanupCamera();
    };
  }, [navigate, cleanupCamera]);

  if (
    isLoading ||
    !isAuthenticated ||
    !user ||
    isValidating ||
    personasLoading
  ) {
    return (
      <div className="bg-primary flex h-screen w-full items-center justify-center text-white">
        <div className="text-center">
          <div className="mb-2">
            {isValidating
              ? "Validating credits..."
              : personasLoading
                ? "Loading avatar data..."
                : "Loading..."}
          </div>
          {error && (
            <div className="text-sm text-red-400">
              Credit validation error: {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isValid === false) {
    return (
      <div className="bg-primary flex h-screen w-full items-center justify-center text-white">
        <div className="text-center">
          <div className="mb-2">Insufficient credits for this call</div>
          <div className="text-sm text-red-400">Redirecting to home...</div>
        </div>
      </div>
    );
  }

  return (
    <VisionCaptureProvider>
      {/* Hidden recording AgentScreen: keeps canvas full-size and feeds SessionRecordingService */}
      <div
        className={`pointer-events-none fixed top-0 -left-[10000px] h-[432px] w-[446px] opacity-0 select-none`}
      >
        <AgentScreen
          userVideoRef={userVideoRef}
          avatarName={avatarName}
          timeRemaining={timeRemaining}
          persona={currentPersona}
          focusedScreen={focusedScreen}
          personaSlug={slug}
        />
      </div>
      {!isSessionEnded ? (
        <div className="bg-primary relative -mb-20 flex h-full w-full flex-col items-center justify-center">
          <div className="bg-primary relative flex h-full w-full max-w-md flex-col items-center justify-center overflow-hidden border border-white/20">
            <div className="flex h-full w-full flex-col">
              <div
                onClick={() => handleScreenClick("agent")}
                className={cn(
                  "flex flex-1 items-center justify-center overflow-hidden object-contain transition-all duration-100 ease-in-out",
                  isChatOpen
                    ? "!h-[35%] flex-[unset]"
                    : "flex-1",
                  focusedScreen === "user"
                    ? "absolute right-2 bottom-25 z-20 flex aspect-[3/4] w-[40%] overflow-hidden rounded-md bg-black"
                    : "relative h-full w-full",
                )}
              >
                <AgentScreen
                  userVideoRef={userVideoRef}
                  avatarName={avatarName}
                  timeRemaining={timeRemaining}
                  persona={currentPersona}
                  personaSlug={slug}
                  focusedScreen={focusedScreen}
                  disableRecording={true}
                />
              </div>
              <div
                onClick={() => handleScreenClick("user")}
                className={cn(
                  "flex-1 items-center justify-center transition-all duration-100 ease-in-out",
                  focusedScreen === "agent"
                    ? "absolute right-2 bottom-25 z-20 flex aspect-[3/4] w-[40%] overflow-hidden rounded-md bg-black"
                    : "relative flex aspect-auto h-full w-full flex-1",
                )}
              >
                <UserScreen
                  ref={userVideoRef}
                />
              </div>
            </div>
          </div>
          <ControlBar />
        </div>
      ) : (
        <CallEndScreen />
      )}
      {showProducts && (
        <ProductCards
          products={products}
          onClose={() => setShowProducts(false)}
          onPurchase={handleProductPurchase}
        />
      )}
      <SessionEndDrawer />
    </VisionCaptureProvider>
  );
};

export default CallPage;
