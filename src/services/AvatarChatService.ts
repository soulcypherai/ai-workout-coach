import { Room } from "livekit-client";
import { Socket, io } from "socket.io-client";
import { TinyEmitter } from "tiny-emitter";

import { logError } from "../lib/errorLogger";
import { supabase } from "../lib/supabase";
import { sessionRecordingService } from "./SessionRecordingService";

export interface MouthCue {
  value: string; // 'A' .. 'H' | 'X'
  start: number; // seconds
  end: number; // seconds
}

export interface VisemeData {
  mouthCues: MouthCue[];
}

export interface AvatarChatState {
  isConnected: boolean;
  isRecording: boolean;
  roomName: string | null;
  sessionId: string | null;
  transcription: string;
  llmResponse: string;
  isLLMResponding: boolean;
  audioPlaying: boolean;
  isPlayingMusic: boolean;
  error: string | null;
  audioUrl: string | null;
  visemes: VisemeData | null;
  conversationState: "idle" | "listening" | "thinking" | "speaking";
  wasInterrupted: boolean;
  lastInterruptedResponse: string;
  interruptionCount: number;
  visionEnabled: boolean;
  lastImageDescription: string | null;
  isProcessingImage: boolean;
}

interface AvatarChatOptions {
  serverUrl?: string;
}

export class AvatarChatService extends TinyEmitter {
  private state: AvatarChatState = {
    isConnected: false,
    isRecording: false,
    roomName: null,
    sessionId: null,
    transcription: "",
    llmResponse: "",
    isLLMResponding: false,
    audioPlaying: false,
    isPlayingMusic: false,
    error: null,
    audioUrl: null,
    visemes: null,
    conversationState: "idle",
    wasInterrupted: false,
    lastInterruptedResponse: "",
    interruptionCount: 0,
    visionEnabled: true,
    lastImageDescription: null,
    isProcessingImage: false,
  };

  private sessionActive = false;
  public socket: Socket | null = null;
  public room: Room | null = null;
  public audioContext: AudioContext | null = null;
  private avatarGainNode: GainNode | null = null;
  private avatarMuted = false;
  /** Keep track of currently playing Web-Audio sources so we can stop them when a new utterance starts */
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private workletNode: AudioWorkletNode | null = null;
  private mediaStream: MediaStream | null = null;
  private serverUrl: string;
  private userId: string = "";
  private avatarId: string = "";
  private liveKitConnecting = false; // guard against double connect

  // --- Audio Queue for Streaming Playback ---
  private audioQueue: string[] = [];
  private audioDurationAccumulator = 0;
  private pendingAudioQueue: string[] = []; // Queue for audio received before AudioContext exists
  private visemeAccumulator: MouthCue[] = [];
  private isProcessingAudio = false;

  // --- New timing model state ---
  private playedDuration = 0;
  private currentChunkStartTime: number | null = null;
  // -----------------------------------------

  private static resumeOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      try {
        const ctx = new AudioContext();
        ctx.resume();
        ctx.close();
      } catch { }
    };
  })();

  public playbackStartTime: number | null = null;

  // --- Public accessors for audio timing ---
  public getUtterancePlaybackTime(): number {
    // If no audio context, return 0
    if (!this.audioContext) {
      return 0;
    }

    // If we have a current chunk playing, calculate based on its start time
    if (this.currentChunkStartTime !== null) {
      const currentChunkElapsed =
        this.audioContext.currentTime - this.currentChunkStartTime;
      return this.playedDuration + currentChunkElapsed;
    }

    // If no chunk is currently playing but we have active sources,
    // the audio is still playing (between chunks or finishing)
    if (this.activeAudioSources.length > 0) {
      // Return the total duration so far - this prevents timing jumps
      return this.playedDuration;
    }

    // No audio playing at all
    return 0;
  }

  constructor({ serverUrl }: AvatarChatOptions = {}) {
    super();
    // 1) explicit param   2) build-time env   3) same-origin fallback
    const envUrl = (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_SERVER_URL) as string | undefined;
    this.serverUrl =
      serverUrl ??
      envUrl ??
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3005");

    // Ensure browser autoplay policy satisfied: resume AudioContext on first gesture
    window.addEventListener("pointerdown", AvatarChatService.resumeOnce, {
      once: true,
    });
  }

  private setState(
    updater:
      | Partial<AvatarChatState>
      | ((prevState: AvatarChatState) => Partial<AvatarChatState>),
  ) {
    const newState =
      typeof updater === "function" ? updater(this.state) : updater;
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    this.emit("state-change", this.state, oldState);
  }

  public getState = (): AvatarChatState => {
    return this.state;
  };

  private convertToVisemes = (
    chars: string[] = [],
    starts: number[] = [],
    ends: number[] = [],
  ): MouthCue[] => {
    const visemeMap: Record<string, MouthCue["value"]> = {
      // silence / pauses
      " ": "X",
      "\n": "X",
      ".": "X",
      ",": "X",
      "?": "X",
      "!": "X",

      // bilabial stops & nasal -> viseme A
      p: "A",
      b: "A",
      m: "A",

      // labiodental
      f: "G",
      v: "G",

      // alveolar / dental
      t: "C",
      d: "C",
      n: "C",
      l: "C",

      // alveolar fricatives
      s: "C",
      z: "C",

      // interdental
      th: "H",
      dh: "H",

      // palato-alveolar fricatives / affricates
      sh: "C",
      zh: "C",
      ch: "C",
      j: "C",

      // velar
      k: "B",
      g: "B",

      // liquids / semivowels
      r: "C",
      w: "E",
      y: "E",

      // vowels (approximate to Preston-Blair visemes)
      a: "D",
      e: "D",
      i: "D",
      o: "E",
      u: "F",
      0: "X",
    };

    const cues: MouthCue[] = chars.map((char, i) => {
      const lowerChar = char.toLowerCase();
      const viseme = visemeMap[lowerChar] || "X";
      const cue = {
        value: viseme,
        start: starts[i] || 0,
        end: ends[i] || 0,
      };

      return cue;
    });

    // Merge consecutive identical visemes
    if (cues.length === 0) {
      return [];
    }
    const mergedCues = [cues[0]];
    for (let i = 1; i < cues.length; i++) {
      const lastCue = mergedCues[mergedCues.length - 1];
      if (cues[i].value === lastCue.value) {
        lastCue.end = cues[i].end;
      } else {
        mergedCues.push(cues[i]);
      }
    }

    return mergedCues;
  };

  // Adds a chunk to the audio queue and starts processing if not already started.
  private playAudioChunk = (base64Audio: string) => {
    if (!this.audioContext) return;
    this.audioQueue.push(base64Audio);
    this.processAudioQueue();
  };

  // Processes the audio queue sequentially.
  private processAudioQueue = async () => {
    if (this.isProcessingAudio || this.audioQueue.length === 0) {
      // If the queue is empty and we are not processing, it means we've finished.
      if (!this.isProcessingAudio && this.audioQueue.length === 0) {
        // Only transition to idle if the current state is speaking and no active sources
        if (
          this.state.conversationState === "speaking" &&
          this.activeAudioSources.length === 0
        ) {
          this.setState({
            audioPlaying: false,
            conversationState: "idle",
          });

          // **AVATAR SPEAKING TRACKING**: Notify server when avatar stops speaking
          if (this.socket) {
            this.socket.emit("avatar_speaking_end");
          }
        }
      }
      return;
    }

    this.isProcessingAudio = true;
    const base64Audio = this.audioQueue.shift();

    if (!base64Audio || !this.audioContext) {
      this.isProcessingAudio = false;
      this.processAudioQueue(); // Continue with the next item
      return;
    }

    this.ensureAvatarGainNode();
    this.setState({
      audioPlaying: true,
      conversationState: "speaking",
    });

    // **AVATAR SPEAKING TRACKING**: Notify server when avatar starts speaking
    if (this.socket) {
      this.socket.emit("avatar_speaking_start");
    }

    try {
      const audioData = Uint8Array.from(atob(base64Audio), (c) =>
        c.charCodeAt(0),
      );
      const audioBuffer = await this.audioContext.decodeAudioData(
        audioData.buffer,
      );

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.avatarGainNode ?? this.audioContext.destination);
      this.activeAudioSources.push(source);

      source.onended = () => {
        this.activeAudioSources = this.activeAudioSources.filter(
          (s) => s !== source,
        );

        // Add ended chunk's duration to playedDuration
        this.playedDuration += audioBuffer.duration;
        this.currentChunkStartTime = null; // Mark that no chunk is currently playing

        this.isProcessingAudio = false;

        // Only process next item if there are no more active sources or queue items
        if (
          this.activeAudioSources.length === 0 &&
          this.audioQueue.length === 0
        ) {
          // All audio has finished, transition to idle
          this.setState({
            audioPlaying: false,
            conversationState: "idle",
          });

          if (this.socket) {
            this.socket.emit("avatar_speaking_end");
          }
        } else {
          // Continue processing the queue
          this.processAudioQueue();
        }
      };

      // Record the start time for the current chunk
      this.currentChunkStartTime = this.audioContext.currentTime;
      source.start();
    } catch (error) {
      logError("[SVC] Audio chunk processing error", error, {
        section: "audio_processing",
      });
      this.isProcessingAudio = false;
      this.processAudioQueue(); // Continue with the next item even if this one fails
    }
  };

  // Play complete audio buffer
  private playAudioBuffer = (base64Audio: string) => {
    if (!this.audioContext) return;

    // Stop any streaming audio, clear the queue, and play this buffer immediately.
    this.stopAllAudioPlayback();
    this.ensureAvatarGainNode();

    try {
      const audioData = Uint8Array.from(atob(base64Audio), (c) =>
        c.charCodeAt(0),
      );

      this.audioContext
        .decodeAudioData(audioData.buffer.slice())
        .then((audioBuffer) => {
          const source = this.audioContext!.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.avatarGainNode ?? this.audioContext!.destination);
          this.activeAudioSources.push(source);
          source.onended = () => {
            this.activeAudioSources = this.activeAudioSources.filter(
              (s) => s !== source,
            );
            this.setState({
              audioPlaying: false,
              conversationState: "idle",
            });

            // **AVATAR SPEAKING TRACKING**: Notify server when avatar stops speaking
            if (this.socket) {
              this.socket.emit("avatar_speaking_end");
            }
          };
          // Mark as speaking while this buffer plays
          this.setState({
            audioPlaying: true,
            conversationState: "speaking",
          });
          source.start();
        })
        .catch((err) => {
          logError("[SVC] decodeAudioData error", err, {
            section: "audio_decode",
          });
        });
    } catch (error) {
      logError("[SVC] Audio buffer playback error", error, {
        section: "audio_playback",
      });
    }
  };

  // Ensure we have a GainNode in the audio graph that we can use to mute/unmute.
  private ensureAvatarGainNode() {
    if (!this.audioContext) return;
    if (
      this.avatarGainNode &&
      this.avatarGainNode.context === this.audioContext
    )
      return;

    // If avatarGainNode exists but belongs to a different context, disconnect and recreate
    if (
      this.avatarGainNode &&
      this.avatarGainNode.context !== this.audioContext
    ) {
      try {
        this.avatarGainNode.disconnect();
      } catch (e) {
        // Ignore disconnect errors from closed contexts
      }
      this.avatarGainNode = null;
    }

    this.avatarGainNode = this.audioContext.createGain();
    this.avatarGainNode.gain.value = this.avatarMuted ? 0 : 1;
    this.avatarGainNode.connect(this.audioContext.destination);
  }

  /**
   * Public API to mute / unmute avatar audio without affecting socket or playback logic.
   */
  public setAvatarMuted(muted: boolean) {
    this.avatarMuted = muted;
    if (this.avatarGainNode) {
      this.avatarGainNode.gain.value = muted ? 0 : 1;
    } else {
    }
  }

  public async switchAudioDevice(deviceId: string) {
    if (!this.mediaStream) return;

    try {
      // Get new audio stream with the selected device
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Stop old audio tracks
      this.mediaStream.getAudioTracks().forEach((track) => track.stop());

      // Replace the audio track
      const newAudioTrack = newStream.getAudioTracks()[0];
      this.mediaStream.removeTrack(this.mediaStream.getAudioTracks()[0]);
      this.mediaStream.addTrack(newAudioTrack);

      // Reconnect to the audio worklet if it exists
      if (this.audioContext && this.workletNode) {
        const source = this.audioContext.createMediaStreamSource(
          this.mediaStream,
        );
        source.connect(this.workletNode);
      }
    } catch (error) {
      logError("[SVC] Failed to switch audio device", error, {
        section: "avatar_chat",
        deviceId,
      });
    }
  }

  public setVisionEnabled = (enabled: boolean): void => {
    this.setState({ visionEnabled: enabled });
    // Notify backend about vision state change
    if (this.socket && this.state.isConnected) {
      this.socket.emit("set_vision_enabled", { enabled });
    }
  };

  /**
   * Public API for recording service to access audio components safely
   */
  public getAudioRecordingComponents() {
    return {
      audioContext: this.audioContext,
      avatarGainNode: this.avatarGainNode,
      mediaStream: this.mediaStream,
      isReady: this.audioContext !== null && this.mediaStream !== null,
    };
  }

  /**
   * Ensure audio recording components are available
   */
  public async ensureAudioForRecording() {
    // Ensure audio context exists for avatar voice playback
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: 44100 });
      this.ensureAvatarGainNode();
      console.log("[SVC] Created AudioContext in ensureAudioForRecording");

      // Play any pending audio that was queued before AudioContext was ready
      if (this.pendingAudioQueue.length > 0) {
        console.log(
          `[SVC] Playing ${this.pendingAudioQueue.length} queued audio chunks`,
        );
        const queuedAudio = [...this.pendingAudioQueue];
        this.pendingAudioQueue = [];

        // Play all queued audio chunks
        for (const audioChunk of queuedAudio) {
          this.playAudioChunk(audioChunk);
        }
      }
    }

    // Resume if suspended
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
      console.log("[SVC] Resumed suspended AudioContext");
    }

    this.ensureAvatarGainNode();

    return this.getAudioRecordingComponents();
  }

  private stopAllAudioPlayback() {
    const wasPlaying = this.state.audioPlaying;

    this.activeAudioSources.forEach((source) => source.stop());
    this.activeAudioSources = [];
    this.audioQueue = [];
    this.pendingAudioQueue = []; // Clear pending audio queue as well
    this.visemeAccumulator = [];
    this.isProcessingAudio = false;

    // Reset new timing model state
    this.playedDuration = 0;
    this.currentChunkStartTime = null;

    this.audioDurationAccumulator = 0;

    // **AVATAR SPEAKING TRACKING**: Notify server when avatar stops speaking (if was playing)
    if (wasPlaying && this.socket) {
      this.socket.emit("avatar_speaking_end");
    }
  }

  private async initializeSocket() {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Get the authentication token
    let token = null;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      token = session?.access_token;
    } catch (error) {
      logError("[SVC] Failed to get auth token", error, {
        section: "avatar_chat",
      });
    }

    // if (!token) {
    //   logError("[SVC] No auth token available", new Error("No auth token"), {
    //     section: "avatar_chat",
    //   });
    //   this.setState({ error: "Authentication required" });
    //   return;
    // }

    this.socket = io(`${this.serverUrl}/media`, {
      transports: ["websocket"],
      withCredentials: true, // Include cookies for MiniKit authentication
      auth: {
        token,
      },
    });

    this.socket.on("connect", () => {
      this.setState({ isConnected: true, error: null });
      // Pass socket connection to recording service
      sessionRecordingService.setSocket(this.socket);
    });

    this.socket.on("connect_error", (err) => {
      logError("[SVC] Socket connection error", err, {
        section: "avatar_chat",
      });
      this.setState({ isConnected: false, error: err.message });
    });

    this.socket.on("disconnect", (_reason) => {
      this.setState({ isConnected: false });
    });

    this.socket.on("session_ready", (data) => {
      console.log("[AvatarChatService] Session ready received:", data);
      this.setState({ sessionId: data.sessionId, roomName: data.roomName });
      this.initializeLiveKit();
    });

    this.socket.on("session_error", (data) => {
      logError("❌ [SVC] Session error", new Error(data.error), {
        section: "avatar_chat",
      });
      this.setState({ error: data.error });
    });

    this.socket.on("transcription_update", (data) => {
      this.setState({ transcription: data.transcription });
    });

    // Capture image when voice activity is detected (first partial transcription)
    let capturedForCurrentUtterance = false;
    this.socket.on("transcription_partial", (data) => {
      if (
        !capturedForCurrentUtterance &&
        data.text &&
        data.text.trim().length > 0
      ) {
        // First words detected - capture image
        capturedForCurrentUtterance = true;
        if (this.state.visionEnabled) {
          window.dispatchEvent(new CustomEvent("capture-for-voice"));
        }
      }
    });

    // Reset capture flag when transcription is finalized
    this.socket.on("transcription_final", () => {
      capturedForCurrentUtterance = false;
    });

    this.socket.on(
      "visemes_data",
      (data: { visemes: VisemeData; audio: string }) => {
        this.playAudioBuffer(data.audio);
        this.setState({ visemes: data.visemes });
      },
    );

    this.socket.on("tts_stream", async (data) => {
      if (data.audio) {
        if (!this.audioContext) {
          console.log("[SVC] AudioContext not ready, queueing audio chunk");
          this.pendingAudioQueue.push(data.audio);
          return;
        }

        // Decode audio immediately to get duration for timestamp offset
        const audioData = Uint8Array.from(atob(data.audio), (c) =>
          c.charCodeAt(0),
        );
        const audioBuffer = await this.audioContext.decodeAudioData(
          audioData.buffer,
        );

        this.audioDurationAccumulator += audioBuffer.duration;

        this.playAudioChunk(data.audio);
      }
    });

    this.socket.on("tts_stream_alignment", (data) => {
      const newCues = this.convertToVisemes(
        data.characters,
        data.start_seconds,
        data.end_seconds,
      );

      // Offset cues by accumulated duration within this response
      // This handles multiple alignment chunks within a single TTS response
      const offsetCues = newCues.map((cue) => ({
        ...cue,
        start: cue.start + this.audioDurationAccumulator,
        end: cue.end + this.audioDurationAccumulator,
      }));

      // Add a small buffer to the last viseme to prevent abrupt ending
      if (offsetCues.length > 0) {
        const lastCue = offsetCues[offsetCues.length - 1];
        lastCue.end += 0.1; // Add 100ms buffer to prevent abrupt ending
      }

      this.visemeAccumulator.push(...offsetCues);
      this.setState({ visemes: { mouthCues: this.visemeAccumulator } });
    });

    this.socket.on("llm_response_chunk", (data) => {
      // Reset audio state at the start of a new LLM response
      if (this.state.llmResponse === "") {
        this.audioDurationAccumulator = 0;
        this.visemeAccumulator = [];
        this.stopAllAudioPlayback(); // This now resets the new timing variables
      }

      // **INTERRUPTION HANDLING**: Handle interruption responses differently
      if (data.isInterruption) {
        this.setState({
          llmResponse: data.chunk, // Replace with interruption response
          isLLMResponding: true,
          conversationState: "thinking",
        });
      } else {
        this.setState((prevState) => ({
          llmResponse: prevState.llmResponse + data.chunk,
          isLLMResponding: true,
          conversationState: "thinking",
        }));
      }
    });

    this.socket.on("llm_response_complete", () => {
      this.setState({ isLLMResponding: false });
    });

    this.socket.on("error", (error) => {
      logError("[SVC] Socket error", error, { section: "avatar_chat" });
      this.setState({ error: error.message || "Unknown error" });
    });

    this.socket.on("user_spoke", () => {
      // Log interruption for analysis
      const wasPlaying = this.state.audioPlaying;
      const currentResponse = this.state.llmResponse;

      this.stopAllAudioPlayback();
      this.setState({
        isLLMResponding: false,
        llmResponse: "",
        visemes: null,
        audioPlaying: false,
        wasInterrupted: wasPlaying,
        lastInterruptedResponse: wasPlaying ? currentResponse : "",
        interruptionCount: this.state.interruptionCount + (wasPlaying ? 1 : 0),
        conversationState: "listening",
      });
    });

    // --- CREDIT SYSTEM EVENT HANDLERS ---
    this.socket.on("credits_charged", (data) => {
      // Emit event so UI can update credit display
      this.emit("credits-updated", {
        amount: data.amount,
        newBalance: data.newBalance,
        totalSpent: data.totalSpent,
      });
    });

    this.socket.on("insufficient_credits", (data) => {
      this.setState({
        error: data.message,
        conversationState: "idle",
      });
      // Emit event so UI can handle insufficient credits
      this.emit("insufficient-credits", {
        message: data.message,
        totalSpent: data.totalSpent,
      });
    });

    this.socket.on("session_force_end", () => {
      // End the session immediately
      this.endSession();
      // Emit event so UI can redirect or show modal
      this.emit("session-force-ended");
    });

    // Handle generated music auto-play
    this.socket.on(
      "music_ready",
      async (data: {
        audioUrl: string;
        lyrics: string;
        avatarId: string;
        sessionId?: string;
      }) => {
        if (data.avatarId !== this.avatarId) return;
        try {
          // await this.playExternalTrack(data.audioUrl);
        } catch (e) {
          console.warn("[AvatarChat] Failed to play external track", e);
        }
      },
    );

    // Vision response handlers
    this.socket.on(
      "vision_response",
      (data: {
        description: string;
        response: string;
        visemes?: VisemeData;
      }) => {
        this.setState({
          lastImageDescription: data.description,
          llmResponse: data.response,
          isProcessingImage: false,
          conversationState: "speaking",
        });

        // Emit event for UI to show image was processed
        this.emit("image-processed", {
          description: data.description,
          response: data.response,
        });
      },
    );

    this.socket.on("vision_error", (data: { error: string }) => {
      console.error("Vision processing error:", data.error);
      this.setState({
        error: data.error,
        isProcessingImage: false,
        conversationState: "idle",
      });
    });
  }

  private async initializeLiveKit() {
    if (this.liveKitConnecting || this.room) {
      return;
    }
    this.liveKitConnecting = true;
    try {
      const res = await fetch(`${this.serverUrl}/api/livekit/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roomName: this.state.roomName,
          participantName: `user_${this.userId}`,
        }),
      });
      const { token } = await res.json();
      this.room = new Room();
      const livekitUrl =
        import.meta.env.VITE_LIVEKIT_URL || "ws://localhost:7880";
      await this.room.connect(livekitUrl, token);
      this.emit("room-connected", this.room);
    } catch (e) {
      logError("[SVC] Failed to connect to video room", e, {
        section: "avatar_chat",
      });
      this.setState({ error: "Failed to connect to video room" });
    } finally {
      this.liveKitConnecting = false;
    }
  }

  public async initializeAudioCapture() {
    console.log("[AvatarChatService] initializeAudioCapture called, audioContext exists:", !!this.audioContext, "workletNode exists:", !!this.workletNode);
    if (this.audioContext && this.workletNode) {
      console.log("[AvatarChatService] Audio already initialized, returning early");
      return;
    }
    try {
      if (!this.mediaStream) {
        console.log("[AvatarChatService] Requesting getUserMedia for microphone access");
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000,
          },
        });
        console.log("[AvatarChatService] MediaStream acquired successfully");
      }

      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        console.log("[AvatarChatService] AudioContext created");
      }

      // Make sure gain node exists as soon as we have an AudioContext.
      this.ensureAvatarGainNode();

      // Play any pending audio that was queued before AudioContext was ready
      if (this.pendingAudioQueue.length > 0) {
        const queuedAudio = [...this.pendingAudioQueue];
        this.pendingAudioQueue = [];

        // Play all queued audio chunks
        for (const audioChunk of queuedAudio) {
          this.playAudioChunk(audioChunk);
        }
      }

      if (!this.workletNode) {
        console.log("[AvatarChatService] Loading AudioWorklet module");
        await this.audioContext.audioWorklet.addModule("/audio/pcmWorklet.js");
        console.log("[AvatarChatService] AudioWorklet module loaded successfully");

        const source = this.audioContext.createMediaStreamSource(
          this.mediaStream,
        );
        console.log("[AvatarChatService] Creating AudioWorkletNode");
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "pcm-worklet-processor",
        );
        console.log("[AvatarChatService] AudioWorkletNode created successfully");
        this.workletNode.port.onmessage = (event) => {
          if (event.data.type === "audioData" && this.socket) {
            const audioData = event.data.data.buffer;
            this.socket.emit("audio_chunk", audioData);
          }
        };
        source.connect(this.workletNode);

        // Connect the worklet to a muted GainNode to keep the audio graph running.
        const muteNode = this.audioContext.createGain();
        muteNode.gain.value = 0;
        this.workletNode.connect(muteNode);
        muteNode.connect(this.audioContext.destination);
      }
    } catch (e) {
      logError("[SVC] Failed to access microphone", e, {
        section: "avatar_chat",
      });
      this.setState({ error: "Failed to access microphone" });
    }
  }

  public async startRecording() {
    console.log("[AvatarChatService] startRecording called, workletNode exists:", !!this.workletNode);
    if (!this.workletNode) {
      console.log("[AvatarChatService] No workletNode, initializing audio capture");
      await this.initializeAudioCapture();
    }
    if (!this.workletNode) {
      console.error("[AvatarChatService] Failed to initialize workletNode, cannot start recording");
      return; // Guard if init failed
    }
    console.log("[AvatarChatService] Sending start command to workletNode");
    this.workletNode.port.postMessage({ command: "start" });
    this.setState({
      isRecording: true,
      transcription: "",
      audioUrl: null,
      visemes: null,
      conversationState: "listening",
    });
  }

  public stopRecording = () => {
    if (!this.workletNode || !this.socket) return;
    this.workletNode.port.postMessage({ command: "stop" });
    // Notify server explicitly that the user's turn has ended so the
    // transcription service can close the segment immediately.
    // this.socket.emit("turn_end");
    this.setState({
      isRecording: false,
      // conversationState: "thinking",
    });
    // Reset accumulators for the next LLM response
    // this.audioDurationAccumulator = 0;
    // this.visemeAccumulator = [];
  };

  public sendTextMessage = (text: string) => {
    if (!this.socket) return;
    this.socket.emit("text_input", {
      text,
      userId: this.userId,
      avatarId: this.avatarId,
    });
  };

  public async sendImage(imageData: string): Promise<void> {
    if (!this.socket || !this.state.isConnected) {
      console.warn(
        "[AvatarChatService] Cannot send image - not connected to server",
      );
      return;
    }

    if (!this.state.sessionId) {
      console.warn("[AvatarChatService] Cannot send image - no active session");
      return;
    }

    this.setState({
      isProcessingImage: true,
      conversationState: "thinking",
    });

    // Emit event to add image to chat history
    this.emit("image-sent", {
      imageUrl: imageData,
      timestamp: Date.now(),
    });

    this.socket.emit("process_image", {
      image: imageData.replace(/^data:image\/\w+;base64,/, ""),
      sessionId: this.state.sessionId,
      timestamp: Date.now(),
    });
  }

  public async sendExerciseData(data: {
    keypoints: any[];
    exercise: string;
    repCount: number;
    formScore?: number;
    formCorrections?: string[];
    timestamp: number;
  }): Promise<void> {
    if (!this.socket || !this.state.isConnected) {
      console.warn(
        "[AvatarChatService] Cannot send exercise data - not connected to server",
      );
      return;
    }

    if (!this.state.sessionId) {
      console.warn(
        "[AvatarChatService] Cannot send exercise data - no active session",
      );
      return;
    }

    // Send exercise update (no image, just pose data)
    this.socket.emit("exercise_update", {
      sessionId: this.state.sessionId,
      ...data,
    });
  }

  public initializeSession = async (options: {
    avatarId: string;
    userId: string;
  }) => {
    if (this.sessionActive) {
      return;
    }
    this.sessionActive = true;

    this.avatarId = options.avatarId;
    this.userId = options.userId;

    if (!this.socket) {
      await this.initializeSocket();
    } else if (!this.socket.connected) {
      this.socket.connect();
    }

    // Check if socket was created successfully
    if (!this.socket) {
      logError(
        "[SVC] Failed to create socket connection",
        new Error("Socket initialization failed"),
        {
          section: "avatar_chat",
        },
      );
      this.sessionActive = false;
      return;
    }

    // Wait for socket to be connected before emitting init_session
    const sendInitSession = () => {
      const roomName = `room_${this.userId}_${this.avatarId}`;
      this.socket?.emit("init_session", {
        roomName,
        avatarId: this.avatarId,
        userId: this.userId,
        visionEnabled: this.state.visionEnabled,
      });
    };

    if (this.socket.connected) {
      sendInitSession();
    } else {
      // Wait for connection and then send init_session
      this.socket.once("connect", sendInitSession);
    }
  };

  public endSession = () => {
    if (!this.sessionActive) {
      return;
    }
    this.sessionActive = false;

    // Stop any currently playing audio before ending the session
    this.stopAllAudioPlayback();

    // Stop microphone capture and close audio context to release device
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ command: "stop" });
        this.workletNode.disconnect();
      } catch (e) {
        // no-op
      }
      this.workletNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        t.stop();
      });
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch { }
      this.audioContext = null;
      this.avatarGainNode = null;
    }

    this.socket?.emit("end_session");
    this.room?.disconnect();
    this.room = null;

    this.setState({
      isRecording: false,
      roomName: null,
      sessionId: null,
      llmResponse: "",
      transcription: "",
      isLLMResponding: false,
      audioPlaying: false,
      error: null,
      audioUrl: null,
      visemes: null,
      conversationState: "idle",
      wasInterrupted: false,
      lastInterruptedResponse: "",
      interruptionCount: 0,
    });
  };

  public isConnected(): boolean {
    return this.state.isConnected && this.socket?.connected === true;
  }

  public destroy() {
    this.socket?.disconnect();
    this.socket = null;

    this.room?.disconnect();
    this.room = null;

    this.audioContext?.close();
    this.audioContext = null;
    this.avatarGainNode = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    this.off("state-change");
  }

  // -------- Music playback helpers ---------
  public async playExternalTrack(url: string) {
    if (!url) return;
    console.log("[DEBUG] AvatarChatService.playExternalTrack", {
      instance: this,
      url,
      hasAudioContext: !!this.audioContext,
      hasAvatarGainNode: !!this.avatarGainNode,
    });
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 44100 });
        this.ensureAvatarGainNode();
      }
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await this.audioContext!.decodeAudioData(arrayBuf);

      // Stop any existing avatar speech / audio
      this.stopAllAudioPlayback();

      const src = this.audioContext!.createBufferSource();
      src.buffer = audioBuf;
      // Route through avatarGainNode so recordings capture the music
      this.ensureAvatarGainNode();
      src.connect(this.avatarGainNode ?? this.audioContext!.destination);

      // EXTRA DEBUG: verify connection path
      console.log("[DEBUG] External track source connected", {
        destType: this.audioContext!.destination.constructor.name,
        avatarGainNodeConnected: !!this.avatarGainNode,
      });

      // Prepare simple visemes spread across duration
      this.setState({
        audioPlaying: true,
        isPlayingMusic: true,
        conversationState: "speaking",
      });

      src.start(0);
      this.activeAudioSources.push(src);

      src.onended = () => {
        // Clear visemes after playback
        this.setState({
          audioPlaying: false,
          isPlayingMusic: false,
          visemes: null,
          conversationState: "idle",
        });
        this.stopAllAudioPlayback();
      };
    } catch (e) {
      console.error("[AvatarChat] playExternalTrack error", e);
    }
  }

  public stopExternalPlayback() {
    this.stopAllAudioPlayback();
  }
}

export const avatarChatService = new AvatarChatService();
