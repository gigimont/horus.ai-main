-- supabase/migrations/010_rollup_rls_fix.sql
-- Fix RLS policies to use get_tenant_id(), add missing index and check constraints

-- Drop old policies
drop policy if exists "tenant_isolation_rollup_scenarios" on rollup_scenarios;
drop policy if exists "tenant_isolation_rollup_scenario_targets" on rollup_scenario_targets;

-- Recreate with get_tenant_id() and explicit WITH CHECK
create policy "tenant_isolation_rollup_scenarios"
  on rollup_scenarios for all
  using (tenant_id = get_tenant_id())
  with check (tenant_id = get_tenant_id());

create policy "tenant_isolation_rollup_scenario_targets"
  on rollup_scenario_targets for all
  using (scenario_id in (
    select id from rollup_scenarios where tenant_id = get_tenant_id()
  ))
  with check (scenario_id in (
    select id from rollup_scenarios where tenant_id = get_tenant_id()
  ));

-- Add missing tenant index
create index if not exists rollup_scenarios_tenant_id_idx
  on rollup_scenarios (tenant_id);

-- Add CHECK constraints
alter table rollup_scenarios
  add constraint rollup_scenarios_status_check
  check (status in ('draft', 'active', 'archived'));

alter table rollup_scenario_targets
  add constraint rollup_scenario_targets_margin_source_check
  check (ebitda_margin_source in ('ai', 'manual'));
