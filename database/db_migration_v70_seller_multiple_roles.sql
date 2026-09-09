-- Migration v70: Add multiple roles support to sellers table
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS roles text[] DEFAULT '{}'::text[];

-- Migrate existing role values into roles array
UPDATE sellers 
SET roles = ARRAY[role] 
WHERE (roles IS NULL OR cardinality(roles) = 0) AND role IS NOT NULL;
