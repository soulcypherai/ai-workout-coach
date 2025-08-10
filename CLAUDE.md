# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 Problem-Solving Approach

**CRITICAL**: When debugging issues, provide only the single best fix you are absolutely confident about. Do NOT suggest multiple possible solutions or speculative fixes. 

- Diagnose thoroughly first
- Identify the root cause with certainty  
- Provide one clear, confident recommendation
- Avoid "try this or that" approaches

## Package Manager

**IMPORTANT**: This project uses **pnpm** as the package manager. Always use `pnpm` commands, never `npm` or `yarn`.

## Development Commands

```bash
# Start development server (frontend only)
pnpm run dev                 # Runs on port 3004

# Build for production
pnpm run build              # TypeScript compilation + Vite build

# Code quality
pnpm run lint               # ESLint checking
pnpm run preview            # Preview production build

# Deployment
pnpm run deploy             # Build + Firebase deploy
```

## Architecture Overview

### Frontend Stack
- **React 19** with TypeScript and Vite
- **Tailwind CSS 4** for styling with custom design system
- **React Router 7** for client-side routing
- **Redux Toolkit** with Redux Persist for state management
- **Privy** for Web3 wallet authentication

### Project Structure
```
src/
├── layouts/           # MainLayout with bottom navigation
├── pages/            # Route-based page components
│   ├── home/         # AI agent selection with tabs (VCs, Creators, Advisors)
│   ├── call/         # Video call interface with agent/user screens
│   ├── profile/      # User profile and points management
│   ├── wallet/       # Wallet integration
│   └── leaderboard/  # User ranking system
├── components/       # Reusable UI components and drawers
├── store/           # Redux state management
└── router/          # React Router configuration
```

### State Management Architecture
The app uses Redux Toolkit with three main slices:
- **app**: Global app state (wallet address)
- **session**: Call session state (camera controls)
- **modal**: UI modal state (buy points, session complete)

### Navigation System
- **MainLayout**: Wraps all pages with bottom navigation
- **BottomNavbar**: Fixed bottom navigation (hidden on /call page)
- **PageHeader**: Reusable header with back navigation

### UI Components
- Custom design system with Tailwind CSS
- Vaul for drawer components
- Lucide React for icons
- Custom fonts (Chakra Petch, RoundPixel)

## Concurrent Session Capacity Analysis

### AWS EC2 Server Recommendations
Based on resource requirements analysis for real-time AI avatar chat sessions:

**t3.medium (4GB RAM, 2 vCPU) - Development/Testing**
- Concurrent sessions: 10-25
- Cost: ~$30/month
- Use case: Development, small-scale testing

**c5.large (4GB RAM, 2 vCPU) - Small Production**  
- Concurrent sessions: 20-35
- Cost: ~$62/month
- Use case: MVP launch, small user base

**c5.xlarge (8GB RAM, 4 vCPU) - Medium Production**
- Concurrent sessions: 40-60  
- Cost: ~$124/month
- Use case: Growing user base, recommended starting point

**c5.2xlarge (16GB RAM, 8 vCPU) - Large Production**
- Concurrent sessions: 80-120
- Cost: ~$248/month  
- Use case: High-traffic production deployment

### Resource Requirements per Session
- **Memory**: 50-100MB (audio buffers, WebSocket connections)
- **CPU**: 5-10% (audio processing, streaming)
- **Bandwidth**: ~800KB/s (WebRTC + audio streaming)
- **API Costs**: $0.02-0.05/minute (primarily ElevenLabs TTS)

### Primary Bottlenecks
1. **ElevenLabs API rate limits** (most restrictive)
2. **Memory usage** from real-time audio processing  
3. **Network bandwidth** for WebRTC streaming
4. **Database connections** for session persistence

### Scaling Strategy
- Start with c5.large for initial deployment
- Monitor memory usage and API rate limits
- Scale horizontally with load balancer for >60 concurrent sessions
- Consider CDN for avatar assets and audio caching

## 🎉 Implementation Status: COMPLETE!

### ✅ Fully Implemented Features
- **Backend Infrastructure**: Express + Socket.IO + LiveKit integration
- **Real-time Audio Pipeline**: VAD → Whisper STT → GPT-4o-mini → ElevenLabs TTS
- **3D Avatar System**: Ready Player Me with lip-sync and animations
- **Frontend Integration**: React hooks, components, and controls
- **Self-hosted LiveKit**: Docker-based WebRTC server

### 🚀 Ready to Test
LiveKit server is running on:
- WebSocket: `ws://localhost:7880`
- HTTP API: `http://localhost:7881` 
- Redis: `localhost:6379`

### Quick Start Commands
```bash
# 1. Start LiveKit (already running)
yarn run livekit:start

# 2. Start backend server
yarn run dev:server

# 3. Start frontend (in new terminal)
yarn run dev

# 4. Test avatar chat
# Navigate to: http://localhost:3004/call?avatar=vc-analyst
```

### Environment Setup Required

#### 1. API Keys (Required)
Add your API keys to `server/.env`:
```env
OPENAI_API_KEY=sk-your-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key
```

#### 2. Ready Player Me Avatars (Optional)
The system includes fallback avatars, but for custom 3D models:

1. **Create avatars**: Visit [readyplayer.me](https://readyplayer.me/)
2. **Get .glb URLs**: Copy the model URLs after creation
3. **Update URLs**: Replace URLs in `src/components/AvatarScene.tsx`

**Note**: System works perfectly with fallback circular avatars if you skip this step!

See `READYPLAYERME_SETUP.md` for detailed instructions.

## AI Avatar Video Chat Implementation Plan

### Current State
The call page (`/call`) currently shows:
- Static placeholder agent image in `AgentScreen`
- Basic user video interface in `UserScreen`
- Control bar for call actions

### Planned Implementation

## Architecture Flow

### Streaming Pipeline: VAD → STT → LLM → TTS → Avatar

1. **Voice Activity Detection (VAD)**
   - Frontend captures microphone audio via `getUserMedia()`
   - Audio processed through `AudioWorkletNode` with custom PCM processor
   - Continuous streaming to backend via Socket.IO

2. **Speech-to-Text (STT) - Streaming**
   - OpenAI Whisper streaming API for real-time transcription
   - Partial transcripts shown during speech
   - Final transcript triggers LLM processing

3. **LLM Processing - Streaming**
   - OpenAI GPT-4o-mini with streaming completions
   - Tokens streamed as generated (not waiting for complete response)
   - Customizable system prompts per avatar persona

4. **Text-to-Speech (TTS) - Streaming**
   - ElevenLabs streaming TTS with phoneme data
   - Audio chunks generated and played as LLM tokens arrive
   - Phoneme timestamps for accurate lip-sync

5. **Avatar Rendering & Lip-Sync**
   - Ready Player Me avatars with real-time lip-sync
   - Phoneme-based mouth shape mapping
   - Streaming audio/video via LiveKit

## Customizable Avatar Personas

### Avatar Configuration Schema
```typescript
interface AvatarPersona {
  id: string;
  name: string;
  systemPrompt: string;
  voiceId: string; // ElevenLabs voice ID
  modelUri: string; // Ready Player Me avatar URL
  personality: {
    tone: string;
    expertise: string[];
    conversationStyle: string;
    responseStyle: string;
  };
  lipSyncConfig: {
    enabled: boolean;
    method: 'builtin' | 'phoneme' | 'audio-analysis';
    sensitivity: number;
  };
}
```

### Example Personas
- **Business Mentor**: Professional, analytical, startup-focused
- **Creative Director**: Artistic, innovative, design-thinking
- **Tech Expert**: Technical, problem-solving, engineering-focused
- **Wellness Coach**: Supportive, mindful, health-oriented

## Lip-Sync Implementation

### Option 1: Ready Player Me Built-in (Phase 1)
- Automatic lip-sync from audio playback
- No additional code required
- Basic accuracy but immediate functionality

### Option 2: Phoneme-Based Lip-Sync (Phase 2)
```typescript
// Enhanced TTS with phoneme data
async function publishTTS(sock, text: string, avatarId: string) {
  const persona = await getAvatarPersona(avatarId);
  const response = await elevenlabs.textToSpeech({
    text,
    voice_id: persona.voiceId,
    output_format: "mp3_44100_128",
    enable_phonemes: true,
    stream: true
  });
  
  // Stream audio and phoneme data
  for await (const chunk of response.stream) {
    sock.emit('audio_chunk', chunk.audio);
    sock.emit('phoneme_data', chunk.phonemes);
  }
}
```

### Option 3: Audio Analysis Lip-Sync (Phase 3)
- Real-time frequency analysis
- Custom viseme mapping
- Highest accuracy but most complex

## Implementation Phases

### Phase 1: Backend Infrastructure (90 min)
- [ ] Set up Express + Socket.IO server (`server/index.ts`)
- [ ] Create LiveKit token generation (`server/livekit/client.ts`)
- [ ] Implement media namespace (`server/sockets/media.ts`)
- [ ] Build Whisper streaming pipeline (`server/pipeline/whisperStream.ts`)
- [ ] Create LLM responder with streaming (`server/pipeline/llmResponder.ts`)
- [ ] Implement TTS synthesis (`server/pipeline/ttsSynth.ts`)

### Phase 2: Frontend Dependencies (30 min)
- [ ] Install required packages:
  ```bash
  yarn install livekit-client socket.io-client
  ```
- [ ] Create audio worklet processor (`public/audio/pcmWorklet.js`)

### Phase 3: Avatar Integration (60 min)
- [ ] Create `AvatarScene` component with Ready Player Me
- [ ] Implement `useAvatarChat` hook
- [ ] Replace static image in `AgentScreen` with interactive avatar
- [ ] Set up LiveKit room connection and video streaming

### Phase 4: Persona System (45 min)
- [ ] Create avatar persona configuration system
- [ ] Implement persona loading in LLM responder
- [ ] Add persona selection to home page
- [ ] Connect persona data to avatar rendering

### Phase 5: Streaming Enhancements (60 min)
- [ ] Implement LLM streaming responses
- [ ] Add TTS streaming with phoneme data
- [ ] Create real-time lip-sync system
- [ ] Optimize for low-latency experience

## Technical Components

### Backend Files Structure
```
server/
├── index.ts              # Main server entry point
├── livekit/
│   └── client.ts         # LiveKit token generation
├── sockets/
│   └── media.ts          # WebSocket media namespace
├── pipeline/
│   ├── whisperStream.ts  # STT processing
│   ├── llmResponder.ts   # LLM with streaming
│   └── ttsSynth.ts       # TTS with phonemes
├── db/
│   └── schema.sql        # Database for message history
└── personas/
    └── config.ts         # Avatar persona definitions
```

### Frontend Components
```
src/
├── hooks/
│   └── useAvatarChat.ts  # Main avatar chat logic
├── components/
│   └── AvatarScene.tsx   # Ready Player Me integration
└── pages/call/components/
    └── agentScreen.tsx   # Updated with avatar rendering
```

### Environment Variables
```env
# OpenAI
OPENAI_API_KEY=sk-...

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# LiveKit
LIVEKIT_HOST=ws://localhost:7880
LIVEKIT_API_KEY=...
LIVEKIT_SECRET=...

# Database (optional)
DATABASE_URL=postgresql://...
```

## API Integrations

### OpenAI Whisper (STT)
- Streaming audio transcription
- Real-time partial results
- Handles multiple languages

### OpenAI GPT-4o-mini (LLM)
- Streaming text completions
- Customizable system prompts
- Fast response times

### ElevenLabs (TTS)
- High-quality voice synthesis
- Multiple voice options per persona
- Phoneme data for lip-sync
- Streaming audio output

### Ready Player Me (Avatars)
- 3D avatar rendering
- Customizable appearance
- Built-in lip-sync capabilities
- WebGL-based rendering

### LiveKit (WebRTC)
- Real-time audio/video streaming
- Room-based communication
- Low-latency media delivery
- Participant management

## Testing Strategy

### Development Testing
1. **Audio Pipeline**: Test microphone capture and PCM streaming
2. **STT Accuracy**: Verify Whisper transcription quality
3. **LLM Responses**: Test streaming completions and persona consistency
4. **TTS Quality**: Validate voice synthesis and streaming
5. **Avatar Rendering**: Check Ready Player Me integration and lip-sync
6. **End-to-End**: Full conversation flow testing

### Performance Optimization
- Audio buffer management
- Streaming latency reduction
- Memory usage monitoring
- WebRTC optimization

## Security Considerations
- API key management
- Rate limiting for AI services
- User audio data handling
- WebRTC security best practices

## Future Enhancements
- [ ] RAG integration for knowledge-based responses
- [ ] Multi-language support
- [ ] Avatar customization tools
- [ ] Conversation history and analytics
- [ ] Mobile app support
- [ ] Group chat with multiple avatars

## Development Commands
```bash
# Start backend
yarn run dev:server

# Start frontend
yarn run dev

# Build for production
yarn run build

# Run tests
yarn run test

# Lint code
yarn run lint

# Type check
yarn run typecheck
```

## Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] LiveKit server running
- [ ] SSL certificates for WebRTC
- [ ] Performance monitoring setup
- [ ] Error logging configured

---

*This document should be updated as implementation progresses and requirements evolve.*


# IMPORTANT RULES FOR CLAUDE

## Server Management
- **NEVER** restart, stop, or start any services (PM2, servers, databases, etc.) without explicitly asking the user first
- **ALWAYS** ask for permission before making any service state changes

## Database Access
- When debugging issues, query the database directly to inspect data
- Database URL: postgresql://localhost:5432/pitchroom