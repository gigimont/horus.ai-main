-- Enable RLS on all tables
alter table tenants          enable row level security;
alter table users            enable row level security;
alter table targets          enable row level security;
alter table target_scores    enable row level security;
alter table clusters         enable row level security;
alter table cluster_members  enable row level security;
alter table pipeline_entries enable row level security;
alter table chat_sessions    enable row level security;

-- Helper function: get tenant_id from JWT
create or replace function get_tenant_id()
returns uuid language sql stable
as $$ select (auth.jwt() ->> 'tenant_id')::uuid $$;

-- Targets
create policy "tenant_isolation_targets" on targets
  using (tenant_id = get_tenant_id());

-- Target scores
create policy "tenant_isolation_scores" on target_scores
  using (tenant_id = get_tenant_id());

-- Clusters
create policy "tenant_isolation_clusters" on clusters
  using (tenant_id = get_tenant_id());

-- Cluster members (join through target)
create policy "tenant_isolation_cluster_members" on cluster_members
  using (target_id in (select id from targets where tenant_id = get_tenant_id()));

-- Pipeline entries
create policy "tenant_isolation_pipeline" on pipeline_entries
  using (tenant_id = get_tenant_id());

-- Chat sessions
create policy "tenant_isolation_chat" on chat_sessions
  using (tenant_id = get_tenant_id());

-- Users (can only see own tenant's users)
create policy "tenant_isolation_users" on users
  using (tenant_id = get_tenant_id());
