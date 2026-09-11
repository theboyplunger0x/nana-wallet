-- New sessions open in English by default (was 'es').
--
-- The persisted value stays authoritative per session: detection still switches
-- a session to Spanish on the first turn with clear Spanish evidence, so this
-- changes the starting language, not the supported set.
ALTER TABLE public.conversation_state ALTER COLUMN language SET DEFAULT 'en';
