-- Local mirror of supabase/migrations/20260901000600_conversation_language_default_en.sql
ALTER TABLE public.conversation_state ALTER COLUMN language SET DEFAULT 'en';
