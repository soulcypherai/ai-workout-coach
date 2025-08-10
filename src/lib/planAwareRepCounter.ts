import { ExerciseRepCounter, ExerciseFeedback } from './exerciseRepCounter';
import type { ExerciseType } from './exercises';
import { EXERCISE } from './exercises';

export interface ExerciseGuidance {
  action: 'continue' | 'rest' | 'switch' | 'complete';
  message: string;
  nextExercise?: string;
  restDuration?: number;
  formCue?: string;
}

export interface ExercisePlan {
  exerciseType: ExerciseType;
  sets: number;
  targetReps: number;
  restDuration: number;
  order: number;
}

export interface WorkoutPlan {
  exercises: ExercisePlan[];
  totalDuration: number;
  difficulty: string;
}

export class PlanAwareRepCounter {
  private currentPlan: WorkoutPlan;
  private currentExerciseIndex: number = 0;
  private currentSet: number = 1;
  private repCounter: ExerciseRepCounter | null = null;
  private completedExercises: Set<ExerciseType> = new Set();
  private setHistory: Map<ExerciseType, number[]> = new Map(); // Track reps per set
  private currentRepCount: number = 0; // Track current rep count
  
  constructor(workoutPlan: WorkoutPlan) {
    this.currentPlan = workoutPlan;
  }
  
  setCurrentExercise(exerciseType: ExerciseType) {
    // Reset rep count when starting new exercise
    this.currentRepCount = 0;
    
    // ExerciseRepCounter expects canonical ExerciseType; pass through directly
    this.repCounter = new ExerciseRepCounter(exerciseType);
    
    // Find this exercise in the plan (exact match on canonical)
    const planIndex = this.currentPlan.exercises.findIndex(
      (ex) => ex.exerciseType === exerciseType
    );
    
    if (planIndex >= 0) {
      this.currentExerciseIndex = planIndex;
    }
  }
  
  processFrame(landmarks: any): ExerciseFeedback & { guidance?: ExerciseGuidance } {
    if (!this.repCounter) {
      return {
        state: 'neutral',
        repCount: 0,
        isRepComplete: false,
        isSetComplete: false,
        isNewPersonalRecord: false,
        formScore: 0,
        corrections: ['No exercise selected']
      };
    }
    
    // Get base feedback from rep counter
    const feedback = this.repCounter.processFrame(landmarks);
    
    // Update current rep count
    this.currentRepCount = feedback.repCount;
    
    // Add plan-aware guidance
    const planExercise = this.currentPlan.exercises[this.currentExerciseIndex];
    let guidance: ExerciseGuidance | undefined;
    
    if (feedback.isRepComplete && planExercise) {
      guidance = this.onRepCompleted(planExercise.exerciseType, feedback.repCount);
    }
    
    return {
      ...feedback,
      guidance
    };
  }
  
  onRepCompleted(exercise: ExerciseType, repCount: number): ExerciseGuidance {
    const planExercise = this.currentPlan.exercises[this.currentExerciseIndex];
    
    if (!planExercise) {
      return this.handleUnplannedExercise(exercise, repCount);
    }
    
    // Check if we've completed the target reps for this set
    if (repCount >= planExercise.targetReps) {
      const excessReps = repCount - planExercise.targetReps;
      
      // Handle overflow reps
      if (excessReps > 0) {
        return this.handleOverflowReps(exercise, planExercise.targetReps, repCount);
      }
      
      // Track completed reps for this set
      const exerciseHistory = this.setHistory.get(exercise) || [];
      exerciseHistory.push(repCount);
      this.setHistory.set(exercise, exerciseHistory);
      
      if (this.currentSet < planExercise.sets) {
        // More sets to go
        this.currentSet++;
        return {
          action: 'rest',
          message: `Great set! Rest for ${planExercise.restDuration}s before set ${this.currentSet}`,
          nextExercise: exercise,
          restDuration: planExercise.restDuration
        };
      } else {
    // All sets completed for this exercise
    this.completedExercises.add(exercise);
        this.currentSet = 1;
        
        const nextExercise = this.getNextPlannedExercise();
        if (nextExercise) {
          return {
            action: 'switch',
            message: 'Excellent work! Time to move to the next exercise.',
            nextExercise: nextExercise.exerciseType
          };
        } else {
          return {
            action: 'complete',
            message: 'Workout complete! Great job! 💪'
          };
        }
      }
    }
    
    // Still have reps to go
    const repsRemaining = planExercise.targetReps - repCount;
    return {
      action: 'continue',
      message: `${repsRemaining} rep${repsRemaining === 1 ? '' : 's'} to go!`,
      formCue: this.getFormCue(exercise, repCount)
    };
  }
  
  private handleOverflowReps(exercise: ExerciseType, plannedReps: number, actualReps: number): ExerciseGuidance {
    const excessReps = actualReps - plannedReps;
    
    if (excessReps < 3) {
      return {
        action: 'continue',
        message: "Great job! You've completed your target. Time to rest or switch exercises.",
        formCue: 'Consider stopping to save energy for the next set'
      };
    }
    
    if (excessReps < 10) {
      return {
        action: 'continue',
        message: "Impressive! You're exceeding your plan. Consider saving energy for the next exercise.",
        formCue: 'Amazing endurance! But remember to pace yourself'
      };
    }
    
    // 10+ excess reps
    return {
      action: 'continue',
      message: "Incredible endurance! You've crushed your target. Time to channel this energy into your next exercise!",
      formCue: this.suggestComplementaryExercise(exercise)
    };
  }
  
  private suggestComplementaryExercise(currentExercise: ExerciseType): string {
    const complementary: Record<ExerciseType, string> = {
      [EXERCISE.SQUATS]: 'Try some lunges to work different leg muscles',
      [EXERCISE.PUSH_UPS]: 'Switch to planks for core stability',
      [EXERCISE.LUNGES]: 'Move to squats for bilateral leg work',
      [EXERCISE.JUMPING_JACKS]: 'Rest with some planks for core work',
      [EXERCISE.PLANKS]: 'Try push-ups for upper body strength',
      [EXERCISE.CHIN_UPS]: 'Switch to push-ups for pushing movements'
    };
    
    return complementary[currentExercise as ExerciseType] || 'Consider switching to work different muscle groups';
  }
  
  private handleUnplannedExercise(_exercise: ExerciseType, repCount: number): ExerciseGuidance {
    // Default guidance for exercises not in the plan
    return {
      action: 'continue',
      message: `${repCount} reps completed!`,
      formCue: 'Keep up the good form!'
    };
  }
  
  private getNextPlannedExercise(): ExercisePlan | null {
    // Find next uncompleted exercise
    for (let i = this.currentExerciseIndex + 1; i < this.currentPlan.exercises.length; i++) {
      const exercise = this.currentPlan.exercises[i];
      if (!this.completedExercises.has(exercise.exerciseType)) {
        return exercise;
      }
    }
    return null;
  }
  
  private getFormCue(exercise: ExerciseType, repCount: number): string {
    // Provide form cues at specific rep counts
    const cues: Record<ExerciseType, string[]> = {
      [EXERCISE.SQUATS]: [
        'Keep your chest up',
        'Drive through your heels',
        'Knees tracking over toes'
      ],
      [EXERCISE.PUSH_UPS]: [
        'Keep your core tight',
        'Full range of motion',
        'Elbows at 45 degrees'
      ],
      [EXERCISE.LUNGES]: [
        'Front knee over ankle',
        'Back straight',
        'Push through front heel'
      ],
      [EXERCISE.JUMPING_JACKS]: [
        'Land softly',
        'Full arm extension',
        'Maintain rhythm'
      ],
      [EXERCISE.PLANKS]: [
        'Straight line from head to heels',
        'Breathe normally',
        'Engage your core'
      ],
      [EXERCISE.CHIN_UPS]: [
        'Full extension at bottom',
        'Chin over bar',
        'Control the descent'
      ]
    };
    
    const exerciseCues = cues[exercise as ExerciseType] || ['Focus on form'];
    return exerciseCues[repCount % exerciseCues.length];
  }
  
  getCurrentProgress() {
    const planExercise = this.currentPlan.exercises[this.currentExerciseIndex];
    
    return {
      exercise: planExercise?.exerciseType || 'Unknown',
      currentSet: this.currentSet,
      totalSets: planExercise?.sets || 0,
      currentReps: this.currentRepCount,
      targetReps: planExercise?.targetReps || 0,
      completedExercises: Array.from(this.completedExercises),
      totalExercises: this.currentPlan.exercises.length
    };
  }
  
  reset() {
    this.currentExerciseIndex = 0;
    this.currentSet = 1;
    this.currentRepCount = 0;
    this.repCounter?.reset();
    this.completedExercises.clear();
    this.setHistory.clear();
  }
  
  getCurrentExpectedExercise(): ExercisePlan | null {
    // Find the first exercise in the plan that hasn't been completed
    for (const exercise of this.currentPlan.exercises) {
      if (!this.completedExercises.has(exercise.exerciseType)) {
        return exercise;
      }
    }
    return null;
  }
  
  startNextSet() {
    // Reset rep counter for next set
    this.currentRepCount = 0;
    this.repCounter?.reset();
  }
  
  markExerciseCompleted(exerciseType: ExerciseType) {
    // Manually mark an exercise as completed (used when End button is clicked)
    this.completedExercises.add(exerciseType);
  }
  
  setCurrentRepCount(count: number) {
    // Update the current rep count (used in test mode)
    this.currentRepCount = count;
  }
}