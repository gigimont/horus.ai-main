create policy "tenant_isolation_pipeline_insert" on pipeline_entries
  for insert with check (tenant_id = get_tenant_id());

create policy "tenant_isolation_pipeline_update" on pipeline_entries
  for update using (tenant_id = get_tenant_id());

create policy "tenant_isolation_pipeline_delete" on pipeline_entries
  for delete using (tenant_id = get_tenant_id());
