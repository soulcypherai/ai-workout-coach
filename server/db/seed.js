import pg from 'pg';
import 'dotenv/config';
import { getAllPersonas } from '../personas/config.js';

const { Pool } = pg;

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const personasObject = await getAllPersonas();
  const personas = Object.values(personasObject);

  console.log('Seeding database from server/personas/config.js...');

  try {
    for (const persona of personas) {
      // The config.js file does not have pricing, so we'll default it.
      const pricing_per_min = persona.pricing_per_min || 10; 

      await pool.query(
        `INSERT INTO "AvatarPersona" (id, name, system_prompt, personality, voice_id, model_uri, pricing_per_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           system_prompt = EXCLUDED.system_prompt,
           personality = EXCLUDED.personality,
           voice_id = EXCLUDED.voice_id,
           model_uri = EXCLUDED.model_uri,
           pricing_per_min = EXCLUDED.pricing_per_min,
           updated_at = NOW();`,
        [
          persona.id,
          persona.name,
          persona.systemPrompt, // Note the property name difference
          persona.personality,
          persona.voiceId, // Note the property name difference
          persona.model_uri || `/models/${persona.id}.glb`, // Fallback for model_uri
          pricing_per_min,
        ]
      );
      console.log(`Upserted persona: ${persona.name}`);
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await pool.end();
    console.log('Database seeding complete.');
  }
}

seed(); 