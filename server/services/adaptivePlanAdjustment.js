import pool from '../db/index.js';
import { logger } from '../lib/cloudwatch-logger.js';

/**
 * Calculate overperformance percentage based on actual vs planned performance
 */
function calculateOverperformance(performanceData) {
  const { plannedReps, actualReps, plannedSets, actualSets, formScore } = performanceData;
  
  // Calculate volume overperformance
  const plannedVolume = plannedReps * plannedSets;
  const actualVolume = actualReps * actualSets;
  const volumeOverperformance = (actualVolume - plannedVolume) / plannedVolume;
  
  // Factor in form quality
  const qualityAdjustedOverperformance = volumeOverperformance * formScore;
  
  return qualityAdjustedOverperformance;
}

/**
 * Update user fitness profile based on workout performance
 */
export async function adjustFuturePlans(userId, sessionId, performanceData) {
  try {
    const overperformance = calculateOverperformance(performanceData);
    
    // Get current fitness profile
    const profileResult = await pool.query(
      'SELECT * FROM user_fitness_profile WHERE user_id = $1',
      [userId]
    );
    
    let currentProfile = profileResult.rows[0] || {
      fitness_level: 'beginner',
      preferred_rep_increase: 2,
      preferred_difficulty_increase: 0.1
    };
    
    // Calculate adjustments based on performance
    const adjustments = {
      suggestedDifficultyIncrease: false,
      recommendedRepIncrease: 0,
      recommendedSetIncrease: 0,
      performanceNotes: []
    };
    
    if (overperformance > 0.3) { // 30% above plan
      adjustments.suggestedDifficultyIncrease = true;
      adjustments.recommendedRepIncrease = Math.ceil(overperformance * 5);
      adjustments.performanceNotes.push('Exceptional performance - consider increasing difficulty');
      
      // Update fitness level if consistently overperforming
      if (currentProfile.fitness_level === 'beginner') {
        currentProfile.fitness_level = 'intermediate';
      } else if (currentProfile.fitness_level === 'intermediate') {
        currentProfile.fitness_level = 'advanced';
      }
    } else if (overperformance > 0.15) { // 15-30% above plan
      adjustments.recommendedRepIncrease = Math.ceil(overperformance * 3);
      adjustments.performanceNotes.push('Good progress - slight increase recommended');
    } else if (overperformance < -0.2) { // 20% below plan
      adjustments.recommendedRepIncrease = -2;
      adjustments.performanceNotes.push('Consider reducing intensity or taking extra rest');
    }
    
    // Store performance analysis in session transcript as a string message
    const performanceAnalysis = {
      role: 'system',
      content: `Performance analysis: Session ${sessionId} - Overperformance: ${(overperformance * 100).toFixed(1)}%, Adjustments: ${JSON.stringify(adjustments)}`
    };
    
    await pool.query(
      `UPDATE "CallSession" 
       SET transcript = transcript || $1::jsonb 
       WHERE id = $2`,
      [JSON.stringify([performanceAnalysis]), sessionId]
    );
    
    // Update user fitness profile if needed
    if (adjustments.suggestedDifficultyIncrease) {
      await updateUserFitnessProfile(userId, {
        fitness_level: currentProfile.fitness_level,
        last_performance_rating: 'exceeded',
        suggested_rep_increase: adjustments.recommendedRepIncrease,
        last_adjustment_date: new Date().toISOString()
      });
    }
    
    logger.info('Adaptive plan adjustment completed', {
      userId,
      sessionId,
      overperformance,
      adjustments
    });
    
    return adjustments;
    
  } catch (error) {
    logger.error('Error in adaptive plan adjustment', {
      error: error.message,
      userId,
      sessionId
    });
    return null;
  }
}

/**
 * Update user fitness profile with new recommendations
 */
export async function updateUserFitnessProfile(userId, updates) {
  try {
    // Check if profile exists
    const existingProfile = await pool.query(
      'SELECT id FROM user_fitness_profile WHERE user_id = $1',
      [userId]
    );
    
    if (existingProfile.rows.length > 0) {
      // Update existing profile
      const updateFields = [];
      const values = [];
      let paramCount = 1;
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });
      
      values.push(userId);
      
      await pool.query(
        `UPDATE user_fitness_profile 
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE user_id = $${paramCount}`,
        values
      );
    } else {
      // Create new profile with updates
      await pool.query(
        `INSERT INTO user_fitness_profile (user_id, fitness_level, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [userId, updates.fitness_level || 'beginner']
      );
    }
    
    logger.info('Updated user fitness profile', { userId, updates });
    
  } catch (error) {
    logger.error('Error updating fitness profile', {
      error: error.message,
      userId
    });
  }
}

/**
 * Get workout performance summary from session
 */
export async function getSessionPerformanceSummary(sessionId) {
  try {
    const result = await pool.query(
      `SELECT transcript FROM "CallSession" WHERE id = $1`,
      [sessionId]
    );
    
    if (result.rows.length === 0) return null;
    
    const transcript = result.rows[0].transcript || [];
    const exerciseEvents = transcript.filter(msg => 
      msg.role === 'system' && 
      msg.content?.type === 'exercise_event'
    );
    
    // Aggregate performance data
    const performanceSummary = {
      exercises: {},
      totalReps: 0,
      totalSets: 0,
      averageFormScore: 0
    };
    
    let formScoreSum = 0;
    let formScoreCount = 0;
    
    exerciseEvents.forEach(event => {
      const data = event.content.data;
      if (!performanceSummary.exercises[data.exerciseType]) {
        performanceSummary.exercises[data.exerciseType] = {
          sets: 0,
          totalReps: 0,
          formScores: []
        };
      }
      
      const exercise = performanceSummary.exercises[data.exerciseType];
      
      if (data.event === 'set_complete') {
        exercise.sets++;
        exercise.totalReps += data.repCount;
        performanceSummary.totalSets++;
        performanceSummary.totalReps += data.repCount;
        
        if (data.formScore) {
          exercise.formScores.push(data.formScore);
          formScoreSum += data.formScore;
          formScoreCount++;
        }
      }
    });
    
    if (formScoreCount > 0) {
      performanceSummary.averageFormScore = formScoreSum / formScoreCount;
    }
    
    return performanceSummary;
    
  } catch (error) {
    logger.error('Error getting session performance summary', {
      error: error.message,
      sessionId
    });
    return null;
  }
}