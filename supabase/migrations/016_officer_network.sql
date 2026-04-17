-- 016_officer_network.sql
-- Store detected officer network relationships

CREATE TABLE IF NOT EXISTS officer_network (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  officer_name text NOT NULL,
  normalized_name text NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('exact', 'family_name')),
  target_ids uuid[] NOT NULL,
  target_names text[] NOT NULL,
  roles text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  detected_at timestamptz DEFAULT now()
);

ALTER TABLE officer_network ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON officer_network
    FOR ALL USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_officer_network_tenant ON officer_network(tenant_id);
CREATE INDEX IF NOT EXISTS idx_officer_network_name ON officer_network(normalized_name);
