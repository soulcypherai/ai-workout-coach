import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  useAvatarChatState,
  useSharedAvatarChat,
} from "@/contexts/AvatarChatContext";
import { logError } from "@/lib/errorLogger";
import { useDispatch, useSelector } from "@/store";
import {
  addChatMessage,
  loadChatHistory,
} from "@/store/slices/session";
import {
  MdOutlineFileDownload,
  MdOutlinePauseCircleFilled,
  MdOutlinePlayCircleFilled,
} from "react-icons/md";
import { useParams } from "react-router-dom";

import ImageModal from "@/components/ui/image-modal";

import type { ChatMessage } from "@/types/slices";

const ChatInterface = () => {
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    description?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { slug } = useParams();
  const personas = useSelector((state) => state.app.personas);
  const currentPersona = personas.find((p) => p.slug === slug);
  const avatarId = currentPersona?.id;
  const { service } = useSharedAvatarChat();
  const { getToken, isMiniApp } = useAuth();
  const dispatch = useDispatch();
  const chatMessages = useSelector((state) => state.session.chatMessages);
  const { audioPlaying } = useAvatarChatState();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Focus input when chat opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch conversation history when component mounts
  useEffect(() => {
    console.log("[ChatHistory] useEffect triggered with:", {
      avatarId,
      historyLoaded,
      isLoadingHistory,
      chatMessagesLength: chatMessages.length,
    });

    const fetchConversationHistory = async () => {
      if (
        !avatarId ||
        historyLoaded ||
        isLoadingHistory ||
        chatMessages.length > 0
      ) {
        console.log("[ChatHistory] Skipping fetch due to conditions:", {
          noAvatarId: !avatarId,
          alreadyLoaded: historyLoaded,
          currentlyLoading: isLoadingHistory,
          existingMessages: chatMessages.length,
        });
        return;
      }

      setIsLoadingHistory(true);
      try {
        const serverUrl =
          import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
        const token = getToken();

        console.log("[ChatHistory] Starting fetch...", {
          avatarId,
          serverUrl,
          hasToken: !!token,
        });

        if (!token) {
          console.warn("[ChatHistory] No auth token found");
          console.log({ token });
          return;
        }

        const url = `${serverUrl}/api/auth/conversation-history/${avatarId}?limit=200&days=7`;
        console.log("[ChatHistory] Fetching from:", url);

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        console.log("[ChatHistory] Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          logError("[ChatHistory] Error response", new Error(errorText), {
            section: "chat_interface",
          });
          throw new Error(
            `Failed to fetch conversation history: ${response.status} - ${errorText}`,
          );
        }

        const data = await response.json();
        console.log("[ChatHistory] Response data:", data);

        if (data.success && data.messages && data.messages.length > 0) {
          console.log(
            "[ChatHistory] Loaded",
            data.messages.length,
            "historical messages",
          );

          // Add separator after historical messages
          const messagesWithSeparator = [
            ...data.messages,
            {
              id: "session-separator",
              text: "",
              sender: "separator" as const,
              timestamp: Date.now(),
            },
          ];

          dispatch(loadChatHistory(messagesWithSeparator));
        } else {
          console.log("[ChatHistory] No previous conversation history found");
        }

        setHistoryLoaded(true);
      } catch (error) {
        logError("[ChatHistory] Error fetching conversation history", error, {
          section: "chat_interface",
        });
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchConversationHistory();
  }, [avatarId, historyLoaded, isLoadingHistory]);

  // Listen for thinking state changes only (messages are handled at CallPage level)
  useEffect(() => {
    const socket = service.socket;
    if (!socket) return;

    const handleLLMStart = () => {
      setIsThinking(true);
    };

    const handleLLMComplete = () => {
      setIsThinking(false);
    };

    const handleLLMError = () => {
      setIsThinking(false);
    };

    socket.on("llm_response_start", handleLLMStart);
    socket.on("llm_response_complete", handleLLMComplete);
    socket.on("llm_response_error", handleLLMError);

    return () => {
      socket.off("llm_response_start", handleLLMStart);
      socket.off("llm_response_complete", handleLLMComplete);
      socket.off("llm_response_error", handleLLMError);
    };
  }, [service.socket]);


  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const messageText = inputValue.trim();
    // Send message - backend will include last captured image if available
    service.sendTextMessage(messageText);

    // User message will be added by CallPage when it receives transcription_final event

    // Clear input
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };




  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="absolute right-0 left-0 flex h-full w-full flex-col bg-black/90 pb-21 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-white/20 p-4">
        <h3 className="text-lg font-semibold text-white">Chat</h3>
        <p className="text-sm text-gray-400">
          Type your message to continue the conversation
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex flex-1 flex-col space-y-3 overflow-x-hidden p-4">
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              <div>Loading conversation history...</div>
            </div>
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {historyLoaded
              ? "Start typing to begin the conversation..."
              : "No previous conversations found. Start typing to begin..."}
          </div>
        ) : (
          chatMessages.map((message) => {
            if (message.sender === "separator") {
              return (
                <div
                  key={message.id}
                  className="my-4 flex items-center justify-center"
                >
                  <div className="flex w-full items-center">
                    <div className="h-px flex-1 bg-white/20"></div>
                    <div className="bg-black px-3 text-xs text-white/50">
                      Current Session
                    </div>
                    <div className="h-px flex-1 bg-white/20"></div>
                  </div>
                </div>
              );
            }


            // Special rendering for image messages
            if (message.type === "image" && message.imageData) {
              return (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.sender === "user"
                        ? "bg-accent"
                        : "border border-white/20 bg-white/10"
                    }`}
                  >
                    <div
                      className="cursor-pointer overflow-hidden rounded-lg transition-opacity hover:opacity-90"
                      onClick={() =>
                        setSelectedImage({
                          url: message.imageData!.url,
                          description: message.imageData!.description,
                        })
                      }
                    >
                      <img
                        src={message.imageData.url}
                        alt="Shared image"
                        className="max-h-48 w-full object-contain"
                      />
                    </div>
                    {message.imageData.description && (
                      <p
                        className={`mt-2 text-sm ${
                          message.sender === "user"
                            ? "text-black"
                            : "text-white"
                        }`}
                      >
                        {message.imageData.description}
                      </p>
                    )}
                    <span
                      className={`text-xs ${
                        message.sender === "user"
                          ? "text-black/70"
                          : "text-white/50"
                      } mt-1 block`}
                    >
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.sender === "user"
                      ? "bg-accent text-black"
                      : "border border-white/20 bg-white/10 text-white"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  <span
                    className={`text-xs ${
                      message.sender === "user"
                        ? "text-black/70"
                        : "text-white/50"
                    } mt-1 block`}
                  >
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white">
              <div className="flex items-center space-x-1">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-white/60"></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-white/60"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-white/60"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
                <span className="ml-2 text-xs text-white/70">thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="w-full border-t border-white/20 bg-black/90 p-4 backdrop-blur-sm">
        <div className="flex w-full gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="focus:ring-accent w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/50 focus:border-transparent focus:ring-2 focus:outline-none"
            disabled={isThinking}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isThinking}
            className="bg-accent hover:bg-accent/80 disabled:bg-accent/50 rounded-lg px-4 py-2 font-medium text-black transition-colors disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>

      {/* Image Modal */}
      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage?.url || ""}
        description={selectedImage?.description}
      />

    </div>
  );
};

export default ChatInterface;
