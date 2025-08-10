-- Migration: Add exercise tracking tables
-- This migration adds support for AI fitness coach features

-- Link exercise sessions to existing CallSession
CREATE TABLE IF NOT EXISTS exercise_sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES "User"(id) NOT NULL,
  avatar_id UUID REFERENCES "AvatarPersona"(id) NOT NULL,
  call_session_id UUID REFERENCES "CallSession"(id),
  workout_plan_id INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  total_exercises INTEGER DEFAULT 0,
  completed_exercises INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track individual exercise sets
CREATE TABLE IF NOT EXISTS exercise_sets (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES exercise_sessions(id) NOT NULL,
  exercise_name VARCHAR(255) NOT NULL,
  target_reps INTEGER,
  completed_reps INTEGER NOT NULL,
  form_score DECIMAL(3,2),
  rest_duration INTEGER, -- seconds
  feedback JSONB, -- Store form corrections and tips
  keypoints JSONB, -- Compressed pose data for analysis
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User fitness profile for personalization
CREATE TABLE IF NOT EXISTS user_fitness_profile (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES "User"(id) UNIQUE NOT NULL,
  fitness_level VARCHAR(50), -- beginner, intermediate, advanced
  goals JSONB, -- {strength: true, cardio: true, flexibility: true}
  injuries JSONB, -- [{bodyPart: "knee", severity: "mild", date: "2024-01-01"}]
  preferences JSONB, -- {preferredExercises: [], avoidExercises: []}
  equipment_available JSONB, -- ["dumbbells", "resistance_bands", "mat"]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pre-designed workout plans
CREATE TABLE IF NOT EXISTS workout_plans (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES "User"(id),
  avatar_id UUID REFERENCES "AvatarPersona"(id),
  plan_name VARCHAR(255) NOT NULL,
  exercises JSONB NOT NULL, -- [{name: "Squats", sets: 3, reps: 12, rest: 60}]
  difficulty_level VARCHAR(50),
  focus_areas JSONB, -- ["legs", "core", "cardio"]
  duration_minutes INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track personal records and achievements
CREATE TABLE IF NOT EXISTS exercise_achievements (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES "User"(id) NOT NULL,
  exercise_name VARCHAR(255) NOT NULL,
  achievement_type VARCHAR(100), -- "personal_record", "milestone", "streak"
  value INTEGER NOT NULL, -- reps, days, etc.
  milestone_image_url TEXT, -- Optional celebration photo
  achieved_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, exercise_name, achievement_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user_id ON exercise_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sessions_avatar_id ON exercise_sessions(avatar_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sets_session_id ON exercise_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise_name ON exercise_sets(exercise_name);
CREATE INDEX IF NOT EXISTS idx_user_fitness_profile_user_id ON user_fitness_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_achievements_user_id ON exercise_achievements(user_id);

-- Add coach category to AvatarPersona if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'AvatarPersona' 
    AND column_name = 'category'
  ) THEN
    -- Category already exists from previous migrations
    NULL;
  END IF;
END $$;

-- Update existing personas to set coach category (example)
-- UPDATE "AvatarPersona" 
-- SET category = 'coach'
-- WHERE name ILIKE '%coach%' OR name ILIKE '%trainer%' OR name ILIKE '%fitness%';

-- Seed data for common exercises (optional)
-- Only insert seed data if no coach personas exist yet
INSERT INTO workout_plans (avatar_id, plan_name, exercises, difficulty_level, focus_areas, duration_minutes)
SELECT 
  id,
  'Beginner Full Body',
  '[
    {"name": "Squats", "sets": 3, "reps": 10, "rest": 60},
    {"name": "Push-ups", "sets": 3, "reps": 8, "rest": 60},
    {"name": "Lunges", "sets": 3, "reps": 10, "rest": 60},
    {"name": "Jumping Jacks", "sets": 3, "reps": 15, "rest": 45}
  ]'::jsonb,
  'beginner',
  '["full_body", "strength", "cardio"]'::jsonb,
  20
FROM "AvatarPersona"
WHERE category = 'coach'
LIMIT 1
ON CONFLICT DO NOTHING;