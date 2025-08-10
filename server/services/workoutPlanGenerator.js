import pool from '../db/index.js';
import { generateLLMResponse } from '../pipeline/llmResponder.js';
import { logger } from '../lib/cloudwatch-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { EXERCISE, EXERCISES } from '../constants/exercises.js';

// Muscle group mapping for exercises
const EXERCISE_MUSCLE_GROUPS = {
  [EXERCISE.SQUATS]: ['legs', 'glutes', 'core'],
  [EXERCISE.PUSH_UPS]: ['chest', 'shoulders', 'triceps', 'core'],
  [EXERCISE.LUNGES]: ['legs', 'glutes', 'core'],
  [EXERCISE.JUMPING_JACKS]: ['cardio', 'full-body'],
  [EXERCISE.PLANKS]: ['core', 'shoulders'],
  [EXERCISE.CHIN_UPS]: ['back', 'biceps', 'core']
};

/**
 * Extract workout history from user's past transcripts
 */
async function getWorkoutHistoryFromTranscripts(userId, days = 30) {
  try {
    const result = await pool.query(
      `SELECT cs.id, cs.transcript, cs.started_at, cs.ended_at
       FROM "CallSession" cs
       WHERE cs.user_id = $1 
         AND cs.started_at > NOW() - INTERVAL '${days} days'
         AND cs.transcript IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(cs.transcript) AS msg
           WHERE msg->>'role' = 'system' 
             AND msg->'content'->>'type' IN ('workout_plan', 'exercise_event', 'workout_summary')
         )
       ORDER BY cs.started_at DESC`,
      [userId]
    );
    
    const workoutSessions = [];
    
    for (const session of result.rows) {
      const transcript = session.transcript || [];
      const workoutData = {
        sessionId: session.id,
        date: session.started_at,
        duration: session.ended_at ? 
          Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000) : 0,
        exercises: [],
        plan: null,
        summary: null
      };
      
      // Extract workout data from transcript
      for (const msg of transcript) {
        if (msg.role === 'system' && msg.content?.type) {
          switch (msg.content.type) {
            case 'workout_plan':
              workoutData.plan = msg.content.data;
              break;
            case 'exercise_event':
              if (msg.content.data.event === 'exercise_complete') {
                workoutData.exercises.push({
                  type: msg.content.data.exerciseType,
                  sets: msg.content.data.setNumber,
                  totalReps: msg.content.data.repCount,
                  avgFormScore: msg.content.data.formScore
                });
              }
              break;
            case 'workout_summary':
              workoutData.summary = msg.content.data;
              break;
          }
        }
      }
      
      if (workoutData.exercises.length > 0 || workoutData.plan) {
        workoutSessions.push(workoutData);
      }
    }
    
    return workoutSessions;
  } catch (error) {
    logger.error('Error extracting workout history', { error: error.message, userId });
    return [];
  }
}

/**
 * Get user's fitness profile
 */
async function getUserFitnessProfile(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM user_fitness_profile WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Return default profile if none exists
    return {
      fitness_level: 'beginner',
      goals: ['general_fitness'],
      injuries: [],
      preferred_duration: 30,
      workout_frequency: 3
    };
  } catch (error) {
    logger.error('Error getting fitness profile', { error: error.message, userId });
    return {
      fitness_level: 'beginner',
      goals: ['general_fitness'],
      injuries: [],
      preferred_duration: 30,
      workout_frequency: 3
    };
  }
}

/**
 * Analyze recent workouts for patterns and recovery needs
 */
function analyzeRecentWorkouts(workoutHistory) {
  const analysis = {
    lastWorkoutDate: null,
    daysSinceLastWorkout: null,
    weeklyFrequency: 0,
    recentExercises: [],
    muscleGroupsWorked: {},
    progressionTrend: {},
    averageSessionDuration: 0
  };
  
  if (workoutHistory.length === 0) return analysis;
  
  // Sort by date
  const sortedWorkouts = [...workoutHistory].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  // Last workout analysis
  analysis.lastWorkoutDate = sortedWorkouts[0].date;
  analysis.daysSinceLastWorkout = Math.floor(
    (new Date() - new Date(analysis.lastWorkoutDate)) / (1000 * 60 * 60 * 24)
  );
  
  // Weekly frequency (last 4 weeks)
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentWorkouts = sortedWorkouts.filter(w => new Date(w.date) > fourWeeksAgo);
  analysis.weeklyFrequency = Math.round((recentWorkouts.length / 4) * 10) / 10;
  
  // Recent exercises and muscle groups
  const muscleGroupLastWorked = {};
  
  for (const workout of sortedWorkouts.slice(0, 5)) {
    for (const exercise of workout.exercises) {
      if (!analysis.recentExercises.includes(exercise.type)) {
        analysis.recentExercises.push(exercise.type);
      }
      
      // Track muscle groups
      const muscleGroups = EXERCISE_MUSCLE_GROUPS[exercise.type] || [];
      for (const muscle of muscleGroups) {
        if (!muscleGroupLastWorked[muscle]) {
          const daysSince = Math.floor(
            (new Date() - new Date(workout.date)) / (1000 * 60 * 60 * 24)
          );
          muscleGroupLastWorked[muscle] = daysSince;
        }
      }
    }
  }
  
  analysis.muscleGroupsWorked = muscleGroupLastWorked;
  
  // Calculate average session duration
  const durations = sortedWorkouts
    .filter(w => w.duration > 0)
    .map(w => w.duration);
  
  if (durations.length > 0) {
    analysis.averageSessionDuration = Math.round(
      durations.reduce((a, b) => a + b, 0) / durations.length
    );
  }
  
  // Progression trend (compare last 3 workouts to previous 3)
  if (sortedWorkouts.length >= 6) {
    const recent = sortedWorkouts.slice(0, 3);
    const previous = sortedWorkouts.slice(3, 6);
    
    const recentAvgReps = recent.reduce((sum, w) => {
      const totalReps = w.exercises.reduce((s, e) => s + e.totalReps, 0);
      return sum + totalReps;
    }, 0) / recent.length;
    
    const previousAvgReps = previous.reduce((sum, w) => {
      const totalReps = w.exercises.reduce((s, e) => s + e.totalReps, 0);
      return sum + totalReps;
    }, 0) / previous.length;
    
    analysis.progressionTrend.repsChange = Math.round(
      ((recentAvgReps - previousAvgReps) / previousAvgReps) * 100
    );
  }
  
  return analysis;
}

/**
 * Get enabled exercises for a fitness coach persona
 */
async function getEnabledExercises(avatarId) {
  try {
    const { rows } = await pool.query(
      `SELECT meta->'exercises' as exercises FROM "AvatarPersona" WHERE id = $1 AND category = 'fitness'`,
      [avatarId]
    );
    
    if (!rows[0]) return null;
    
    const enabledExercises = (rows[0].exercises || [])
      .filter(ex => ex.enabled)
      .map(ex => ex.name); // Expect canonical ExerciseType values stored in persona meta
    
    logger.info('Enabled exercises for persona', { avatarId, exercises: enabledExercises });
    return enabledExercises;
  } catch (error) {
    logger.error('Error getting enabled exercises', { error: error.message, avatarId });
    return null;
  }
}

/**
 * Generate a personalized workout plan
 */
async function generateWorkoutPlan(userId, sessionContext = {}) {
  // Debug mode - skip LLM and create minimal plan
  const DEBUG_MODE = process.env.DEBUG_WORKOUT_PLAN === 'true';
  
  try {
    // Get user history and profile
    const [workoutHistory, fitnessProfile] = await Promise.all([
      getWorkoutHistoryFromTranscripts(userId, 30),
      getUserFitnessProfile(userId)
    ]);
    
    const analysis = analyzeRecentWorkouts(workoutHistory);
    
    // Get enabled exercises for this avatar
    let availableExercises = [...EXERCISES];
    if (sessionContext.avatarId) {
      const enabledExercises = await getEnabledExercises(sessionContext.avatarId);
      if (enabledExercises && enabledExercises.length > 0) {
        availableExercises = enabledExercises;
      }
    }
    
    // Debug mode - create minimal plan with 1 rep of each exercise
    if (DEBUG_MODE) {
      logger.info('[DEBUG] Creating debug workout plan', { 
        availableExercises,
        avatarId: sessionContext.avatarId 
      });
      
      const debugPlan = {
        planId: uuidv4(),
        userId,
        sessionId: sessionContext.sessionId,
        exercises: availableExercises.map((exercise, index) => ({
          exerciseType: exercise,
          sets: 1,
          targetReps: 1,
          restDuration: 5, // 5 seconds rest in debug mode
          order: index + 1,
          reasoning: 'Debug mode - minimal workout',
          alternatives: [],
          formCues: ['Debug mode - test exercise']
        })),
        totalDuration: 5,
        difficulty: 'debug',
        focusAreas: ['testing'],
        progressionNotes: 'Debug workout plan with 1 rep per exercise',
        generatedAt: new Date().toISOString()
      };
      
      logger.info('[DEBUG] Generated debug workout plan', { 
        exerciseCount: debugPlan.exercises.length,
        exercises: debugPlan.exercises.map(e => `${e.exerciseType}(${e.sets}x${e.targetReps})`)
      });
      
      return debugPlan;
    }
    
    // Build prompt for GPT
    const prompt = `Generate a personalized workout plan for a fitness coaching session.

User Profile:
- Fitness Level: ${fitnessProfile.fitness_level}
- Goals: ${fitnessProfile.goals.join(', ')}
- Injuries/Limitations: ${fitnessProfile.injuries.length > 0 ? fitnessProfile.injuries.join(', ') : 'None'}
- Preferred Duration: ${fitnessProfile.preferred_duration} minutes

Recent Workout Analysis:
- Days Since Last Workout: ${analysis.daysSinceLastWorkout || 'First workout'}
- Weekly Frequency: ${analysis.weeklyFrequency} workouts/week
- Recent Exercises: ${analysis.recentExercises.join(', ') || 'None'}
- Average Session Duration: ${analysis.averageSessionDuration} minutes
- Progression Trend: ${analysis.progressionTrend.repsChange ? `${analysis.progressionTrend.repsChange}% change in volume` : 'No trend data'}

Muscle Recovery Status:
${Object.entries(analysis.muscleGroupsWorked)
  .map(([muscle, days]) => `- ${muscle}: ${days} days ago`)
  .join('\n') || 'No recent muscle group data'}

Available Exercises: ${availableExercises.join(', ')}
${availableExercises.length < 3 ? 'NOTE: Limited exercises available. Create a plan using ONLY these exercises with appropriate sets/reps variations.' : ''}

Requirements:
1. Apply progressive overload principles
2. Ensure proper muscle recovery (major muscle groups need 48-72 hours)
3. Balance the workout across muscle groups
4. Start with a warm-up exercise
5. Include ${availableExercises.length} exercises total (but NEVER repeat the same exercise type in the plan)
6. Adjust difficulty based on fitness level and recent performance
7. Each exercise should appear only ONCE in the plan with multiple sets if needed
8. IMPORTANT: For each exercise item, the "exerciseType" MUST be EXACTLY one of: ${availableExercises.join(', ')} (case-sensitive). Do NOT invent variations or different spellings.

Return a JSON object with this structure:
{
  "exercises": [
    {
      "exerciseType": "exercise name",
      "sets": number,
      "targetReps": number,
      "restDuration": seconds,
      "order": number,
      "reasoning": "why this exercise and rep scheme"
    }
  ],
  "totalDuration": estimated minutes,
  "difficulty": "beginner|intermediate|advanced",
  "focusAreas": ["muscle groups targeted"],
  "progressionNotes": "explanation of progression strategy"
}`;

    // Use OpenAI directly for structured response
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional fitness coach creating personalized workout plans.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });
    
    const response = completion.choices[0].message.content;
    
    // Parse the response
    let plan;
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      logger.error('Error parsing workout plan', { error: parseError.message, response });
      // Fallback to default plan
      plan = generateDefaultPlan(fitnessProfile.fitness_level, availableExercises);
    }
    
    // Add metadata
    let workoutPlan = {
      planId: uuidv4(),
      userId,
      sessionId: sessionContext.sessionId,
      exercises: plan.exercises.map(ex => ({
        ...ex,
        alternatives: getExerciseAlternatives(ex.exerciseType),
        formCues: getFormCues(ex.exerciseType)
      })),
      totalDuration: plan.totalDuration || 30,
      difficulty: plan.difficulty || fitnessProfile.fitness_level,
      focusAreas: plan.focusAreas || ['full-body'],
      progressionNotes: plan.progressionNotes || 'Standard progression',
      generatedAt: new Date().toISOString()
    };
    // Emit as-is. Backend is the source of truth for canonical ExerciseType values.
    
    return workoutPlan;
    
  } catch (error) {
    logger.error('Error generating workout plan', { error: error.message, userId });
    return generateDefaultPlan('beginner', availableExercises);
  }
}

/**
 * Get alternative exercises for a given exercise
 */
function getExerciseAlternatives(exerciseType) {
    const alternatives = {
      [EXERCISE.SQUATS]: [EXERCISE.LUNGES, EXERCISE.JUMPING_JACKS],
      [EXERCISE.PUSH_UPS]: [EXERCISE.PLANKS],
      [EXERCISE.LUNGES]: [EXERCISE.SQUATS, EXERCISE.JUMPING_JACKS],
      [EXERCISE.JUMPING_JACKS]: [EXERCISE.SQUATS, EXERCISE.LUNGES],
      [EXERCISE.PLANKS]: [EXERCISE.PUSH_UPS],
      [EXERCISE.CHIN_UPS]: [EXERCISE.PUSH_UPS, EXERCISE.PLANKS]
    };
  
  return alternatives[exerciseType] || [];
}

/**
 * Get form cues for an exercise
 */
function getFormCues(exerciseType) {
  const cues = {
    [EXERCISE.SQUATS]: [
      'Keep your chest up and core engaged',
      'Push your knees out in line with your toes',
      'Drive through your heels to stand up'
    ],
    [EXERCISE.PUSH_UPS]: [
      'Keep your body in a straight line',
      'Lower until your chest nearly touches the ground',
      'Push through your palms, not just your fingers'
    ],
    [EXERCISE.LUNGES]: [
      'Step forward with control',
      'Keep your front knee over your ankle',
      'Push through your front heel to return'
    ],
    [EXERCISE.JUMPING_JACKS]: [
      'Land softly on the balls of your feet',
      'Keep your core engaged throughout',
      'Maintain a steady rhythm'
    ],
    [EXERCISE.PLANKS]: [
      'Keep your body in a straight line from head to heels',
      'Engage your core and glutes',
      'Breathe normally throughout'
    ],
    [EXERCISE.CHIN_UPS]: [
      'Pull until your chin clears the bar',
      'Control the descent',
      'Engage your core to prevent swinging'
    ]
  };
  
  return cues[exerciseType] || ['Focus on proper form', 'Control the movement'];
}

/**
 * Generate a default workout plan
 */
function generateDefaultPlan(fitnessLevel = 'beginner', availableExercises = null) {
  const plans = {
    beginner: {
      exercises: [
        {
          exerciseType: EXERCISE.JUMPING_JACKS,
          sets: 2,
          targetReps: 20,
          restDuration: 30,
          order: 1,
          reasoning: 'Warm-up to elevate heart rate'
        },
        {
          exerciseType: EXERCISE.SQUATS,
          sets: 3,
          targetReps: 10,
          restDuration: 45,
          order: 2,
          reasoning: 'Build lower body strength'
        },
        {
          exerciseType: EXERCISE.PUSH_UPS,
          sets: 3,
          targetReps: 8,
          restDuration: 45,
          order: 3,
          reasoning: 'Develop upper body strength'
        },
        {
          exerciseType: EXERCISE.PLANKS,
          sets: 3,
          targetReps: 30, // seconds
          restDuration: 30,
          order: 4,
          reasoning: 'Core strengthening'
        }
      ],
      totalDuration: 20,
      difficulty: 'beginner',
      focusAreas: ['full-body'],
      progressionNotes: 'Focus on form and consistency'
    },
    intermediate: {
      exercises: [
        {
          exerciseType: EXERCISE.JUMPING_JACKS,
          sets: 2,
          targetReps: 30,
          restDuration: 20,
          order: 1,
          reasoning: 'Dynamic warm-up'
        },
        {
          exerciseType: EXERCISE.SQUATS,
          sets: 4,
          targetReps: 15,
          restDuration: 30,
          order: 2,
          reasoning: 'Progressive lower body training'
        },
        {
          exerciseType: EXERCISE.PUSH_UPS,
          sets: 4,
          targetReps: 12,
          restDuration: 30,
          order: 3,
          reasoning: 'Upper body endurance'
        },
        {
          exerciseType: EXERCISE.LUNGES,
          sets: 3,
          targetReps: 10, // per leg
          restDuration: 30,
          order: 4,
          reasoning: 'Unilateral leg strength'
        },
        {
          exerciseType: EXERCISE.PLANKS,
          sets: 3,
          targetReps: 45,
          restDuration: 20,
          order: 5,
          reasoning: 'Advanced core stability'
        }
      ],
      totalDuration: 30,
      difficulty: 'intermediate',
      focusAreas: ['strength', 'endurance'],
      progressionNotes: 'Increasing volume and reducing rest'
    },
    advanced: {
      exercises: [
        {
          exerciseType: EXERCISE.JUMPING_JACKS,
          sets: 3,
          targetReps: 40,
          restDuration: 15,
          order: 1,
          reasoning: 'High-intensity warm-up'
        },
        {
          exerciseType: EXERCISE.CHIN_UPS,
          sets: 4,
          targetReps: 8,
          restDuration: 60,
          order: 2,
          reasoning: 'Advanced pulling strength'
        },
        {
          exerciseType: EXERCISE.PUSH_UPS,
          sets: 5,
          targetReps: 20,
          restDuration: 30,
          order: 3,
          reasoning: 'High-volume pushing'
        },
        {
          exerciseType: EXERCISE.SQUATS,
          sets: 5,
          targetReps: 20,
          restDuration: 30,
          order: 4,
          reasoning: 'Lower body endurance'
        },
        {
          exerciseType: EXERCISE.LUNGES,
          sets: 4,
          targetReps: 15,
          restDuration: 30,
          order: 5,
          reasoning: 'Unilateral strength endurance'
        },
        {
          exerciseType: EXERCISE.PLANKS,
          sets: 4,
          targetReps: 60,
          restDuration: 20,
          order: 6,
          reasoning: 'Elite core endurance'
        }
      ],
      totalDuration: 45,
      difficulty: 'advanced',
      focusAreas: ['strength', 'endurance', 'power'],
      progressionNotes: 'High volume with minimal rest'
    }
  };
  
  let plan = plans[fitnessLevel] || plans.beginner;
  
  // Filter exercises if availableExercises provided (expect canonical names)
  if (availableExercises?.length > 0) {
    const availableSet = new Set(availableExercises);
    let filteredExercises = plan.exercises
      .filter(ex => availableSet.has(ex.exerciseType));
    
    // If we have very few exercises after filtering, create a minimal plan
    if (filteredExercises.length < 2 && availableExercises.length >= 2) {
      // Create a plan with just the available exercises
      filteredExercises = availableExercises.map((exercise, index) => ({
        exerciseType: exercise,
        sets: index === 0 ? 2 : 3, // Warm-up gets fewer sets
        targetReps: exercise === EXERCISE.JUMPING_JACKS ? 20 : 10,
        restDuration: 45,
        order: index + 1,
        reasoning: index === 0 ? 'Warm-up' : 'Main exercise'
      }));
    }
    
    plan = {
      ...plan,
      exercises: filteredExercises.map((ex, i) => ({ ...ex, order: i + 1 }))
    };
  }
  
  return {
    planId: uuidv4(),
    ...plan,
    exercises: plan.exercises.map(ex => ({
      ...ex,
      alternatives: getExerciseAlternatives(ex.exerciseType),
      formCues: getFormCues(ex.exerciseType)
    })),
    generatedAt: new Date().toISOString()
  };
}

export {
  generateWorkoutPlan,
  getWorkoutHistoryFromTranscripts,
  getUserFitnessProfile,
  analyzeRecentWorkouts
};