import { NormalizedLandmark } from '@mediapipe/pose';
import { ExerciseRepCounter } from './exerciseRepCounter';
import type { ExerciseType } from './exercises';
import { EXERCISES, EXERCISE } from './exercises';
import { performanceMonitor } from './performanceMonitor';

// Exercise detection confidence thresholds
const CONFIDENCE_THRESHOLD = 0.8;
const TEMPORAL_WINDOW = 30; // frames for smoothing

// Define exercise signatures
interface ExerciseSignature {
  name: ExerciseType;
  keyJoints: string[];
  checkPosture: (landmarks: NormalizedLandmark[]) => number; // Returns confidence 0-1
}

interface DetectionResult {
  exercise: ExerciseType | null;
  confidence: number;
  suggestedExercises: ExerciseType[];
}

export class MultiExerciseDetector {
  private detectors: Map<ExerciseType, ExerciseRepCounter> = new Map();
  private signatures: ExerciseSignature[] = [];
  private detectionHistory: Array<{ exercise: ExerciseType | null; confidence: number }> = [];
  private currentExercise: ExerciseType | null = null;
  private transitionFrames = 0;
  
  // Performance optimization: Frame rate throttling
  private lastProcessedTime: number = 0;
  private readonly TARGET_FPS = 15; // Process at 15 FPS for battery optimization
  private readonly FRAME_INTERVAL = 1000 / this.TARGET_FPS; // ~67ms between frames
  
  constructor() {
    // Initialize detectors for each exercise
    EXERCISES.forEach((exercise) => {
      this.detectors.set(exercise, new ExerciseRepCounter(exercise));
    });
    
    // Define exercise signatures
    this.signatures = [
      {
        name: EXERCISE.SQUATS,
        keyJoints: ['left_hip', 'left_knee', 'left_ankle', 'right_hip', 'right_knee', 'right_ankle'],
        checkPosture: (landmarks) => this.checkSquatPosture(landmarks)
      },
      {
        name: EXERCISE.PUSH_UPS,
        keyJoints: ['left_shoulder', 'left_elbow', 'left_wrist', 'right_shoulder', 'right_elbow', 'right_wrist'],
        checkPosture: (landmarks) => this.checkPushupPosture(landmarks)
      },
      {
        name: EXERCISE.LUNGES,
        keyJoints: ['left_hip', 'left_knee', 'left_ankle', 'right_hip', 'right_knee', 'right_ankle'],
        checkPosture: (landmarks) => this.checkLungePosture(landmarks)
      },
      {
        name: EXERCISE.JUMPING_JACKS,
        keyJoints: ['left_shoulder', 'left_hip', 'right_shoulder', 'right_hip'],
        checkPosture: (landmarks) => this.checkJumpingJackPosture(landmarks)
      },
      {
        name: EXERCISE.PLANKS,
        keyJoints: ['left_shoulder', 'left_hip', 'left_ankle', 'right_shoulder', 'right_hip', 'right_ankle'],
        checkPosture: (landmarks) => this.checkPlankPosture(landmarks)
      },
      {
        name: EXERCISE.CHIN_UPS,
        keyJoints: ['left_wrist', 'left_elbow', 'left_shoulder', 'right_wrist', 'right_elbow', 'right_shoulder'],
        checkPosture: (landmarks) => this.checkChinupPosture(landmarks)
      }
    ];
  }
  
  detectExercise(landmarks: NormalizedLandmark[]): DetectionResult {
    // Record frame for performance monitoring
    performanceMonitor.recordFrame();
    
    // Performance optimization: Throttle processing to target FPS
    const currentTime = performance.now();
    const timeSinceLastProcess = currentTime - this.lastProcessedTime;
    
    // Skip processing if not enough time has passed
    if (timeSinceLastProcess < this.FRAME_INTERVAL) {
      // Record dropped frame
      performanceMonitor.recordDroppedFrame();
      
      // Return cached result for skipped frames
      return {
        exercise: this.currentExercise,
        confidence: this.detectionHistory.length > 0 
          ? this.detectionHistory[this.detectionHistory.length - 1].confidence 
          : 0,
        suggestedExercises: []
      };
    }
    
    // Mark start of processing for performance measurement
    const processingStart = performance.now();
    this.lastProcessedTime = currentTime;
    
    // Calculate confidence for each exercise
    const scores = new Map<ExerciseType, number>();
    
    for (const signature of this.signatures) {
      const confidence = signature.checkPosture(landmarks);
      scores.set(signature.name, confidence);
    }
    
    // Find highest confidence exercise
    let topExercise: ExerciseType | null = null;
    let topConfidence = 0;
    const suggestedExercises: ExerciseType[] = [];
    
    scores.forEach((confidence, exercise) => {
      if (confidence > topConfidence) {
        topConfidence = confidence;
        topExercise = exercise;
      }
      if (confidence > 0.5) {
        suggestedExercises.push(exercise);
      }
    });
    
    // Apply temporal smoothing
    this.detectionHistory.push({ exercise: topExercise, confidence: topConfidence });
    if (this.detectionHistory.length > TEMPORAL_WINDOW) {
      this.detectionHistory.shift();
    }
    
    // Check if we have consistent detection
    const smoothedResult = this.applyTemporalSmoothing();
    
    // Handle exercise transitions
    if (smoothedResult.exercise !== this.currentExercise) {
      if (this.isNeutralPosition(landmarks)) {
        this.transitionFrames++;
        if (this.transitionFrames > 10) {
          this.currentExercise = smoothedResult.exercise;
          this.transitionFrames = 0;
        }
      }
    } else {
      this.transitionFrames = 0;
    }
    
    // Record processing time for performance monitoring
    const processingTime = performance.now() - processingStart;
    performanceMonitor.recordProcessingTime(processingTime);
    performanceMonitor.setActiveDetectors(this.detectors.size);
    
    // For auto-detection, return the smoothed result directly instead of currentExercise
    // This allows detection to work without requiring neutral position transitions
    return {
      exercise: smoothedResult.exercise || topExercise,  // Use smoothed or top exercise
      confidence: smoothedResult.confidence || topConfidence,  // Use actual confidence
      suggestedExercises: suggestedExercises.sort((a, b) => 
        (scores.get(b) || 0) - (scores.get(a) || 0)
      )
    };
  }
  
  // Safe landmark access with bounds checking
  private getLandmark(landmarks: NormalizedLandmark[], index: number): NormalizedLandmark | null {
    if (!landmarks || index < 0 || index >= landmarks.length) {
      return null;
    }
    return landmarks[index];
  }
  
  private applyTemporalSmoothing(): { exercise: ExerciseType | null; confidence: number } {
    if (this.detectionHistory.length < 5) {
      return { exercise: null, confidence: 0 };
    }
    
    // Count occurrences of each exercise in recent history
    const exerciseCounts = new Map<ExerciseType | null, number>();
    let totalConfidence = 0;
    
    this.detectionHistory.forEach(detection => {
      const count = exerciseCounts.get(detection.exercise) || 0;
      exerciseCounts.set(detection.exercise, count + 1);
      if (detection.exercise) {
        totalConfidence += detection.confidence;
      }
    });
    
    // Find most common exercise
    let mostCommon: ExerciseType | null = null;
    let maxCount = 0;
    
    exerciseCounts.forEach((count, exercise) => {
      if (count > maxCount && exercise !== null) {
        maxCount = count;
        mostCommon = exercise;
      }
    });
    
    // Calculate average confidence for the most common exercise
    const avgConfidence = totalConfidence / this.detectionHistory.length;
    
    // Only return if we have strong consensus
    if (maxCount >= this.detectionHistory.length * 0.7 && avgConfidence > CONFIDENCE_THRESHOLD) {
      return { exercise: mostCommon, confidence: avgConfidence };
    }
    
    return { exercise: null, confidence: 0 };
  }
  
  private isNeutralPosition(landmarks: NormalizedLandmark[]): boolean {
    // Validate landmarks array
    if (!landmarks || landmarks.length < 33) {
      return false;
    }
    
    // Check if person is in a neutral standing position with safe access
    const leftHip = this.getLandmark(landmarks, 23);
    const rightHip = this.getLandmark(landmarks, 24);
    const leftKnee = this.getLandmark(landmarks, 25);
    const rightKnee = this.getLandmark(landmarks, 26);
    const leftShoulder = this.getLandmark(landmarks, 11);
    const rightShoulder = this.getLandmark(landmarks, 12);
    
    // Validate all required landmarks exist
    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftShoulder || !rightShoulder) {
      return false;
    }
    
    // Check if standing upright
    const hipY = (leftHip.y + rightHip.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const kneeY = (leftKnee.y + rightKnee.y) / 2;
    
    const isUpright = shoulderY < hipY && hipY < kneeY;
    
    // Check if arms are at sides
    const leftElbow = this.getLandmark(landmarks, 13);
    const rightElbow = this.getLandmark(landmarks, 14);
    
    if (!leftElbow || !rightElbow) {
      return false;
    }
    
    const armsAtSides = Math.abs(leftElbow.x - leftShoulder.x) < 0.1 && 
                       Math.abs(rightElbow.x - rightShoulder.x) < 0.1;
    
    return isUpright && armsAtSides;
  }
  
  // Exercise-specific posture checks
  private checkSquatPosture(landmarks: NormalizedLandmark[]): number {
    // Validate landmarks array
    if (!landmarks || landmarks.length < 33) {
      return 0;
    }
    
    const leftHip = this.getLandmark(landmarks, 23);
    const leftKnee = this.getLandmark(landmarks, 25);
    const leftAnkle = this.getLandmark(landmarks, 27);
    const rightHip = this.getLandmark(landmarks, 24);
    const rightKnee = this.getLandmark(landmarks, 26);
    const rightAnkle = this.getLandmark(landmarks, 28);
    
    // Validate all required landmarks exist
    if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) {
      return 0;
    }
    
    // Check if hips are moving up and down
    const hipHeight = (leftHip.y + rightHip.y) / 2;
    
    // Check knee bend
    const leftKneeAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    
    // Check feet position
    const feetApart = Math.abs(leftAnkle.x - rightAnkle.x) > 0.2;
    
    // Score based on squat characteristics
    let score = 0;
    if (feetApart) score += 0.3;
    if (avgKneeAngle < 160) score += 0.4; // Knees bent
    if (hipHeight > 0.4 && hipHeight < 0.7) score += 0.3; // Hip at squat height
    
    return score;
  }
  
  private checkPushupPosture(landmarks: NormalizedLandmark[]): number {
    if (!landmarks || landmarks.length < 33) return 0;
    
    const leftShoulder = this.getLandmark(landmarks, 11);
    const leftElbow = this.getLandmark(landmarks, 13);
    const leftWrist = this.getLandmark(landmarks, 15);
    const leftHip = this.getLandmark(landmarks, 23);
    
    if (!leftShoulder || !leftElbow || !leftWrist || !leftHip) return 0;
    
    // Check if in horizontal position
    const shoulderHeight = leftShoulder.y;
    const hipHeight = leftHip.y;
    const isHorizontal = Math.abs(shoulderHeight - hipHeight) < 0.15;
    
    // Check arm position
    const armAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    
    // Check if hands are on ground level
    const wristHeight = leftWrist.y;
    const handsLow = wristHeight > 0.7;
    
    let score = 0;
    if (isHorizontal) score += 0.4;
    if (handsLow) score += 0.3;
    if (armAngle < 170) score += 0.3; // Arms bent
    
    return score;
  }
  
  private checkLungePosture(landmarks: NormalizedLandmark[]): number {
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    // Check for split stance
    const ankleSeparation = Math.abs(leftAnkle.x - rightAnkle.x);
    const isSplitStance = ankleSeparation > 0.3;
    
    // Check knee angles
    const leftKneeAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle);
    
    // One knee should be bent more than the other
    const angleDiff = Math.abs(leftKneeAngle - rightKneeAngle);
    const hasAsymmetry = angleDiff > 30;
    
    let score = 0;
    if (isSplitStance) score += 0.5;
    if (hasAsymmetry) score += 0.3;
    if (leftKneeAngle < 120 || rightKneeAngle < 120) score += 0.2;
    
    return score;
  }
  
  private checkJumpingJackPosture(landmarks: NormalizedLandmark[]): number {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    // Check arm position (should be raised or at sides)
    const leftArmRaised = leftWrist.y < leftShoulder.y;
    const rightArmRaised = rightWrist.y < rightShoulder.y;
    const armsRaised = leftArmRaised && rightArmRaised;
    
    // Check leg separation
    const legSeparation = Math.abs(leftAnkle.x - rightAnkle.x);
    const legsApart = legSeparation > 0.3;
    
    // Jumping jacks alternate between arms up/legs apart and arms down/legs together
    let score = 0;
    if (armsRaised && legsApart) score = 0.9; // Extended position
    else if (!armsRaised && legSeparation < 0.15) score = 0.9; // Together position
    else score = 0.3; // Transitioning
    
    return score;
  }
  
  private checkPlankPosture(landmarks: NormalizedLandmark[]): number {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    
    // Check if body is horizontal
    const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
    const hipHeight = (leftHip.y + rightHip.y) / 2;
    const ankleHeight = (leftAnkle.y + rightAnkle.y) / 2;
    
    const isHorizontal = Math.abs(shoulderHeight - hipHeight) < 0.1 && 
                        Math.abs(hipHeight - ankleHeight) < 0.15;
    
    // Check if low to ground
    const isLowToGround = shoulderHeight > 0.6;
    
    // Check if elbows are bent (forearm plank) or straight (high plank)
    const leftElbowBent = leftElbow.y > leftShoulder.y;
    const rightElbowBent = rightElbow.y > rightShoulder.y;
    
    let score = 0;
    if (isHorizontal) score += 0.5;
    if (isLowToGround) score += 0.3;
    if (leftElbowBent || rightElbowBent || shoulderHeight > 0.7) score += 0.2;
    
    return score;
  }
  
  private checkChinupPosture(landmarks: NormalizedLandmark[]): number {
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    // Check if arms are raised above head
    const wristsHigh = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
    
    // Check if hands are close together (gripping bar)
    const handDistance = Math.abs(leftWrist.x - rightWrist.x);
    const handsClose = handDistance < 0.4;
    
    // Check elbow bend
    const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgArmAngle = (leftArmAngle + rightArmAngle) / 2;
    
    let score = 0;
    if (wristsHigh) score += 0.4;
    if (handsClose) score += 0.3;
    if (avgArmAngle < 160) score += 0.3; // Arms bent (pulling up)
    
    return score;
  }
  
  private calculateAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }
  
  // Get the current exercise detector for rep counting
  getCurrentDetector(): ExerciseRepCounter | null {
    if (!this.currentExercise) {
      console.debug('[MultiExerciseDetector] getCurrentDetector: no currentExercise set');
      return null;
    }
    const detector = this.detectors.get(this.currentExercise) || null;
    if (!detector) {
      console.warn('[MultiExerciseDetector] No detector for exercise key:', this.currentExercise);
    }
    return detector;
  }
  
  // Set current exercise explicitly (for when exercise is manually selected)
  setCurrentExercise(exercise: ExerciseType) {
    this.currentExercise = exercise;
    // Reset the detector for this exercise to start fresh
    const detector = this.detectors.get(exercise);
    if (detector) {
      detector.reset();
      console.debug('[MultiExerciseDetector] setCurrentExercise -> detector reset for:', exercise);
    } else {
      console.warn('[MultiExerciseDetector] setCurrentExercise: unsupported exercise key:', exercise);
    }
  }
  
  // Reset detection state
  reset() {
    this.currentExercise = null;
    this.detectionHistory = [];
    this.transitionFrames = 0;
    this.detectors.forEach(detector => detector.reset());
  }
}