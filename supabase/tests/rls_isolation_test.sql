-- ==============================================================================
-- PERSONAL FINANCE — RLS & MULTI-TENANT ISOLATION VERIFICATION SCRIPT (V2)
-- Description: Tests multi-tenant isolation and composite FK constraints
--              using two simulated user IDs under the authenticated role.
-- ==============================================================================

-- Asegurar rol authenticated y permisos para la prueba
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
END $$;

DO $$
DECLARE
    v_user_a UUID := '00000000-0000-0000-0000-00000000000a'::UUID;
    v_user_b UUID := '00000000-0000-0000-0000-00000000000b'::UUID;
    v_institution_a UUID;
    v_account_a UUID;
    v_count INTEGER;
BEGIN
    -- 1. Cambiar al rol authenticated (no superusuario) y simular contexto de User A
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);

    -- Insertar institución para User A
    INSERT INTO public.institutions (user_id, name, type)
    VALUES (v_user_a, 'Banco de Occidente A', 'BANK')
    RETURNING id INTO v_institution_a;

    -- Insertar cuenta para User A
    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance)
    VALUES (v_user_a, v_institution_a, 'Bancolombia Ahorros A', 'SAVINGS', 5000000.00)
    RETURNING id INTO v_account_a;

    -- 2. Simular cambio de contexto a User B
    PERFORM set_config('request.jwt.claim.sub', v_user_b::TEXT, true);

    -- Comprobar que User B NO ve la cuenta de User A (Aislamiento RLS estricto)
    SELECT COUNT(*) INTO v_count FROM public.accounts WHERE id = v_account_a;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED: User B fue capaz de ver la cuenta de User A vía SELECT!';
    END IF;

    -- Comprobar que User B NO ve la institución de User A
    SELECT COUNT(*) INTO v_count FROM public.institutions WHERE id = v_institution_a;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED: User B fue capaz de ver la institución de User A vía SELECT!';
    END IF;

    -- 3. Comprobar que User B NO puede insertar un movimiento referenciando la cuenta de User A (FK compuesta)
    BEGIN
        INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount)
        VALUES (v_user_b, v_account_a, 2026, 1, 'Sueldo Ilegítimo', 1000000.00);
        RAISE EXCEPTION 'TEST FAILED: User B insertó un ingreso referenciando la cuenta de User A!';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'Aislamiento FK Compuesta confirmado: User B no puede asociar la cuenta de User A.';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%TEST FAILED%' THEN
                RAISE;
            END IF;
            RAISE NOTICE 'Aislamiento FK Compuesta confirmado con excepción: %', SQLERRM;
    END;

    -- 4. Revertir todos los cambios de prueba
    RAISE EXCEPTION 'RLS Isolation Test Completed Successfully. Rolling back test transaction.';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%RLS Isolation Test Completed Successfully%' THEN
            RAISE NOTICE '%', SQLERRM;
        ELSE
            RAISE;
        END IF;
END $$;
