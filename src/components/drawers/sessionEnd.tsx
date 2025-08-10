"use client";

// import MedalIcon from "@/assets/svg/medal-active.svg";
import { useEffect, useState } from "react";

import CommunityIcon from "@/assets/svg/people-active.svg";
import SaveIcon from "@/assets/svg/save-active.svg";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatarChatState } from "@/contexts/AvatarChatContext";
import { logError } from "@/lib/errorLogger";
import { sessionRecordingService } from "@/services/SessionRecordingService";
import { dispatch, useSelector } from "@/store";
import { setSessionEndModal } from "@/store/slices/modal";
import { Check, ChevronRight, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const SessionEndDrawer = () => {
  const { isOpen: isModalOpen, data: modalData } = useSelector(
    (state) => state.modal.sessionEndedModal,
  );
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { transcription, llmResponse } = useAvatarChatState();
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [recordingReady, setRecordingReady] = useState<boolean>(
    () => !!sessionRecordingService.getLastRecordingId(),
  );

  // Listen for recording-finalised event so we know when the DB row exists
  useEffect(() => {
    if (recordingReady) return;
    const onFinalised = () => {
      setRecordingReady(true);
    };
    sessionRecordingService.on("recording-finalised", onFinalised);
    return () => {
      sessionRecordingService.off("recording-finalised", onFinalised);
    };
  }, [recordingReady]);

  const onOpenChange = () => {
    dispatch(setSessionEndModal([false]));
  };

  const handleShareWithCommunity = async () => {
    try {
      if (!user) {
        logError(
          "User not authenticated for community share",
          new Error("User not authenticated"),
          { section: "session_complete" },
        );
        return;
      }

      // At this point we expect the recording to be ready because the modal is
      // only shown after end-call, and we wait for the finalised event above.
      const finalRecordingId =
        sessionRecordingService.getLastRecordingId() ||
        sessionRecordingService.getState().recordingId;

      if (!finalRecordingId) {
        logError(
          "No recording ID available for community share",
          new Error("No recording ID available"),
          { section: "session_complete" },
        );
        setUploadStatus("error");
        return;
      }

      setUploadStatus("uploading");

      // Publish the existing recording to community
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
      const maxRetries = 5;
      let attempt = 0;
      while (attempt < maxRetries) {
        const resp = await fetch(
          `${serverUrl}/api/recordings/publish/${finalRecordingId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              transcript: `User: ${transcription}\n\nAI: ${llmResponse}`, // Use existing session transcript
            }),
          },
        );

        if (resp.ok) {
          await resp.json();
          break;
        }

        if (resp.status === 404) {
          throw new Error("Publishing failed after retries");
        }

        attempt++;
      }

      setUploadStatus("success");

      // Navigate to community feed
      setTimeout(() => {
        dispatch(setSessionEndModal([false]));
        navigate("/community");
      }, 1500);
    } catch (error) {
      logError("Error sharing with community", error, {
        section: "session_complete",
      });
      setUploadStatus("error");
    }
  };

  const handleSaveAndExit = () => {
    // Function to handle save and exit
    dispatch(setSessionEndModal([false]));
    navigate("/");
  };

  return (
    <Drawer open={isModalOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black p-4 text-white">
        <DrawerHeader className="flex flex-col items-center">
          <DrawerTitle className="font-secondary text-accent text-center text-3xl">
            {modalData?.title||"Session complete"}
          </DrawerTitle>
          <DrawerDescription className="text-secondary my-2 text-center text-sm">
            {modalData?.description ||
              "Session completed and your pitch is saved, thank you for engaging with the AI Judges"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 p-4">
          <button
            onClick={handleShareWithCommunity}
            disabled={uploadStatus === "uploading" || !recordingReady}
            className="bg-bg-foreground border-border flex items-center justify-between rounded-xl border px-5 py-4 text-left disabled:opacity-50"
          >
            <div className="flex items-center">
              <span className="text-accent mr-2">
                {uploadStatus === "success" ? (
                  <Check className="h-6 w-6" />
                ) : uploadStatus === "uploading" ? (
                  <Upload className="h-6 w-6 animate-bounce" />
                ) : (
                  <img src={CommunityIcon} alt="Community Icon" />
                )}
              </span>
              <span>
                {!recordingReady
                  ? "Preparing recording..."
                  : uploadStatus === "uploading"
                    ? "Uploading..."
                    : uploadStatus === "success"
                      ? "Shared successfully!"
                      : uploadStatus === "error"
                        ? "Upload failed - try again"
                        : "Share it with community"}
              </span>
            </div>
            {uploadStatus === "idle" && (
              <ChevronRight className="text-accent" />
            )}
          </button>

          {/* <button
            onClick={handleSubmitForContests}
            className="bg-bg-foreground border-border flex items-center justify-between rounded-xl border px-5 py-4 text-left"
          >
            <div className="flex items-center">
              <span className="text-accent mr-2">
                <img src={MedalIcon} alt="Medal Icon" />
              </span>
              <span>Submit for contests</span>
            </div>
            <ChevronRight className="text-accent" />
          </button> */}

          <button
            onClick={handleSaveAndExit}
            className="bg-bg-foreground border-border flex items-center justify-between rounded-xl border px-5 py-4 text-left"
          >
            <div className="flex items-center">
              <span className="text-accent mr-2">
                <img src={SaveIcon} alt="Save Icon" />
              </span>
              <span>Save and exit</span>
            </div>
            <ChevronRight className="text-accent" />
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default SessionEndDrawer;
