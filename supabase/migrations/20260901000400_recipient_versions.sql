-- Owner-scoped recipient version history (PMU-010 / design r2026-09-08).
-- recipients stays the stable-id current projection; every PATCH snapshots the
-- prior values here inside the same transaction that advances the projection.
-- Ordered history migration after users in the supabase chain.

CREATE TABLE IF NOT EXISTS public.recipient_versions (
  recipient_id UUID NOT NULL,
  user_id UUID NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_id, version),
  FOREIGN KEY (recipient_id) REFERENCES public.recipients(id) NOT VALID
);

CREATE INDEX IF NOT EXISTS recipient_versions_user_idx
  ON public.recipient_versions (user_id, recipient_id, version DESC);

ALTER TABLE public.recipient_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY recipient_versions_user_isolation ON public.recipient_versions
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT ON public.recipient_versions TO recipient_app;
