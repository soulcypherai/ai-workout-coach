import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { avatarChatService, AvatarChatService, AvatarChatState } from '@/services/AvatarChatService';
import { sessionRecordingService, SessionRecordingService, RecordingState } from '@/services/SessionRecordingService';
import { Room } from 'livekit-client';

interface AvatarChatContextValue {
  service: AvatarChatService;
  recordingService: SessionRecordingService;
}

const AvatarChatContext = createContext<AvatarChatContextValue | null>(null);

export const useSharedAvatarChat = () => {
  const context = useContext(AvatarChatContext);
  if (!context) {
    throw new Error('useSharedAvatarChat must be used within an AvatarChatProvider');
  }
  return context;
};

export const useAvatarChatState = () => {
  const { service, recordingService } = useSharedAvatarChat();
  const [state, setState] = useState(service.getState());
  const [recordingState, setRecordingState] = useState(recordingService.getState());
  const [room, setRoom] = useState(service.room);

  useEffect(() => {
    const onStateChange = (newState: AvatarChatState) => setState(newState);
    const onRoomConnected = (newRoom: Room) => setRoom(newRoom);
    const onRecordingStateChange = (newRecordingState: RecordingState) => setRecordingState(newRecordingState);

    service.on('state-change', onStateChange);
    service.on('room-connected', onRoomConnected);
    recordingService.on('state-change', onRecordingStateChange);
    
    setState(service.getState());
    setRoom(service.room);
    setRecordingState(recordingService.getState());

    return () => {
      service.off('state-change', onStateChange);
      service.off('room-connected', onRoomConnected);
      recordingService.off('state-change', onRecordingStateChange);
    };
  }, [service, recordingService]);

  return { ...state, room, recording: recordingState, recordingService };
};

interface AvatarChatProviderProps {
  children: ReactNode;
}

export const AvatarChatProvider = ({ children }: AvatarChatProviderProps) => {
  const contextValue: AvatarChatContextValue = {
    service: avatarChatService,
    recordingService: sessionRecordingService,
  };

  return (
    <AvatarChatContext.Provider value={contextValue}>
      {children}
    </AvatarChatContext.Provider>
  );
}; 