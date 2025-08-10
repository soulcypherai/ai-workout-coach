import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { captureError, trackSpan } from "../lib/monitoring.js";
import { getPersonaVoiceId } from "../personas/config.js";
import { logger } from "../lib/cloudwatch-logger.js";

const MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam - a standard, professional voice

/* ---------- shared helpers ---------- */
const ensureApiKey = () => {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error("ElevenLabs API key not configured");
};

const preprocessTextForTTS = (txt) =>
  txt
    .replace(/\bUI\b/g, "user interface")
    .replace(/\bAPI\b/g, "A P I")
    .replace(/\bCEO\b/g, "C E O")
    .replace(/\bCTO\b/g, "C T O")
    .replace(/\bVC\b/g, "venture capital")
    .replace(/\bSaaS\b/g, "Software as a Service")
    .replace(/\bAI\b/g, "artificial intelligence")
    .replace(/\bML\b/g, "machine learning")
    .replace(/\.{3,}/g, "...")
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .trim()
    .replace(/[^.!?]$/, (m) => m + ".");

/* ---------- streaming (NDJSON) ---------- */
export async function synthesizeTTSStreaming(text, avatarId, socket) {
  const processed = preprocessTextForTTS(text);
  let voiceId = await getPersonaVoiceId(avatarId);
  if (!voiceId) {
    logger.warn('Voice ID for avatar not found, using default', { avatarId, defaultVoiceId: DEFAULT_VOICE_ID, component: 'ttsSynth' });
    voiceId = DEFAULT_VOICE_ID;
  }
  
  return trackSpan("tts.synthesize_streaming", "tts", {
    "tts.model_id": MODEL_ID,
    "tts.voice_id": voiceId,
    "tts.avatar_id": avatarId,
    "tts.text_length": processed.length,
    "tts.output_format": "mp3_44100_128"
  }, async () => {
    try {
      ensureApiKey();
      const elevenlabs = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      });

      const audioStream = await elevenlabs.textToSpeech.streamWithTimestamps(
        voiceId,
        {
          text: processed,
          modelId: MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      );

      for await (const chunk of audioStream) {

        if (chunk.alignment) {
          socket.emit("tts_stream_alignment", {
            characters: chunk.alignment.characters,
            start_seconds: chunk.alignment.characterStartTimesSeconds,
            end_seconds: chunk.alignment.characterEndTimesSeconds,
            avatarId,
          });
        }
        if (chunk.audioBase64) {
          socket.emit("tts_stream", {
            audio: chunk.audioBase64,
            avatarId,
          });
        }
      }

      return true;
    } catch (e) {
      logger.error('TTS streaming error', { error: e.message, avatarId, component: 'ttsSynth' });
      captureError(e, "tts", "synthesizeTTSStreaming", {
        avatar_id: avatarId,
        text_length: processed?.length,
        voice_id: await getPersonaVoiceId(avatarId),
      });
      return false;
    }
  });
}

/* ------------------------------------------------------------
 * Simple helper to stream LLM chunks to TTS.
 * Flushes to ElevenLabs once we detect a sentence boundary (. ! ?) or
 * the buffer exceeds 120 characters.
 * ---------------------------------------------------------- */
export function createStreamingTTSCallback(avatarId, socket) {
  let buffer = "";
  const SENTENCE_REGEX = /[.!?]\s*$/;

  const flush = async () => {
    const txt = buffer.trim();
    if (!txt) return;
    buffer = "";
    try {
      await synthesizeTTSStreaming(txt, avatarId, socket);
    } catch (err) {
      logger.error('TTS flush error', { error: err.message, avatarId, component: 'ttsSynth' });
    }
  };

  return {
    /**
     * Processes a chunk of text from the LLM.
     * @param {string} chunk - The piece of text.
     */
    async onChunk(chunk) {
      buffer += chunk;
      if (buffer.length >= 120 || SENTENCE_REGEX.test(buffer)) {
        await flush();
      }
    },

    /**
     * Flushes any remaining text in the buffer.
     */
    async onComplete() {
      await flush();
    },
  };
}
