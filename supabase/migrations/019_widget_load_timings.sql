-- Widget load timings: diagnostic rows from embed beacons.
-- Service-role only (RLS on, no policies). No FKs — widget ids span tables.

BEGIN;

CREATE TABLE IF NOT EXISTS widget_load_timings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  widget_id UUID NOT NULL,
  host TEXT NOT NULL,
  data_ms INTEGER,
  renderer_ms INTEGER,
  ok BOOLEAN NOT NULL,
  slower TEXT
);

CREATE INDEX IF NOT EXISTS idx_widget_load_timings_created_at
  ON widget_load_timings (created_at DESC);

ALTER TABLE widget_load_timings ENABLE ROW LEVEL SECURITY;

COMMIT;
