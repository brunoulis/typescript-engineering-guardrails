-- Expand: old explicit-column clients remain compatible. No destructive down migration.
SET lock_timeout = '2s';
ALTER TABLE data_evidence.readings ADD COLUMN unit text;
UPDATE data_evidence.readings SET unit = 'count' WHERE unit IS NULL;
ALTER TABLE data_evidence.readings ALTER COLUMN unit SET DEFAULT 'count';
ALTER TABLE data_evidence.readings ADD CONSTRAINT unit_present CHECK (unit IS NOT NULL) NOT VALID;
ALTER TABLE data_evidence.readings VALIDATE CONSTRAINT unit_present;
-- Contract/drop of obsolete fields is deliberately a later deployment decision.
