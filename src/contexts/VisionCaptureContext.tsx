import React, { createContext, useContext, useRef, useCallback } from 'react';

interface VisionCaptureContextType {
  triggerCapture: () => void;
  registerCaptureHandler: (handler: () => void) => void;
}

const VisionCaptureContext = createContext<VisionCaptureContextType | null>(null);

export const VisionCaptureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const captureHandlerRef = useRef<(() => void) | null>(null);

  const registerCaptureHandler = useCallback((handler: () => void) => {
    captureHandlerRef.current = handler;
  }, []);

  const triggerCapture = useCallback(() => {
    if (captureHandlerRef.current) {
      console.log('[VisionCapture] Triggering manual capture');
      captureHandlerRef.current();
    } else {
      console.warn('[VisionCapture] No capture handler registered');
    }
  }, []);

  return (
    <VisionCaptureContext.Provider value={{ triggerCapture, registerCaptureHandler }}>
      {children}
    </VisionCaptureContext.Provider>
  );
};

export const useVisionCapture = () => {
  const context = useContext(VisionCaptureContext);
  if (!context) {
    throw new Error('useVisionCapture must be used within VisionCaptureProvider');
  }
  return context;
};