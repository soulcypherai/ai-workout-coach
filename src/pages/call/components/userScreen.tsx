import { forwardRef, useEffect, useState, useRef, useCallback } from "react";
import { LocalVideoTrack } from 'livekit-client';

import userProfileImage from "@/assets/png/egghead.png";
import { useSelector, useDispatch } from "@/store";
import { useParams } from "react-router-dom";
import { addChatMessage } from "@/store/slices/session";
import ChatInterface from "./ChatInterface";
import { useSharedAvatarChat, useAvatarChatState } from "@/contexts/AvatarChatContext";
import { RotateCw, Sparkles, Activity, ChevronUp, Dumbbell } from "lucide-react";
import { areImagesSimilar } from "@/utils/imageComparison";
import { useVisionCapture } from "@/contexts/VisionCaptureContext";
import { usePoseDetector, getEssentialKeypoints } from "@/hooks/usePoseDetector";
import { ExerciseRepCounter } from "@/lib/exerciseRepCounter";
import type { ExerciseType } from "@/lib/exercises";
import { useSkeletonCanvas } from "@/hooks/useSkeletonCanvas";
import { MultiExerciseDetector } from "@/lib/multiExerciseDetector";
import { PlanAwareRepCounter, ExerciseGuidance, WorkoutPlan } from "@/lib/planAwareRepCounter";
import { EXERCISE } from '@/lib/exercises';
import { RestTimer } from "@/components/RestTimer";
import { WorkoutFlowManager, WorkoutTransition } from "@/lib/workoutFlowManager";
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface UserScreenProps {}

const UserScreen = forwardRef<HTMLVideoElement, UserScreenProps>((props, ref) => {
  const { slug } = useParams();
  const dispatch = useDispatch();
  
  // Exercise tracking state (for coach personas)
  const [currentExercise, setCurrentExercise] = useState<ExerciseType | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStarted, setExerciseStarted] = useState(false);
  const [formScore, setFormScore] = useState(1);
  const [formCorrections, setFormCorrections] = useState<string[]>([]);
  const repCounterRef = useRef<ExerciseRepCounter | null>(null);
  const multiDetectorRef = useRef<MultiExerciseDetector | null>(null);
  const planAwareCounterRef = useRef<PlanAwareRepCounter | null>(null);
  const flowManagerRef = useRef<WorkoutFlowManager | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  type PosePoint = NormalizedLandmark & { visibility?: number };
  const [poseKeypoints, setPoseKeypoints] = useState<PosePoint[] | null>(null);
  const { canvasRef, registerCanvas, unregisterCanvas } = useSkeletonCanvas();
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isExerciseUICollapsed, setIsExerciseUICollapsed] = useState(false);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [detectedExercise, setDetectedExercise] = useState<ExerciseType | null>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  
  // Test mode for debugging
  const [testMode, setTestMode] = useState(false);
  const [useAutoDetection, setUseAutoDetection] = useState(false);
  const [isResting, setIsResting] = useState(false);
  const [restDuration, setRestDuration] = useState(0);
  const [nextExercise, setNextExercise] = useState<string | null>(null);
  const [exerciseGuidance, setExerciseGuidance] = useState<ExerciseGuidance | null>(null);
  const [currentSetNumber, setCurrentSetNumber] = useState(1);
  const [totalSets, setTotalSets] = useState(1);
  const [workoutTransition, setWorkoutTransition] = useState<WorkoutTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Get persona info to check if coach
  const personas = useSelector((state) => state.app.personas);
  const currentPersona = personas.find((p) => p.slug === slug);
  const isCoachAvatar = currentPersona?.category === 'fitness';
  
  
  const isCameraOn = useSelector((state) => state.session.isCameraOn);
  const isChatOpen = useSelector((state) => state.session.isChatOpen);
  
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const lastCapturedImageRef = useRef<string | null>(null);
  
  const { service } = useSharedAvatarChat();
  const { visionEnabled, isConnected, sessionId } = useAvatarChatState();
  const { registerCaptureHandler } = useVisionCapture();
  
  
  const videoRef = ref as React.RefObject<HTMLVideoElement>; // cast once for type safety
  const lastLogTimeRef = useRef<number>(0);
  
  // Listen for workout plan from backend
  useEffect(() => {
    if (!service?.socket || !isCoachAvatar) return;
    
    interface RawWorkoutPlan {
      exercises: Array<{ exerciseType: string; sets: number; targetReps: number; restDuration: number; order: number }>;
      totalDuration?: number;
      difficulty?: string;
    }
    const handleWorkoutPlan = (plan: RawWorkoutPlan) => {
      const finalPlan: WorkoutPlan = {
        exercises: plan.exercises.map(ex => ({
          ...ex,
          exerciseType: ex.exerciseType as ExerciseType
        })) || [],
        totalDuration: plan.totalDuration ?? 0,
        difficulty: plan.difficulty ?? 'medium',
      };
      setWorkoutPlan(finalPlan);
      // Enable auto-detection when we have a plan
      setUseAutoDetection(true);
      // Initialize plan-aware counter and flow manager
      planAwareCounterRef.current = new PlanAwareRepCounter(finalPlan);
      flowManagerRef.current = new WorkoutFlowManager(finalPlan);
      
      // Set up transition callback
      flowManagerRef.current.setOnTransitionCallback((transition) => {
        setWorkoutTransition(transition);
        
        if (transition.type === 'exercise_switch') {
          setIsTransitioning(true);
          // Auto-switch after countdown
          setTimeout(() => {
            if (transition.to) {
              // Reset states for new exercise
              setRepCount(0);
              setFormScore(1);
              setFormCorrections([]);
              // Set new exercise
              setCurrentExercise(transition.to as ExerciseType);
              setExerciseStarted(true);
              setIsTransitioning(false);
              setWorkoutTransition(null);
            }
          }, (transition.countdown || 5) * 1000);
        } else if (transition.type === 'workout_complete') {
          // Handle workout completion
          setExerciseStarted(false);
          setCurrentExercise(null);
          setIsTransitioning(false);
          
          // IMPORTANT: Clear the workout plan to hide the UI
          setWorkoutPlan(null);
          setUseAutoDetection(false);
          
          // Add workout completion message to chat
          const completionMessage = {
            id: `workout-complete-${Date.now()}`,
            text: `🎉 Workout Complete!\n\n${transition.summary ? 
              `**Summary:**\n- Total Exercises: ${transition.summary.totalExercises}\n- Completed: ${transition.summary.completedExercises}\n- Total Reps: ${transition.summary.totalReps}\n- Average Form: ${Math.round(transition.summary.averageFormScore * 100)}%\n\n${transition.summary.achievements.join('\n')}` : 
              'Great job completing your workout!'}`,
            sender: 'separator' as const,
            timestamp: Date.now()
          };
          dispatch(addChatMessage(completionMessage));
          
          // Send workout completion to backend
          if (service.socket) {
            service.socket.emit('workout_complete', {
              sessionId: sessionId,
              summary: transition.summary
            });
          }
        }
      });
    };
    
    service.socket.on('workout_plan_generated', handleWorkoutPlan);
    
    return () => {
      service.socket?.off('workout_plan_generated', handleWorkoutPlan);
    };
  }, [service?.socket, isCoachAvatar, dispatch, sessionId]);
  
  // Initialize multi-exercise detector
  useEffect(() => {
    if (isCoachAvatar && useAutoDetection) {
      multiDetectorRef.current = new MultiExerciseDetector();
    }
    
    return () => {
      if (multiDetectorRef.current) {
        multiDetectorRef.current.reset();
        multiDetectorRef.current = null;
      }
    };
  }, [isCoachAvatar, useAutoDetection]);
  
  // Initialize pose detector only for coach avatars
  const { detectPoses, isInitialized: isPoseDetectorReady } = usePoseDetector({
    onPoseDetected: (result) => {
      if (isCoachAvatar && result.landmarks.length > 0) {
        // Auto-detection mode - ONLY when no exercise is active
        if (useAutoDetection && !exerciseStarted && workoutPlan) {
          // NEW APPROACH: Try to detect first rep using actual rep counter
          const expectedExercise = planAwareCounterRef.current?.getCurrentExpectedExercise();
          
          if (expectedExercise) {
            // Create a temporary rep counter for the expected exercise to test if user is doing it
            if (!repCounterRef.current) {
              repCounterRef.current = new ExerciseRepCounter(expectedExercise.exerciseType as ExerciseType);
            }
            
            // Process frame through rep counter
            const feedback = repCounterRef.current.processFrame(result.landmarks[0]);
            
            // If we detect the first rep completion, auto-start the exercise
            if (feedback.isRepComplete && feedback.repCount === 1) {
              
              setCurrentExercise(expectedExercise.exerciseType as ExerciseType);
              setExerciseStarted(true);
              setRepCount(1); // Already have 1 rep
              setFormScore(feedback.formScore);
              setFormCorrections(feedback.corrections);
              
              // Notify backend about exercise start and interrupt avatar
              if (service && sessionId) {
                // First, interrupt any ongoing avatar speech
                service.socket?.emit('interrupt_avatar', {
                  reason: 'exercise_started',
                  exercise: expectedExercise.exerciseType
                });
                
                // Then notify exercise start
                service.socket?.emit('exercise_start', {
                  exercise: expectedExercise.exerciseType,
                  sessionId: sessionId,
                  timestamp: Date.now(),
                  isAutoDetected: true
                });
              }
            }
          }
        }
        
        // Regular rep counting
        if (currentExercise && !isResting && exerciseStarted) {
          let feedback;
          
          // Use plan-aware counter if available
          if (planAwareCounterRef.current && workoutPlan) {
            feedback = planAwareCounterRef.current.processFrame(result.landmarks[0]);
            
            // Debug log every 30 frames (about once per second at 30fps)
            if (Math.random() < 0.033) {
              // Periodic debug logging spot
            }
            
            // Handle guidance from plan-aware counter
            if (feedback.guidance) {
              setExerciseGuidance(feedback.guidance);
              
              // Handle different guidance actions
              if (feedback.guidance.action === 'rest') {
                setIsResting(true);
                setRestDuration(feedback.guidance.restDuration || 30);
                setNextExercise(feedback.guidance.nextExercise || null);
              } else if (feedback.guidance.action === 'switch') {
                // Handle exercise switching through flow manager
                if (flowManagerRef.current && currentExercise) {
                  flowManagerRef.current.handleExerciseCompletion(currentExercise);
                }
                
                // Send next exercise announcement to backend
                if (service && sessionId && feedback.guidance.nextExercise) {
                  service.socket?.emit('announce_next_exercise', {
                    currentExercise: currentExercise,
                    nextExercise: feedback.guidance.nextExercise,
                    sessionId: sessionId
                  });
                }
              } else if (feedback.guidance.action === 'complete') {
                // Workout complete
                if (flowManagerRef.current && currentExercise) {
                  flowManagerRef.current.handleExerciseCompletion(currentExercise).then(transition => {
                    // Send workout completion to backend
                    if (transition.type === 'workout_complete' && service.socket) {
                      // Clear the workout plan to hide the UI
                      setWorkoutPlan(null);
                      setUseAutoDetection(false);
                      setExerciseStarted(false);
                      setCurrentExercise(null);
                      
                      service.socket.emit('workout_complete', {
                        sessionId: sessionId,
                        summary: transition.summary
                      });
                    }
                  });
                }
              }
            }
            
            // Update set tracking
            const progress = planAwareCounterRef.current.getCurrentProgress();
            setCurrentSetNumber(progress.currentSet);
            setTotalSets(progress.totalSets);
          } else if (repCounterRef.current) {
            // Fallback to regular counter
            feedback = repCounterRef.current.processFrame(result.landmarks[0]);
          }
          
          // Update UI with feedback
          if (feedback) {
            // Always update rep count, not just on completion
            if (feedback.repCount !== repCount) {
              setRepCount(feedback.repCount);
              if (feedback.isRepComplete) {
                // Rep completed - could add feedback here
              }
            }
            setFormScore(feedback.formScore);
            setFormCorrections(feedback.corrections);
          }
        }
      }
    }
  });
  
  // Initialize rep counter when exercise starts
  useEffect(() => {
    if (currentExercise && exerciseStarted) {
      
      // When using plan-aware counter (workout plan mode)
      if (planAwareCounterRef.current && workoutPlan) {
        // Set the current exercise in plan-aware counter
        planAwareCounterRef.current.setCurrentExercise(currentExercise);
        // Note: We don't set repCounterRef.current here because plan-aware counter manages its own internal counter
      } else {
        // For manual exercise selection (no workout plan)
        repCounterRef.current = new ExerciseRepCounter(currentExercise);
      }
      
      // Notify flow manager
      if (flowManagerRef.current) {
        flowManagerRef.current.startExercise(currentExercise);
      }
      
      // Reset states
      setIsResting(false);
      setRepCount(0);
      setIsTransitioning(false);
      
      // No countdown - start exercise immediately
    } else {
      repCounterRef.current = null;
    }
  }, [currentExercise, exerciseStarted, workoutPlan]);
  
  // Use existing MediaStream for gesture music (no need for new LocalVideoTrack)
  useEffect(() => {
    const setupGestureTrack = async () => {
      if (!isCameraOn) {
        setVideoTrack(prev => {
          if (prev) prev.stop();
          return null;
        });
        return;
      }

      // Try to reuse the main camera stream. If it's not yet available, wait
      if (videoRef && typeof videoRef === 'object') {
        for (let i = 0; i < 5; i++) { // wait up to ~500 ms
          if (videoRef.current?.srcObject) {
            console.log('[UserScreen] Reusing existing MediaStream for gesture music');
            const gestureVideoTrack = {
              id: 'gesture-video-track',
              mediaStream: videoRef.current.srcObject as MediaStream,
              attach: (element: HTMLVideoElement) => {
                element.srcObject = videoRef.current?.srcObject || null;
              },
              detach: () => {},
              stop: () => {},
            } as LocalVideoTrack;
            
            // Only update if different to avoid infinite loop
            setVideoTrack(prev => {
              if (prev?.id === 'gesture-video-track') {
                return prev; // Already set, don't update
              }
              if (prev) prev.stop();
              return gestureVideoTrack;
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      // Fallback: open a *low-resolution, low-FPS* camera stream
      try {
        console.warn('[UserScreen] getUserMedia fallback for gesture music – low-res');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { max: 15 },
            facingMode: 'user',
          },
          audio: false,  // Don't capture audio to prevent echo
        });
        const track = stream.getVideoTracks()[0];
        const gestureVideoTrack = {
          id: track.id,
          mediaStream: stream,
          attach: (element: HTMLVideoElement) => {
            element.srcObject = stream;
          },
          detach: () => {},
          stop: () => {
            track.stop();
          },
        } as LocalVideoTrack;
        
        // Only update if different to avoid infinite loop
        setVideoTrack(prev => {
          if (prev?.id === track.id) {
            return prev; // Already set with same track
          }
          if (prev) prev.stop();
          return gestureVideoTrack;
        });
      } catch (err) {
        console.error('[UserScreen] Failed to acquire fallback camera', err);
        setVideoTrack(prev => {
          if (prev) prev.stop();
          return null;
        });
      }
    };

    setupGestureTrack();
    
    return () => {
      // Clean up will happen when component unmounts or isCameraOn changes
      setVideoTrack(prev => {
        if (prev) prev.stop();
        return null;
      });
    };
  }, [isCameraOn, videoRef]);
  
  
  // Global keyboard listener for test mode toggle
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Toggle test mode with Ctrl+T
      if (e.code === 'KeyT' && e.ctrlKey) {
        e.preventDefault();
        setTestMode(prev => {
          const newMode = !prev;
          return newMode;
        });
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyPress);
    return () => window.removeEventListener('keydown', handleGlobalKeyPress);
  }, []);

  // Test mode keyboard shortcuts
  useEffect(() => {
    if (!testMode || !exerciseStarted || !planAwareCounterRef.current) return;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      // Simulate rep completion with spacebar
      if (e.code === 'Space' && !isResting && !isTransitioning) {
        e.preventDefault();
        
        // Get current progress (narrow ref with local var)
        const planCounter = planAwareCounterRef.current;
        if (!planCounter) return;
        const progress = planCounter.getCurrentProgress();
        const currentReps = progress.currentReps;
        const targetReps = progress.targetReps;
        
        // Simulate a rep
        if (currentReps < targetReps) {
          // Update rep count first
          const newCount = repCount + 1;
          setRepCount(newCount);
          
          // Update the plan-aware counter's internal count
          planCounter.setCurrentRepCount(newCount);
          
          // Check if we've reached target
          if (newCount >= targetReps) {
            // Trigger completion logic
            if (!currentExercise) return;
            const guidance = planCounter.onRepCompleted(
              currentExercise, 
              newCount
            );
            
            if (guidance) {
              setExerciseGuidance(guidance);
              
              // Handle guidance actions
              if (guidance.action === 'rest') {
                setIsResting(true);
                setRestDuration(guidance.restDuration || 30);
                setNextExercise(guidance.nextExercise || null);
              } else if (guidance.action === 'switch') {
                // Exercise switch - trigger flow manager
                if (flowManagerRef.current && currentExercise) {
                  flowManagerRef.current.handleExerciseCompletion(currentExercise).then((transition) => {
                    // Clear workout plan if workout is complete (in case switch leads to completion)
                    if (transition?.type === 'workout_complete') {
                      setWorkoutPlan(null);
                      setUseAutoDetection(false);
                      setExerciseStarted(false);
                      setCurrentExercise(null);
                    }
                  });
                }
              } else if (guidance.action === 'complete') {
                // Workout complete - trigger flow manager
                if (flowManagerRef.current && currentExercise) {
                  flowManagerRef.current.handleExerciseCompletion(currentExercise).then((transition) => {
                    // Clear workout plan if workout is complete
                    if (transition?.type === 'workout_complete') {
                      setWorkoutPlan(null);
                      setUseAutoDetection(false);
                      setExerciseStarted(false);
                      setCurrentExercise(null);
                    }
                  });
                }
              }
            }
          }
        }
      }
      
      // Skip rest period with 'R' key
      if (e.code === 'KeyR' && isResting) {
        setIsResting(false);
        setRestDuration(0);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [testMode, exerciseStarted, currentExercise, isResting, isTransitioning, repCount, planAwareCounterRef, flowManagerRef]);

  // Draw skeleton on canvas
  const drawSkeleton = useCallback(() => {
    if (!canvasRef.current || !poseKeypoints || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match video
    const video = videoRef.current;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // MediaPipe pose connections
    const connections: Array<[number, number]> = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], // torso
      [23, 24], // hips
      [23, 25], [25, 27], // left leg
      [24, 26], [26, 28], // right leg
    ];
    
    // Draw connections with thicker lines
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    connections.forEach(([a, b]) => {
      const pointA = poseKeypoints![a];
      const pointB = poseKeypoints![b];
      if (pointA && pointB && (pointA.visibility ?? 1) > 0.3) {
        ctx.beginPath();
        ctx.moveTo(pointA.x * canvas.width, pointA.y * canvas.height);
        ctx.lineTo(pointB.x * canvas.width, pointB.y * canvas.height);
        ctx.stroke();
      }
    });
    
    // Draw keypoints with larger circles
    poseKeypoints!.forEach((point) => {
      if (point && (point.visibility ?? 1) > 0.3) {
        // Draw white outline
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw colored center
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }, [poseKeypoints]);
  
  // Update skeleton drawing with animation loop
  useEffect(() => {
    if (!isCoachAvatar || !canvasRef.current) return;
    
    let animationFrameId: number;
    
    const animate = () => {
      if (poseKeypoints && canvasRef.current) {
        drawSkeleton();
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    
    // Start animation loop when coach avatar is active
    if (isCoachAvatar) {
      animate();
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isCoachAvatar, drawSkeleton, poseKeypoints]);
  
  // Register/unregister skeleton canvas for recording
  useEffect(() => {
    if (isCoachAvatar) {
      registerCanvas();
    } else {
      unregisterCanvas();
    }
    
    return () => {
      unregisterCanvas();
    };
  }, [isCoachAvatar, registerCanvas, unregisterCanvas]);
  
  // Dual-mode capture system: Style images for stylists, Pose data for coaches
  useEffect(() => {
    // Skip entire effect if vision is disabled at admin level
    if (!currentPersona?.vision_enabled) return;
    
    if (!isCameraOn || !videoRef.current || !visionEnabled) return;
    
    // Check if we have an active session
    if (!isConnected || !sessionId) {
      console.log("[UserScreen] Waiting for session to be ready before enabling capture");
      return;
    }
    
    let frameInterval: NodeJS.Timeout;
    let lastCaptureTime = 0;
    let lastPoseUpdateTime = 0;
    
    // Different intervals for different modes
    const VISION_INTERVAL = currentPersona?.vision_capture_interval 
      ? currentPersona.vision_capture_interval * 1000 
      : 5000; // 5 seconds for style images
    const POSE_INTERVAL = 100; // 10 FPS for pose tracking

    const captureAndProcess = async () => {
      if (!videoRef.current) return;
      
      const now = Date.now();
      
      if (isCoachAvatar && isPoseDetectorReady && isVideoReady) {
        // COACH MODE: Send pose data only
        if (now - lastPoseUpdateTime < POSE_INTERVAL) return;
        lastPoseUpdateTime = now;
        
        try {
          const video = videoRef.current;
          
          // Check if video is ready
          if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
            console.warn('[Coach Mode] Video not ready for pose detection');
            return;
          }
          
          const poseResult = await detectPoses(video);
          if (poseResult && poseResult.landmarks.length > 0) {
            const pose = poseResult.landmarks[0] as PosePoint[];
            const essentialKeypoints = getEssentialKeypoints(pose);
            
            // Store pose keypoints for visualization
            setPoseKeypoints(pose);
            
            // Process through rep counter
            if (currentExercise && exerciseStarted) {
              // Only log once per second to reduce noise
              const now = Date.now();
              if (!lastLogTimeRef.current || now - lastLogTimeRef.current > 1000) {
                lastLogTimeRef.current = now;
                console.log('[Exercise] Rep counter state:', {
                  currentExercise,
                  exerciseStarted,
                  countdown,
                  hasRepCounter: !!repCounterRef.current,
                  isResting,
                  useAutoDetection
                });
              }
              
              // Skip processing during countdown
              if (countdown !== null) {
                return;
              }
              
              if (!repCounterRef.current) {
                const normalized = typeof currentExercise === 'string' ? {
                  raw: currentExercise,
                  lower: currentExercise.toLowerCase(),
                  title: currentExercise.charAt(0).toUpperCase() + currentExercise.slice(1),
                } : null;
                console.warn('[Exercise] No rep counter available for:', currentExercise, {
                  isPlanAware: !!planAwareCounterRef.current,
                  useAutoDetection,
                  multiHasDetector: !!multiDetectorRef.current,
                  normalized,
                });
                // Try to initialize it now if using auto-detection
                if (multiDetectorRef.current && useAutoDetection) {
                  multiDetectorRef.current.setCurrentExercise(currentExercise);
                  const detector = multiDetectorRef.current.getCurrentDetector();
                  if (detector) {
                    repCounterRef.current = detector;
                    console.log('[Exercise] Initialized rep counter on-demand for:', currentExercise);
                  }
                }
                if (!repCounterRef.current) {
                  return;
                }
              }
              
              const feedback = repCounterRef.current.processFrame(pose);
              
              // Track exercise state
              
              // Update local state
              if (feedback.isRepComplete) {
                console.log('[Exercise] Rep completed!', feedback.repCount);
                setRepCount(feedback.repCount);
                // Audio feedback removed - avatar gives verbal feedback instead
              }
              
              if (feedback.isSetComplete) {
                // Set complete - avatar will provide verbal feedback
                
                // Auto-complete the exercise when set is done
                setTimeout(() => {
                  const completionMessage = {
                    id: `set-complete-${Date.now()}`,
                    text: `🎯 Set Complete!\n\n**${currentExercise}**: ${feedback.repCount} reps\n**Average Form Score**: ${Math.round(feedback.formScore * 100)}%\n\n💪 Excellent work! You completed the full set!`,
                    sender: 'separator' as const,
                    timestamp: Date.now()
                  };
                  
                  dispatch(addChatMessage(completionMessage));
                  
                  // Send to backend
                  service.socket?.emit('exercise_milestone', {
                    exercise: currentExercise,
                    reps: feedback.repCount,
                    formScore: feedback.formScore,
                    sessionId: sessionId,
                    setComplete: true
                  });
                  
                  // Reset exercise
                  setExerciseStarted(false);
                  setCurrentExercise(null);
                  setRepCount(0);
                  setCountdown(null);
                }, 2000); // Give 2 seconds to celebrate
              }
              
              if (feedback.isNewPersonalRecord) {
                // Personal record - avatar will celebrate verbally
              }
              
              // Form warning - avatar will provide correction feedback
              if (feedback.formScore < 0.5 && formScore >= 0.5) {
                // Avatar handles form corrections verbally
              }
              
              setFormScore(feedback.formScore);
              setFormCorrections(feedback.corrections);
              
              // Send only when rep completes or periodically
              if (feedback.isRepComplete || now - lastCaptureTime > 2000) {
                lastCaptureTime = now;
                
                // Send only pose data (no image)
                await service.sendExerciseData?.({
                  keypoints: essentialKeypoints,
                  exercise: currentExercise,
                  repCount: feedback.repCount,
                  formScore: feedback.formScore,
                  formCorrections: feedback.corrections,
                  timestamp: now
                });
              }
            }
          }
        } catch (error) {
          console.error("[Coach Mode] Failed to process pose:", error);
        }
      } else if (isStylistAvatar) {
        // STYLIST MODE: Send full images for style analysis
        if (now - lastCaptureTime < VISION_INTERVAL) return;
        lastCaptureTime = now;
        
        try {
          const video = videoRef.current;
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.warn("[Stylist Mode] Video not ready yet, skipping frame");
            return;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            
            // Check similarity to avoid duplicate images
            const isSimilar = await areImagesSimilar(lastCapturedImageRef.current, imageData, 0.15);
            
            if (!isSimilar) {
              console.log("[Stylist Mode] Image changed, sending frame...");
              await service.sendImage(imageData);
              lastCapturedImageRef.current = imageData;
            }
          }
        } catch (error) {
          console.error("[Stylist Mode] Failed to capture/send frame:", error);
        }
      }
    };

    // Run at appropriate frequency based on mode
    const checkInterval = isCoachAvatar ? 50 : 500; // Check more frequently for coaches
    frameInterval = setInterval(captureAndProcess, checkInterval);

    return () => {
      if (frameInterval) clearInterval(frameInterval);
    };
  }, [isCameraOn, videoRef, currentPersona, service, visionEnabled, isConnected, sessionId, 
      isCoachAvatar, isStylistAvatar, isPoseDetectorReady, currentExercise, repCount, detectPoses, isVideoReady]);

  // Manual capture function for self-references
  const manualCaptureFrame = useCallback(async () => {
    // Check admin-level vision first
    if (!currentPersona?.vision_enabled) {
      console.log("[UserScreen] Cannot manual capture - vision disabled at admin level");
      return;
    }
    
    if (!isCameraOn || !videoRef.current || !visionEnabled || !service || !isConnected || !sessionId) {
      console.log("[UserScreen] Cannot manual capture - conditions not met");
      return;
    }
    
    try {
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn("[UserScreen] Video not ready for manual capture");
        return;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        console.log("[UserScreen] Manual capture triggered - sending frame immediately");
        await service.sendImage(imageData);
        
        // Update last captured image to prevent duplicate sends in continuous capture
        lastCapturedImageRef.current = imageData;
      }
    } catch (error) {
      console.error("[UserScreen] Failed manual capture:", error);
    }
  }, [isCameraOn, videoRef, visionEnabled, service, isConnected, sessionId, currentPersona]);

  // Register the manual capture handler
  useEffect(() => {
    registerCaptureHandler(manualCaptureFrame);
  }, [registerCaptureHandler, manualCaptureFrame]);

  // Listen for voice-triggered capture events
  useEffect(() => {
    const handleVoiceCapture = () => {
      console.log("[UserScreen] Voice activity detected - triggering capture");
      manualCaptureFrame();
    };

    window.addEventListener('capture-for-voice', handleVoiceCapture);
    return () => window.removeEventListener('capture-for-voice', handleVoiceCapture);
  }, [manualCaptureFrame]);


  // If chat is open, show chat interface
  if (isChatOpen) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ChatInterface />
      </div>
    );
  }

  return (
    <>
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Test Mode Indicator */}
        {testMode && (
          <div className="absolute top-4 left-4 z-30 bg-yellow-500/90 text-black px-3 py-1 rounded-md text-sm font-bold">
            TEST MODE - Press Space to simulate reps, R to skip rest
          </div>
        )}
        
        {/* Exercise UI for Coach Avatars - positioned in top-right corner */}
        {/* Only show when there's a workout plan or exercise in progress */}
        {isCoachAvatar && isCameraOn && (workoutPlan || exerciseStarted) && (
          <div className="absolute top-4 right-4 z-20">
            {/* Collapsed state - just show icon */}
            {isExerciseUICollapsed ? (
              <button
                onClick={() => setIsExerciseUICollapsed(false)}
                className="bg-black/80 backdrop-blur-md rounded-lg p-2 hover:bg-black/90 transition-colors"
              >
                <Dumbbell className="w-5 h-5 text-white" />
              </button>
            ) : (
              <div className="bg-black/80 backdrop-blur-md rounded-lg p-2 min-w-[180px] max-w-[200px]">
                {/* Header with collapse button */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white">Exercise</h3>
                  <button
                    onClick={() => setIsExerciseUICollapsed(true)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
                
                {!exerciseStarted ? (
                  <>
                    {workoutPlan ? (
                      // Show workout plan
                      <div className="space-y-2">
                        <div className="text-xs text-white/70 mb-1">Today's Workout</div>
                        
                        {/* Auto-detection indicator */}
                        {useAutoDetection && (
                          <div className="bg-blue-500/10 p-2 rounded mb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-blue-300">Auto-detecting exercise...</span>
                            </div>
                            {!currentExercise && (
                              <div className="mt-2">
                                {(() => {
                                  const expectedExercise = planAwareCounterRef.current?.getCurrentExpectedExercise() || workoutPlan.exercises[0];
                                  // Only show detection progress if we're detecting the expected exercise
                                  const isDetectingCorrectExercise = detectedExercise && 
                                    detectedExercise.toLowerCase() === expectedExercise?.exerciseType?.toLowerCase();
                                  const showProgress = isDetectingCorrectExercise && detectionConfidence > 0;
                                  
                                  return (
                                    <>
                                      <p className="text-xs text-white font-bold">
                                        Start doing: {expectedExercise?.exerciseType}
                                      </p>
                                      {expectedExercise && (
                                        <p className="text-xs text-white/60 mt-0.5">
                                          {expectedExercise.sets} × {expectedExercise.targetReps} reps
                                        </p>
                                      )}
                                      <p className="text-xs text-white/50 mt-1">
                                        {!showProgress ? 'Move into position and start the exercise' : 
                                         detectionConfidence < 0.7 ? `Detecting... (${Math.round(detectionConfidence * 100)}% - need 70%)` : 
                                         'Almost there, keep going...'}
                                      </p>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Show workout plan differently based on auto-detection mode */}
                        {useAutoDetection ? (
                          // In auto-detect mode: show only upcoming exercises (not the current one being prompted)
                          workoutPlan.exercises.length > 1 && (
                            <div className="space-y-1">
                              <div className="text-xs text-white/50 mb-1">Up next:</div>
                              <div className="space-y-1 max-h-24 overflow-y-auto">
                                {workoutPlan.exercises.slice(1).map((exercise: any, idx: number) => (
                                  <div 
                                    key={idx + 1}
                                    className="bg-white/5 p-1.5 rounded text-xs flex justify-between items-center"
                                  >
                                    <span className="text-white/70 capitalize">{exercise.exerciseType}</span>
                                    <span className="text-white/40">
                                      {exercise.sets} × {exercise.targetReps}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        ) : (
                          // Manual mode: show full workout plan with Start button
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {workoutPlan.exercises.map((exercise: any, idx: number) => (
                              <div 
                                key={idx}
                                className="bg-white/10 p-2 rounded text-xs space-y-1"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-medium capitalize">{exercise.exerciseType}</span>
                                  <span className="text-white/60">
                                    {exercise.sets} × {exercise.targetReps}
                                  </span>
                                </div>
                                {idx === 0 && !currentExercise && (
                                   <button
                                    onClick={() => {
                                      setCurrentExercise(exercise.exerciseType as ExerciseType);
                                      setExerciseStarted(true);
                                      setRepCount(0);
                                      setFormScore(1);
                                      setFormCorrections([]);
                                      
                                      // Notify backend about exercise start
                                      if (service && sessionId) {
                                        service.socket?.emit('exercise_start', {
                                          exercise: exercise.exerciseType,
                                          sessionId: sessionId,
                                          timestamp: Date.now()
                                        });
                                      }
                                    }}
                                    className="w-full bg-green-500/20 hover:bg-green-500/30 text-green-400 py-1 rounded text-xs transition-colors"
                                  >
                                    Start
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* Current exercise state */}
                    {isResting ? (
                      // Rest timer display with clear header
                      <div className="flex flex-col items-center space-y-2">
                        <div className="text-lg font-bold text-white bg-blue-600 px-4 py-2 rounded-lg">
                          REST PERIOD
                        </div>
                        <RestTimer
                          duration={restDuration}
                          onComplete={() => {
                            setIsResting(false);
                            if (planAwareCounterRef.current) {
                              planAwareCounterRef.current.startNextSet();
                            }
                            setRepCount(0);
                          }}
                          exerciseName={nextExercise || currentExercise || undefined}
                        />
                      </div>
                    ) : isTransitioning && workoutTransition ? (
                      // Exercise transition display
                      <div className="text-center space-y-2 p-2">
                        <div className="text-sm font-medium text-white">
                          {workoutTransition.guidance}
                        </div>
                        {workoutTransition.to && (
                          <div className="text-xs text-white/60">
                            Next: {workoutTransition.to}
                          </div>
                        )}
                        {workoutTransition.countdown && (
                          <div className="text-2xl font-bold text-blue-400">
                            {workoutTransition.countdown}s
                          </div>
                        )}
                      </div>
                    ) : workoutTransition?.type === 'workout_complete' ? (
                      // Workout completion display
                      <div className="text-center space-y-2 p-2">
                        <div className="text-lg font-bold text-green-400">
                          Workout Complete! 🎉
                        </div>
                        {workoutTransition.summary && (
                          <div className="text-xs text-white/70 space-y-1">
                            <div>{workoutTransition.summary.completedExercises}/{workoutTransition.summary.totalExercises} exercises</div>
                            <div>{workoutTransition.summary.totalReps} total reps</div>
                            <div>{Math.floor(workoutTransition.summary.totalTime / 60)}m {workoutTransition.summary.totalTime % 60}s</div>
                            {workoutTransition.summary.achievements.map((achievement, idx) => (
                              <div key={idx} className="text-green-300">{achievement}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      // Exercise tracking display - compact version
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-white">{currentExercise}</span>
                            {workoutPlan && totalSets > 1 && (
                              <span className="text-xs text-white/50 ml-1">
                                Set {currentSetNumber}/{totalSets}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                             <div className="text-3xl font-bold text-green-400">
                               {currentExercise === EXERCISE.PLANKS 
                                ? `${repCount}s` 
                                : repCount}
                            </div>
                            <div className="text-xs text-white/60">
                               {currentExercise === EXERCISE.PLANKS ? 'seconds' : 'reps'}
                            </div>
                          </div>
                        </div>
                        
                        {/* Compact form score */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/10 rounded-full h-1">
                            <div 
                              className={`h-1 rounded-full transition-all duration-300 ${
                                formScore > 0.8 ? 'bg-green-400' : 
                                formScore > 0.6 ? 'bg-yellow-400' : 'bg-red-400'
                              }`}
                              style={{ width: `${formScore * 100}%` }}
                            />
                          </div>
                          <span className={`text-xs ${
                            formScore > 0.8 ? 'text-green-400' : 
                            formScore > 0.6 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {Math.round(formScore * 100)}%
                          </span>
                        </div>
                        
                        {/* Exercise guidance and corrections */}
                        {exerciseGuidance && (
                          <div className="text-xs text-blue-300 truncate">
                            {exerciseGuidance.message}
                          </div>
                        )}
                        {formCorrections.length > 0 && !exerciseGuidance && (
                          <div className="text-xs text-yellow-300 truncate">
                            {formCorrections[0]}
                          </div>
                        )}
                        
                        <button
                          onClick={async () => {
                            // Send exercise completion stats to chat
                            if (repCount > 0 && service) {
                              const completionMessage = {
                                id: `exercise-complete-${Date.now()}`,
                                text: `🎯 Exercise Complete!\n\n**${currentExercise}**: ${repCount} reps\n**Average Form Score**: ${Math.round(formScore * 100)}%\n\nGreat job! ${repCount >= 10 ? '💪 Excellent work!' : repCount >= 5 ? 'Good effort!' : 'Keep practicing!'}`,
                                sender: 'separator' as const,
                                timestamp: Date.now()
                              };
                              
                              // Add to chat via dispatch
                              dispatch(addChatMessage(completionMessage));
                              
                              // Also send to backend for tracking
                              service.socket?.emit('exercise_milestone', {
                                exercise: currentExercise,
                                reps: repCount,
                                formScore: formScore,
                                sessionId: sessionId,
                                setComplete: true  // Mark as complete
                              });
                            }
                            
                            // If using a workout plan, properly mark exercise as completed
                            if (workoutPlan && flowManagerRef.current && currentExercise) {
                              
                              // Mark the exercise as completed in the plan
                              if (planAwareCounterRef.current) {
                                // Manually mark as completed
                                planAwareCounterRef.current.markExerciseCompleted(currentExercise);
                                
                                // Handle completion through flow manager
                                const transition = await flowManagerRef.current.handleExerciseCompletion(currentExercise);
                                
                                if (transition.type === 'workout_complete') {
                                  // The flow manager's transition callback will handle the UI update
                                } else if (transition.type === 'exercise_switch') {
                                  // The flow manager's transition callback will handle the UI update
                                }
                              }
                            }
                            
                            // Clean up exercise state
                            setExerciseStarted(false);
                            setCurrentExercise(null);
                            setRepCount(0);
                            setCountdown(null);
                            setFormScore(1);
                            setFormCorrections([]);
                            setDetectedExercise(null);
                            setDetectionConfidence(0);
                            
                            // Reset the rep counter
                            if (repCounterRef.current) {
                              repCounterRef.current.reset();
                              repCounterRef.current = null;
                            }
                            
                            // Reset multi-detector if using auto-detection
                            if (multiDetectorRef.current && useAutoDetection) {
                              multiDetectorRef.current.reset();
                            }
                          }}
                          className="w-full bg-red-500/80 hover:bg-red-600 text-white py-1 px-2 rounded text-xs transition-colors"
                        >
                          End
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        
        
        {/* Status Indicator */}
        {isCoachAvatar && isCameraOn && (
          <div className="absolute bottom-4 left-4 z-20">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              !isPoseDetectorReady 
                ? 'bg-yellow-500/20 text-yellow-300' 
                : poseKeypoints
                ? 'bg-green-500/20 text-green-300'
                : 'bg-orange-500/20 text-orange-300'
            }`}>
              <Activity className="w-4 h-4" />
              {!isPoseDetectorReady 
                ? 'Initializing...' 
                : poseKeypoints
                ? 'Tracking Movement'
                : 'No pose detected - stand in frame'}
            </div>
          </div>
        )}
        {isCameraOn ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover transform scale-x-[-1]"
              onLoadedMetadata={() => {
                console.log('[UserScreen] Video metadata loaded');
                setIsVideoReady(true);
              }}
            />
            {/* Skeleton overlay canvas for coach mode */}
            {isCoachAvatar && (
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full object-cover transform scale-x-[-1] pointer-events-none"
              />
            )}
            {/* Flip camera button - positioned to not overlap with exercise UI */}
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('flip-camera'));
              }}
              className={`absolute p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors ${
                isCoachAvatar && exerciseStarted ? 'top-4 left-4' : 'top-4 right-4'
              }`}
              title="Flip camera"
            >
              <RotateCw className="h-5 w-5 text-white" />
            </button>
          </>
        ) : (
          <img
            src={userProfileImage}
            alt="User"
            className="w-52 max-w-4/5 aspect-square rounded-full object-cover"
          />
        )}
        
      </div>
    </>
  );
});

UserScreen.displayName = "UserScreen";

export default UserScreen;
