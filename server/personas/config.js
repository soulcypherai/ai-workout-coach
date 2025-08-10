import pool from '../db/index.js';

// Simple in-memory cache for avatar personas
const personaCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetches a single avatar persona from the database, with caching
export async function getAvatarPersona(avatarId) {
  // Check cache first
  const cached = personaCache.get(avatarId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Try fetching from the database
  const query = `
    SELECT id, name, category, system_prompt as "systemPrompt", personality, voice_id as "voiceId", model_uri as "modelUri", pricing_per_min as "pricingPerMin", vision_enabled as "visionEnabled", vision_capture_interval as "visionCaptureInterval", reference_outfits as "referenceOutfits", meta
    FROM "AvatarPersona"
    WHERE id = $1;
  `;
  
  try {
    const result = await pool.query(query, [avatarId]);
    if (result.rows.length > 0) {
      const persona = result.rows[0];
      // Cache the result
      personaCache.set(avatarId, {
        data: persona,
        timestamp: Date.now()
      });
      return persona;
    }
  } catch (error) {
    console.error('Error fetching avatar persona from DB:', error);
  }

  // If not found, try to get the default persona
  const defaultQuery = `
    SELECT id, name, category, system_prompt as "systemPrompt", personality, voice_id as "voiceId", model_uri as "modelUri", pricing_per_min as "pricingPerMin", vision_enabled as "visionEnabled", vision_capture_interval as "visionCaptureInterval", reference_outfits as "referenceOutfits", meta
    FROM "AvatarPersona"
    WHERE name = 'AI Assistant';
  `;
  
  try {
    const defaultResult = await pool.query(defaultQuery);
    if (defaultResult.rows.length > 0) {
      return defaultResult.rows[0];
    }
  } catch (error) {
    console.error('Error fetching default avatar persona from DB:', error);
  }

  console.error(`[Config] Could not find any persona for ${avatarId} or a default.`);
  return null;
}

// Fetches all avatar personas from the database
export async function getAllPersonas() {
  const query = `
    SELECT id, name, category, system_prompt as "systemPrompt", personality, voice_id as "voiceId", model_uri as "modelUri", pricing_per_min as "pricingPerMin", vision_enabled as "visionEnabled", vision_capture_interval as "visionCaptureInterval", reference_outfits as "referenceOutfits", meta
    FROM "AvatarPersona";
  `;

  try {
    const result = await pool.query(query);
    return result.rows.reduce((acc, persona) => {
      acc[persona.id] = persona;
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching all personas:', error);
    return {};
  }
}

// Fetches only the voice ID for a given persona
export async function getPersonaVoiceId(avatarId) {
  const persona = await getAvatarPersona(avatarId);
  return persona ? persona.voiceId : null;
}

// Clear cache for a specific persona or all personas
export function clearPersonaCache(avatarId = null) {
  if (avatarId) {
    personaCache.delete(avatarId);
  } else {
    personaCache.clear();
  }
}