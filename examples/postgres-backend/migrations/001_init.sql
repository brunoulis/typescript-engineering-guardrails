CREATE TABLE auth_user (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 email_verified boolean NOT NULL DEFAULT false, image text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_session (
 id text PRIMARY KEY, token text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES auth_user ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 ip_address text, user_agent text
);
CREATE INDEX auth_session_user_idx ON auth_session(user_id);
CREATE TABLE auth_account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
 user_id text NOT NULL REFERENCES auth_user ON DELETE CASCADE,
 access_token text, refresh_token text, id_token text,
 access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT auth_account_provider_key UNIQUE(provider_id, account_id)
);
CREATE INDEX auth_account_user_idx ON auth_account(user_id);
CREATE TABLE auth_verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
CREATE TABLE tenant (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE membership (
 tenant_id uuid NOT NULL REFERENCES tenant ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES auth_user ON DELETE CASCADE,
 PRIMARY KEY(tenant_id, user_id)
);
CREATE TABLE task (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant,
 owner_id text NOT NULL REFERENCES auth_user, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 80), request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT task_owner_membership FOREIGN KEY(tenant_id, owner_id) REFERENCES membership(tenant_id, user_id),
 CONSTRAINT task_idempotency_key UNIQUE(tenant_id, owner_id, idempotency_key),
 CONSTRAINT task_tenant_key UNIQUE(tenant_id, id)
);
CREATE INDEX task_list_idx ON task(tenant_id, owner_id, id);
CREATE TABLE outbox (
 id uuid PRIMARY KEY, task_id uuid NOT NULL UNIQUE REFERENCES task ON DELETE CASCADE,
 tenant_id uuid NOT NULL, event text NOT NULL CHECK(event = 'task.created'), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT outbox_task_tenant FOREIGN KEY(tenant_id, task_id) REFERENCES task(tenant_id, id)
);

-- Provision this login separately. The application cannot change memberships or its schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_user, auth_session, auth_account, auth_verification TO guardrails_backend_app;
GRANT SELECT ON tenant, membership TO guardrails_backend_app;
GRANT SELECT, INSERT, UPDATE ON task TO guardrails_backend_app;
GRANT INSERT ON outbox TO guardrails_backend_app;
