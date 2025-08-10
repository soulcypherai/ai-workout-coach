import dotenv from "dotenv";
import WebSocket from "ws";

import { generateLLMResponse } from "./llmResponder.js";
import { createStreamingTTSCallback } from "./ttsSynth.js";
import { logger } from "../lib/cloudwatch-logger.js";

dotenv.config();

// This config is based on your provided code.
const OPEN_AI_REALTIME_TRANSCRIPTION_CONFIG = {
  type: "transcription_session.update",
  session: {
    input_audio_format: "pcm16",
    input_audio_transcription: {
      model: "gpt-4o-transcribe",
      language: "en",
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.3,
      prefix_padding_ms: 300,
      silence_duration_ms: 500, // Reduced for more responsive feel
    },
  },
};

export async function createRealtimeTranscriber(clientSocket, avatarId, callSessionId, userId = null) {
  // IMPORTANT: This URL is a placeholder. You must replace it with the actual URL from your other project.
  const REALTIME_URL =
    process.env.OPEN_AI_REALTIME_TRANSCRIPTION_URL ||
    "wss://api.openai.com/v1/realtime?intent=transcription";

  const serviceWs = new WebSocket(REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1", // Custom header from your reference
    },
  });

  let transcription = "";
  let lastFinalTranscript = "";
  let avatarSpeaking = false; // Track if avatar is currently speaking

  serviceWs.on("open", () => {
    logger.info('Transcription service connected', { component: 'realtimeTranscriber' });
    logger.info('Sending transcription_session.update config', { component: 'realtimeTranscriber' });
    serviceWs.send(JSON.stringify(OPEN_AI_REALTIME_TRANSCRIPTION_CONFIG));
  });

  serviceWs.on("message", async (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === "conversation.item.input_audio_transcription.delta") {
      logger.info('Partial delta received', { delta: message.delta, component: 'realtimeTranscriber' });
      transcription += message.delta;
      clientSocket.emit("transcription_partial", { text: transcription });
      
      // **INTERRUPTION DETECTION**: Check if avatar is speaking and user just started
      if (avatarSpeaking && transcription.trim().length > 2) {
        logger.info('User spoke while avatar was speaking', { transcription, component: 'realtimeTranscriber' });
        clientSocket.emit("user_spoke", { 
          partialTranscript: transcription,
          interruptionType: "during_speech"
        });
        avatarSpeaking = false; // Reset flag
      }
      
    } else if (
      message.type === "conversation.item.input_audio_transcription.completed"
    ) {
      logger.info('Accumulated transcription from deltas', { transcription, component: 'realtimeTranscriber' });
      logger.info('Official final transcription from OpenAI', { transcription: message.transcription || "", component: 'realtimeTranscriber' });

      const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

      let finalTranscription = (message.transcription || "").trim();
      if (!finalTranscription) {
        // Fallback to accumulated deltas if service didn't include transcript
        finalTranscription = transcription.trim();
      }

      if (!finalTranscription) {
        logger.info('Empty transcript – skipping LLM/TTS pipeline', { component: 'realtimeTranscriber' });
        transcription = "";
        return;
      }

      // Skip if normalized text matches previous or is too short (<4 chars)
      // if (
      //   normalize(finalTranscription) === normalize(lastFinalTranscript) ||
      //   normalize(finalTranscription).length < 4
      // ) {
      //   console.log('[Transcriber] Duplicate transcript – skipping LLM/TTS pipeline.');
      //   transcription = "";
      //   return;
      // }

      lastFinalTranscript = finalTranscription;

      logger.info('Final transcript from service', { finalTranscription, component: 'realtimeTranscriber' });
      logger.info('Passing transcript to LLM and TTS pipeline', { component: 'realtimeTranscriber' });
      clientSocket.emit("transcription_final", { text: finalTranscription });

      if (finalTranscription.trim()) {
        const ttsCallback = createStreamingTTSCallback(avatarId, clientSocket);
        
        // Mark that user has interacted via voice
        clientSocket.hasUserInteracted = true;
        
        // **AVATAR SPEAKING TRACKING**: Mark avatar as speaking
        avatarSpeaking = true;
        
        // Check if we have a recent image to include with the user's message
        let messageContent = finalTranscription;
        logger.info('Checking for vision image', { 
          hasLastVisionImage: !!clientSocket.lastVisionImage,
          timestamp: clientSocket.lastVisionImage?.timestamp,
          timeDiff: clientSocket.lastVisionImage ? (Date.now() - clientSocket.lastVisionImage.timestamp) : null,
          component: 'realtimeTranscriber' 
        });
        
        if (clientSocket.lastVisionImage && (Date.now() - clientSocket.lastVisionImage.timestamp < 30000)) {
          // Convert text message to multimodal message with image
          messageContent = [
            {
              type: "text", 
              text: finalTranscription
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${clientSocket.lastVisionImage.data}`
              }
            }
          ];
          logger.info('Including vision image with voice transcription', { component: 'realtimeTranscriber' });
        }
        
        // This now streams to TTS internally and resolves when the LLM is done.
        await generateLLMResponse(
          messageContent,
          avatarId,
          clientSocket,
          callSessionId,
          ttsCallback,
          [],    // additionalContext
          false, // isProactive
          userId // pass userId for cross-session history
        );
        
        // Mark avatar as finished speaking
        avatarSpeaking = false;
        logger.info('Avatar finished speaking', { component: 'realtimeTranscriber' });
      }

      // Reset for the next turn
      transcription = "";
    }
  });

  serviceWs.on("error", (error) => {
    logger.error('Transcription service error', { error: error.message, component: 'realtimeTranscriber' });
    clientSocket.emit("error", { message: "Transcription service error." });
  });

  serviceWs.on("close", (code, reason) => {
    logger.info('Transcription service disconnected', { 
      code, 
      reason: reason.toString(), 
      component: 'realtimeTranscriber' 
    });
  });

  return {
    send: (audioData) => {
      if (serviceWs.readyState === WebSocket.OPEN) {
        // console.log(`[Transcriber] Forwarding audio chunk to OpenAI realtime service. size=${audioData?.byteLength || audioData?.length}`);
        // The reference code sends base64 encoded audio
        serviceWs.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: Buffer.from(audioData).toString("base64"),
          }),
        );
      }
    },
    // Add method to manually set avatar speaking state
    setAvatarSpeaking: (speaking) => {
      avatarSpeaking = speaking;
    },
    close: () => {
      logger.info('Close called', { 
        webSocketReadyState: serviceWs.readyState, 
        component: 'realtimeTranscriber' 
      });
      if (serviceWs.readyState === WebSocket.CONNECTING) {
        logger.info('WebSocket is still connecting. Will close on open', { component: 'realtimeTranscriber' });
        serviceWs.once("open", () => {
          logger.info('WebSocket opened, now closing as requested', { component: 'realtimeTranscriber' });
          serviceWs.send(JSON.stringify({ type: "CloseStream" }));
          serviceWs.close();
        });
      } else if (serviceWs.readyState === WebSocket.OPEN) {
        logger.info('WebSocket is open. Closing now', { component: 'realtimeTranscriber' });
        serviceWs.send(JSON.stringify({ type: "CloseStream" }));
        serviceWs.close();
      } else {
        logger.info('WebSocket is in state - no action taken', { 
          webSocketReadyState: serviceWs.readyState, 
          component: 'realtimeTranscriber' 
        });
      }
    },
  };
}
