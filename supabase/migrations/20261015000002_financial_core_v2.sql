-- ==============================================================================
-- PERSONAL FINANCE — SCHEMA MIGRATION V2 (PROGRESSIVE & AUDITED MIGRATION)
-- ==============================================================================
-- Descripción:
--   Evolución del modelo financiero a V2 corrigiendo los defectos de auditoría:
--   1. Migración progresiva y segura desde base vacía o desde V1 sin pérdida de datos.
--   2. Aislamiento multiusuario estricto mediante claves foráneas compuestas (user_id, id).
--   3. Eliminación de distribución proporcional arbitraria y de comisiones inventadas.
--   4. Integridad de cuotas mediante triggers contables (amount_paid + amount_pending = amount).
--   5. Funciones atómicas transaccionales con bloqueo FOR UPDATE, concurrencia e idempotencia.
--   6. Precisión monetaria exacta en NUMERIC(15, 2).
--   7. Auditoría inmutable con reversos explícitos y prohibición de borrado silencioso.
--   8. Modelo financiero diferenciado (capital, intereses causados, exigible, liquidez y patrimonio).
-- ==============================================================================

-- 1. EXTENSIONES
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. INSTITUCIONES Y PROVEEDORES (Bancos, Fintechs, Aseguradoras, Comercios)
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(50),
    type VARCHAR(30) NOT NULL CHECK (type IN ('BANK', 'FINTECH', 'INSURANCE', 'MERCHANT', 'SERVICE_PROVIDER', 'OTHER')),
    website_url VARCHAR(255),
    phone_contact VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_institutions_user_name UNIQUE (user_id, name),
    CONSTRAINT uq_institutions_user_id UNIQUE (user_id, id)
);

-- Asegurar restricción única compuesta si la tabla ya existía
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_institutions_user_id'
    ) THEN
        ALTER TABLE public.institutions ADD CONSTRAINT uq_institutions_user_id UNIQUE (user_id, id);
    END IF;
END $$;

-- 3. EVOLUCIÓN DE TABLA ACCOUNTS (Cuentas financieras / Activos Líquidos)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL,
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'COP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_accounts_user_name UNIQUE (user_id, name)
);

-- Agregar columnas de V2 a accounts si provienen de V1
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'institution_id') THEN
        ALTER TABLE public.accounts ADD COLUMN institution_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'initial_balance') THEN
        ALTER TABLE public.accounts ADD COLUMN initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'statement_cutoff_day') THEN
        ALTER TABLE public.accounts ADD COLUMN statement_cutoff_day SMALLINT CHECK (statement_cutoff_day BETWEEN 1 AND 31);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'color') THEN
        ALTER TABLE public.accounts ADD COLUMN color VARCHAR(20) DEFAULT '#00f2fe';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'is_archived') THEN
        ALTER TABLE public.accounts ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- Migrar is_active a is_archived si existía en V1
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'is_active') THEN
        EXECUTE 'UPDATE public.accounts SET is_archived = NOT is_active WHERE is_archived = false';
    END IF;

    -- Actualizar restricción de tipo de cuenta
    ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
    ALTER TABLE public.accounts ADD CONSTRAINT chk_accounts_type CHECK (
        type IN ('SAVINGS', 'CHECKING', 'CASH', 'DIGITAL_WALLET', 'INVESTMENT', 'CREDIT_CARD')
    );

    -- Clave única compuesta para FKs compuestas
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_accounts_user_id') THEN
        ALTER TABLE public.accounts ADD CONSTRAINT uq_accounts_user_id UNIQUE (user_id, id);
    END IF;

    -- FK compuesta a institutions
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_accounts_institution') THEN
        ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_institution
            FOREIGN KEY (user_id, institution_id) REFERENCES public.institutions(user_id, id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. PRODUCTOS CREDITICIOS (Pasivos, Créditos, Tarjetas, Financiaciones)
CREATE TABLE IF NOT EXISTS public.credit_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(40) NOT NULL CHECK (type IN (
        'VEHICLE_LOAN', 'PERSONAL_LOAN', 'CONSUMER_LOAN', 'COMMERCIAL_LOAN',
        'CREDIT_CARD', 'MERCHANT_FINANCING', 'OTHER_CREDIT'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
        'ACTIVE', 'PAID_OFF', 'RESTRUCTURED', 'DEFAULTED', 'CANCELLED'
    )),

    -- Montos de capital y cupos
    original_principal NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (original_principal >= 0),
    current_principal_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (current_principal_balance >= 0),
    approved_credit_limit NUMERIC(15, 2) CHECK (approved_credit_limit >= 0),
    used_credit_limit NUMERIC(15, 2) CHECK (used_credit_limit >= 0),
    available_credit_limit NUMERIC(15, 2) CHECK (available_credit_limit >= 0),

    -- Fechas contractuales
    disbursement_date DATE,
    statement_cutoff_day SMALLINT CHECK (statement_cutoff_day BETWEEN 1 AND 31),
    due_payment_day SMALLINT CHECK (due_payment_day BETWEEN 1 AND 31),

    -- Plazos y cuotas
    total_installments INTEGER CHECK (total_installments > 0),
    remaining_installments INTEGER CHECK (remaining_installments >= 0),

    -- Tasas
    nominal_rate_monthly NUMERIC(7, 4) NOT NULL DEFAULT 0.0000,
    effective_annual_rate NUMERIC(7, 4) NOT NULL DEFAULT 0.0000,
    moratorium_rate_annual NUMERIC(7, 4),
    capitalization_period VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (capitalization_period IN (
        'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'
    )),
    amortization_method VARCHAR(30) NOT NULL DEFAULT 'FRENCH' CHECK (amortization_method IN (
        'FRENCH', 'GERMAN', 'AMERICAN', 'FIXED_INSTALLMENT'
    )),

    -- Seguros y cargos fijos contractuales
    associated_insurances_monthly NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (associated_insurances_monthly >= 0),
    management_fee_monthly NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (management_fee_monthly >= 0),

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_credit_product_user_name UNIQUE (user_id, name),
    CONSTRAINT uq_credit_products_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_credit_products_institution FOREIGN KEY (user_id, institution_id)
        REFERENCES public.institutions(user_id, id) ON DELETE RESTRICT
);

-- 5. COMPRAS Y AVANCES EN TARJETAS DE CRÉDITO
CREATE TABLE IF NOT EXISTS public.credit_card_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description VARCHAR(150) NOT NULL,
    original_amount NUMERIC(15, 2) NOT NULL CHECK (original_amount > 0),
    total_installments INTEGER NOT NULL CHECK (total_installments > 0),
    remaining_installments INTEGER NOT NULL CHECK (remaining_installments >= 0),
    interest_rate_monthly NUMERIC(7, 4) NOT NULL DEFAULT 0.0000,
    monthly_capital NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    monthly_interest NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_cc_purchases_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_cc_purchases_product FOREIGN KEY (user_id, product_id)
        REFERENCES public.credit_products(user_id, id) ON DELETE CASCADE
);

-- 6. OBLIGACIONES RECURRENTES (Suscripciones, Servicios, Pólizas, Apoyo Familiar)
CREATE TABLE IF NOT EXISTS public.recurrent_obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(40) NOT NULL CHECK (type IN (
        'SUBSCRIPTION', 'PUBLIC_SERVICE', 'TELECOM', 'INSURANCE_POLICY',
        'GYM', 'FAMILY_SUPPORT', 'PERSONAL_COMMITMENT', 'OTHER_RECURRENT'
    )),
    frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (frequency IN ('MONTHLY', 'BIMONTHLY', 'SEMIANNUAL', 'ANNUAL')),
    estimated_amount NUMERIC(15, 2) NOT NULL CHECK (estimated_amount >= 0),
    is_variable_amount BOOLEAN NOT NULL DEFAULT false,
    default_due_day SMALLINT CHECK (default_due_day BETWEEN 1 AND 31),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_recurrent_obligations_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_recurrent_obligations_institution FOREIGN KEY (user_id, institution_id)
        REFERENCES public.institutions(user_id, id) ON DELETE SET NULL
);

-- 7. OBLIGACIONES EXIGIBLES DEL PERÍODO (Filas Columna B/C del Excel)
CREATE TABLE IF NOT EXISTS public.period_obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credit_product_id UUID,
    recurrent_obligation_id UUID,
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN (
        'CREDIT_INSTALLMENT', 'RECURRENT_EXPENSE', 'AD_HOC_COMMITMENT'
    )),
    period_year INTEGER NOT NULL CHECK (period_year >= 2020),
    period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    name VARCHAR(150) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    due_date DATE,
    order_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED')),

    -- Descomposición financiera rigurosa
    capital_component NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (capital_component >= 0),
    interest_current_component NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (interest_current_component >= 0),
    interest_mora_component NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (interest_mora_component >= 0),
    insurance_component NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (insurance_component >= 0),
    other_fees_component NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (other_fees_component >= 0),

    -- Abonos y saldos pendientes
    amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    amount_pending NUMERIC(15, 2) CHECK (amount_pending >= 0),

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_period_obligations_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_period_obligations_credit FOREIGN KEY (user_id, credit_product_id)
        REFERENCES public.credit_products(user_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_period_obligations_recurrent FOREIGN KEY (user_id, recurrent_obligation_id)
        REFERENCES public.recurrent_obligations(user_id, id) ON DELETE SET NULL,
    CONSTRAINT chk_period_obligation_total_match CHECK (amount_paid + amount_pending = amount)
);

-- Trigger de Integridad Contable en period_obligations:
-- Autocompleta amount_pending si no se suministra, valida coherencia contable y desgloses
CREATE OR REPLACE FUNCTION public.fn_trg_period_obligations_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.amount_paid IS NULL THEN
        NEW.amount_paid := 0.00;
    END IF;

    IF (NEW.amount_pending IS NULL) OR (TG_OP = 'INSERT' AND NEW.amount_pending = 0.00 AND NEW.amount_paid = 0.00 AND NEW.amount > 0) THEN
        NEW.amount_pending := NEW.amount - NEW.amount_paid;
    END IF;

    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'El monto de la obligación debe ser estrictamente positivo';
    END IF;

    IF (NEW.amount_paid + NEW.amount_pending) <> NEW.amount THEN
        RAISE EXCEPTION 'Incoherencia contable: amount_paid (%) + amount_pending (%) != amount (%)',
            NEW.amount_paid, NEW.amount_pending, NEW.amount;
    END IF;

    IF NEW.amount_paid < 0 OR NEW.amount_pending < 0 THEN
        RAISE EXCEPTION 'Los saldos pagados y pendientes no pueden ser negativos';
    END IF;

    -- Actualización de estado según saldos
    IF NEW.status <> 'CANCELLED' THEN
        IF NEW.amount_pending = 0 THEN
            NEW.status := 'PAID';
        ELSIF NEW.amount_paid > 0 THEN
            NEW.status := 'PARTIAL';
        ELSE
            NEW.status := 'PENDING';
        END IF;
    END IF;

    -- Para cuotas de crédito estructuradas, los componentes deben sumar exactamente el monto
    IF NEW.source_type = 'CREDIT_INSTALLMENT' THEN
        DECLARE
            v_sum NUMERIC(15, 2);
        BEGIN
            v_sum := COALESCE(NEW.capital_component, 0.00) +
                     COALESCE(NEW.interest_current_component, 0.00) +
                     COALESCE(NEW.interest_mora_component, 0.00) +
                     COALESCE(NEW.insurance_component, 0.00) +
                     COALESCE(NEW.other_fees_component, 0.00);
            IF v_sum <> NEW.amount THEN
                RAISE EXCEPTION 'Desglose de cuota de crédito inconsistente: suma de componentes (%) != valor de cuota (%)',
                    v_sum, NEW.amount;
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_period_obligations_integrity ON public.period_obligations;
CREATE TRIGGER trg_period_obligations_integrity
BEFORE INSERT OR UPDATE ON public.period_obligations
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_period_obligations_integrity();

-- MIGRACIÓN DE DATOS DESDE V1 (obligations -> period_obligations)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'obligations'
    ) THEN
        INSERT INTO public.period_obligations (
            id, user_id, source_type, period_year, period_month, name, amount, due_date,
            order_index, status, capital_component, interest_current_component,
            insurance_component, other_fees_component, amount_paid, amount_pending, notes, created_at, updated_at
        )
        SELECT
            o.id,
            o.user_id,
            'AD_HOC_COMMITMENT' AS source_type,
            o.year AS period_year,
            o.month AS period_month,
            o.name,
            o.amount,
            o.due_date,
            o.order_index,
            o.status,
            0.00, 0.00, 0.00, 0.00,
            COALESCE(p.paid_sum, 0.00),
            GREATEST(0.00, o.amount - COALESCE(p.paid_sum, 0.00)),
            o.notes,
            o.created_at,
            o.updated_at
        FROM public.obligations o
        LEFT JOIN (
            SELECT obligation_id, SUM(amount) AS paid_sum
            FROM public.obligation_payments
            GROUP BY obligation_id
        ) p ON p.obligation_id = o.id
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 8. EVOLUCIÓN DE OBLIGATION_PAYMENTS (Registro auditable de abonos y pagos)
CREATE TABLE IF NOT EXISTS public.obligation_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    obligation_id UUID NOT NULL,
    account_id UUID NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
    -- Agregar columnas de V2 si provienen de V1
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'payment_type') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN payment_type VARCHAR(30) NOT NULL DEFAULT 'REGULAR_INSTALLMENT'
            CHECK (payment_type IN ('REGULAR_INSTALLMENT', 'PARTIAL_PAYMENT', 'PREPAYMENT_CAPITAL', 'FULL_PAYMENT'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'payment_date') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN payment_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'paid_at') THEN
            EXECUTE 'UPDATE public.obligation_payments SET payment_date = paid_at WHERE payment_date IS NULL';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'applied_to_capital') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN applied_to_capital NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (applied_to_capital >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'applied_to_interest') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN applied_to_interest NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (applied_to_interest >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'applied_to_insurance') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN applied_to_insurance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (applied_to_insurance >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'applied_to_fees') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN applied_to_fees NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (applied_to_fees >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'reference_number') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN reference_number VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN idempotency_key VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'is_reversed') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN is_reversed BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'reversed_at') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN reversed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'reversal_reason') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN reversal_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'obligation_payments' AND column_name = 'notes') THEN
        ALTER TABLE public.obligation_payments ADD COLUMN notes TEXT;
    END IF;

    -- Restricciones compuestas
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_obligation_payments_user_id') THEN
        ALTER TABLE public.obligation_payments ADD CONSTRAINT uq_obligation_payments_user_id UNIQUE (user_id, id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_user_idempotency') THEN
        ALTER TABLE public.obligation_payments ADD CONSTRAINT uq_payment_user_idempotency UNIQUE (user_id, idempotency_key);
    END IF;

    -- Eliminar FKs antiguas si apuntaban a tablas no compuestas
    ALTER TABLE public.obligation_payments DROP CONSTRAINT IF EXISTS obligation_payments_obligation_id_fkey;
    ALTER TABLE public.obligation_payments DROP CONSTRAINT IF EXISTS obligation_payments_account_id_fkey;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_obligation') THEN
        ALTER TABLE public.obligation_payments ADD CONSTRAINT fk_payments_obligation
            FOREIGN KEY (user_id, obligation_id) REFERENCES public.period_obligations(user_id, id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_account') THEN
        ALTER TABLE public.obligation_payments ADD CONSTRAINT fk_payments_account
            FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 9. EVENTOS DE REESTRUCTURACIÓN DE DEUDA (Rediferidos, Refinanciaciones)
CREATE TABLE IF NOT EXISTS public.debt_restructure_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credit_product_id UUID NOT NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,

    previous_principal_balance NUMERIC(15, 2) NOT NULL,
    previous_effective_annual_rate NUMERIC(7, 4) NOT NULL,
    previous_remaining_installments INTEGER NOT NULL,

    new_principal_balance NUMERIC(15, 2) NOT NULL,
    new_effective_annual_rate NUMERIC(7, 4) NOT NULL,
    new_total_installments INTEGER NOT NULL,
    refinancing_fees NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    reason TEXT NOT NULL,
    approved_by_institution_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_debt_restructure_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_restructure_credit FOREIGN KEY (user_id, credit_product_id)
        REFERENCES public.credit_products(user_id, id) ON DELETE CASCADE
);

-- 10. EVOLUCIÓN DE TABLA INCOMES (Ingresos del período)
CREATE TABLE IF NOT EXISTS public.incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID,
    source_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'period_year') THEN
        ALTER TABLE public.incomes ADD COLUMN period_year INTEGER CHECK (period_year >= 2020);
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'year') THEN
            EXECUTE 'UPDATE public.incomes SET period_year = year WHERE period_year IS NULL';
        ELSE
            EXECUTE 'UPDATE public.incomes SET period_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER WHERE period_year IS NULL';
        END IF;
        ALTER TABLE public.incomes ALTER COLUMN period_year SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'period_month') THEN
        ALTER TABLE public.incomes ADD COLUMN period_month SMALLINT CHECK (period_month BETWEEN 1 AND 12);
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'month') THEN
            EXECUTE 'UPDATE public.incomes SET period_month = month WHERE period_month IS NULL';
        ELSE
            EXECUTE 'UPDATE public.incomes SET period_month = EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT WHERE period_month IS NULL';
        END IF;
        ALTER TABLE public.incomes ALTER COLUMN period_month SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'received_date') THEN
        ALTER TABLE public.incomes ADD COLUMN received_date DATE DEFAULT CURRENT_DATE;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'received_at') THEN
            EXECUTE 'UPDATE public.incomes SET received_date = received_at WHERE received_date IS NULL';
        END IF;
        ALTER TABLE public.incomes ALTER COLUMN received_date SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'notes') THEN
        ALTER TABLE public.incomes ADD COLUMN notes TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.incomes ADD COLUMN idempotency_key VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'is_reversed') THEN
        ALTER TABLE public.incomes ADD COLUMN is_reversed BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'reversed_at') THEN
        ALTER TABLE public.incomes ADD COLUMN reversed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'reversal_reason') THEN
        ALTER TABLE public.incomes ADD COLUMN reversal_reason TEXT;
    END IF;

    -- Restricciones compuestas
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_incomes_user_id') THEN
        ALTER TABLE public.incomes ADD CONSTRAINT uq_incomes_user_id UNIQUE (user_id, id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_incomes_user_idempotency') THEN
        ALTER TABLE public.incomes ADD CONSTRAINT uq_incomes_user_idempotency UNIQUE (user_id, idempotency_key);
    END IF;

    ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_account_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incomes_account') THEN
        ALTER TABLE public.incomes ADD CONSTRAINT fk_incomes_account
            FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE SET NULL;
    END IF;
END $$;

-- 11. EVOLUCIÓN DE TRANSFERENCIAS INTERNAS (account_transfers -> internal_transfers)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_transfers'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'internal_transfers'
    ) THEN
        ALTER TABLE public.account_transfers RENAME TO internal_transfers;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.internal_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_account_id UUID NOT NULL,
    to_account_id UUID NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (fee_amount >= 0),
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_different_transfer_accounts CHECK (from_account_id <> to_account_id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transfers' AND column_name = 'fee_amount') THEN
        ALTER TABLE public.internal_transfers ADD COLUMN fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (fee_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transfers' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.internal_transfers ADD COLUMN idempotency_key VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transfers' AND column_name = 'is_reversed') THEN
        ALTER TABLE public.internal_transfers ADD COLUMN is_reversed BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transfers' AND column_name = 'reversed_at') THEN
        ALTER TABLE public.internal_transfers ADD COLUMN reversed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'internal_transfers' AND column_name = 'reversal_reason') THEN
        ALTER TABLE public.internal_transfers ADD COLUMN reversal_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_internal_transfers_user_id') THEN
        ALTER TABLE public.internal_transfers ADD CONSTRAINT uq_internal_transfers_user_id UNIQUE (user_id, id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_transfers_user_idempotency') THEN
        ALTER TABLE public.internal_transfers ADD CONSTRAINT uq_transfers_user_idempotency UNIQUE (user_id, idempotency_key);
    END IF;

    ALTER TABLE public.internal_transfers DROP CONSTRAINT IF EXISTS account_transfers_from_account_id_fkey;
    ALTER TABLE public.internal_transfers DROP CONSTRAINT IF EXISTS account_transfers_to_account_id_fkey;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transfers_from_account') THEN
        ALTER TABLE public.internal_transfers ADD CONSTRAINT fk_transfers_from_account
            FOREIGN KEY (user_id, from_account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transfers_to_account') THEN
        ALTER TABLE public.internal_transfers ADD CONSTRAINT fk_transfers_to_account
            FOREIGN KEY (user_id, to_account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 12. LOG DE AUDITORÍA FINANCIERA (Inmutable)
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    amount NUMERIC(15, 2),
    idempotency_key VARCHAR(100),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_audit_log_user_id UNIQUE (user_id, id)
);

-- 13. PREVENCIÓN DE BORRADO FÍSICO SILENCIOSO (Inmutabilidad Contable)
CREATE OR REPLACE FUNCTION public.fn_prevent_financial_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación denegada: Los registros financieros en % son inmutables y no pueden eliminarse físicamente. Utilice la función de reverso (reverse_operation).',
        TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_delete_obligation_payments ON public.obligation_payments;
CREATE TRIGGER trg_no_delete_obligation_payments
BEFORE DELETE ON public.obligation_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

DROP TRIGGER IF EXISTS trg_no_delete_internal_transfers ON public.internal_transfers;
CREATE TRIGGER trg_no_delete_internal_transfers
BEFORE DELETE ON public.internal_transfers
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

DROP TRIGGER IF EXISTS trg_no_delete_financial_audit_log ON public.financial_audit_log;
CREATE TRIGGER trg_no_delete_financial_audit_log
BEFORE DELETE ON public.financial_audit_log
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

-- 14. FUNCIONES TRANSACCIONALES ATÓMICAS

-- A. Registro de Pago / Abono de Obligación
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
    v_caller UUID := auth.uid();
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
    -- 1. Control de autenticación y autorización estricto
    IF v_caller IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
            RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
        END IF;
        p_user_id := v_caller;
    ELSIF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto del pago debe ser mayor a 0';
    END IF;

    -- 2. Control de Idempotencia con verificación de consistencia de payload
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, obligation_id, account_id INTO v_existing
        FROM public.obligation_payments
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.obligation_id <> p_obligation_id OR v_existing.account_id <> p_account_id THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'is_replayed', true,
                'payment_id', v_existing.id,
                'message', 'Operación idempotente: el pago ya había sido procesado previamente'
            );
        END IF;
    END IF;

    -- 3. Bloqueo pesimista de obligación y cuenta
    SELECT * INTO v_ob
    FROM public.period_obligations
    WHERE id = p_obligation_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Obligación % no encontrada o no pertenece al usuario', p_obligation_id;
    END IF;

    SELECT * INTO v_acc
    FROM public.accounts
    WHERE id = p_account_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta % no encontrada o no pertenece al usuario', p_account_id;
    END IF;

    -- 4. Validación de fondos en cuenta
    IF v_acc.current_balance < p_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta. Saldo actual: %, Requerido: %',
            v_acc.current_balance, p_amount;
    END IF;

    -- 5. Validación de sobrepago
    IF p_payment_type <> 'PREPAYMENT_CAPITAL' THEN
        IF p_amount > v_ob.amount_pending THEN
            RAISE EXCEPTION 'Intento de sobrepago: el monto % excede el saldo pendiente exigible %',
                p_amount, v_ob.amount_pending;
        END IF;

        IF v_ob.status = 'PAID' THEN
            RAISE EXCEPTION 'La obligación ya se encuentra totalmente cancelada';
        END IF;
    END IF;

    -- 6. Determinación del desglose financiero sin inventar comisiones
    IF p_payment_type = 'PREPAYMENT_CAPITAL' THEN
        v_cap := p_amount;
    ELSIF p_applied_to_capital IS NOT NULL OR p_applied_to_interest IS NOT NULL OR
          p_applied_to_insurance IS NOT NULL OR p_applied_to_fees IS NOT NULL THEN
        v_cap := COALESCE(p_applied_to_capital, 0.00);
        v_int := COALESCE(p_applied_to_interest, 0.00);
        v_ins := COALESCE(p_applied_to_insurance, 0.00);
        v_fees := COALESCE(p_applied_to_fees, 0.00);

        IF (v_cap + v_int + v_ins + v_fees) <> p_amount THEN
            RAISE EXCEPTION 'Desglose explícito inconsistente: suma (%) != valor del pago (%)',
                (v_cap + v_int + v_ins + v_fees), p_amount;
        END IF;
    ELSE
        -- Cascada Contractual Estándar: Mora -> Comisiones -> Seguro -> Interés -> Capital
        DECLARE
            v_rem NUMERIC(15, 2) := p_amount;
            v_take NUMERIC(15, 2);
        BEGIN
            v_take := LEAST(v_rem, COALESCE(v_ob.interest_mora_component, 0.00));
            v_rem := v_rem - v_take;
            v_int := v_take;

            v_take := LEAST(v_rem, COALESCE(v_ob.other_fees_component, 0.00));
            v_rem := v_rem - v_take;
            v_fees := v_take;

            v_take := LEAST(v_rem, COALESCE(v_ob.insurance_component, 0.00));
            v_rem := v_rem - v_take;
            v_ins := v_take;

            v_take := LEAST(v_rem, COALESCE(v_ob.interest_current_component, 0.00));
            v_rem := v_rem - v_take;
            v_int := v_int + v_take;

            v_take := LEAST(v_rem, COALESCE(v_ob.capital_component, 0.00));
            v_rem := v_rem - v_take;
            v_cap := v_take;

            IF v_rem > 0 THEN
                v_cap := v_cap + v_rem;
            END IF;
        END;
    END IF;

    -- 7. Débito atómico a la cuenta
    UPDATE public.accounts
    SET current_balance = current_balance - p_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_account_id;

    -- 8. Actualización de la obligación
    IF p_payment_type <> 'PREPAYMENT_CAPITAL' THEN
        v_new_paid := v_ob.amount_paid + p_amount;
        v_new_pending := v_ob.amount_pending - p_amount;

        UPDATE public.period_obligations
        SET amount_paid = v_new_paid,
            amount_pending = v_new_pending,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_obligation_id;
    END IF;

    -- 9. Amortización directa a capital en el crédito asociado
    IF v_ob.credit_product_id IS NOT NULL AND v_cap > 0 THEN
        UPDATE public.credit_products
        SET current_principal_balance = GREATEST(0.00, current_principal_balance - v_cap),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_ob.credit_product_id;
    END IF;

    -- 10. Inserción de pago auditable
    INSERT INTO public.obligation_payments (
        user_id, obligation_id, account_id, payment_type, amount,
        applied_to_capital, applied_to_interest, applied_to_insurance, applied_to_fees,
        reference_number, idempotency_key, notes
    ) VALUES (
        p_user_id, p_obligation_id, p_account_id, p_payment_type, p_amount,
        v_cap, v_int, v_ins, v_fees,
        p_reference_number, p_idempotency_key, p_notes
    ) RETURNING id INTO v_payment_id;

    -- 11. Registro en log inmutable
    INSERT INTO public.financial_audit_log (
        user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload
    ) VALUES (
        p_user_id, 'PAYMENT_RECORDED', 'obligation_payments', v_payment_id, p_amount, p_idempotency_key,
        jsonb_build_object(
            'obligation_id', p_obligation_id,
            'account_id', p_account_id,
            'payment_type', p_payment_type,
            'amount', p_amount,
            'applied_to_capital', v_cap,
            'applied_to_interest', v_int,
            'applied_to_insurance', v_ins,
            'applied_to_fees', v_fees
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_replayed', false,
        'payment_id', v_payment_id,
        'amount', p_amount,
        'applied_to_capital', v_cap,
        'applied_to_interest', v_int
    );
END;
$$;

-- B. Registro de Transferencia Interna (Neutro, seguro contra deadlocks e idempotente)
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
    v_caller UUID := auth.uid();
    v_existing RECORD;
    v_from RECORD;
    v_to RECORD;
    v_transfer_id UUID;
    v_total_debit NUMERIC(15, 2);
BEGIN
    -- 1. Control de autenticación y autorización
    IF v_caller IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
            RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
        END IF;
        p_user_id := v_caller;
    ELSIF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y destino deben ser distintas';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    v_total_debit := p_amount + COALESCE(p_fee_amount, 0.00);

    -- 2. Idempotencia con verificación de consistencia de payload
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, from_account_id, to_account_id INTO v_existing
        FROM public.internal_transfers
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.from_account_id <> p_from_account_id OR v_existing.to_account_id <> p_to_account_id THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'is_replayed', true,
                'transfer_id', v_existing.id,
                'message', 'Operación idempotente: transferencia ya procesada'
            );
        END IF;
    END IF;

    -- 3. Bloqueo ordenado determinístico para evitar interbloqueos (deadlocks)
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
        RAISE EXCEPTION 'Saldo insuficiente en cuenta origen. Saldo actual: %, Requerido: %',
            v_from.current_balance, v_total_debit;
    END IF;

    -- 4. Débito en origen y crédito en destino
    UPDATE public.accounts
    SET current_balance = current_balance - v_total_debit, updated_at = timezone('utc'::text, now())
    WHERE id = p_from_account_id;

    UPDATE public.accounts
    SET current_balance = current_balance + p_amount, updated_at = timezone('utc'::text, now())
    WHERE id = p_to_account_id;

    INSERT INTO public.internal_transfers (
        user_id, from_account_id, to_account_id, amount, fee_amount, idempotency_key, notes
    ) VALUES (
        p_user_id, p_from_account_id, p_to_account_id, p_amount, COALESCE(p_fee_amount, 0.00), p_idempotency_key, p_notes
    ) RETURNING id INTO v_transfer_id;

    INSERT INTO public.financial_audit_log (
        user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload
    ) VALUES (
        p_user_id, 'TRANSFER_RECORDED', 'internal_transfers', v_transfer_id, p_amount, p_idempotency_key,
        jsonb_build_object(
            'from_account_id', p_from_account_id,
            'to_account_id', p_to_account_id,
            'amount', p_amount,
            'fee_amount', p_fee_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_replayed', false,
        'transfer_id', v_transfer_id,
        'amount', p_amount
    );
END;
$$;

-- C. Registro de Ingreso
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
    v_caller UUID := auth.uid();
    v_existing RECORD;
    v_income_id UUID;
    v_acc RECORD;
BEGIN
    -- 1. Control de autenticación y autorización
    IF v_caller IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
            RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
        END IF;
        p_user_id := v_caller;
    ELSIF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto del ingreso debe ser mayor a 0';
    END IF;

    -- 2. Idempotencia con verificación de consistencia de payload
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, source_name INTO v_existing
        FROM public.incomes
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF v_existing.id IS NOT NULL THEN
            IF v_existing.amount <> p_amount OR v_existing.source_name <> p_source_name THEN
                RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada con parámetros diferentes', p_idempotency_key;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'is_replayed', true,
                'income_id', v_existing.id,
                'message', 'Operación idempotente: ingreso ya registrado'
            );
        END IF;
    END IF;

    IF p_account_id IS NOT NULL THEN
        SELECT * INTO v_acc
        FROM public.accounts
        WHERE id = p_account_id AND user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'La cuenta seleccionada no existe o no pertenece al usuario';
        END IF;

        UPDATE public.accounts
        SET current_balance = current_balance + p_amount, updated_at = timezone('utc'::text, now())
        WHERE id = p_account_id;
    END IF;

    INSERT INTO public.incomes (
        user_id, account_id, period_year, period_month, source_name, amount, received_date, idempotency_key, notes
    ) VALUES (
        p_user_id, p_account_id, p_period_year, p_period_month, p_source_name, p_amount, p_received_date, p_idempotency_key, p_notes
    ) RETURNING id INTO v_income_id;

    INSERT INTO public.financial_audit_log (
        user_id, event_type, entity_type, entity_id, amount, idempotency_key, payload
    ) VALUES (
        p_user_id, 'INCOME_RECORDED', 'incomes', v_income_id, p_amount, p_idempotency_key,
        jsonb_build_object(
            'account_id', p_account_id,
            'source_name', p_source_name,
            'amount', p_amount,
            'period_year', p_period_year,
            'period_month', p_period_month
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_replayed', false,
        'income_id', v_income_id,
        'amount', p_amount
    );
END;
$$;

-- D. Reverso Atómico de Operación Financiera (Pago, Transferencia, Ingreso)
CREATE OR REPLACE FUNCTION public.reverse_operation(
    p_user_id UUID,
    p_operation_type VARCHAR(30), -- 'PAYMENT', 'TRANSFER', 'INCOME'
    p_operation_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_pay RECORD;
    v_trans RECORD;
    v_inc RECORD;
    v_ob RECORD;
BEGIN
    -- 1. Control de autenticación y autorización
    IF v_caller IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
            RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
        END IF;
        p_user_id := v_caller;
    ELSIF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Debe especificarse un motivo justificativo para el reverso financiero';
    END IF;

    IF p_operation_type = 'PAYMENT' THEN
        SELECT * INTO v_pay
        FROM public.obligation_payments
        WHERE id = p_operation_id AND user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pago % no encontrado o no pertenece al usuario', p_operation_id;
        END IF;

        IF v_pay.is_reversed THEN
            RAISE EXCEPTION 'El pago ya fue revertido con anterioridad';
        END IF;

        -- 1. Restituir saldo a la cuenta
        UPDATE public.accounts
        SET current_balance = current_balance + v_pay.amount, updated_at = timezone('utc'::text, now())
        WHERE id = v_pay.account_id;

        -- 2. Restituir saldo a la obligación
        SELECT * INTO v_ob
        FROM public.period_obligations
        WHERE id = v_pay.obligation_id AND user_id = p_user_id
        FOR UPDATE;

        UPDATE public.period_obligations
        SET amount_paid = GREATEST(0.00, amount_paid - v_pay.amount),
            amount_pending = amount_pending + v_pay.amount,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_pay.obligation_id;

        -- 3. Si amortizó a capital en crédito, restituir saldo adeudado
        IF v_ob.credit_product_id IS NOT NULL AND v_pay.applied_to_capital > 0 THEN
            UPDATE public.credit_products
            SET current_principal_balance = current_principal_balance + v_pay.applied_to_capital,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_ob.credit_product_id;
        END IF;

        -- 4. Marcar pago como revertido
        UPDATE public.obligation_payments
        SET is_reversed = true,
            reversed_at = timezone('utc'::text, now()),
            reversal_reason = p_reason
        WHERE id = p_operation_id;

        -- 5. Auditoría
        INSERT INTO public.financial_audit_log (
            user_id, event_type, entity_type, entity_id, amount, payload
        ) VALUES (
            p_user_id, 'PAYMENT_REVERSED', 'obligation_payments', p_operation_id, v_pay.amount,
            jsonb_build_object('reason', p_reason, 'obligation_id', v_pay.obligation_id)
        );

        RETURN jsonb_build_object('success', true, 'operation', 'PAYMENT', 'reversal_id', p_operation_id);

    ELSIF p_operation_type = 'TRANSFER' THEN
        SELECT * INTO v_trans
        FROM public.internal_transfers
        WHERE id = p_operation_id AND user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transferencia % no encontrada o no pertenece al usuario', p_operation_id;
        END IF;

        IF v_trans.is_reversed THEN
            RAISE EXCEPTION 'La transferencia ya fue revertida previamente';
        END IF;

        -- Bloqueo en orden para restitución
        IF v_trans.from_account_id < v_trans.to_account_id THEN
            PERFORM 1 FROM public.accounts WHERE id = v_trans.from_account_id FOR UPDATE;
            PERFORM 1 FROM public.accounts WHERE id = v_trans.to_account_id FOR UPDATE;
        ELSE
            PERFORM 1 FROM public.accounts WHERE id = v_trans.to_account_id FOR UPDATE;
            PERFORM 1 FROM public.accounts WHERE id = v_trans.from_account_id FOR UPDATE;
        END IF;

        -- Restituir: debitar a to_account y acreditar a from_account
        UPDATE public.accounts
        SET current_balance = current_balance - v_trans.amount, updated_at = timezone('utc'::text, now())
        WHERE id = v_trans.to_account_id;

        UPDATE public.accounts
        SET current_balance = current_balance + (v_trans.amount + v_trans.fee_amount), updated_at = timezone('utc'::text, now())
        WHERE id = v_trans.from_account_id;

        UPDATE public.internal_transfers
        SET is_reversed = true, reversed_at = timezone('utc'::text, now()), reversal_reason = p_reason
        WHERE id = p_operation_id;

        INSERT INTO public.financial_audit_log (
            user_id, event_type, entity_type, entity_id, amount, payload
        ) VALUES (
            p_user_id, 'TRANSFER_REVERSED', 'internal_transfers', p_operation_id, v_trans.amount,
            jsonb_build_object('reason', p_reason)
        );

        RETURN jsonb_build_object('success', true, 'operation', 'TRANSFER', 'reversal_id', p_operation_id);

    ELSIF p_operation_type = 'INCOME' THEN
        SELECT * INTO v_inc
        FROM public.incomes
        WHERE id = p_operation_id AND user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ingreso % no encontrado o no pertenece al usuario', p_operation_id;
        END IF;

        IF v_inc.is_reversed THEN
            RAISE EXCEPTION 'El ingreso ya fue revertido previamente';
        END IF;

        IF v_inc.account_id IS NOT NULL THEN
            UPDATE public.accounts
            SET current_balance = current_balance - v_inc.amount, updated_at = timezone('utc'::text, now())
            WHERE id = v_inc.account_id;
        END IF;

        UPDATE public.incomes
        SET is_reversed = true, reversed_at = timezone('utc'::text, now()), reversal_reason = p_reason
        WHERE id = p_operation_id;

        INSERT INTO public.financial_audit_log (
            user_id, event_type, entity_type, entity_id, amount, payload
        ) VALUES (
            p_user_id, 'INCOME_REVERSED', 'incomes', p_operation_id, v_inc.amount,
            jsonb_build_object('reason', p_reason)
        );

        RETURN jsonb_build_object('success', true, 'operation', 'INCOME', 'reversal_id', p_operation_id);
    ELSE
        RAISE EXCEPTION 'Tipo de operación no soportado para reverso: %', p_operation_type;
    END IF;
END;
$$;

-- E. Registro de Rediferido / Reestructuración de Crédito
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
    v_caller UUID := auth.uid();
    v_credit RECORD;
    v_event_id UUID;
    v_new_monthly_rate NUMERIC(7, 4);
BEGIN
    -- 1. Control de autenticación y autorización
    IF v_caller IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
            RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
        END IF;
        p_user_id := v_caller;
    ELSIF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT * INTO v_credit
    FROM public.credit_products
    WHERE id = p_credit_product_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto de crédito % no encontrado o no pertenece al usuario', p_credit_product_id;
    END IF;

    -- Tasa mensual derivada de EA: i = (1 + EA)^(1/12) - 1 con 4 decimales exactos
    v_new_monthly_rate := ROUND(
        (POWER(1.0 + (p_new_effective_annual_rate / 100.0), 1.0 / 12.0) - 1.0) * 100.0,
        4
    );

    -- Registrar evento histórico inmutable
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

    -- Actualizar condiciones contractuales del crédito
    UPDATE public.credit_products
    SET current_principal_balance = p_new_principal_balance,
        effective_annual_rate = p_new_effective_annual_rate,
        nominal_rate_monthly = v_new_monthly_rate,
        total_installments = p_new_total_installments,
        remaining_installments = p_new_total_installments,
        status = 'RESTRUCTURED',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_credit_product_id;

    INSERT INTO public.financial_audit_log (
        user_id, event_type, entity_type, entity_id, amount, payload
    ) VALUES (
        p_user_id, 'RESTRUCTURE_RECORDED', 'debt_restructure_events', v_event_id, p_new_principal_balance,
        jsonb_build_object(
            'credit_product_id', p_credit_product_id,
            'previous_balance', v_credit.current_principal_balance,
            'new_balance', p_new_principal_balance,
            'new_ea', p_new_effective_annual_rate
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', v_event_id,
        'new_principal_balance', p_new_principal_balance,
        'new_monthly_rate', v_new_monthly_rate
    );
END;
$$;

-- 15. ÍNDICES DE RENDIMIENTO Y CONSULTA
CREATE INDEX IF NOT EXISTS idx_institutions_user ON public.institutions(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_products_user ON public.credit_products(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_purchases_product ON public.credit_card_purchases(user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_recurrent_obligations_user ON public.recurrent_obligations(user_id);
CREATE INDEX IF NOT EXISTS idx_period_obligations_user_period ON public.period_obligations(user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_user_ob ON public.obligation_payments(user_id, obligation_id);
CREATE INDEX IF NOT EXISTS idx_incomes_user_period ON public.incomes(user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON public.internal_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.financial_audit_log(user_id, entity_type, entity_id);

-- 16. SEGURIDAD DE NIVEL DE FILA (RLS) ESTRICTA CON FORZADO
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.credit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.credit_card_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_purchases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recurrent_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrent_obligations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.period_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_obligations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obligation_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.debt_restructure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_restructure_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_transfers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_log FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'institutions', 'accounts', 'credit_products', 'credit_card_purchases',
            'recurrent_obligations', 'period_obligations', 'obligation_payments',
            'debt_restructure_events', 'incomes', 'internal_transfers', 'financial_audit_log'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_user_policy ON public.%I', t, t);
        EXECUTE format('
            CREATE POLICY %I_user_policy ON public.%I
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id)
        ', t, t);
    END LOOP;
END $$;

-- 17. PRIVILEGIOS DE EJECUCIÓN (POLÍTICA DE MÍNIMO PRIVILEGIO)
REVOKE ALL ON FUNCTION public.record_obligation_payment FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_internal_transfer FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_income FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_operation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_debt_restructure FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.record_obligation_payment TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_internal_transfer TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_income TO authenticated;
        GRANT EXECUTE ON FUNCTION public.reverse_operation TO authenticated;
        GRANT EXECUTE ON FUNCTION public.record_debt_restructure TO authenticated;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.record_obligation_payment TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_internal_transfer TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_income TO service_role;
        GRANT EXECUTE ON FUNCTION public.reverse_operation TO service_role;
        GRANT EXECUTE ON FUNCTION public.record_debt_restructure TO service_role;
    END IF;
END $$;

