DROP SCHEMA IF EXISTS data_evidence CASCADE;
CREATE SCHEMA data_evidence;
CREATE TABLE data_evidence.tenants (id text PRIMARY KEY);
INSERT INTO data_evidence.tenants VALUES ('a'), ('b');
CREATE TABLE data_evidence.readings (
  tenant_id text NOT NULL REFERENCES data_evidence.tenants(id),
  id text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE data_evidence.outbox (
  tenant_id text NOT NULL,
  reading_id text NOT NULL,
  body text NOT NULL CHECK (length(body) > 0),
  FOREIGN KEY (tenant_id, reading_id) REFERENCES data_evidence.readings(tenant_id, id)
);
CREATE TABLE data_evidence.counters (id integer PRIMARY KEY, value integer NOT NULL);
INSERT INTO data_evidence.counters VALUES (1, 0);
CREATE TABLE data_evidence.documents (tenant_id text NOT NULL, id text NOT NULL, body text NOT NULL, PRIMARY KEY (tenant_id, id));
INSERT INTO data_evidence.documents VALUES ('a', '1', 'A'), ('b', '1', 'B');
ALTER TABLE data_evidence.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_evidence.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_policy ON data_evidence.documents
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'guardrails_data_app') THEN
    CREATE ROLE guardrails_data_app LOGIN PASSWORD 'local_data_app_only' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT CONNECT ON DATABASE guardrails_data TO guardrails_data_app;
GRANT USAGE ON SCHEMA data_evidence TO guardrails_data_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_evidence.documents TO guardrails_data_app;
