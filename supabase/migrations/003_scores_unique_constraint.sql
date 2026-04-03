-- Add unique constraint on target_id so upsert works cleanly
-- (one score record per target per model version)
alter table target_scores
  add constraint target_scores_target_id_model_version_key
  unique (target_id, model_version);
