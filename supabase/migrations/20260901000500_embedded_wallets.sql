-- PEW-001..014: embedded wallet bindings, user-owned signer grants and the
-- restricted signing operation log. FORCE RLS everywhere, scoped to the resolved
-- internal UUID through `app.user_id` exactly like recipients (PMU-008).
-- Local mirror: src/db/migrations/006_embedded_wallets.sql.
-- Granularity decisions r3: NO expires_at on grants, NO local consumed/reserved
-- budget columns, NO local spending cap. Enforcement lives only in Privy policy
-- configuration. `next_nonce` exists solely to serialize per-wallet nonce use and
-- is never exposed; `intent` preserves the exact confirmed signing intent so a
-- lost signing response can re-sign the IDENTICAL payload (F6).

CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_wallet_id TEXT NOT NULL UNIQUE,
  chain_family TEXT NOT NULL,
  address TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (state IN ('unprovisioned', 'provisioning', 'ready', 'recovery_required', 'conflict', 'unavailable')),
  nonce BIGINT NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.signer_grants (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  provider_policy_id TEXT,
  provider_signer_id TEXT,
  policy_hash TEXT NOT NULL,
  allowlisted_recipients JSONB NOT NULL,
  per_transfer_atomic6 TEXT NOT NULL,
  rolling_total_atomic6 TEXT NOT NULL,
  rolling_window_seconds INTEGER NOT NULL,
  gas_ceiling TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'active', 'revoking', 'revoked', 'unavailable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_operations (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  grant_id UUID NOT NULL,
  conversation_id UUID,
  preview_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'signed', 'submitted', 'confirmed', 'reverted', 'uncertain', 'rejected')),
  intent JSONB NOT NULL,
  payload_hash TEXT,
  signed_tx TEXT,
  tx_hash TEXT,
  nonce BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active selection per user/chain family (PEW-003): only the 'ready' wallet
-- may be the unique active binding for a chain family.
CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_one_active_per_user_chain_idx
  ON public.user_wallets (user_id, chain_family)
  WHERE state = 'ready';

-- One winner per confirmed preview (PEW-008): concurrent confirmations of the
-- same preview cannot create two active operations. Rejected rows do not hold
-- the slot so a genuine re-attempt can create a fresh operation.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_operations_one_active_per_preview_idx
  ON public.wallet_operations (user_id, preview_id)
  WHERE status NOT IN ('rejected');

CREATE INDEX IF NOT EXISTS user_wallets_user_state_idx
  ON public.user_wallets (user_id, state);
CREATE INDEX IF NOT EXISTS signer_grants_user_state_idx
  ON public.signer_grants (user_id, state);
CREATE INDEX IF NOT EXISTS wallet_operations_user_status_idx
  ON public.wallet_operations (user_id, status);
CREATE INDEX IF NOT EXISTS wallet_operations_user_idempotency_idx
  ON public.wallet_operations (user_id, idempotency_key);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.signer_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signer_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_wallets_user_isolation ON public.user_wallets;
CREATE POLICY user_wallets_user_isolation ON public.user_wallets
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS signer_grants_user_isolation ON public.signer_grants;
CREATE POLICY signer_grants_user_isolation ON public.signer_grants
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS wallet_operations_user_isolation ON public.wallet_operations;
CREATE POLICY wallet_operations_user_isolation ON public.wallet_operations
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- NOT VALID FKs: new writes must reference provisioned users/wallets/grants but
-- existing rows (none) are not rewritten. Same pattern as PMU-023. Wrapped in
-- existence checks so re-applying the migration is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_wallets_user_id_users_fk') THEN
    ALTER TABLE public.user_wallets ADD CONSTRAINT user_wallets_user_id_users_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signer_grants_user_id_users_fk') THEN
    ALTER TABLE public.signer_grants ADD CONSTRAINT signer_grants_user_id_users_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signer_grants_wallet_id_wallets_fk') THEN
    ALTER TABLE public.signer_grants ADD CONSTRAINT signer_grants_wallet_id_wallets_fk
      FOREIGN KEY (wallet_id) REFERENCES public.user_wallets(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_operations_user_id_users_fk') THEN
    ALTER TABLE public.wallet_operations ADD CONSTRAINT wallet_operations_user_id_users_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_operations_wallet_id_wallets_fk') THEN
    ALTER TABLE public.wallet_operations ADD CONSTRAINT wallet_operations_wallet_id_wallets_fk
      FOREIGN KEY (wallet_id) REFERENCES public.user_wallets(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_operations_grant_id_grants_fk') THEN
    ALTER TABLE public.wallet_operations ADD CONSTRAINT wallet_operations_grant_id_grants_fk
      FOREIGN KEY (grant_id) REFERENCES public.signer_grants(id) NOT VALID;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO recipient_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signer_grants TO recipient_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_operations TO recipient_app;
