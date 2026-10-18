CREATE OR REPLACE FUNCTION public.record_income(
    p_user_id          UUID,
    p_account_id       UUID,
    p_period_year      INTEGER,
    p_period_month     SMALLINT,
    p_source_name      VARCHAR,
    p_amount           NUMERIC,
    p_received_date    DATE    DEFAULT CURRENT_DATE,
    p_idempotency_key  VARCHAR DEFAULT NULL,
    p_notes            TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_caller    UUID;
    v_existing  RECORD;
    v_income_id UUID;
    v_acc       RECORD;
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto del ingreso debe ser mayor a 0';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, source_name INTO v_existing
        FROM public.incomes
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.source_name <> p_source_name THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;
            RETURN jsonb_build_object('success', true, 'is_replayed', true, 'income_id', v_existing.id,
                'message', 'Operación idempotente: ingreso ya registrado');
        END IF;
    END IF;

    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc FROM public.accounts
        WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La cuenta seleccionada no existe o no pertenece al usuario';
        END IF;
        UPDATE public.accounts
        SET current_balance = current_balance + p_amount,
            updated_at      = timezone('utc', now())
        WHERE id = p_account_id;
    END IF;

    INSERT INTO public.incomes (
        user_id, account_id,
        period_year, period_month,
        year, month, received_at,
        source_name, amount, received_date,
        idempotency_key, notes
    ) VALUES (
        p_user_id, p_account_id,
        p_period_year, p_period_month,
        p_period_year, p_period_month, p_received_date::TIMESTAMPTZ,
        p_source_name, p_amount, p_received_date,
        p_idempotency_key, p_notes
    )
    RETURNING id INTO v_income_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'INCOME_RECORDED', 'incomes', v_income_id, p_amount, p_idempotency_key,
        jsonb_build_object('account_id', p_account_id, 'source_name', p_source_name,
            'amount', p_amount, 'period_year', p_period_year, 'period_month', p_period_month));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'income_id', v_income_id, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) TO service_role;
