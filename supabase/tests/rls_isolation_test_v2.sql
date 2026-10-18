-- ==============================================================================
-- PERSONAL FINANCE — RLS & MULTI-TENANT ISOLATION VERIFICATION SCRIPT (V2)
-- Ejecutar en el SQL Editor de Supabase staging con un usuario autenticado
-- (no requiere ni crea roles extra; asume que los roles authenticated/anon
-- existen y están configurados por Supabase)
--
-- Prerequisito: las tres migraciones aplicadas en staging
-- Ejecutar como: usuario de servicio en el SQL Editor de Supabase
--
-- El script finaliza con ROLLBACK total: no persiste datos de prueba.
-- ==============================================================================

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
    v_first_reversal_ok BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    -- -----------------------------------------------------------------------
    -- SETUP: insertar datos de prueba como User A y User B
    -- En staging, set_config simula el contexto de sesión JWT para RLS
    -- -----------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);

    INSERT INTO public.institutions (user_id, name, type)
        VALUES (v_user_a, 'Banco Test A', 'BANK')
        RETURNING id INTO v_institution_a;

    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance)
        VALUES (v_user_a, v_institution_a, 'Cuenta A', 'SAVINGS', 5000000.00)
        RETURNING id INTO v_account_a;

    INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount, received_date)
        VALUES (v_user_a, v_account_a, 2026, 1, 'Salario A', 1000000.00, CURRENT_DATE)
        RETURNING id INTO v_income_a;

    PERFORM set_config('request.jwt.claim.sub', v_user_b::TEXT, true);

    INSERT INTO public.institutions (user_id, name, type)
        VALUES (v_user_b, 'Banco Test B', 'BANK')
        RETURNING id INTO v_institution_b;

    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance)
        VALUES (v_user_b, v_institution_b, 'Cuenta B', 'SAVINGS', 3000000.00)
        RETURNING id INTO v_account_b;

    -- -----------------------------------------------------------------------
    -- RLS-01: SELECT cross-user — User B no puede ver cuentas de User A
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_count
        FROM public.accounts
        WHERE id = v_account_a;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'RLS-01 FAILED: User B ve la cuenta de User A via SELECT (% filas)', v_count;
    END IF;
    RAISE NOTICE 'RLS-01 PASSED: SELECT cross-user — 0 filas devueltas';

    -- -----------------------------------------------------------------------
    -- RLS-02: UPDATE cross-user — User B no puede modificar cuenta de User A
    -- -----------------------------------------------------------------------
    UPDATE public.accounts
        SET current_balance = 0
        WHERE id = v_account_a;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected <> 0 THEN
        RAISE EXCEPTION 'RLS-02 FAILED: User B modificó cuenta de User A via UPDATE (% filas)', v_affected;
    END IF;
    RAISE NOTICE 'RLS-02 PASSED: UPDATE cross-user — 0 filas afectadas';

    -- -----------------------------------------------------------------------
    -- RLS-03: INSERT con FK compuesta cruzada — User B referencia cuenta de User A
    -- Solo se acepta foreign_key_violation (23503). Cualquier otra excepción es fallo.
    -- -----------------------------------------------------------------------
    BEGIN
        INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount, received_date)
            VALUES (v_user_b, v_account_a, 2026, 1, 'Sueldo Ilegitimo', 500000.00, CURRENT_DATE);
        RAISE EXCEPTION 'RLS-03 FAILED: User B insertó ingreso referenciando cuenta de User A sin error';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'RLS-03 PASSED: FK compuesta bloqueó referencia cruzada (foreign_key_violation)';
        WHEN OTHERS THEN
            RAISE EXCEPTION 'RLS-03 FAILED: excepción inesperada (%) en lugar de foreign_key_violation', SQLERRM;
    END;

    -- -----------------------------------------------------------------------
    -- RLS-04: RPC record_income con p_user_id de User A siendo User B la sesión
    -- El guard de SECURITY DEFINER debe rechazar la identidad cruzada
    -- -----------------------------------------------------------------------
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
            IF SQLERRM LIKE '%FAILED%' THEN
                RAISE;
            END IF;
            RAISE NOTICE 'RLS-04 PASSED: RPC rechazó p_user_id cruzado: %', SQLERRM;
    END;

    -- -----------------------------------------------------------------------
    -- RLS-05: RPC record_income sin autenticación (sesión nula simulada)
    -- El guard debe rechazar auth.uid() IS NULL
    -- -----------------------------------------------------------------------
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
            IF SQLERRM LIKE '%FAILED%' THEN
                RAISE;
            END IF;
            RAISE NOTICE 'RLS-05 PASSED: RPC rechazó sesión sin autenticación: %', SQLERRM;
    END;

    -- -----------------------------------------------------------------------
    -- RLS-06: Doble reverso — el segundo reverso debe ser rechazado
    -- Se verifica primero que el primer reverso SE EJECUTÓ correctamente.
    -- Si el primer reverso falla, RLS-06 se marca como FAILED (no como passed).
    -- -----------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);

    BEGIN
        v_result := public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Primer reverso de prueba RLS-06');
        v_first_reversal_ok := TRUE;
        RAISE NOTICE 'RLS-06 primer reverso ejecutado correctamente: %', v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'RLS-06 FAILED: el primer reverso falló inesperadamente: %', SQLERRM;
    END;

    IF NOT v_first_reversal_ok THEN
        RAISE EXCEPTION 'RLS-06 FAILED: el primer reverso no retornó exitosamente';
    END IF;

    BEGIN
        PERFORM public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Segundo reverso de prueba RLS-06');
        RAISE EXCEPTION 'RLS-06 FAILED: el segundo reverso del mismo ingreso fue aceptado';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN
                RAISE;
            END IF;
            RAISE NOTICE 'RLS-06 PASSED: segundo reverso rechazado correctamente: %', SQLERRM;
    END;

    -- -----------------------------------------------------------------------
    -- FIN: rollback total — ningún dato de prueba persiste
    -- -----------------------------------------------------------------------
    RAISE EXCEPTION 'RLS_TEST_COMPLETE_ROLLBACK';

EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM = 'RLS_TEST_COMPLETE_ROLLBACK' THEN
            RAISE NOTICE '=== TODOS LOS CASOS RLS COMPLETADOS. Ejecutando rollback de datos de prueba. ===';
        ELSE
            RAISE;
        END IF;
END $$;
