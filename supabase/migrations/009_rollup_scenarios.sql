-- supabase/migrations/009_rollup_scenarios.sql

create table if not exists rollup_scenarios (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  description   text,
  status        text not null default 'draft',
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists rollup_scenario_targets (
  id                    uuid primary key default gen_random_uuid(),
  scenario_id           uuid not null references rollup_scenarios(id) on delete cascade,
  target_id             uuid not null references targets(id) on delete cascade,
  sequence_order        int not null default 0,
  entry_multiple        numeric(5,2) not null default 6.0,
  ebitda_margin_pct     numeric(5,2),
  ebitda_margin_source  text not null default 'ai',
  synergy_pct           numeric(5,2) not null default 15.0,
  revenue_uplift_pct    numeric(5,2) not null default 0.0,
  debt_pct              numeric(5,2) not null default 50.0,
  integration_cost_eur  bigint not null default 0,
  hold_period_years     int not null default 5,
  notes                 text,
  created_at            timestamptz not null default now(),
  constraint rollup_scenario_targets_scenario_target_unique unique (scenario_id, target_id)
);

create index if not exists rollup_scenario_targets_scenario_order_idx
  on rollup_scenario_targets (scenario_id, sequence_order);

-- RLS
alter table rollup_scenarios enable row level security;
alter table rollup_scenario_targets enable row level security;

create policy "tenant_isolation_rollup_scenarios"
  on rollup_scenarios for all
  using (tenant_id = (
    select tenant_id from users where id = auth.uid()
  ));

create policy "tenant_isolation_rollup_scenario_targets"
  on rollup_scenario_targets for all
  using (scenario_id in (
    select id from rollup_scenarios
    where tenant_id = (select tenant_id from users where id = auth.uid())
  ));
