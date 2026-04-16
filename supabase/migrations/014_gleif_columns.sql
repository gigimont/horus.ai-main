-- 014_gleif_columns.sql
-- Add GLEIF LEI and corporate hierarchy columns to targets

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN lei_code text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN parent_company text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN ultimate_parent text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
