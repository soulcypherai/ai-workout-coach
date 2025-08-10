import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export interface PoseDetectorOptions {
  enableSegmentation?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  onPoseDetected?: (result: PoseLandmarkerResult) => void;
}

export interface PoseDetectorHandle {
  detectPoses: (video: HTMLVideoElement) => Promise<PoseLandmarkerResult | null>;
  isInitialized: boolean;
  error: Error | null;
}

export function usePoseDetector(options: PoseDetectorOptions = {}): PoseDetectorHandle {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initializePoseDetector = async () => {
      try {
        console.log('[PoseDetector] Initializing MediaPipe Pose...');
        
        // Initialize MediaPipe Vision
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        
        // Create Pose Landmarker
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: options.minDetectionConfidence || 0.5,
          minTrackingConfidence: options.minTrackingConfidence || 0.5,
          outputSegmentationMasks: options.enableSegmentation || false
        });
        
        poseLandmarkerRef.current = poseLandmarker;
        setIsInitialized(true);
        console.log('[PoseDetector] MediaPipe Pose initialized successfully');
        
      } catch (err) {
        console.error('[PoseDetector] Initialization error:', err);
        setError(err as Error);
      }
    };

    initializePoseDetector();

    return () => {
      // Cleanup
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
        poseLandmarkerRef.current = null;
      }
    };
  }, []);

  const detectPoses = async (video: HTMLVideoElement): Promise<PoseLandmarkerResult | null> => {
    if (!poseLandmarkerRef.current || !isInitialized) {
      console.warn('[PoseDetector] Not initialized yet');
      return null;
    }

    // Check video dimensions
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('[PoseDetector] Invalid video dimensions');
      return null;
    }

    try {
      const result = poseLandmarkerRef.current.detectForVideo(video, performance.now());
      
      // Call callback if provided
      if (options.onPoseDetected && result.landmarks.length > 0) {
        options.onPoseDetected(result);
      }
      
      return result;
    } catch (err) {
      console.error('[PoseDetector] Detection error:', err);
      return null;
    }
  };

  return {
    detectPoses,
    isInitialized,
    error
  };
}

// Helper function to get essential 17 keypoints from 33 MediaPipe landmarks
export function getEssentialKeypoints(landmarks: any[]): any[] {
  if (!landmarks || landmarks.length === 0) return [];
  
  // MediaPipe Pose landmark indices for essential joints
  const essentialIndices = [
    0,  // nose
    11, // left_shoulder
    12, // right_shoulder
    13, // left_elbow
    14, // right_elbow
    15, // left_wrist
    16, // right_wrist
    23, // left_hip
    24, // right_hip
    25, // left_knee
    26, // right_knee
    27, // left_ankle
    28, // right_ankle
    31, // left_foot_index
    32, // right_foot_index
    9,  // mouth_left
    10  // mouth_right
  ];
  
  return essentialIndices.map(index => landmarks[index]).filter(Boolean);
}