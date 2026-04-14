-- supabase/migrations/011_scenario_results.sql
create table if not exists scenario_results (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id),
  target_id               uuid not null references targets(id) on delete cascade,
  rollup_scenario_id      uuid references rollup_scenarios(id) on delete set null,
  scenario_type           text not null check (scenario_type in ('macro_shock','industry_shift','succession_trigger')),
  severity                int not null check (severity between 1 and 10),
  description             text not null,
  score_before            jsonb not null,
  score_deltas            jsonb not null,
  implications            text[] not null,
  acquisition_window_effect text not null,
  model_version           text not null default 'v1',
  run_at                  timestamptz not null default now()
);

alter table scenario_results enable row level security;

create policy "tenant isolation" on scenario_results
  using (tenant_id = get_tenant_id());
