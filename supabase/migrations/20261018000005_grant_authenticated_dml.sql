DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN

        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.institutions FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.accounts FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.credit_products FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.credit_card_purchases FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.period_obligations FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.incomes FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.obligation_payments FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.internal_transfers FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.financial_audit_log FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.debt_restructure_events FROM authenticated;
        REVOKE SELECT, INSERT, UPDATE, DELETE ON public.recurrent_obligations FROM authenticated;

        GRANT SELECT, INSERT
            ON public.institutions
            TO authenticated;

        GRANT SELECT, INSERT, UPDATE
            ON public.accounts
            TO authenticated;

        GRANT SELECT, INSERT
            ON public.credit_products
            TO authenticated;

        GRANT SELECT
            ON public.credit_card_purchases
            TO authenticated;

        GRANT SELECT, INSERT
            ON public.period_obligations
            TO authenticated;

        GRANT SELECT
            ON public.incomes
            TO authenticated;

    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.institutions
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.accounts
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.credit_products
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.credit_card_purchases
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.period_obligations
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.incomes
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.obligation_payments
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.internal_transfers
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.financial_audit_log
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.debt_restructure_events
            TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON public.recurrent_obligations
            TO service_role;

    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.institutions
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.accounts
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.credit_products
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.credit_card_purchases
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.period_obligations
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.incomes
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.obligation_payments
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.internal_transfers
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.financial_audit_log
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.debt_restructure_events
            FROM anon;

        REVOKE SELECT, INSERT, UPDATE, DELETE
            ON public.recurrent_obligations
            FROM anon;

    END IF;
END $$;
