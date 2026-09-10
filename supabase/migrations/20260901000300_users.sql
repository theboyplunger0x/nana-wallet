-- PMU-003/004/006/022: users table, FORCE RLS, owner-only provisioning,
-- SECURITY DEFINER idempotent DID->UUID resolution, NOT VALID FKs.
-- No demo sentinel row is inserted here: demo startup owns the configured UUID.
-- Mirror of src/db/migrations/004_users.sql (extensions schema for pgcrypto).

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  privy_did TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Provisioning policy: restricted to the actual migration owner role, so a
-- NOBYPASSRLS owner can still provision identities under FORCE RLS.
DO $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS users_provisioning ON %I', 'users');
  EXECUTE format(
    'CREATE POLICY users_provisioning ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
    'users', current_user
  );
END
$$;

-- Self-isolation policy for the application role (PMU-006).
CREATE POLICY user_self_isolation ON public.users
  FOR ALL TO recipient_app
  USING (id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::uuid);

REVOKE ALL ON public.users FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO recipient_app;

-- Idempotent DID -> UUID resolution (PMU-003). Concurrent first logins race on
-- the privy_did unique constraint; the losing insert updates last_seen_at and
-- returns the existing id. SECURITY DEFINER keeps provisioning owner-scoped so
-- no BYPASSRLS role is introduced.
CREATE OR REPLACE FUNCTION public.users_ensure_for_privy_did(p_privy_did TEXT, p_display_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.users (privy_did, display_name)
  VALUES (p_privy_did, p_display_name)
  ON CONFLICT (privy_did) DO UPDATE SET last_seen_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.users_ensure_for_privy_did(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.users_ensure_for_privy_did(TEXT, TEXT) FROM recipient_app;

-- PMU-023: prerequisite conversation tables exist in earlier migrations; the
-- user-scoped foreign keys attach NOT VALID so existing demo rows are not
-- rewritten while all new writes must reference a provisioned user.
ALTER TABLE public.recipients ADD CONSTRAINT recipients_user_id_users_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_user_id_users_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
