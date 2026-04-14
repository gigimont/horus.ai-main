-- supabase/migrations/012_network_edges.sql
create table if not exists network_edges (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  scenario_id       uuid not null references rollup_scenarios(id) on delete cascade,
  source_target_id  uuid not null references targets(id),
  dest_target_id    uuid not null references targets(id),
  edge_type         text not null check (edge_type in (
                      'supply_chain', 'geographic', 'industry',
                      'customer_overlap', 'vendor_overlap'
                    )),
  strength          float not null default 0.5 check (strength >= 0 and strength <= 1),
  description       text,
  metadata          jsonb default '{}',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table network_edges enable row level security;

create policy "tenant_isolation" on network_edges
  for all using (tenant_id = get_tenant_id());

create index idx_network_edges_scenario on network_edges(scenario_id);
create index idx_network_edges_source   on network_edges(source_target_id);
create index idx_network_edges_dest     on network_edges(dest_target_id);

create unique index idx_network_edges_unique
  on network_edges(scenario_id, source_target_id, dest_target_id, edge_type);
