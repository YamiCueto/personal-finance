-- ==============================================================================
-- PERSONAL FINANCE — SECURITY PATCH (UX-03.1)
-- ==============================================================================
-- Corrige la brecha en el guard de autenticación de las 5 funciones SECURITY DEFINER:
-- Cuando auth.uid() retorna NULL (rol anónimo o sesión expirada) y p_user_id es NOT NULL,
-- el guard original no disparaba ninguna rama y la función procedía con la identidad
-- suministrada por el cliente. Esta migración reescribe el guard en todas las funciones.
--
-- Adicionalmente:
-- - Añade RPC create_credit_card_purchase (atomicidad INSERT + UPDATE cupo)
-- - Añade constraint UNIQUE para deduplicación de cuotas de crédito por período
-- - Refuerza REVOKE de rol anon de forma explícita
-- ==============================================================================

-- 1. PARCHE DE GUARD EN record_obligation_payment
CREATE OR REPLACE FUNCTION public.record_obligation_payment(
    p_user_id UUID,
    p_obligation_id UUID,
    p_account_id UUID,
    p_amount NUMERIC(15, 2),
    p_payment_type VARCHAR(30) DEFAULT 'REGULAR_INSTALLMENT',
    p_idempotency_key VARCHAR(100) DEFAULT NULL,
    p_applied_to_capital NUMERIC(15, 2) DEFAULT NULL,
    p_applied_to_interest NUMERIC(15, 2) DEFAULT NULL,
    p_applied_to_insurance NUMERIC(15, 2) DEFAULT NULL,
    p_applied_to_fees NUMERIC(15, 2) DEFAULT NULL,
    p_reference_number VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_existing RECORD;
    v_ob RECORD;
    v_acc RECORD;
    v_cap NUMERIC(15, 2) := 0.00;
    v_int NUMERIC(15, 2) := 0.00;
    v_ins NUMERIC(15, 2) := 0.00;
    v_fees NUMERIC(15, 2) := 0.00;
    v_payment_id UUID;
    v_new_paid NUMERIC(15, 2);
    v_new_pending NUMERIC(15, 2);
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
        RAISE EXCEPTION 'El monto del pago debe ser mayor a 0';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, obligation_id, account_id INTO v_existing
        FROM public.obligation_payments
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.obligation_id <> p_obligation_id OR v_existing.account_id <> p_account_id THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;
            RETURN jsonb_build_object(
                'success', true, 'is_replayed', true, 'payment_id', v_existing.id,
                'message', 'Operación idempotente: el pago ya había sido procesado previamente'
            );
        END IF;
    END IF;

    SELECT * INTO v_ob FROM public.period_obligations WHERE id = p_obligation_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Obligación % no encontrada o no pertenece al usuario', p_obligation_id;
    END IF;

    SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta % no encontrada o no pertenece al usuario', p_account_id;
    END IF;

    IF v_acc.current_balance < p_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta. Saldo actual: %, Requerido: %', v_acc.current_balance, p_amount;
    END IF;

    IF p_payment_type <> 'PREPAYMENT_CAPITAL' THEN
        IF p_amount > v_ob.amount_pending THEN
            RAISE EXCEPTION 'Intento de sobrepago: el monto % excede el saldo pendiente exigible %', p_amount, v_ob.amount_pending;
        END IF;
        IF v_ob.status = 'PAID' THEN
            RAISE EXCEPTION 'La obligación ya se encuentra totalmente cancelada';
        END IF;
    END IF;

    IF p_payment_type = 'PREPAYMENT_CAPITAL' THEN
        v_cap := p_amount;
    ELSIF p_applied_to_capital IS NOT NULL OR p_applied_to_interest IS NOT NULL OR
          p_applied_to_insurance IS NOT NULL OR p_applied_to_fees IS NOT NULL THEN
        v_cap := COALESCE(p_applied_to_capital, 0.00);
        v_int := COALESCE(p_applied_to_interest, 0.00);
        v_ins := COALESCE(p_applied_to_insurance, 0.00);
        v_fees := COALESCE(p_applied_to_fees, 0.00);
        IF (v_cap + v_int + v_ins + v_fees) <> p_amount THEN
            RAISE EXCEPTION 'Desglose explícito inconsistente: suma (%) != valor del pago (%)', (v_cap + v_int + v_ins + v_fees), p_amount;
        END IF;
    ELSE
        DECLARE
            v_rem NUMERIC(15, 2) := p_amount;
            v_take NUMERIC(15, 2);
        BEGIN
            v_take := LEAST(v_rem, COALESCE(v_ob.interest_mora_component, 0.00)); v_rem := v_rem - v_take; v_int := v_take;
            v_take := LEAST(v_rem, COALESCE(v_ob.other_fees_component, 0.00)); v_rem := v_rem - v_take; v_fees := v_take;
            v_take := LEAST(v_rem, COALESCE(v_ob.insurance_component, 0.00)); v_rem := v_rem - v_take; v_ins := v_take;
            v_take := LEAST(v_rem, COALESCE(v_ob.interest_current_component, 0.00)); v_rem := v_rem - v_take; v_int := v_int + v_take;
            v_take := LEAST(v_rem, COALESCE(v_ob.capital_component, 0.00)); v_rem := v_rem - v_take; v_cap := v_take;
            IF v_rem > 0 THEN v_cap := v_cap + v_rem; END IF;
        END;
    END IF;

    UPDATE public.accounts SET current_balance = current_balance - p_amount, updated_at = timezone('utc'::text, now()) WHERE id = p_account_id;

    IF p_payment_type <> 'PREPAYMENT_CAPITAL' THEN
        v_new_paid := v_ob.amount_paid + p_amount;
        v_new_pending := v_ob.amount_pending - p_amount;
        UPDATE public.period_obligations SET amount_paid = v_new_paid, amount_pending = v_new_pending, updated_at = timezone('utc'::text, now()) WHERE id = p_obligation_id;
    END IF;

    IF v_ob.credit_product_id IS NOT NULL AND v_cap > 0 THEN
        UPDATE public.credit_products SET current_principal_balance = GREATEST(0.00, current_principal_balance - v_cap), updated_at = timezone('utc'::text, now()) WHERE id = v_ob.credit_product_id;
    END IF;

    INSERT INTO public.obligation_payments (
        user_id, obligation_id, account_id, payment_type, amount,
        applied_to_capital, applied_to_interest, applied_to_insurance, applied_to_fees,
        reference_number, idempotency_key, notes
    ) VALUES (
        p_user_id, p_obligation_id, p_account_id, p_payment_type, p_amount,
        v_cap, v_int, v_ins, v_fees, p_reference_number, p_idempotency_key, p_notes
    ) RETURNING id INTO v_payment_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'PAYMENT_RECORDED', 'obligation_payments', v_payment_id, p_amount, p_idempotency_key,
        jsonb_build_object('obligation_id', p_obligation_id, 'account_id', p_account_id, 'payment_type', p_payment_type,
            'amount', p_amount, 'applied_to_capital', v_cap, 'applied_to_interest', v_int, 'applied_to_insurance', v_ins, 'applied_to_fees', v_fees));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'payment_id', v_payment_id, 'amount', p_amount, 'applied_to_capital', v_cap, 'applied_to_interest', v_int);
END;
$$;

-- 2. PARCHE DE GUARD EN record_internal_transfer
CREATE OR REPLACE FUNCTION public.record_internal_transfer(
    p_user_id UUID,
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount NUMERIC(15, 2),
    p_fee_amount NUMERIC(15, 2) DEFAULT 0.00,
    p_idempotency_key VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_existing RECORD;
    v_from RECORD;
    v_to RECORD;
    v_transfer_id UUID;
    v_total_debit NUMERIC(15, 2);
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y destino deben ser distintas';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    v_total_debit := p_amount + COALESCE(p_fee_amount, 0.00);

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, from_account_id, to_account_id INTO v_existing
        FROM public.internal_transfers WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.from_account_id <> p_from_account_id OR v_existing.to_account_id <> p_to_account_id THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;
            RETURN jsonb_build_object('success', true, 'is_replayed', true, 'transfer_id', v_existing.id, 'message', 'Operación idempotente: transferencia ya procesada');
        END IF;
    END IF;

    IF p_from_account_id < p_to_account_id THEN
        SELECT * INTO v_from FROM public.accounts WHERE id = p_from_account_id AND user_id = p_user_id FOR UPDATE;
        SELECT * INTO v_to FROM public.accounts WHERE id = p_to_account_id AND user_id = p_user_id FOR UPDATE;
    ELSE
        SELECT * INTO v_to FROM public.accounts WHERE id = p_to_account_id AND user_id = p_user_id FOR UPDATE;
        SELECT * INTO v_from FROM public.accounts WHERE id = p_from_account_id AND user_id = p_user_id FOR UPDATE;
    END IF;

    IF v_from.id IS NULL OR v_to.id IS NULL THEN
        RAISE EXCEPTION 'Una de las cuentas no existe o no pertenece al usuario';
    END IF;
    IF v_from.current_balance < v_total_debit THEN
        RAISE EXCEPTION 'Saldo insuficiente en cuenta origen. Saldo actual: %, Requerido: %', v_from.current_balance, v_total_debit;
    END IF;

    UPDATE public.accounts SET current_balance = current_balance - v_total_debit, updated_at = timezone('utc'::text, now()) WHERE id = p_from_account_id;
    UPDATE public.accounts SET current_balance = current_balance + p_amount, updated_at = timezone('utc'::text, now()) WHERE id = p_to_account_id;

    INSERT INTO public.internal_transfers (user_id, from_account_id, to_account_id, amount, fee_amount, idempotency_key, notes)
    VALUES (p_user_id, p_from_account_id, p_to_account_id, p_amount, COALESCE(p_fee_amount, 0.00), p_idempotency_key, p_notes)
    RETURNING id INTO v_transfer_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'TRANSFER_RECORDED', 'internal_transfers', v_transfer_id, p_amount, p_idempotency_key,
        jsonb_build_object('from_account_id', p_from_account_id, 'to_account_id', p_to_account_id, 'amount', p_amount, 'fee_amount', p_fee_amount));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'transfer_id', v_transfer_id, 'amount', p_amount);
END;
$$;

-- 3. PARCHE DE GUARD EN record_income
CREATE OR REPLACE FUNCTION public.record_income(
    p_user_id UUID,
    p_account_id UUID,
    p_period_year INTEGER,
    p_period_month SMALLINT,
    p_source_name VARCHAR(150),
    p_amount NUMERIC(15, 2),
    p_received_date DATE DEFAULT CURRENT_DATE,
    p_idempotency_key VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_existing RECORD;
    v_income_id UUID;
    v_acc RECORD;
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
        SELECT id, amount, source_name INTO v_existing FROM public.incomes WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.source_name <> p_source_name THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;
            RETURN jsonb_build_object('success', true, 'is_replayed', true, 'income_id', v_existing.id, 'message', 'Operación idempotente: ingreso ya registrado');
        END IF;
    END IF;

    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La cuenta seleccionada no existe o no pertenece al usuario';
        END IF;
        UPDATE public.accounts SET current_balance = current_balance + p_amount, updated_at = timezone('utc'::text, now()) WHERE id = p_account_id;
    END IF;

    INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount, received_date, idempotency_key, notes)
    VALUES (p_user_id, p_account_id, p_period_year, p_period_month, p_source_name, p_amount, p_received_date, p_idempotency_key, p_notes)
    RETURNING id INTO v_income_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'INCOME_RECORDED', 'incomes', v_income_id, p_amount, p_idempotency_key,
        jsonb_build_object('account_id', p_account_id, 'source_name', p_source_name, 'amount', p_amount, 'period_year', p_period_year, 'period_month', p_period_month));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'income_id', v_income_id, 'amount', p_amount);
END;
$$;

-- 4. PARCHE DE GUARD EN reverse_operation
CREATE OR REPLACE FUNCTION public.reverse_operation(
    p_user_id UUID,
    p_operation_type VARCHAR(30),
    p_operation_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_pay RECORD;
    v_trans RECORD;
    v_inc RECORD;
    v_ob RECORD;
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Debe especificarse un motivo justificativo para el reverso financiero';
    END IF;

    IF p_operation_type = 'PAYMENT' THEN
        SELECT * INTO v_pay FROM public.obligation_payments WHERE id = p_operation_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pago % no encontrado o no pertenece al usuario', p_operation_id; END IF;
        IF v_pay.is_reversed THEN RAISE EXCEPTION 'El pago ya fue revertido con anterioridad'; END IF;

        UPDATE public.accounts SET current_balance = current_balance + v_pay.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_pay.account_id;

        SELECT * INTO v_ob FROM public.period_obligations WHERE id = v_pay.obligation_id AND user_id = p_user_id FOR UPDATE;
        UPDATE public.period_obligations SET amount_paid = GREATEST(0.00, amount_paid - v_pay.amount), amount_pending = amount_pending + v_pay.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_pay.obligation_id;

        IF v_ob.credit_product_id IS NOT NULL AND v_pay.applied_to_capital > 0 THEN
            UPDATE public.credit_products SET current_principal_balance = current_principal_balance + v_pay.applied_to_capital, updated_at = timezone('utc'::text, now()) WHERE id = v_ob.credit_product_id;
        END IF;

        UPDATE public.obligation_payments SET is_reversed = true, reversed_at = timezone('utc'::text, now()), reversal_reason = p_reason WHERE id = p_operation_id;
        INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, payload)
        VALUES (p_user_id, 'PAYMENT_REVERSED', 'obligation_payments', p_operation_id, v_pay.amount, jsonb_build_object('reason', p_reason, 'obligation_id', v_pay.obligation_id));
        RETURN jsonb_build_object('success', true, 'operation', 'PAYMENT', 'reversal_id', p_operation_id);

    ELSIF p_operation_type = 'TRANSFER' THEN
        SELECT * INTO v_trans FROM public.internal_transfers WHERE id = p_operation_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia % no encontrada o no pertenece al usuario', p_operation_id; END IF;
        IF v_trans.is_reversed THEN RAISE EXCEPTION 'La transferencia ya fue revertida previamente'; END IF;

        IF v_trans.from_account_id < v_trans.to_account_id THEN
            PERFORM 1 FROM public.accounts WHERE id = v_trans.from_account_id FOR UPDATE;
            PERFORM 1 FROM public.accounts WHERE id = v_trans.to_account_id FOR UPDATE;
        ELSE
            PERFORM 1 FROM public.accounts WHERE id = v_trans.to_account_id FOR UPDATE;
            PERFORM 1 FROM public.accounts WHERE id = v_trans.from_account_id FOR UPDATE;
        END IF;

        UPDATE public.accounts SET current_balance = current_balance - v_trans.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_trans.to_account_id;
        UPDATE public.accounts SET current_balance = current_balance + (v_trans.amount + v_trans.fee_amount), updated_at = timezone('utc'::text, now()) WHERE id = v_trans.from_account_id;
        UPDATE public.internal_transfers SET is_reversed = true, reversed_at = timezone('utc'::text, now()), reversal_reason = p_reason WHERE id = p_operation_id;
        INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, payload)
        VALUES (p_user_id, 'TRANSFER_REVERSED', 'internal_transfers', p_operation_id, v_trans.amount, jsonb_build_object('reason', p_reason));
        RETURN jsonb_build_object('success', true, 'operation', 'TRANSFER', 'reversal_id', p_operation_id);

    ELSIF p_operation_type = 'INCOME' THEN
        SELECT * INTO v_inc FROM public.incomes WHERE id = p_operation_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Ingreso % no encontrado o no pertenece al usuario', p_operation_id; END IF;
        IF v_inc.is_reversed THEN RAISE EXCEPTION 'El ingreso ya fue revertido previamente'; END IF;

        IF v_inc.account_id IS NOT NULL THEN
            UPDATE public.accounts SET current_balance = current_balance - v_inc.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_inc.account_id;
        END IF;
        UPDATE public.incomes SET is_reversed = true, reversed_at = timezone('utc'::text, now()), reversal_reason = p_reason WHERE id = p_operation_id;
        INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, payload)
        VALUES (p_user_id, 'INCOME_REVERSED', 'incomes', p_operation_id, v_inc.amount, jsonb_build_object('reason', p_reason));
        RETURN jsonb_build_object('success', true, 'operation', 'INCOME', 'reversal_id', p_operation_id);
    ELSE
        RAISE EXCEPTION 'Tipo de operación no soportado para reverso: %', p_operation_type;
    END IF;
END;
$$;

-- 5. PARCHE DE GUARD EN record_debt_restructure
CREATE OR REPLACE FUNCTION public.record_debt_restructure(
    p_user_id UUID,
    p_credit_product_id UUID,
    p_new_principal_balance NUMERIC(15, 2),
    p_new_effective_annual_rate NUMERIC(7, 4),
    p_new_total_installments INTEGER,
    p_refinancing_fees NUMERIC(15, 2) DEFAULT 0.00,
    p_reason TEXT DEFAULT 'Alivio / Rediferido financiero',
    p_approved_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_credit RECORD;
    v_event_id UUID;
    v_new_monthly_rate NUMERIC(7, 4);
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    SELECT * INTO v_credit FROM public.credit_products WHERE id = p_credit_product_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto de crédito % no encontrado o no pertenece al usuario', p_credit_product_id;
    END IF;

    v_new_monthly_rate := ROUND((POWER(1.0 + (p_new_effective_annual_rate / 100.0), 1.0 / 12.0) - 1.0) * 100.0, 4);

    INSERT INTO public.debt_restructure_events (
        user_id, credit_product_id, event_date,
        previous_principal_balance, previous_effective_annual_rate, previous_remaining_installments,
        new_principal_balance, new_effective_annual_rate, new_total_installments, refinancing_fees,
        reason, approved_by_institution_date
    ) VALUES (
        p_user_id, p_credit_product_id, p_approved_date,
        v_credit.current_principal_balance, v_credit.effective_annual_rate,
        COALESCE(v_credit.remaining_installments, v_credit.total_installments, 0),
        p_new_principal_balance, p_new_effective_annual_rate, p_new_total_installments, p_refinancing_fees,
        p_reason, p_approved_date
    ) RETURNING id INTO v_event_id;

    UPDATE public.credit_products
    SET current_principal_balance = p_new_principal_balance,
        effective_annual_rate = p_new_effective_annual_rate,
        nominal_rate_monthly = v_new_monthly_rate,
        total_installments = p_new_total_installments,
        remaining_installments = p_new_total_installments,
        status = 'RESTRUCTURED',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_credit_product_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, payload)
    VALUES (p_user_id, 'RESTRUCTURE_RECORDED', 'debt_restructure_events', v_event_id, p_new_principal_balance,
        jsonb_build_object('credit_product_id', p_credit_product_id, 'previous_balance', v_credit.current_principal_balance,
            'new_balance', p_new_principal_balance, 'new_ea', p_new_effective_annual_rate));

    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'new_principal_balance', p_new_principal_balance, 'new_monthly_rate', v_new_monthly_rate);
END;
$$;

-- 6. NUEVA RPC: create_credit_card_purchase (atómica: INSERT compra + UPDATE cupo + idempotencia)
CREATE OR REPLACE FUNCTION public.create_credit_card_purchase(
    p_user_id UUID,
    p_credit_card_id UUID,
    p_description VARCHAR(150),
    p_amount NUMERIC(15, 2),
    p_total_installments INTEGER,
    p_interest_rate_monthly NUMERIC(7, 4) DEFAULT NULL,
    p_purchase_date DATE DEFAULT CURRENT_DATE,
    p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID;
    v_existing RECORD;
    v_card RECORD;
    v_purchase_id UUID;
    v_rate NUMERIC(7, 4);
    v_monthly_capital NUMERIC(15, 2);
    v_monthly_interest NUMERIC(15, 2);
    v_new_used NUMERIC(15, 2);
    v_new_available NUMERIC(15, 2);
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    IF p_amount <= 0 THEN RAISE EXCEPTION 'El valor de la compra debe ser mayor a 0'; END IF;
    IF p_total_installments < 1 THEN RAISE EXCEPTION 'El número de cuotas debe ser como mínimo 1'; END IF;
    IF p_description IS NULL OR trim(p_description) = '' THEN RAISE EXCEPTION 'La descripción de la compra es obligatoria'; END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, original_amount, product_id, total_installments INTO v_existing
        FROM public.credit_card_purchases
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        FOR SHARE;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.original_amount <> p_amount
               OR v_existing.product_id <> p_credit_card_id
               OR v_existing.total_installments <> p_total_installments THEN
                RAISE EXCEPTION
                    'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes (monto, tarjeta o cuotas no coinciden)',
                    p_idempotency_key;
            END IF;
            RETURN jsonb_build_object(
                'success', true, 'is_replayed', true, 'purchase_id', v_existing.id,
                'message', 'Operación idempotente: la compra ya había sido registrada'
            );
        END IF;
    END IF;

    SELECT * INTO v_card FROM public.credit_products WHERE id = p_credit_card_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tarjeta de crédito no encontrada o no pertenece al usuario'; END IF;
    IF v_card.type <> 'CREDIT_CARD' THEN RAISE EXCEPTION 'El producto especificado no es una tarjeta de crédito'; END IF;

    IF p_amount > COALESCE(v_card.available_credit_limit, (COALESCE(v_card.approved_credit_limit, 0) - COALESCE(v_card.used_credit_limit, 0))) THEN
        RAISE EXCEPTION 'Fondos insuficientes: el monto % supera el cupo disponible de la tarjeta', p_amount;
    END IF;

    v_rate := COALESCE(p_interest_rate_monthly, v_card.nominal_rate_monthly);
    v_monthly_capital := ROUND(p_amount / p_total_installments, 2);
    v_monthly_interest := CASE WHEN v_rate > 0 THEN ROUND(p_amount * (v_rate / 100.0), 2) ELSE 0.00 END;

    INSERT INTO public.credit_card_purchases (user_id, product_id, purchase_date, description, original_amount, total_installments, remaining_installments, interest_rate_monthly, monthly_capital, monthly_interest, status, idempotency_key)
    VALUES (p_user_id, p_credit_card_id, p_purchase_date, trim(p_description), p_amount, p_total_installments, p_total_installments, v_rate, v_monthly_capital, v_monthly_interest, 'PENDING', p_idempotency_key)
    RETURNING id INTO v_purchase_id;

    v_new_used := COALESCE(v_card.used_credit_limit, 0) + p_amount;
    v_new_available := COALESCE(v_card.approved_credit_limit, 0) - v_new_used;

    UPDATE public.credit_products
    SET used_credit_limit = v_new_used,
        available_credit_limit = GREATEST(0.00, v_new_available),
        current_principal_balance = v_new_used,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_credit_card_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'CREDIT_CARD_PURCHASE', 'credit_card_purchases', v_purchase_id, p_amount, p_idempotency_key,
        jsonb_build_object('credit_card_id', p_credit_card_id, 'description', p_description, 'installments', p_total_installments));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'purchase_id', v_purchase_id, 'monthly_capital', v_monthly_capital, 'monthly_interest', v_monthly_interest, 'new_available_limit', GREATEST(0.00, v_new_available));
END;
$$;

-- 7. COLUMNA E ÍNDICE DE IDEMPOTENCIA EN credit_card_purchases
ALTER TABLE public.credit_card_purchases
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'credit_card_purchases'
          AND indexname = 'uq_cc_purchases_user_idempotency'
    ) THEN
        CREATE UNIQUE INDEX uq_cc_purchases_user_idempotency
            ON public.credit_card_purchases(user_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
        RAISE NOTICE 'Índice uq_cc_purchases_user_idempotency creado.';
    ELSE
        RAISE NOTICE 'Índice uq_cc_purchases_user_idempotency ya existe — omitiendo creación.';
    END IF;
END $$;

-- 8. CONSTRAINT UNIQUE para deduplicación de cuotas de crédito por período
-- Verifica la definición real del índice antes de crear: si existe con nombre correcto pero definición
-- diferente (ej: sin la cláusula WHERE o sin UNIQUE), falla explícitamente para evitar silenciar
-- un índice incorrecto.
DO $$
DECLARE
    v_is_unique  BOOLEAN;
    v_has_where  BOOLEAN;
    v_indexdef   TEXT;
BEGIN
    SELECT
        ix.indisunique,
        ix.indpred IS NOT NULL,
        pg_get_indexdef(ix.indexrelid)
    INTO v_is_unique, v_has_where, v_indexdef
    FROM pg_index     ix
    JOIN pg_class     tbl ON tbl.oid = ix.indrelid  AND tbl.relname = 'period_obligations'
    JOIN pg_class     idx ON idx.oid = ix.indexrelid AND idx.relname = 'uq_period_obligation_credit_period'
    JOIN pg_namespace ns  ON ns.oid  = tbl.relnamespace AND ns.nspname = 'public';

    IF v_is_unique IS NULL THEN
        CREATE UNIQUE INDEX uq_period_obligation_credit_period
            ON public.period_obligations(user_id, credit_product_id, period_year, period_month)
            WHERE credit_product_id IS NOT NULL;
        RAISE NOTICE 'Índice uq_period_obligation_credit_period creado.';
    ELSIF NOT v_is_unique THEN
        RAISE EXCEPTION
            'Índice uq_period_obligation_credit_period existe pero no es UNIQUE (definición: %). Corregir manualmente.',
            v_indexdef;
    ELSIF NOT v_has_where THEN
        RAISE EXCEPTION
            'Índice uq_period_obligation_credit_period existe pero le falta la cláusula WHERE (definición: %). Corregir manualmente.',
            v_indexdef;
    ELSE
        RAISE NOTICE 'Índice uq_period_obligation_credit_period ya existe y es correcto — omitiendo creación.';
    END IF;
END $$;

-- 8. PERMISOS EXPLÍCITOS EN TODAS LAS RPC SECURITY DEFINER
-- Revoca PUBLIC (herencia implícita) → otorga solo a authenticated y service_role

REVOKE ALL ON FUNCTION public.record_obligation_payment FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_internal_transfer FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_income FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_operation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_debt_restructure FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_card_purchase FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.record_obligation_payment TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_internal_transfer TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_income TO authenticated;
        GRANT EXECUTE ON FUNCTION public.reverse_operation TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_debt_restructure TO authenticated;
        GRANT EXECUTE ON FUNCTION public.create_credit_card_purchase TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.record_obligation_payment TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_internal_transfer TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_income TO service_role;
        GRANT EXECUTE ON FUNCTION public.reverse_operation TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_debt_restructure TO service_role;
        GRANT EXECUTE ON FUNCTION public.create_credit_card_purchase TO service_role;
    END IF;
END $$;

-- 9. REVOKE EXPLÍCITO DEL ROL anon (defensa en profundidad — por si persisten permisos heredados)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE EXECUTE ON FUNCTION public.record_obligation_payment FROM anon;
        REVOKE EXECUTE ON FUNCTION public.record_internal_transfer FROM anon;
        REVOKE EXECUTE ON FUNCTION public.record_income FROM anon;
        REVOKE EXECUTE ON FUNCTION public.reverse_operation FROM anon;
        REVOKE EXECUTE ON FUNCTION public.record_debt_restructure FROM anon;
        REVOKE EXECUTE ON FUNCTION public.create_credit_card_purchase FROM anon;
    END IF;
END $$;
