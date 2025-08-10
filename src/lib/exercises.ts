export const EXERCISE = {
  SQUATS: 'Squats',
  PUSH_UPS: 'Push-ups',
  LUNGES: 'Lunges',
  JUMPING_JACKS: 'Jumping Jacks',
  PLANKS: 'Planks',
  CHIN_UPS: 'Chin-ups',
} as const;

export const EXERCISES = [
  EXERCISE.SQUATS,
  EXERCISE.PUSH_UPS,
  EXERCISE.LUNGES,
  EXERCISE.JUMPING_JACKS,
  EXERCISE.PLANKS,
  EXERCISE.CHIN_UPS,
] as const;

export type ExerciseName = typeof EXERCISES[number];
export type ExerciseType = ExerciseName;

export const EXERCISE_SET: ReadonlySet<ExerciseName> = new Set(EXERCISES);

