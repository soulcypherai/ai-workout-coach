import { createCompletion } from "../pipeline/llmResponder.js";
import { logger } from "../lib/cloudwatch-logger.js";

/**
 * Generate form correction response
 */
export async function generateFormCorrectionResponse(persona, exercise, formScore, correction) {
  const prompt = `User's ${exercise} form needs correction: "${correction}". Give a brief, encouraging correction (10-15 words).`;
  
  logger.info('[CoachResponses] Generating form correction', {
    exercise,
    formScore,
    correction,
    component: 'coachResponses'
  });
  
  const response = await createCompletion(
    persona.systemPrompt,
    prompt,
    {
      model: persona.model || 'gpt-4o-mini',
      maxTokens: 40,
      temperature: 0.7
    }
  );
  
  logger.info('[CoachResponses] Form correction response', {
    response: response ? response.substring(0, 50) : 'null',
    component: 'coachResponses'
  });
  
  return response;
}

/**
 * Generate plank encouragement response
 */
export async function generatePlankEncouragementResponse(persona, plankTimeSeconds) {
  let prompt = '';
  if (plankTimeSeconds >= 60) {
    prompt = `User has held plank for ${plankTimeSeconds} seconds! Give enthusiastic praise (10-15 words).`;
  } else if (plankTimeSeconds >= 30) {
    prompt = `User holding plank for ${plankTimeSeconds} seconds. Encourage them to keep going (10-15 words).`;
  } else {
    prompt = `User at ${plankTimeSeconds} seconds in plank. Quick motivation to maintain form (10 words).`;
  }
  
  return await createCompletion(
    persona.systemPrompt,
    prompt,
    {
      model: persona.model || 'gpt-4o-mini',
      maxTokens: 40,
      temperature: 0.8
    }
  );
}

/**
 * Generate milestone motivation response
 */
export async function generateMilestoneResponse(persona, exercise, repCount, formScore) {
  const prompt = `User just completed ${repCount} ${exercise.toLowerCase()}. ` +
    `Their form score is ${Math.round((formScore || 0.8) * 100)}%. ` +
    `Give a brief (10 words max) motivational response.`;
  
  return await createCompletion(
    persona.systemPrompt,
    prompt,
    {
      model: persona.model || 'gpt-4o-mini',
      maxTokens: 30,
      temperature: 0.8
    }
  );
}

/**
 * Generate set completion celebration
 */
export async function generateSetCompletionResponse(persona, exercise, reps, formScore) {
  const prompt = `User just completed a full set of ${exercise}: ${reps} reps with ${Math.round(formScore * 100)}% average form score. ` +
    `Give an enthusiastic celebration (15-20 words). Mention their specific achievement.`;
  
  return await createCompletion(
    persona.systemPrompt,
    prompt,
    {
      model: persona.model || 'gpt-4o-mini',
      maxTokens: 50,
      temperature: 0.9
    }
  );
}

/**
 * Generate time-based periodic feedback
 */
import { EXERCISE } from '../constants/exercises.js';

export async function generatePeriodicFeedbackResponse(persona, exercise, timeSeconds, repCount, avgFormScore, progressRate) {
  let prompt = '';
  
  // Special handling for planks (time-based exercise)
  if (exercise === EXERCISE.PLANKS) {
    if (avgFormScore < 0.6) {
      prompt = `User holding plank for ${timeSeconds}s with poor form. Give brief alignment tip (10-15 words).`;
    } else if (timeSeconds < 15) {
      prompt = `${timeSeconds}s plank hold. Encourage them to breathe and stay strong (10-15 words).`;
    } else if (timeSeconds >= 60) {
      prompt = `Amazing ${timeSeconds}s plank! Give enthusiastic praise (10-15 words).`;
    } else {
      prompt = `${timeSeconds}s plank with ${Math.round(avgFormScore * 100)}% form. Keep encouraging (10-15 words).`;
    }
  } 
  // Regular exercises (rep-based)
  else {
    if (avgFormScore < 0.6) {
      prompt = `User doing ${exercise} for ${timeSeconds}s with poor form (${Math.round(avgFormScore * 100)}%). Give brief form tip (10-15 words).`;
    } else if (progressRate < 10) {
      prompt = `User doing ${exercise} for ${timeSeconds}s. ${repCount} reps done. Encourage steady pace (10-15 words).`;
    } else if (progressRate > 40) {
      prompt = `User doing ${exercise} very fast (${Math.round(progressRate)} reps/min). Remind quality over quantity (10-15 words).`;
    } else if (timeSeconds > 60 && repCount === 0) {
      prompt = `User struggling with ${exercise} for ${timeSeconds}s. Give supportive guidance (10-15 words).`;
    } else {
      // Good progress - vary encouragement
      const encouragements = [
        `${repCount} reps in ${timeSeconds}s! Keep it up!`,
        `Great form at ${Math.round(avgFormScore * 100)}%! Stay strong!`,
        `${timeSeconds}s of solid work! You're doing great!`,
        `Excellent pace! ${repCount} and counting!`
      ];
      prompt = `User doing ${exercise} well. Say: "${encouragements[Math.floor(Math.random() * encouragements.length)]}"`;
    }
  }
  
  return await createCompletion(
    persona.systemPrompt,
    prompt,
    {
      model: persona.model || 'gpt-4o-mini',
      maxTokens: 40,
      temperature: 0.8
    }
  );
}