import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ExerciseType } from './exercises';
import { EXERCISE } from './exercises';

// ExerciseType now comes from shared constants in ./exercises
export type RepState = 'neutral' | 'down' | 'up' | 'extended' | 'contracted' | 'hanging' | 'pulling' | 'holding';

export interface ExerciseFeedback {
  repCount: number;
  state: RepState;
  formScore: number;
  corrections: string[];
  isRepComplete: boolean;
  isSetComplete: boolean;
  isNewPersonalRecord: boolean;
}

export interface JointAngles {
  leftKnee?: number;
  rightKnee?: number;
  leftElbow?: number;
  rightElbow?: number;
  leftHip?: number;
  rightHip?: number;
  leftShoulder?: number;
  rightShoulder?: number;
}

// MediaPipe Pose landmark indices
const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28
};

export class ExerciseRepCounter {
  private exerciseType: ExerciseType;
  private repState: RepState = 'neutral';
  private repCount: number = 0;
  private targetReps: number = 10;
  private personalRecord: number = 0;
  private frameCount: number = 0;
  private angleHistory: JointAngles[] = [];
  private readonly HISTORY_SIZE = 5; // Keep last 5 frames for smoothing
  
  // Frame confirmation for stability
  private pendingState: RepState | null = null;
  private pendingStateFrames: number = 0;
  private readonly CONFIRMATION_FRAMES = 2; // Require 2 consecutive frames
  
  // Position history for exponential smoothing
  private landmarkHistory: NormalizedLandmark[][] = [];
  private readonly POSITION_HISTORY_SIZE = 3;
  private readonly SMOOTHING_FACTOR = 0.7; // Weight for current frame vs history
  private readonly JUMPING_JACK_SMOOTHING_FACTOR = 0.9; // Less smoothing for faster detection
  
  // Velocity tracking for jumping jacks
  private wristVelocities: { left: number; right: number }[] = [];
  private readonly VELOCITY_HISTORY_SIZE = 3;
  private readonly VELOCITY_THRESHOLD = 0.02; // Minimum velocity to consider movement
  
  // Plank timing
  private plankStartTime: number | null = null;
  private plankHoldTime: number = 0;
  // Seconds of hold time that equate to one "rep" for planks. Previously hard-coded to 10.
  // Setting this to 1 means every second contributes a rep, which matches UX expectations.
  private readonly PLANK_SECONDS_PER_REP = 1;

  constructor(exerciseType: ExerciseType, targetReps: number = 10) {
    this.exerciseType = exerciseType;
    this.targetReps = targetReps;
  }

  processFrame(landmarks: NormalizedLandmark[]): ExerciseFeedback {
    // Remember previous rep count so we can detect increments (especially for planks)
    const prevRepCount = this.repCount;
    if (!landmarks || landmarks.length < 33) {
      return this.getDefaultFeedback();
    }

    // Apply exponential smoothing to landmarks
    const smoothedLandmarks = this.smoothLandmarks(landmarks);
    
    // Calculate joint angles from smoothed positions
    const angles = this.calculateJointAngles(smoothedLandmarks);
    
    // Smooth angles using history
    this.angleHistory.push(angles);
    if (this.angleHistory.length > this.HISTORY_SIZE) {
      this.angleHistory.shift();
    }
    const smoothedAngles = this.smoothAngles();

    // Determine current state based on exercise type
    const candidateState = this.determineState(smoothedAngles, smoothedLandmarks);
    
    // Apply frame confirmation for stability
    const confirmedState = this.confirmStateChange(candidateState);
    
    // Check for rep completion with confirmed state
    let isRepComplete = false;
    if (confirmedState !== this.repState) {
      isRepComplete = this.detectRepCompletion(this.repState, confirmedState);
      if (isRepComplete) {
        this.repCount++;
      }
      this.repState = confirmedState;
      
      // Handle plank timing
    if (this.exerciseType === EXERCISE.PLANKS) {
        if (confirmedState === 'holding' && !this.plankStartTime) {
          // Start the timer when we first enter a valid plank hold
          this.plankStartTime = Date.now();
        } else if (confirmedState !== 'holding' && this.plankStartTime) {
          // We exited the plank – finalise the hold duration
          this.plankHoldTime = Math.floor((Date.now() - this.plankStartTime) / 1000);
          this.plankStartTime = null;
          // Convert seconds held to rep count using the new constant
          this.repCount = Math.floor(this.plankHoldTime / this.PLANK_SECONDS_PER_REP);
        }
      }
    }
    
    if (this.exerciseType === EXERCISE.PLANKS && this.plankStartTime) {
      // Continuous update while holding
      this.plankHoldTime = Math.floor((Date.now() - this.plankStartTime) / 1000);
      this.repCount = Math.floor(this.plankHoldTime / this.PLANK_SECONDS_PER_REP);
    }
    
    this.frameCount++;

    // Detect if rep count increased this frame (important for planks where state may not change)
    const repIncremented = this.repCount > prevRepCount;

    // Calculate form score and corrections
      const formScore = this.calculateFormScore(smoothedAngles, smoothedLandmarks);
    const corrections = this.getFormCorrections(smoothedAngles, smoothedLandmarks);

      return {
      repCount: this.repCount,
      state: this.repState,
      formScore,
      corrections,
        isRepComplete: this.exerciseType === EXERCISE.PLANKS ? repIncremented : isRepComplete,
      isSetComplete: this.repCount >= this.targetReps,
      isNewPersonalRecord: this.repCount > this.personalRecord
    };
  }

  private calculateJointAngles(landmarks: NormalizedLandmark[]): JointAngles {
    const angles: JointAngles = {};

    // Calculate knee angles
    angles.leftKnee = this.calculateAngle(
      landmarks[POSE_LANDMARKS.LEFT_HIP],
      landmarks[POSE_LANDMARKS.LEFT_KNEE],
      landmarks[POSE_LANDMARKS.LEFT_ANKLE]
    );
    angles.rightKnee = this.calculateAngle(
      landmarks[POSE_LANDMARKS.RIGHT_HIP],
      landmarks[POSE_LANDMARKS.RIGHT_KNEE],
      landmarks[POSE_LANDMARKS.RIGHT_ANKLE]
    );

    // Calculate elbow angles
    angles.leftElbow = this.calculateAngle(
      landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      landmarks[POSE_LANDMARKS.LEFT_ELBOW],
      landmarks[POSE_LANDMARKS.LEFT_WRIST]
    );
    angles.rightElbow = this.calculateAngle(
      landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
      landmarks[POSE_LANDMARKS.RIGHT_ELBOW],
      landmarks[POSE_LANDMARKS.RIGHT_WRIST]
    );

    // Calculate hip angles
    angles.leftHip = this.calculateAngle(
      landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      landmarks[POSE_LANDMARKS.LEFT_HIP],
      landmarks[POSE_LANDMARKS.LEFT_KNEE]
    );
    angles.rightHip = this.calculateAngle(
      landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
      landmarks[POSE_LANDMARKS.RIGHT_HIP],
      landmarks[POSE_LANDMARKS.RIGHT_KNEE]
    );

    // Calculate shoulder angles - for jumping jacks, measure arm elevation from hip to wrist
    angles.leftShoulder = this.calculateAngle(
      landmarks[POSE_LANDMARKS.LEFT_HIP],
      landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      landmarks[POSE_LANDMARKS.LEFT_WRIST]
    );
    angles.rightShoulder = this.calculateAngle(
      landmarks[POSE_LANDMARKS.RIGHT_HIP],
      landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
      landmarks[POSE_LANDMARKS.RIGHT_WRIST]
    );

    return angles;
  }

  private calculateAngle(
    a: NormalizedLandmark,
    b: NormalizedLandmark,
    c: NormalizedLandmark
  ): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  }

  private smoothLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    // Add to history
    this.landmarkHistory.push([...landmarks]);
    if (this.landmarkHistory.length > this.POSITION_HISTORY_SIZE) {
      this.landmarkHistory.shift();
    }
    
    // If not enough history, return original
    if (this.landmarkHistory.length === 1) {
      return landmarks;
    }
    
    // Apply exponential smoothing
    const smoothed: NormalizedLandmark[] = [];
    // Use less smoothing for jumping jacks to detect fast movements
    const smoothingFactor = this.exerciseType === EXERCISE.JUMPING_JACKS 
      ? this.JUMPING_JACK_SMOOTHING_FACTOR 
      : this.SMOOTHING_FACTOR;
    
    for (let i = 0; i < landmarks.length; i++) {
      const current = landmarks[i];
      const history = this.landmarkHistory.slice(0, -1).map(h => h[i]);
      
      // Calculate weighted average
      let weightedX = current.x * smoothingFactor;
      let weightedY = current.y * smoothingFactor;
      let weightedZ = current.z * smoothingFactor;
      let remainingWeight = 1 - smoothingFactor;
      
      history.forEach((h, idx) => {
        const weight = remainingWeight * Math.pow(0.5, idx);
        weightedX += h.x * weight;
        weightedY += h.y * weight;
        weightedZ += h.z * weight;
        remainingWeight -= weight;
      });
      
      smoothed.push({
        x: weightedX,
        y: weightedY,
        z: weightedZ,
        visibility: current.visibility
      });
    }
    
    return smoothed;
  }
  
  private smoothAngles(): JointAngles {
    if (this.angleHistory.length === 0) return {};
    
    const smoothed: JointAngles = {};
    const keys = Object.keys(this.angleHistory[0]) as (keyof JointAngles)[];
    
    keys.forEach(key => {
      const values = this.angleHistory
        .map(angles => angles[key])
        .filter(v => v !== undefined) as number[];
      
      if (values.length > 0) {
        smoothed[key] = values.reduce((a, b) => a + b) / values.length;
      }
    });
    
    return smoothed;
  }
  
  private confirmStateChange(candidateState: RepState): RepState {
    // Jumping Jacks are fast; no confirmation needed - accept state changes immediately
    if (this.exerciseType === EXERCISE.JUMPING_JACKS) {
      this.pendingState = null;
      this.pendingStateFrames = 0;
      return candidateState;
    }
    
    // If state hasn't changed, reset pending state
    if (candidateState === this.repState) {
      this.pendingState = null;
      this.pendingStateFrames = 0;
      return this.repState;
    }
    
    // If this is a new state change
    if (candidateState !== this.pendingState) {
      this.pendingState = candidateState;
      this.pendingStateFrames = 1;
      return this.repState; // Keep current state
    }
    
    // If same pending state, increment counter
    this.pendingStateFrames++;
    
    // Use standard confirmation frames since jumping jacks already return early
    const requiredFrames = this.CONFIRMATION_FRAMES;
    
    // If we've seen enough frames, confirm the change
    if (this.pendingStateFrames >= requiredFrames) {
      this.pendingState = null;
      this.pendingStateFrames = 0;
      return candidateState;
    }
    
    return this.repState; // Keep current state
  }

  private determineState(angles: JointAngles, landmarks: NormalizedLandmark[]): RepState {
    switch (this.exerciseType) {
      case EXERCISE.SQUATS:
        return this.determineSquatState(angles);
      case EXERCISE.PUSH_UPS:
        return this.determinePushupState(angles);
      case EXERCISE.LUNGES:
        return this.determineLungeState(angles);
      case EXERCISE.JUMPING_JACKS:
        return this.determineJumpingJackState(angles, landmarks);
      case EXERCISE.PLANKS:
        return this.determinePlankState(angles, landmarks);
      case EXERCISE.CHIN_UPS:
        return this.determinePullUpState(landmarks);
      default:
        return 'neutral';
    }
  }

  private determineSquatState(angles: JointAngles): RepState {
    const avgKneeAngle = ((angles.leftKnee || 180) + (angles.rightKnee || 180)) / 2;
    
    // More forgiving thresholds
    if (avgKneeAngle < 140) {  // Was 100, now 120 (less deep required)
      return 'down'; // Squatting position
    } else if (avgKneeAngle > 150) {  // Was 160, now 150 (less straight required)
      return 'up'; // Standing position
    }
    return 'neutral';
  }

  private determinePushupState(angles: JointAngles): RepState {
    const avgElbowAngle = ((angles.leftElbow || 180) + (angles.rightElbow || 180)) / 2;
    
    if (avgElbowAngle < 90) {
      return 'down'; // Lowered position
    } else if (avgElbowAngle > 150) {
      return 'up'; // Extended position
    }
    return 'neutral';
  }

  private determineLungeState(angles: JointAngles): RepState {
    const frontKnee = Math.min(angles.leftKnee || 180, angles.rightKnee || 180);
    
    if (frontKnee < 100) {
      return 'down'; // Lunge position
    } else if (frontKnee > 160) {
      return 'up'; // Standing position
    }
    return 'neutral';
  }

  private determineJumpingJackState(_angles: JointAngles, landmarks: NormalizedLandmark[]): RepState {
    // Get all necessary landmarks
    const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
    
    // VELOCITY TRACKING - Calculate wrist velocities for fast movement detection
    let leftVelocity = 0;
    let rightVelocity = 0;
    
    if (this.landmarkHistory.length > 1) {
      const prevLandmarks = this.landmarkHistory[this.landmarkHistory.length - 2];
      const prevLeftWrist = prevLandmarks[POSE_LANDMARKS.LEFT_WRIST];
      const prevRightWrist = prevLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
      
      // Calculate vertical velocity (negative = moving up, positive = moving down)
      leftVelocity = leftWrist.y - prevLeftWrist.y;
      rightVelocity = rightWrist.y - prevRightWrist.y;
      
      // Store velocity history
      this.wristVelocities.push({ left: leftVelocity, right: rightVelocity });
      if (this.wristVelocities.length > this.VELOCITY_HISTORY_SIZE) {
        this.wristVelocities.shift();
      }
    }
    
    // Calculate average velocities
    const avgLeftVelocity = this.wristVelocities.length > 0 
      ? this.wristVelocities.reduce((sum, v) => sum + v.left, 0) / this.wristVelocities.length 
      : 0;
    const avgRightVelocity = this.wristVelocities.length > 0 
      ? this.wristVelocities.reduce((sum, v) => sum + v.right, 0) / this.wristVelocities.length 
      : 0;
    
    // Detect fast upward/downward movement
    const fastUpwardMovement = avgLeftVelocity < -this.VELOCITY_THRESHOLD && avgRightVelocity < -this.VELOCITY_THRESHOLD;
    const fastDownwardMovement = avgLeftVelocity > this.VELOCITY_THRESHOLD && avgRightVelocity > this.VELOCITY_THRESHOLD;
    
    // ARM DETECTION - More sensitive thresholds
    // Check if wrists are above shoulders (arms up) - reduced threshold from 0.05 to 0.02
    const leftArmUp = leftWrist.y < leftShoulder.y - 0.02;  // Y increases downward
    const rightArmUp = rightWrist.y < rightShoulder.y - 0.02;
    
    // Check if wrists are near or below hips (arms down) - more forgiving
    const leftArmDown = leftWrist.y > leftHip.y - 0.1;  // Arms don't need to be fully down
    const rightArmDown = rightWrist.y > rightHip.y - 0.1;
    
    // LEG DETECTION - Check if feet are spread apart
    const hipWidth = Math.abs(leftHip.x - rightHip.x);
    const ankleSpread = Math.abs(leftAnkle.x - rightAnkle.x);
    const legsSpread = ankleSpread > hipWidth * 1.5;  // Feet spread wider than hips
    const legsTogether = ankleSpread < hipWidth * 1.2;  // Feet close together
    
    // PARTIAL MOVEMENT DETECTION - Allow for less than perfect form
    const partialArmUp = (leftArmUp || rightArmUp) && 
                        (leftWrist.y < leftShoulder.y + 0.1 && rightWrist.y < rightShoulder.y + 0.1);
    const partialArmDown = (leftArmDown || rightArmDown) && 
                          (leftWrist.y > leftShoulder.y - 0.1 && rightWrist.y > rightShoulder.y - 0.1);
    
    // Debug logging
    if (this.frameCount % 30 === 0) {
      console.log('[Jumping Jack Debug]', {
        armPositions: {
          leftWristY: leftWrist.y.toFixed(2),
          leftShoulderY: leftShoulder.y.toFixed(2),
          rightWristY: rightWrist.y.toFixed(2),
          rightShoulderY: rightShoulder.y.toFixed(2),
          leftArmUp,
          rightArmUp,
          partialArmUp
        },
        legPositions: {
          hipWidth: hipWidth.toFixed(2),
          ankleSpread: ankleSpread.toFixed(2),
          legsSpread,
          legsTogether
        },
        velocity: {
          leftVelocity: leftVelocity.toFixed(3),
          rightVelocity: rightVelocity.toFixed(3),
          avgLeftVelocity: avgLeftVelocity.toFixed(3),
          avgRightVelocity: avgRightVelocity.toFixed(3),
          fastUpwardMovement,
          fastDownwardMovement
        },
        wouldBeState: (leftArmUp && rightArmUp) ? 'extended' : (leftArmDown && rightArmDown) ? 'contracted' : 'neutral'
      });
    }
    
    // State determination with velocity consideration
    // For fast movements, be more lenient with position requirements
    if ((leftArmUp && rightArmUp) || (partialArmUp && legsSpread) || 
        (fastUpwardMovement && !leftArmDown && !rightArmDown)) {
      return 'extended';  // Arms up (full, partial with leg spread, or fast upward movement)
    } else if ((leftArmDown && rightArmDown) || (partialArmDown && legsTogether) || 
               (fastDownwardMovement && !leftArmUp && !rightArmUp)) {
      return 'contracted';  // Arms down (full, partial with legs together, or fast downward movement)
    }
    return 'neutral';
  }
  
  private determinePlankState(angles: JointAngles, landmarks: NormalizedLandmark[]): RepState {
    // For planks, we check if the body is in a proper plank position
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    
    // Check if person is horizontal (shoulders and hips at similar Y level)
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const bodyAngle = Math.abs(avgShoulderY - avgHipY);
    
    // Check if elbows are bent (for forearm plank) or arms straight
    const avgElbowAngle = ((angles.leftElbow || 180) + (angles.rightElbow || 180)) / 2;
    const isInPlankPosition = bodyAngle < 0.15 && (avgElbowAngle < 100 || avgElbowAngle > 150);
    
    // Debug logging
    if (this.frameCount % 30 === 0) {
      console.log('[Plank Debug]', {
        bodyAngle: bodyAngle.toFixed(3),
        avgElbowAngle: avgElbowAngle.toFixed(1),
        isInPlankPosition
      });
    }
    
    if (isInPlankPosition) {
      return 'holding';
    }
    return 'neutral';
  }
  
  private determinePullUpState(landmarks: NormalizedLandmark[]): RepState {
    const nose = landmarks[POSE_LANDMARKS.NOSE];
    const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
    const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
    const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    
    // Calculate average elbow and wrist positions
    const avgElbowY = (leftElbow.y + rightElbow.y) / 2;
    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    
    // Calculate relative position of head to elbows and wrists
    const headToElbowRatio = (nose.y - avgElbowY) / Math.abs(avgWristY - avgElbowY);
    
    // Determine state based on relative positioning
    if (nose.y > avgElbowY) {
      return 'hanging'; // Head below elbows
    } else if (headToElbowRatio < -0.3) {
      return 'pulling'; // Head moving up towards wrists
    } else if (headToElbowRatio < -0.7) {
      return 'up'; // Head near wrist level
    }
    
    return 'hanging';
  }

  private detectRepCompletion(prevState: RepState, newState: RepState): boolean {
    switch (this.exerciseType) {
      case EXERCISE.SQUATS:
      case EXERCISE.PUSH_UPS:
      case EXERCISE.LUNGES:
        // Count rep when going from down to up
        return prevState === 'down' && newState === 'up';
      case EXERCISE.JUMPING_JACKS:
        // Count rep when going from extended to contracted
        return prevState === 'extended' && newState === 'contracted';
      case EXERCISE.PLANKS:
        // Planks don't have traditional reps, timing is handled separately
        return false;
      case EXERCISE.CHIN_UPS:
        // Count rep when completing the chin-up motion
        return (prevState === 'pulling' || prevState === 'up') && newState === 'hanging';
      default:
        return false;
    }
  }

  private calculateFormScore(angles: JointAngles, landmarks: NormalizedLandmark[]): number {
    switch (this.exerciseType) {
      case EXERCISE.SQUATS:
        return this.calculateSquatFormScore(angles);
      case EXERCISE.PUSH_UPS:
        return this.calculatePushupFormScore(angles);
      case EXERCISE.CHIN_UPS:
        return this.calculatePullUpFormScore(landmarks);
      case EXERCISE.PLANKS:
        return this.calculatePlankFormScore(angles, landmarks);
      default:
        return 0.8; // Default good form
    }
  }

  private calculateSquatFormScore(angles: JointAngles): number {
    let score = 1.0;
    
    // Check knee alignment (should not go past toes)
    const kneeAngleDiff = Math.abs((angles.leftKnee || 180) - (angles.rightKnee || 180));
    if (kneeAngleDiff > 15) {
      score -= 0.2; // Uneven squat
    }
    
    // Check hip alignment
    const hipAngleDiff = Math.abs((angles.leftHip || 180) - (angles.rightHip || 180));
    if (hipAngleDiff > 10) {
      score -= 0.1;
    }
    
    return Math.max(0, score);
  }

  private calculatePushupFormScore(angles: JointAngles): number {
    let score = 1.0;
    
    // Check elbow alignment
    const elbowAngleDiff = Math.abs((angles.leftElbow || 180) - (angles.rightElbow || 180));
    if (elbowAngleDiff > 20) {
      score -= 0.3; // Uneven push-up
    }
    
    return Math.max(0, score);
  }
  
  private calculatePlankFormScore(_angles: JointAngles, landmarks: NormalizedLandmark[]): number {
    let score = 1.0;
    
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    
    // Check if body is straight (shoulders and hips aligned)
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const bodyAlignment = Math.abs(avgShoulderY - avgHipY);
    
    if (bodyAlignment > 0.15) {
      score -= 0.3; // Hips too high or too low
    }
    
    // Check if shoulders are level
    const shoulderLevelDiff = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderLevelDiff > 0.05) {
      score -= 0.2; // Uneven shoulders
    }
    
    return Math.max(0, score);
  }
  
  private calculatePullUpFormScore(landmarks: NormalizedLandmark[]): number {
    let score = 1.0;
    
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
    const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
    
    // Check if shoulders are level
    const shoulderLevelDiff = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderLevelDiff > 0.05) {
      score -= 0.2; // Uneven pull
    }
    
    // Check if elbows are aligned
    const elbowAlignmentDiff = Math.abs(leftElbow.x - leftShoulder.x) - Math.abs(rightElbow.x - rightShoulder.x);
    if (Math.abs(elbowAlignmentDiff) > 0.1) {
      score -= 0.2; // Poor elbow alignment
    }
    
    return Math.max(0, score);
  }

  private getFormCorrections(angles: JointAngles, landmarks: NormalizedLandmark[]): string[] {
    const corrections: string[] = [];
    
    switch (this.exerciseType) {
      case EXERCISE.SQUATS:
        const kneeAngleDiff = Math.abs((angles.leftKnee || 180) - (angles.rightKnee || 180));
        if (kneeAngleDiff > 15) {
          corrections.push('Keep your knees aligned');
        }
        if (this.repState === 'down' && ((angles.leftKnee || 90) > 100 || (angles.rightKnee || 90) > 100)) {
          corrections.push('Go deeper into the squat');
        }
        break;
      
      case EXERCISE.PUSH_UPS:
        const elbowAngleDiff = Math.abs((angles.leftElbow || 180) - (angles.rightElbow || 180));
        if (elbowAngleDiff > 20) {
          corrections.push('Keep your arms even');
        }
        if (this.repState === 'down' && ((angles.leftElbow || 90) > 90)) {
          corrections.push('Lower your chest more');
        }
        break;
        
      case EXERCISE.PLANKS:
        const leftShoulderP = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulderP = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const leftHipP = landmarks[POSE_LANDMARKS.LEFT_HIP];
        const rightHipP = landmarks[POSE_LANDMARKS.RIGHT_HIP];
        
        const avgShoulderYP = (leftShoulderP.y + rightShoulderP.y) / 2;
        const avgHipYP = (leftHipP.y + rightHipP.y) / 2;
        
        if (avgHipYP < avgShoulderYP - 0.1) {
          corrections.push('Lower your hips');
        } else if (avgHipYP > avgShoulderYP + 0.1) {
          corrections.push('Raise your hips');
        }
        
        const shoulderLevelDiffP = Math.abs(leftShoulderP.y - rightShoulderP.y);
        if (shoulderLevelDiffP > 0.05) {
          corrections.push('Keep body straight');
        }
        break;
        
      case EXERCISE.CHIN_UPS:
        const leftShoulderC = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const rightShoulderC = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const shoulderLevelDiffC = Math.abs(leftShoulderC.y - rightShoulderC.y);
        
        if (shoulderLevelDiffC > 0.05) {
          corrections.push('Keep shoulders level');
        }
        if (this.repState === 'pulling' && landmarks[POSE_LANDMARKS.NOSE].y > 
            (landmarks[POSE_LANDMARKS.LEFT_ELBOW].y + landmarks[POSE_LANDMARKS.RIGHT_ELBOW].y) / 2) {
          corrections.push('Pull higher');
        }
        break;
    }
    
    return corrections;
  }

  private getDefaultFeedback(): ExerciseFeedback {
    return {
      repCount: this.repCount,
      state: this.repState,
      formScore: 0,
      corrections: ['Position yourself in frame'],
      isRepComplete: false,
      isSetComplete: false,
      isNewPersonalRecord: false
    };
  }

  reset() {
    this.repCount = 0;
    this.repState = 'neutral';
    this.angleHistory = [];
    this.frameCount = 0;
    this.pendingState = null;
    this.pendingStateFrames = 0;
    this.landmarkHistory = [];
    this.wristVelocities = [];
    this.plankStartTime = null;
    this.plankHoldTime = 0;
  }

  setPersonalRecord(record: number) {
    this.personalRecord = record;
  }

  setTargetReps(target: number) {
    this.targetReps = target;
  }
}