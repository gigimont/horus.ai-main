-- Enable pgvector (in extensions schema)
create extension if not exists vector with schema extensions;

-- Tenants
create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  plan       text not null default 'trial',
  created_at timestamptz default now()
);

-- Users
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references tenants(id) on delete cascade,
  role       text not null default 'member',
  full_name  text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Targets
create table targets (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references tenants(id) on delete cascade,
  name                text not null,
  country             text,
  region              text,
  city                text,
  industry_code       text,
  industry_label      text,
  employee_count      int,
  revenue_eur         bigint,
  founded_year        int,
  owner_age_estimate  int,
  website             text,
  linkedin_url        text,
  raw_data            jsonb,
  embedding           extensions.vector(1536),
  deleted_at          timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Scores
create table target_scores (
  id                uuid primary key default gen_random_uuid(),
  target_id         uuid references targets(id) on delete cascade,
  tenant_id         uuid references tenants(id) on delete cascade,
  overall_score     numeric(4,2),
  transition_score  numeric(4,2),
  value_score       numeric(4,2),
  market_score      numeric(4,2),
  financial_score   numeric(4,2),
  rationale         text,
  key_signals       text[],
  scored_at         timestamptz default now(),
  model_version     text default 'v1'
);

-- Clusters
create table clusters (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  label        text,
  description  text,
  cluster_type text,
  centroid     extensions.vector(1536),
  member_count int,
  metadata     jsonb,
  created_at   timestamptz default now()
);

-- Cluster members
create table cluster_members (
  cluster_id  uuid references clusters(id) on delete cascade,
  target_id   uuid references targets(id) on delete cascade,
  distance    numeric,
  primary key (cluster_id, target_id)
);

-- Pipeline entries
create table pipeline_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  target_id   uuid references targets(id),
  stage       text not null default 'watchlist',
  notes       text,
  assigned_to uuid references users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Chat sessions
create table chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  user_id      uuid references users(id),
  context_type text,
  context_id   uuid,
  messages     jsonb not null default '[]',
  created_at   timestamptz default now()
);
