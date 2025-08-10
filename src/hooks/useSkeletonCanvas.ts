import { useRef, useCallback } from 'react';

let globalSkeletonCanvasRef: HTMLCanvasElement | null = null;

export function useSkeletonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const registerCanvas = useCallback(() => {
    if (canvasRef.current) {
      globalSkeletonCanvasRef = canvasRef.current;
    }
  }, []);
  
  const unregisterCanvas = useCallback(() => {
    if (globalSkeletonCanvasRef === canvasRef.current) {
      globalSkeletonCanvasRef = null;
    }
  }, []);
  
  return {
    canvasRef,
    registerCanvas,
    unregisterCanvas
  };
}

export function getGlobalSkeletonCanvas(): HTMLCanvasElement | null {
  return globalSkeletonCanvasRef;
}