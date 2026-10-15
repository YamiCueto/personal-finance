-- ==============================================================================
-- PERSONAL FINANCE — MIGRATION SCRIPT FOR REVIEW ONLY (DO NOT RUN REMOTELY YET)
-- Description: Core financial schema with RLS, UUID, NUMERIC, CHECK constraints.
-- ==============================================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. ACCOUNTS TABLE (Cuentas financieras)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT')),
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'COP',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_accounts_user_name UNIQUE (user_id, name)
);

-- 3. CATEGORIES TABLE (Categorías de ingresos y obligaciones)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#00f2fe',
    icon VARCHAR(50) DEFAULT 'tag',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_categories_user_name UNIQUE (user_id, name)
);

-- 4. INCOMES TABLE (Ingresos mensuales)
CREATE TABLE IF NOT EXISTS public.incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    source_name VARCHAR(120) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    received_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. OBLIGATIONS TABLE (Obligaciones mensuales / Cuotas)
CREATE TABLE IF NOT EXISTS public.obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    name VARCHAR(150) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED')),
    notes TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. OBLIGATION PAYMENTS TABLE (Pagos parciales o totales de obligaciones)
CREATE TABLE IF NOT EXISTS public.obligation_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    obligation_id UUID NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. ACCOUNT TRANSFERS TABLE (Transferencias entre cuentas propias - Neutras)
CREATE TABLE IF NOT EXISTS public.account_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    to_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_transfers_different_accounts CHECK (from_account_id <> to_account_id)
);

-- 8. INDEXES FOR HIGH QUERY EFFICIENCY
CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_user_period ON public.incomes(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_obligations_user_period ON public.obligations(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_user_obligation ON public.obligation_payments(user_id, obligation_id);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON public.account_transfers(user_id);

-- 9. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

-- 10. STRICT RLS POLICIES (TENANT ISOLATION)
-- Accounts RLS
CREATE POLICY "Users can only view their own accounts" ON public.accounts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own accounts" ON public.accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own accounts" ON public.accounts
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own accounts" ON public.accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Categories RLS
CREATE POLICY "Users can only view their own categories" ON public.categories
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own categories" ON public.categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own categories" ON public.categories
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own categories" ON public.categories
    FOR DELETE USING (auth.uid() = user_id);

-- Incomes RLS
CREATE POLICY "Users can only view their own incomes" ON public.incomes
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own incomes" ON public.incomes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own incomes" ON public.incomes
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own incomes" ON public.incomes
    FOR DELETE USING (auth.uid() = user_id);

-- Obligations RLS
CREATE POLICY "Users can only view their own obligations" ON public.obligations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own obligations" ON public.obligations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own obligations" ON public.obligations
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own obligations" ON public.obligations
    FOR DELETE USING (auth.uid() = user_id);

-- Obligation Payments RLS
CREATE POLICY "Users can only view their own payments" ON public.obligation_payments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own payments" ON public.obligation_payments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own payments" ON public.obligation_payments
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own payments" ON public.obligation_payments
    FOR DELETE USING (auth.uid() = user_id);

-- Account Transfers RLS
CREATE POLICY "Users can only view their own transfers" ON public.account_transfers
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert their own transfers" ON public.account_transfers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only update their own transfers" ON public.account_transfers
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can only delete their own transfers" ON public.account_transfers
    FOR DELETE USING (auth.uid() = user_id);
