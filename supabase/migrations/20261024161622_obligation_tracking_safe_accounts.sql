CREATE OR REPLACE FUNCTION public.guard_account_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.incomes WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.obligation_payments WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.internal_transfers WHERE from_account_id = OLD.id OR to_account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.financial_audit_log WHERE entity_id = OLD.id OR payload->>'account_id' = OLD.id::text OR payload->>'from_account_id' = OLD.id::text OR payload->>'to_account_id' = OLD.id::text)
  THEN RAISE EXCEPTION 'La cuenta tiene historial financiero y no puede eliminarse. Puedes archivar la cuenta.'; END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_account_deletion() FROM PUBLIC;
CREATE TRIGGER guard_account_deletion BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion();

CREATE OR REPLACE FUNCTION public.delete_financial_account(p_user_id uuid, p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sesión no autorizada.'; END IF;
  PERFORM 1 FROM public.accounts WHERE id = p_account_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta no encontrada o no pertenece al usuario'; END IF;
  DELETE FROM public.accounts WHERE id = p_account_id AND user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.delete_financial_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_financial_account(uuid, uuid) TO authenticated;

ALTER TABLE public.credit_products ALTER COLUMN original_principal DROP NOT NULL;
ALTER TABLE public.credit_products ALTER COLUMN nominal_rate_monthly DROP NOT NULL;
ALTER TABLE public.credit_products ALTER COLUMN effective_annual_rate DROP NOT NULL;
ALTER TABLE public.credit_products
  ADD COLUMN tracking_start_date date,
  ADD COLUMN opening_principal_balance numeric(15,2) CHECK (opening_principal_balance > 0),
  ADD COLUMN next_due_date date,
  ADD COLUMN agreed_installment numeric(15,2) CHECK (agreed_installment > 0),
  ADD COLUMN known_interest_monthly numeric(15,2) CHECK (known_interest_monthly >= 0),
  ADD COLUMN obligation_kind text CHECK (obligation_kind IN ('FINANCED_DEBT', 'BALANCE_COMMITMENT')),
  ADD COLUMN registration_key text,
  ADD COLUMN registration_payload jsonb,
  ADD CONSTRAINT uq_debt_registration UNIQUE (user_id, registration_key),
  ADD CONSTRAINT valid_tracking_baseline CHECK (tracking_start_date IS NULL OR (opening_principal_balance IS NOT NULL AND next_due_date IS NOT NULL AND agreed_installment IS NOT NULL AND known_interest_monthly IS NOT NULL AND obligation_kind IS NOT NULL AND next_due_date >= tracking_start_date AND agreed_installment > known_interest_monthly + associated_insurances_monthly + management_fee_monthly));

CREATE TABLE public.debt_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  credit_product_id uuid NOT NULL,
  statement_date date NOT NULL,
  calculated_balance numeric(15,2) NOT NULL,
  reported_balance numeric(15,2) NOT NULL CHECK (reported_balance >= 0),
  difference numeric(15,2) NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, credit_product_id) REFERENCES public.credit_products(user_id, id) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key),
  CHECK (difference = reported_balance - calculated_balance)
);
CREATE INDEX debt_reconciliations_product ON public.debt_reconciliations(user_id, credit_product_id, statement_date);
ALTER TABLE public.debt_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY debt_reconciliations_read ON public.debt_reconciliations FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.debt_reconciliations TO authenticated;
GRANT SELECT ON public.obligation_payments TO authenticated;
REVOKE ALL ON public.debt_reconciliations FROM anon;
CREATE TRIGGER immutable_debt_reconciliation BEFORE UPDATE OR DELETE ON public.debt_reconciliations FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

CREATE OR REPLACE FUNCTION public.register_existing_debt(p_user_id uuid, p_input jsonb)
RETURNS public.credit_products LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_product public.credit_products; v_key text := p_input->>'idempotencyKey';
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sesión no autorizada.'; END IF;
  IF coalesce(v_key,'') = '' THEN RAISE EXCEPTION 'Clave de idempotencia requerida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || v_key, 0));
  SELECT * INTO v_product FROM public.credit_products WHERE user_id = p_user_id AND registration_key = v_key;
  IF FOUND THEN
    IF v_product.registration_payload IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Conflicto de idempotencia.'; END IF;
    RETURN v_product;
  END IF;
  IF coalesce(trim(p_input->>'name'),'') = '' OR (p_input->>'type') = 'CREDIT_CARD'
    OR (p_input->>'openingPrincipalBalance') IS NULL OR (p_input->>'trackingStartDate') IS NULL
    OR (p_input->>'nextDueDate') IS NULL OR (p_input->>'agreedInstallment') IS NULL
    OR (p_input->>'knownInterestMonthly') IS NULL OR (p_input->>'insuranceMonthly') IS NULL OR (p_input->>'feesMonthly') IS NULL
    OR coalesce((p_input->>'nominalRateMonthly')::numeric,0) < 0
    OR ((p_input->>'remainingInstallments') IS NOT NULL AND (p_input->>'remainingInstallments')::int < 1)
  THEN RAISE EXCEPTION 'Datos de deuda incompletos o inválidos.'; END IF;
  INSERT INTO public.credit_products(user_id,institution_id,name,type,status,original_principal,current_principal_balance,opening_principal_balance,tracking_start_date,next_due_date,agreed_installment,known_interest_monthly,associated_insurances_monthly,management_fee_monthly,remaining_installments,nominal_rate_monthly,effective_annual_rate,amortization_method,obligation_kind,notes,due_payment_day,registration_key,registration_payload)
  VALUES (p_user_id,(p_input->>'institutionId')::uuid,trim(p_input->>'name'),p_input->>'type','ACTIVE',NULL,(p_input->>'openingPrincipalBalance')::numeric,(p_input->>'openingPrincipalBalance')::numeric,(p_input->>'trackingStartDate')::date,(p_input->>'nextDueDate')::date,(p_input->>'agreedInstallment')::numeric,(p_input->>'knownInterestMonthly')::numeric,(p_input->>'insuranceMonthly')::numeric,(p_input->>'feesMonthly')::numeric,(p_input->>'remainingInstallments')::int,(p_input->>'nominalRateMonthly')::numeric,(power(1+(p_input->>'nominalRateMonthly')::numeric/100,12)-1)*100,'FIXED_INSTALLMENT',p_input->>'obligationKind',p_input->>'notes',extract(day FROM (p_input->>'nextDueDate')::date),v_key,p_input)
  RETURNING * INTO v_product;
  RETURN v_product;
END;
$$;
REVOKE ALL ON FUNCTION public.register_existing_debt(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_existing_debt(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_tracked_installment(p_user_id uuid,p_credit_product_id uuid,p_year int,p_month int)
RETURNS public.period_obligations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.credit_products; o public.period_obligations; v_date date; v_cap numeric(15,2); v_amount numeric(15,2);
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sesión no autorizada.'; END IF;
  SELECT * INTO p FROM public.credit_products WHERE id = p_credit_product_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR p.tracking_start_date IS NULL THEN RAISE EXCEPTION 'Deuda con seguimiento no encontrada.'; END IF;
  SELECT * INTO o FROM public.period_obligations WHERE credit_product_id = p.id AND period_year = p_year AND period_month = p_month;
  IF FOUND THEN RETURN o; END IF;
  v_date := make_date(p_year,p_month,1);
  IF v_date < date_trunc('month',p.next_due_date)::date THEN RAISE EXCEPTION 'Sin historial registrado: período anterior al próximo vencimiento.'; END IF;
  IF p.current_principal_balance <= 0 OR p.status = 'CANCELLED' THEN RAISE EXCEPTION 'La deuda no tiene saldo exigible.'; END IF;
  v_date := v_date + (least(extract(day FROM p.next_due_date),extract(day FROM (v_date + interval '1 month - 1 day')))::int - 1);
  v_cap := least(p.current_principal_balance,p.agreed_installment-p.known_interest_monthly-p.associated_insurances_monthly-p.management_fee_monthly);
  v_amount := v_cap+p.known_interest_monthly+p.associated_insurances_monthly+p.management_fee_monthly;
  INSERT INTO public.period_obligations(user_id,credit_product_id,source_type,period_year,period_month,name,amount,amount_pending,due_date,capital_component,interest_current_component,insurance_component,other_fees_component)
  VALUES(p_user_id,p.id,'CREDIT_INSTALLMENT',p_year,p_month,'Cuota '||p.name,v_amount,v_amount,v_date,v_cap,p.known_interest_monthly,p.associated_insurances_monthly,p.management_fee_monthly) RETURNING * INTO o;
  RETURN o;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_tracked_installment(uuid,uuid,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_tracked_installment(uuid,uuid,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_tracking_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_due date;
BEGIN
  SELECT next_due_date INTO v_due FROM public.credit_products WHERE id=NEW.credit_product_id AND user_id=NEW.user_id AND tracking_start_date IS NOT NULL;
  IF FOUND AND make_date(NEW.period_year,NEW.period_month,1) < date_trunc('month',v_due)::date THEN RAISE EXCEPTION 'Sin historial registrado: período anterior al próximo vencimiento.'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_tracking_obligation() FROM PUBLIC;
CREATE TRIGGER guard_tracking_obligation BEFORE INSERT ON public.period_obligations FOR EACH ROW EXECUTE FUNCTION public.guard_tracking_obligation();

CREATE OR REPLACE FUNCTION public.reconcile_debt(p_user_id uuid,p_input jsonb)
RETURNS public.debt_reconciliations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.credit_products; r public.debt_reconciliations; v_date date := (p_input->>'statementDate')::date; v_reported numeric(15,2) := (p_input->>'reportedBalance')::numeric; v_latest date;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sesión no autorizada.'; END IF;
  IF coalesce(p_input->>'idempotencyKey','') = '' OR coalesce(trim(p_input->>'reason'),'') = '' OR v_date IS NULL OR v_reported IS NULL OR v_reported < 0 THEN RAISE EXCEPTION 'Completa la fecha, el saldo y el motivo.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || (p_input->>'idempotencyKey'),0));
  SELECT * INTO r FROM public.debt_reconciliations WHERE user_id=p_user_id AND idempotency_key=p_input->>'idempotencyKey';
  IF FOUND THEN
    IF r.credit_product_id IS DISTINCT FROM (p_input->>'creditProductId')::uuid OR r.reported_balance IS DISTINCT FROM v_reported OR r.statement_date IS DISTINCT FROM v_date OR r.reason IS DISTINCT FROM trim(p_input->>'reason') THEN RAISE EXCEPTION 'Conflicto de idempotencia.'; END IF;
    RETURN r;
  END IF;
  SELECT * INTO p FROM public.credit_products WHERE user_id=p_user_id AND id=(p_input->>'creditProductId')::uuid FOR UPDATE;
  IF NOT FOUND OR p.tracking_start_date IS NULL THEN RAISE EXCEPTION 'Deuda con seguimiento no encontrada.'; END IF;
  IF p.current_principal_balance IS DISTINCT FROM (p_input->>'expectedBalance')::numeric THEN RAISE EXCEPTION 'El saldo cambió. Actualiza el detalle antes de conciliar.'; END IF;
  SELECT greatest(p.tracking_start_date, (SELECT max(statement_date) FROM public.debt_reconciliations WHERE credit_product_id=p.id), (SELECT max(greatest(pay.payment_date,pay.reversed_at::date)) FROM public.obligation_payments pay JOIN public.period_obligations o ON o.id=pay.obligation_id WHERE o.credit_product_id=p.id)) INTO v_latest;
  IF v_date < v_latest THEN RAISE EXCEPTION 'La fecha del extracto debe incluir los movimientos registrados.'; END IF;
  INSERT INTO public.debt_reconciliations(user_id,credit_product_id,statement_date,calculated_balance,reported_balance,difference,reason,idempotency_key)
  VALUES(p_user_id,p.id,v_date,p.current_principal_balance,v_reported,v_reported-p.current_principal_balance,trim(p_input->>'reason'),p_input->>'idempotencyKey') RETURNING * INTO r;
  UPDATE public.credit_products SET current_principal_balance=v_reported,status=CASE WHEN v_reported=0 THEN 'PAID_OFF' ELSE 'ACTIVE' END,updated_at=now() WHERE id=p.id;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_debt(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_debt(uuid,jsonb) TO authenticated;

DROP FUNCTION public.record_obligation_payment(uuid,uuid,uuid,numeric,character varying,character varying,numeric,numeric,numeric,numeric,character varying,text);
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
    p_notes TEXT DEFAULT NULL,
    p_payment_date DATE DEFAULT CURRENT_DATE
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
    v_previous RECORD;
    v_product public.credit_products;
BEGIN
    v_caller := auth.uid();

    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
    END IF;
    p_user_id := v_caller;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) OR p_payment_date IS NULL THEN
        RAISE EXCEPTION 'El monto del pago debe ser mayor a 0';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.obligation_payments
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.obligation_id <> p_obligation_id OR v_existing.account_id <> p_account_id OR v_existing.payment_date <> p_payment_date OR v_existing.payment_type <> p_payment_type
              OR (p_applied_to_capital IS NOT NULL AND v_existing.applied_to_capital <> p_applied_to_capital)
              OR (p_applied_to_interest IS NOT NULL AND v_existing.applied_to_interest <> p_applied_to_interest)
              OR (p_applied_to_insurance IS NOT NULL AND v_existing.applied_to_insurance <> p_applied_to_insurance)
              OR (p_applied_to_fees IS NOT NULL AND v_existing.applied_to_fees <> p_applied_to_fees) THEN
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

    IF v_acc.is_archived THEN RAISE EXCEPTION 'La cuenta esta archivada.'; END IF;
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
        SELECT coalesce(sum(applied_to_interest),0) AS interest, coalesce(sum(applied_to_insurance),0) AS insurance, coalesce(sum(applied_to_fees),0) AS fees
        INTO v_previous FROM public.obligation_payments WHERE obligation_id=p_obligation_id AND NOT is_reversed AND payment_type <> 'PREPAYMENT_CAPITAL';
        v_fees := least(p_amount,greatest(0,v_ob.other_fees_component-v_previous.fees));
        v_ins := least(p_amount-v_fees,greatest(0,v_ob.insurance_component-v_previous.insurance));
        v_int := least(p_amount-v_fees-v_ins,greatest(0,v_ob.interest_current_component+v_ob.interest_mora_component-v_previous.interest));
        v_cap := p_amount-v_fees-v_ins-v_int;
    END IF;
    IF least(v_cap,v_int,v_ins,v_fees) < 0 THEN RAISE EXCEPTION 'El desglose no puede ser negativo.'; END IF;
    IF p_payment_type = 'PREPAYMENT_CAPITAL' AND v_ob.credit_product_id IS NULL THEN RAISE EXCEPTION 'El abono requiere una deuda asociada.'; END IF;
    IF v_ob.credit_product_id IS NOT NULL THEN
        SELECT * INTO v_product FROM public.credit_products WHERE id=v_ob.credit_product_id AND user_id=p_user_id FOR UPDATE;
        IF v_cap > v_product.current_principal_balance THEN RAISE EXCEPTION 'El capital supera el saldo de la deuda.'; END IF;
        IF p_payment_date < v_product.tracking_start_date THEN RAISE EXCEPTION 'Fecha de pago fuera del seguimiento.'; END IF;
    END IF;

    UPDATE public.accounts SET current_balance = current_balance - p_amount, updated_at = timezone('utc'::text, now()) WHERE id = p_account_id;

    IF p_payment_type <> 'PREPAYMENT_CAPITAL' THEN
        v_new_paid := v_ob.amount_paid + p_amount;
        v_new_pending := v_ob.amount_pending - p_amount;
        UPDATE public.period_obligations SET amount_paid = v_new_paid, amount_pending = v_new_pending, updated_at = timezone('utc'::text, now()) WHERE id = p_obligation_id;
    END IF;

    IF v_ob.credit_product_id IS NOT NULL THEN
        UPDATE public.credit_products SET current_principal_balance = current_principal_balance - v_cap, remaining_installments = CASE WHEN remaining_installments IS NOT NULL AND p_payment_type <> 'PREPAYMENT_CAPITAL' AND v_ob.amount_pending = p_amount THEN greatest(0,remaining_installments-1) ELSE remaining_installments END, status = CASE WHEN current_principal_balance = v_cap THEN 'PAID_OFF' ELSE status END, updated_at = timezone('utc'::text, now()) WHERE id = v_ob.credit_product_id;
    END IF;

    INSERT INTO public.obligation_payments (
        user_id, obligation_id, account_id, payment_type, amount,
        applied_to_capital, applied_to_interest, applied_to_insurance, applied_to_fees,
        reference_number, idempotency_key, notes, payment_date
    ) VALUES (
        p_user_id, p_obligation_id, p_account_id, p_payment_type, p_amount,
        v_cap, v_int, v_ins, v_fees, p_reference_number, p_idempotency_key, p_notes, p_payment_date
    ) RETURNING id INTO v_payment_id;

    INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload)
    VALUES (p_user_id, 'PAYMENT_RECORDED', 'obligation_payments', v_payment_id, p_amount, p_idempotency_key,
        jsonb_build_object('obligation_id', p_obligation_id, 'account_id', p_account_id, 'payment_type', p_payment_type,
            'amount', p_amount, 'applied_to_capital', v_cap, 'applied_to_interest', v_int, 'applied_to_insurance', v_ins, 'applied_to_fees', v_fees));

    RETURN jsonb_build_object('success', true, 'is_replayed', false, 'payment_id', v_payment_id, 'amount', p_amount, 'applied_to_capital', v_cap, 'applied_to_interest', v_int);
END;
$$;
REVOKE ALL ON FUNCTION public.record_obligation_payment FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_obligation_payment TO authenticated;

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

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
    IF p_operation_type = 'PAYMENT' THEN
        SELECT * INTO v_pay FROM public.obligation_payments WHERE id = p_operation_id AND user_id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pago % no encontrado o no pertenece al usuario', p_operation_id; END IF;
        IF v_pay.is_reversed THEN RAISE EXCEPTION 'El pago ya fue revertido con anterioridad'; END IF;

        UPDATE public.accounts SET current_balance = current_balance + v_pay.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_pay.account_id;

        SELECT * INTO v_ob FROM public.period_obligations WHERE id = v_pay.obligation_id AND user_id = p_user_id FOR UPDATE;
        IF v_pay.payment_type <> 'PREPAYMENT_CAPITAL' THEN
        UPDATE public.period_obligations SET amount_paid = GREATEST(0.00, amount_paid - v_pay.amount), amount_pending = amount_pending + v_pay.amount, updated_at = timezone('utc'::text, now()) WHERE id = v_pay.obligation_id;
        END IF;

        IF v_ob.credit_product_id IS NOT NULL THEN
            UPDATE public.credit_products SET current_principal_balance = current_principal_balance + v_pay.applied_to_capital, remaining_installments = CASE WHEN v_pay.payment_type <> 'PREPAYMENT_CAPITAL' AND v_ob.amount_pending=0 THEN remaining_installments+1 ELSE remaining_installments END, status = CASE WHEN status='PAID_OFF' THEN 'ACTIVE' ELSE status END, updated_at = timezone('utc'::text, now()) WHERE id = v_ob.credit_product_id;
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
        IF v_acc.is_archived THEN
            RAISE EXCEPTION 'La cuenta esta archivada.';
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
REVOKE ALL ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_income(UUID, UUID, INTEGER, SMALLINT, VARCHAR, NUMERIC, DATE, VARCHAR, TEXT) TO authenticated, service_role;

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
    IF v_from.is_archived OR v_to.is_archived THEN
        RAISE EXCEPTION 'La cuenta esta archivada.';
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
REVOKE ALL ON FUNCTION public.record_internal_transfer(UUID, UUID, UUID, NUMERIC, NUMERIC, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_internal_transfer(UUID, UUID, UUID, NUMERIC, NUMERIC, VARCHAR, TEXT) TO authenticated, service_role;
