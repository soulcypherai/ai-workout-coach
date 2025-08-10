import { WorkoutPlan, ExercisePlan } from './planAwareRepCounter';

export interface WorkoutTransition {
  type: 'exercise_switch' | 'workout_complete' | 'rest_period';
  from?: string;
  to?: string;
  guidance?: string;
  countdown?: number;
  summary?: WorkoutSummary;
}

export interface WorkoutSummary {
  totalExercises: number;
  completedExercises: number;
  totalTime: number;
  totalReps: number;
  averageFormScore: number;
  achievements: string[];
}

export interface ExerciseProgress {
  exerciseType: string;
  setsCompleted: number;
  totalReps: number;
  formScore: number;
  startTime: number;
  endTime?: number;
}

export class WorkoutFlowManager {
  private plan: WorkoutPlan;
  private currentExerciseIndex: number = 0;
  private autoSwitchEnabled: boolean = true;
  private exerciseProgress: Map<string, ExerciseProgress> = new Map();
  private workoutStartTime: number;
  private completedExercises: Set<string> = new Set();
  private onTransitionCallback?: (transition: WorkoutTransition) => void;
  private activeTimers: Set<NodeJS.Timeout> = new Set(); // Track active timers for cleanup
  
  constructor(workoutPlan: WorkoutPlan) {
    this.plan = workoutPlan;
    this.workoutStartTime = Date.now();
  }
  
  setOnTransitionCallback(callback: (transition: WorkoutTransition) => void) {
    this.onTransitionCallback = callback;
  }
  
  startExercise(exerciseType: string) {
    const progress: ExerciseProgress = {
      exerciseType,
      setsCompleted: 0,
      totalReps: 0,
      formScore: 1,
      startTime: Date.now()
    };
    this.exerciseProgress.set(exerciseType, progress);
  }
  
  async handleExerciseCompletion(exercise: string): Promise<WorkoutTransition> {
    // Mark exercise as completed
    this.completedExercises.add(exercise);
    
    // Update progress end time
    const progress = this.exerciseProgress.get(exercise);
    if (progress) {
      progress.endTime = Date.now();
    }
    
    const nextExercise = this.getNextExercise();
    
    if (!nextExercise) {
      // Workout complete
      const transition: WorkoutTransition = {
        type: 'workout_complete',
        summary: this.generateWorkoutSummary()
      };
      
      // Trigger transition callback for workout completion
      if (this.onTransitionCallback) {
        this.onTransitionCallback(transition);
      }
      
      return transition;
    }
    
    // Generate transition guidance
    const transitionGuidance = await this.generateTransitionGuidance(exercise, nextExercise.exerciseType);
    
    // Trigger transition callback if set
    const transition: WorkoutTransition = {
      type: 'exercise_switch',
      from: exercise,
      to: nextExercise.exerciseType,
      guidance: transitionGuidance,
      countdown: 5
    };
    
    if (this.onTransitionCallback) {
      this.onTransitionCallback(transition);
    }
    
    return transition;
  }
  
  handleSetCompletion(exercise: string, setNumber: number, reps: number, formScore: number) {
    const progress = this.exerciseProgress.get(exercise);
    if (progress) {
      progress.setsCompleted = setNumber;
      progress.totalReps += reps;
      // Update average form score
      progress.formScore = (progress.formScore * (progress.setsCompleted - 1) + formScore) / progress.setsCompleted;
    }
  }
  
  private getNextExercise(): ExercisePlan | null {
    // Find next uncompleted exercise in plan order
    for (let i = 0; i < this.plan.exercises.length; i++) {
      const exercise = this.plan.exercises[i];
      if (!this.completedExercises.has(exercise.exerciseType)) {
        this.currentExerciseIndex = i;
        return exercise;
      }
    }
    return null;
  }
  
  private async generateTransitionGuidance(from: string, to: string): Promise<string> {
    // Generate contextual transition messages
    const transitions = [
      `Great work on ${from}! Let's move to ${to}.`,
      `${from} complete! Time for ${to}.`,
      `Excellent ${from}! Ready for ${to}?`,
      `Nice job! Switching to ${to}.`,
      `${from} done! Let's do ${to} next.`
    ];
    
    return transitions[Math.floor(Math.random() * transitions.length)];
  }
  
  private generateWorkoutSummary(): WorkoutSummary {
    const totalTime = Math.floor((Date.now() - this.workoutStartTime) / 1000);
    let totalReps = 0;
    let totalFormScore = 0;
    let exerciseCount = 0;
    
    this.exerciseProgress.forEach(progress => {
      totalReps += progress.totalReps;
      totalFormScore += progress.formScore;
      exerciseCount++;
    });
    
    const averageFormScore = exerciseCount > 0 ? totalFormScore / exerciseCount : 0;
    
    // Generate achievements
    const achievements = [];
    if (this.completedExercises.size === this.plan.exercises.length) {
      achievements.push('Completed full workout! 🎯');
    }
    if (averageFormScore > 0.9) {
      achievements.push('Excellent form! 🌟');
    }
    if (totalReps > 100) {
      achievements.push('100+ reps! 💪');
    }
    if (totalTime < this.plan.totalDuration * 60) {
      achievements.push('Finished ahead of schedule! ⚡');
    }
    
    return {
      totalExercises: this.plan.exercises.length,
      completedExercises: this.completedExercises.size,
      totalTime,
      totalReps,
      averageFormScore,
      achievements
    };
  }
  
  getCurrentExercise(): ExercisePlan | null {
    if (this.currentExerciseIndex < this.plan.exercises.length) {
      return this.plan.exercises[this.currentExerciseIndex];
    }
    return null;
  }
  
  getProgress() {
    return {
      current: this.currentExerciseIndex + 1,
      total: this.plan.exercises.length,
      completed: Array.from(this.completedExercises),
      exerciseProgress: Array.from(this.exerciseProgress.values())
    };
  }
  
  skipCurrentExercise() {
    const current = this.getCurrentExercise();
    if (current) {
      return this.handleExerciseCompletion(current.exerciseType);
    }
    return Promise.resolve({
      type: 'workout_complete' as const,
      summary: this.generateWorkoutSummary()
    });
  }
  
  setAutoSwitch(enabled: boolean) {
    this.autoSwitchEnabled = enabled;
  }
  
  isAutoSwitchEnabled() {
    return this.autoSwitchEnabled;
  }
  
  // Cleanup method to prevent memory leaks
  dispose() {
    // Clear all active timers
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();
    
    // Clear callback reference
    this.onTransitionCallback = undefined;
    
    // Clear maps and sets
    this.exerciseProgress.clear();
    this.completedExercises.clear();
  }
}