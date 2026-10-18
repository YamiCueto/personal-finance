DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN

        REVOKE UPDATE ON public.accounts FROM authenticated;

        GRANT UPDATE (is_archived, updated_at, name, color, statement_cutoff_day)
            ON public.accounts
            TO authenticated;

    END IF;
END $$;
