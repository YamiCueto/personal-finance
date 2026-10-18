-- ==============================================================================
-- PERSONAL FINANCE — RLS & MULTI-TENANT ISOLATION VERIFICATION SCRIPT (V2 EXTENDED)
-- Incluye casos adicionales: UPDATE cruzado, RPC con p_user_id manipulado, rol anon
-- ==============================================================================

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
    v_institution_b UUID;
    v_account_b UUID;
    v_income_a UUID;
    v_count INTEGER;
    v_affected INTEGER;
BEGIN
    -- Simular contexto de User A
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);

    -- Setup User A
    INSERT INTO public.institutions (user_id, name, type) VALUES (v_user_a, 'Banco Test A', 'BANK') RETURNING id INTO v_institution_a;
    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance) VALUES (v_user_a, v_institution_a, 'Cuenta A', 'SAVINGS', 5000000.00) RETURNING id INTO v_account_a;
    INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount, received_date) VALUES (v_user_a, v_account_a, 2026, 1, 'Salario A', 1000000.00, CURRENT_DATE) RETURNING id INTO v_income_a;

    -- Simular contexto de User B
    PERFORM set_config('request.jwt.claim.sub', v_user_b::TEXT, true);

    -- Setup User B
    INSERT INTO public.institutions (user_id, name, type) VALUES (v_user_b, 'Banco Test B', 'BANK') RETURNING id INTO v_institution_b;
    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance) VALUES (v_user_b, v_institution_b, 'Cuenta B', 'SAVINGS', 3000000.00) RETURNING id INTO v_account_b;

    -- RLS-01: SELECT cruzado — User B no ve cuentas de User A
    SELECT COUNT(*) INTO v_count FROM public.accounts WHERE id = v_account_a;
    IF v_count <> 0 THEN RAISE EXCEPTION 'RLS-01 FAILED: User B ve la cuenta de User A via SELECT'; END IF;
    RAISE NOTICE 'RLS-01 PASSED: SELECT cross-user aislado correctamente';

    -- RLS-02: UPDATE cruzado — User B no puede modificar cuenta de User A
    UPDATE public.accounts SET current_balance = 0 WHERE id = v_account_a;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 0 THEN RAISE EXCEPTION 'RLS-02 FAILED: User B modificó cuenta de User A via UPDATE'; END IF;
    RAISE NOTICE 'RLS-02 PASSED: UPDATE cross-user bloqueado correctamente';

    -- RLS-03: INSERT con FK compuesta cruzada — User B referencia cuenta de User A
    BEGIN
        INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount, received_date)
        VALUES (v_user_b, v_account_a, 2026, 1, 'Sueldo Ilegitimo', 500000.00, CURRENT_DATE);
        RAISE EXCEPTION 'RLS-03 FAILED: User B insertó ingreso referenciando cuenta de User A';
    EXCEPTION
        WHEN foreign_key_violation THEN RAISE NOTICE 'RLS-03 PASSED: FK compuesta bloqueó referencia cruzada';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-03 PASSED con excepción: %', SQLERRM;
    END;

    -- RLS-04: RPC record_income con p_user_id de User A siendo User B la sesión activa
    BEGIN
        PERFORM public.record_income(
            v_user_a,
            v_account_a,
            2026, 1,
            'Ingreso RPC Manipulado',
            999999.00,
            CURRENT_DATE,
            'idem-rls04-test',
            NULL
        );
        RAISE EXCEPTION 'RLS-04 FAILED: RPC record_income aceptó p_user_id de User A siendo sesión de User B';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-04 PASSED: RPC rechazó p_user_id cruzado: %', SQLERRM;
    END;

    -- RLS-05: RPC record_income sin autenticación (sesión nula simulada)
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
        PERFORM public.record_income(
            v_user_a,
            v_account_a,
            2026, 1,
            'Ingreso Anonimo',
            100.00,
            CURRENT_DATE,
            'idem-rls05-test',
            NULL
        );
        RAISE EXCEPTION 'RLS-05 FAILED: RPC record_income aceptó sesión anónima con p_user_id forjado';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-05 PASSED: RPC rechazó sesión sin autenticación: %', SQLERRM;
    END;

    -- Restaurar contexto User B para verificar que reverso doble falla
    PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);

    -- RLS-06: Doble reverso — User A revierte su propio ingreso dos veces
    BEGIN
        PERFORM public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Primer reverso de prueba');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
        RAISE NOTICE 'RLS-06 primer reverso: %', SQLERRM;
    END;

    BEGIN
        PERFORM public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Segundo reverso de prueba');
        RAISE EXCEPTION 'RLS-06 FAILED: segundo reverso del mismo ingreso fue aceptado';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-06 PASSED: segundo reverso rechazado correctamente: %', SQLERRM;
    END;

    -- Finalizar con rollback total para no persistir datos de prueba
    RAISE EXCEPTION 'RLS Isolation Test V2 Completed Successfully. Rolling back test transaction.';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%RLS Isolation Test V2 Completed Successfully%' THEN
            RAISE NOTICE '%', SQLERRM;
        ELSE
            RAISE;
        END IF;
END $$;
