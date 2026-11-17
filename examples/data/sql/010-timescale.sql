CREATE EXTENSION IF NOT EXISTS timescaledb;
DROP SCHEMA IF EXISTS ts_evidence CASCADE;
CREATE SCHEMA ts_evidence;
CREATE TABLE ts_evidence.metrics (
  tenant_id text NOT NULL, device text NOT NULL, at timestamptz NOT NULL,
  value double precision NOT NULL CHECK (value >= 0),
  PRIMARY KEY (tenant_id,device,at)
);
SELECT create_hypertable('ts_evidence.metrics', by_range('at', INTERVAL '1 day'));
SELECT add_dimension('ts_evidence.metrics', by_hash('tenant_id', 2));
CREATE INDEX ON ts_evidence.metrics(tenant_id, at DESC);
CREATE MATERIALIZED VIEW ts_evidence.hourly
WITH (timescaledb.continuous, timescaledb.materialized_only=true)
AS SELECT tenant_id, time_bucket(INTERVAL '1 hour',at) AS bucket, sum(value) AS total
FROM ts_evidence.metrics GROUP BY tenant_id,bucket WITH NO DATA;
-- Aggregation fixture is separate from the relational RLS fixture. No inherited RLS claim.
REVOKE ALL ON SCHEMA ts_evidence FROM PUBLIC;
REVOKE ALL ON ts_evidence.hourly FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='guardrails_metrics_a') THEN
    CREATE ROLE guardrails_metrics_a LOGIN PASSWORD 'local_metrics_a_only' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
-- This dedicated role has one tenant fixed by the DB view, no tenant input or raw/aggregate access.
CREATE VIEW ts_evidence.tenant_a_hourly WITH (security_barrier=true) AS
  SELECT tenant_id,bucket,total FROM ts_evidence.hourly WHERE tenant_id='a';
GRANT USAGE ON SCHEMA ts_evidence TO guardrails_metrics_a;
GRANT SELECT ON ts_evidence.tenant_a_hourly TO guardrails_metrics_a;
ALTER TABLE ts_evidence.metrics SET (
  timescaledb.enable_columnstore=true,
  timescaledb.segmentby='tenant_id,device', timescaledb.orderby='at DESC'
);
