alter table targets
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists geocoded_at timestamptz;

create index if not exists targets_lat_lng_idx
  on targets (lat, lng)
  where lat is not null and lng is not null;
