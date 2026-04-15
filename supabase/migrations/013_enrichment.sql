-- 013_enrichment.sql
-- Enrichment jobs: one record per enrichment run for a target
create table if not exists enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  target_id uuid not null references targets(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'partial', 'failed')),
  providers_completed text[] default '{}',
  providers_failed text[] default '{}',
  data_before jsonb default '{}',
  data_enriched jsonb default '{}',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table enrichment_jobs enable row level security;
create policy "tenant_isolation" on enrichment_jobs
  for all using (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

create index idx_enrichment_jobs_target on enrichment_jobs(target_id);
create index idx_enrichment_jobs_status on enrichment_jobs(status);

-- Per-provider results within a job
create table if not exists enrichment_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references enrichment_jobs(id) on delete cascade,
  provider text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  raw_response jsonb default '{}',
  extracted_data jsonb default '{}',
  confidence float default 0.0 check (confidence >= 0 and confidence <= 1),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_enrichment_sources_job on enrichment_sources(job_id);

-- Enrichment metadata on targets
DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN enrichment_status text DEFAULT 'none'
    CHECK (enrichment_status IN ('none','pending','enriched','partial','failed'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN last_enriched_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN enrichment_data jsonb DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN legal_form text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN share_capital text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN directors text[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN director_roles jsonb DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN registration_number text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN registration_authority text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN opencorporates_url text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN data_sources text[] DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
