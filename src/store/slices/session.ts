import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { ChatMessage, SessionSlice } from "@/types/slices";

// Initial state
const initialState: SessionSlice = {
  isCameraOn: false,
  isMicOn: false,
  isAvatarMuted: false,
  isChatOpen: false,
  isSessionEnded: true,
  chatMessages: [],
  selectedAudioDeviceId: undefined,
  selectedVideoDeviceId: undefined,
};

// Create slice
export const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    toggleCameraForCall: (
      state,
      action: PayloadAction<SessionSlice["isCameraOn"]>,
    ) => {
      state.isCameraOn = action.payload;
    },
    toggleMicForCall: (
      state,
      action: PayloadAction<SessionSlice["isMicOn"]>,
    ) => {
      state.isMicOn = action.payload;
    },
    toggleAvatarMute: (
      state,
      action: PayloadAction<SessionSlice["isAvatarMuted"]>,
    ) => {
      state.isAvatarMuted = action.payload;
    },
    toggleSessionEnded: (
      state,
      action: PayloadAction<SessionSlice["isSessionEnded"]>,
    ) => {
      state.isSessionEnded = action.payload;
    },
    toggleChatOpen: (
      state,
      action: PayloadAction<SessionSlice["isChatOpen"]>,
    ) => {
      state.isChatOpen = action.payload;
    },
    addChatMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.chatMessages.push(action.payload);
    },
    clearChatMessages: (state) => {
      state.chatMessages = [];
    },
    loadChatHistory: (state, action: PayloadAction<ChatMessage[]>) => {
      state.chatMessages = action.payload;
    },
    removeChatMessage: (
      state,
      action: PayloadAction<string>, // message ID
    ) => {
      state.chatMessages = state.chatMessages.filter(
        message => message.id !== action.payload
      );
    },
    setSelectedAudioDevice: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.selectedAudioDeviceId = action.payload;
    },
    setSelectedVideoDevice: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.selectedVideoDeviceId = action.payload;
    },
  },
});

export const {
  toggleCameraForCall,
  toggleMicForCall,
  toggleAvatarMute,
  toggleChatOpen,
  toggleSessionEnded,
  addChatMessage,
  clearChatMessages,
  loadChatHistory,
  removeChatMessage,
  setSelectedAudioDevice,
  setSelectedVideoDevice
} = sessionSlice.actions;
export default sessionSlice.reducer;
