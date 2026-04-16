-- 015_web_enrichment_columns.sql
-- Succession and web enrichment intelligence columns

DO $$ BEGIN ALTER TABLE targets ADD COLUMN is_family_business boolean; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN succession_risk text
    CHECK (succession_risk IN ('high', 'medium', 'low', 'unknown'));
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE targets ADD COLUMN succession_signals jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN founder_age_estimate text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN founder_age_reasoning text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN products_services text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN industries_served text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN geographic_focus text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN key_customers text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN key_suppliers text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN web_analysis jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
