-- Demo tenant
insert into tenants (id, name, slug, plan) values
  ('00000000-0000-0000-0000-000000000001', 'Demo Fund', 'demo-fund', 'pro');

-- Sample targets
insert into targets (tenant_id, name, country, region, city, industry_label, industry_code, employee_count, revenue_eur, founded_year, owner_age_estimate) values
  ('00000000-0000-0000-0000-000000000001', 'Bianchi Impianti Srl',   'IT', 'Lombardia',        'Brescia',  'Industrial equipment servicing', 'C28', 45, 4200000,  1987, 64),
  ('00000000-0000-0000-0000-000000000001', 'Müller Haustechnik GmbH','DE', 'Bayern',            'Munich',   'HVAC installation & maintenance','F43', 32, 3100000,  1991, 61),
  ('00000000-0000-0000-0000-000000000001', 'García Logística S.L.',  'ES', 'Cataluña',          'Barcelona','Last-mile logistics',           'H49', 78, 8700000,  1995, 58),
  ('00000000-0000-0000-0000-000000000001', 'Dubois Menuiserie SARL', 'FR', 'Auvergne-Rhône-Alpes','Lyon',   'Custom joinery & woodwork',     'C16', 19, 1900000,  1983, 67),
  ('00000000-0000-0000-0000-000000000001', 'Kowalski Stal Sp. z o.o.','PL','Śląskie',           'Katowice', 'Steel fabrication',             'C24', 61, 5500000,  1989, 62);
