-- ==============================================================================
-- PERSONAL FINANCE — RLS & MULTI-TENANT ISOLATION VERIFICATION SCRIPT (V2)
--
-- Prerequisitos:
--   1. Las tres migraciones aplicadas en staging (V1, V2, security patch).
--   2. Ejecutar en el SQL Editor de Supabase staging con el rol postgres o
--      service_role (para poder insertar en auth.users y cambiar de rol).
--   3. El bloque DO garantiza rollback total de todos los datos sintéticos
--      mediante el mecanismo de excepción+handler de PL/pgSQL (savepoint implícito).
--
-- Estructura:
--   Fase 1  — Crear usuarios sintéticos en auth.users (requiere servicio privilegiado).
--   Fase 2  — Cambiar al rol 'authenticated' + JWT claims para forzar RLS en consultas.
--   Fase 3  — Insertar datos de prueba como User A (bajo RLS).
--   Fase 4  — Cambiar contexto a User B, ejecutar casos RLS-01 a RLS-06.
--   Fase 5  — Rollback: excepción final, handler captura y destruye subtransacción completa.
--
-- NOTA sobre SET LOCAL ROLE:
--   En este script se usa `PERFORM set_config('role', 'authenticated', true)` para
--   indicar el rol a PostgREST/Supabase, y EXECUTE 'SET LOCAL ROLE authenticated'
--   para que PostgreSQL aplique RLS en las consultas directas dentro del bloque DO.
--   Sin SET LOCAL ROLE, las consultas corren como el rol ejecutor (postgres/service_role)
--   y bypassean RLS aunque se haya configurado el JWT claim.
--
-- NOTA sobre auth.users:
--   Todas las tablas financieras tienen user_id REFERENCES auth.users(id).
--   Se insertan dos usuarios sintéticos al inicio, protegidos por el rollback final.
-- ==============================================================================

DO $$
DECLARE
    v_user_a          UUID    := '00000000-0000-0000-0000-00000000000a'::UUID;
    v_user_b          UUID    := '00000000-0000-0000-0000-00000000000b'::UUID;
    v_jwt_a           TEXT    := json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::TEXT;
    v_jwt_b           TEXT    := json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::TEXT;
    v_institution_a   UUID;
    v_account_a       UUID;
    v_institution_b   UUID;
    v_account_b       UUID;
    v_income_a        UUID;
    v_count           INTEGER;
    v_affected        INTEGER;
    v_first_rev_ok    BOOLEAN := FALSE;
    v_result          JSONB;
BEGIN

    -- =========================================================================
    -- FASE 1: Insertar usuarios sintéticos en auth.users
    -- Requiere correr como postgres o service_role (acceso a esquema auth).
    -- Los UUIDs son fijos y reconocibles; no colisionan con usuarios reales
    -- si el entorno es staging limpio.
    -- =========================================================================
    INSERT INTO auth.users (
        id, instance_id, aud, role,
        email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
    ) VALUES
        (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'rls_test_a@isolation.local', '',
         NOW(), NOW(), NOW(),
         '{"provider":"email","providers":["email"]}'::JSONB, '{}'::JSONB),
        (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'rls_test_b@isolation.local', '',
         NOW(), NOW(), NOW(),
         '{"provider":"email","providers":["email"]}'::JSONB, '{}'::JSONB);

    -- =========================================================================
    -- FASE 2: Activar rol 'authenticated' + contexto JWT de User A
    -- A partir de aquí las consultas directas a tablas están bajo RLS.
    -- =========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', v_jwt_a, true);

    -- Verificar que auth.uid() retorna el UUID esperado
    IF auth.uid() <> v_user_a THEN
        RAISE EXCEPTION 'SETUP FAILED: auth.uid() retornó % en lugar de %', auth.uid(), v_user_a;
    END IF;

    -- =========================================================================
    -- FASE 3: Insertar datos de prueba como User A (bajo RLS)
    -- =========================================================================
    INSERT INTO public.institutions (user_id, name, type)
        VALUES (v_user_a, 'Banco Test A', 'BANK')
        RETURNING id INTO v_institution_a;

    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance)
        VALUES (v_user_a, v_institution_a, 'Cuenta A', 'SAVINGS', 5000000.00)
        RETURNING id INTO v_account_a;

    INSERT INTO public.incomes (user_id, account_id, month, year, received_at, period_year, period_month, source_name, amount, received_date)
        VALUES (v_user_a, v_account_a, 1, 2026, CURRENT_DATE, 2026, 1, 'Salario A', 1000000.00, CURRENT_DATE)
        RETURNING id INTO v_income_a;

    -- Insertar datos de User B bajo su propio contexto
    PERFORM set_config('request.jwt.claims', v_jwt_b, true);

    IF auth.uid() <> v_user_b THEN
        RAISE EXCEPTION 'SETUP FAILED: auth.uid() retornó % en lugar de %', auth.uid(), v_user_b;
    END IF;

    INSERT INTO public.institutions (user_id, name, type)
        VALUES (v_user_b, 'Banco Test B', 'BANK')
        RETURNING id INTO v_institution_b;

    INSERT INTO public.accounts (user_id, institution_id, name, type, current_balance)
        VALUES (v_user_b, v_institution_b, 'Cuenta B', 'SAVINGS', 3000000.00)
        RETURNING id INTO v_account_b;

    -- =========================================================================
    -- FASE 4: Casos de aislamiento RLS (contexto User B como sesión activa)
    -- =========================================================================

    -- RLS-01: SELECT cross-user — User B no puede ver cuentas de User A
    SELECT COUNT(*) INTO v_count
        FROM public.accounts WHERE id = v_account_a;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'RLS-01 FAILED: User B ve la cuenta de User A via SELECT (% filas)', v_count;
    END IF;
    RAISE NOTICE 'RLS-01 PASSED: SELECT cross-user — 0 filas devueltas';

    -- RLS-02: UPDATE cross-user — User B no puede modificar cuenta de User A
    UPDATE public.accounts SET current_balance = 0 WHERE id = v_account_a;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected <> 0 THEN
        RAISE EXCEPTION 'RLS-02 FAILED: User B modificó cuenta de User A via UPDATE (% filas)', v_affected;
    END IF;
    RAISE NOTICE 'RLS-02 PASSED: UPDATE cross-user — 0 filas afectadas';

    -- RLS-03: INSERT con FK compuesta cruzada — User B referencia cuenta de User A
    -- Acepta SOLO foreign_key_violation (23503). Cualquier otra excepción es un fallo real.
    BEGIN
        INSERT INTO public.incomes (user_id, account_id, month, year, received_at, period_year, period_month, source_name, amount, received_date)
            VALUES (v_user_b, v_account_a, 1, 2026, CURRENT_DATE, 2026, 1, 'Ingreso Ilegitimo', 500000.00, CURRENT_DATE);
        RAISE EXCEPTION 'RLS-03 FAILED: User B insertó ingreso referenciando cuenta de User A sin error';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'RLS-03 PASSED: FK compuesta bloqueó referencia cruzada (foreign_key_violation)';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE EXCEPTION 'RLS-03 FAILED: excepción inesperada en lugar de foreign_key_violation: [%] %', SQLSTATE, SQLERRM;
    END;

    -- RLS-04: RPC con p_user_id de User A siendo User B la sesión activa
    -- El guard SECURITY DEFINER debe rechazar la identidad cruzada.
    BEGIN
        PERFORM public.record_income(
            v_user_a, v_account_a,
            2026, 1::SMALLINT, 'Ingreso RPC Manipulado', 999999.00, CURRENT_DATE,
            'idem-rls04-test', NULL
        );
        RAISE EXCEPTION 'RLS-04 FAILED: RPC record_income aceptó p_user_id de User A siendo sesión de User B';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-04 PASSED: RPC rechazó p_user_id cruzado: %', SQLERRM;
    END;

    -- RLS-05: RPC sin autenticación (JWT sub vacío — simula sesión anónima)
    -- El guard debe rechazar auth.uid() IS NULL.
    PERFORM set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);

    BEGIN
        PERFORM public.record_income(
            v_user_a, v_account_a,
            2026, 1::SMALLINT, 'Ingreso Anonimo', 100.00, CURRENT_DATE,
            'idem-rls05-test', NULL
        );
        RAISE EXCEPTION 'RLS-05 FAILED: RPC record_income aceptó sesión anónima con p_user_id forjado';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-05 PASSED: RPC rechazó sesión sin autenticación: %', SQLERRM;
    END;

    -- RLS-06: Doble reverso — segundo reverso debe ser rechazado.
    -- IMPORTANTE: se verifica que el primer reverso TUVO ÉXITO antes de probar el segundo.
    -- Si el primer reverso falla, el caso completo es FAILED (no un falso positivo).
    PERFORM set_config('request.jwt.claims', v_jwt_a, true);

    BEGIN
        v_result := public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Primer reverso RLS-06');
        IF NOT (v_result->>'success')::BOOLEAN THEN
            RAISE EXCEPTION 'RLS-06 FAILED: el primer reverso retornó success=false: %', v_result;
        END IF;
        v_first_rev_ok := TRUE;
        RAISE NOTICE 'RLS-06 primer reverso ejecutado: %', v_result;
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE EXCEPTION 'RLS-06 FAILED: el primer reverso lanzó excepción inesperada: %', SQLERRM;
    END;

    IF NOT v_first_rev_ok THEN
        RAISE EXCEPTION 'RLS-06 FAILED: v_first_rev_ok no fue establecido (flujo inesperado)';
    END IF;

    BEGIN
        PERFORM public.reverse_operation(v_user_a, 'INCOME', v_income_a, 'Segundo reverso RLS-06');
        RAISE EXCEPTION 'RLS-06 FAILED: el segundo reverso del mismo ingreso fue aceptado';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'RLS-06 PASSED: segundo reverso rechazado: %', SQLERRM;
    END;

    -- =========================================================================
    -- FASE 5: Rollback total — la excepción revierte el savepoint implícito del
    -- bloque DO, deshaciendo todos los INSERTs (incluyendo auth.users).
    -- El handler confirma el resultado; no vuelve a lanzar, así el DO termina sin error.
    -- =========================================================================
    RAISE EXCEPTION 'RLS_TEST_COMPLETE_ROLLBACK';

EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM = 'RLS_TEST_COMPLETE_ROLLBACK' THEN
            RAISE NOTICE '=== TODOS LOS CASOS RLS VERIFICADOS. Datos de prueba revertidos. ===';
        ELSE
            RAISE;
        END IF;
END $$;
