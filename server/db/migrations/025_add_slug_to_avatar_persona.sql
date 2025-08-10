-- 025_add_slug_to_avatar_persona.sql
-- Add slug field to AvatarPersona and populate it based on name

ALTER TABLE "AvatarPersona"
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Function to generate slug from name
DO $$
DECLARE
    persona RECORD;
    base_name TEXT;
    slug_var TEXT;
BEGIN
    FOR persona IN SELECT id, name FROM "AvatarPersona" LOOP
        -- Take string before first '-' if present, else full name
        IF position('-' IN persona.name) > 0 THEN
            base_name := split_part(persona.name, '-', 1);
        ELSE
            base_name := persona.name;
        END IF;
        -- Trim spaces, replace internal spaces with '-', lowercase
        slug_var := lower(regexp_replace(trim(base_name), '\s+', '-', 'g'));
        -- Update the record
        UPDATE "AvatarPersona" SET slug = slug_var WHERE id = persona.id;
    END LOOP;
END $$;

-- Add unique index if desired
CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_persona_slug ON "AvatarPersona"(slug); 