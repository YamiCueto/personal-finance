CREATE TABLE public.financial_account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  account_name text NOT NULL CHECK (length(trim(account_name)) > 0),
  institution_id uuid NULL,
  account_type varchar(30) NOT NULL CHECK (account_type IN ('SAVINGS', 'CHECKING', 'CASH', 'DIGITAL_WALLET', 'INVESTMENT')),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deletion_reason text NULL,
  operation_id uuid NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT chk_deletion_audit_owner_match CHECK (owner_user_id = deleted_by)
);

CREATE INDEX idx_account_deletion_audit_owner
  ON public.financial_account_deletion_audit(owner_user_id, deleted_at DESC);

CREATE INDEX idx_account_deletion_audit_account
  ON public.financial_account_deletion_audit(account_id);

ALTER TABLE public.financial_account_deletion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_deletion_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY financial_account_deletion_audit_read
  ON public.financial_account_deletion_audit
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id AND (SELECT auth.uid()) = deleted_by);

REVOKE ALL ON public.financial_account_deletion_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financial_account_deletion_audit TO authenticated, service_role;

CREATE TRIGGER trg_immutable_account_deletion_audit
  BEFORE UPDATE OR DELETE ON public.financial_account_deletion_audit
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

DROP TRIGGER IF EXISTS trg_no_delete_financial_audit_log ON public.financial_audit_log;
CREATE TRIGGER trg_no_delete_financial_audit_log
  BEFORE UPDATE OR DELETE ON public.financial_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_financial_deletion();

DROP POLICY IF EXISTS financial_audit_log_user_policy ON public.financial_audit_log;
CREATE POLICY financial_audit_log_user_policy
  ON public.financial_audit_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.financial_audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financial_audit_log TO authenticated, service_role;
GRANT SELECT ON public.internal_transfers TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_account_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.incomes WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.obligation_payments WHERE account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.internal_transfers WHERE from_account_id = OLD.id OR to_account_id = OLD.id)
    OR EXISTS (
      SELECT 1 FROM public.financial_audit_log
      WHERE event_type NOT IN ('ACCOUNT_ARCHIVED', 'ACCOUNT_RESTORED', 'ACCOUNT_DELETED')
        AND (
          entity_id = OLD.id
          OR payload->>'account_id' = OLD.id::text
          OR payload->>'from_account_id' = OLD.id::text
          OR payload->>'to_account_id' = OLD.id::text
        )
    )
  THEN
    RAISE EXCEPTION 'La cuenta tiene historial financiero y no puede eliminarse.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_account_deletion_audit
    WHERE account_id = OLD.id AND owner_user_id = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta sin su evento de auditoría confirmado.';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_account_deletion() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.delete_financial_account(uuid, uuid);

CREATE OR REPLACE FUNCTION public.delete_financial_account(
  p_user_id uuid,
  p_account_id uuid,
  p_reason text DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_account public.accounts;
  v_op_id uuid := coalesce(p_operation_id, gen_random_uuid());
  v_audit_id uuid;
  v_now timestamptz := timezone('utc', clock_timestamp());
  v_headers jsonb;
  v_origin text := 'No disponible';
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF v_caller IS NULL OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller) THEN
    RAISE EXCEPTION 'Sesión no autorizada.';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de cuenta requerido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text || ':delete:' || p_account_id::text, 0));

  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada o no pertenece al usuario';
  END IF;

  IF EXISTS (SELECT 1 FROM public.incomes WHERE account_id = v_account.id)
    OR EXISTS (SELECT 1 FROM public.obligation_payments WHERE account_id = v_account.id)
    OR EXISTS (SELECT 1 FROM public.internal_transfers WHERE from_account_id = v_account.id OR to_account_id = v_account.id)
    OR EXISTS (
      SELECT 1 FROM public.financial_audit_log
      WHERE event_type NOT IN ('ACCOUNT_ARCHIVED', 'ACCOUNT_RESTORED', 'ACCOUNT_DELETED')
        AND (
          entity_id = v_account.id
          OR payload->>'account_id' = v_account.id::text
          OR payload->>'from_account_id' = v_account.id::text
          OR payload->>'to_account_id' = v_account.id::text
        )
    )
  THEN
    RAISE EXCEPTION 'La cuenta tiene historial financiero y no puede eliminarse.';
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    IF v_headers IS NOT NULL AND coalesce(v_headers->>'x-forwarded-proto', '') <> '' THEN
      v_origin := 'postgrest:' || (v_headers->>'x-forwarded-proto');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_origin := 'No disponible';
  END;

  INSERT INTO public.financial_account_deletion_audit (
    account_id,
    account_name,
    institution_id,
    account_type,
    owner_user_id,
    deleted_by,
    deleted_at,
    deletion_reason,
    operation_id,
    metadata
  ) VALUES (
    v_account.id,
    v_account.name,
    v_account.institution_id,
    v_account.type,
    v_account.user_id,
    v_caller,
    v_now,
    v_reason,
    v_op_id,
    jsonb_build_object(
      'rpc', 'delete_financial_account',
      'operation_type', 'ACCOUNT_DELETED',
      'txid', txid_current()::text,
      'result', 'SUCCESS',
      'verified_origin', v_origin,
      'client_supplied_origin_trusted', false,
      'previous_state', jsonb_build_object(
        'is_archived', v_account.is_archived,
        'initial_balance', v_account.initial_balance,
        'current_balance', v_account.current_balance,
        'currency', v_account.currency
      ),
      'new_state', 'DELETED'
    )
  ) RETURNING id INTO v_audit_id;

  INSERT INTO public.financial_audit_log (
    user_id,
    event_type,
    entity_type,
    entity_id,
    amount,
    idempotency_key,
    payload,
    created_at
  ) VALUES (
    v_caller,
    'ACCOUNT_DELETED',
    'accounts',
    v_account.id,
    v_account.current_balance,
    v_op_id::text,
    jsonb_build_object(
      'account_id', v_account.id,
      'account_name', v_account.name,
      'account_type', v_account.type,
      'institution_id', v_account.institution_id,
      'owner_user_id', v_account.user_id,
      'deleted_by', v_caller,
      'operation', 'ACCOUNT_DELETED',
      'operation_id', v_op_id,
      'deletion_audit_id', v_audit_id,
      'deletion_reason', v_reason,
      'previous_state', jsonb_build_object('is_archived', v_account.is_archived, 'exists', true),
      'new_state', jsonb_build_object('is_archived', false, 'exists', false),
      'recorded_at', v_now
    ),
    v_now
  );

  DELETE FROM public.accounts WHERE id = v_account.id AND user_id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo completar la eliminación de la cuenta.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'operation_id', v_op_id,
    'account_id', v_account.id,
    'deleted_by', v_caller,
    'deleted_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_financial_account(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_financial_account(uuid, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_financial_account(
  p_user_id uuid,
  p_account_id uuid,
  p_idempotency_key varchar DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_account public.accounts;
  v_existing public.financial_audit_log;
  v_audit_id uuid;
  v_now timestamptz := timezone('utc', clock_timestamp());
  v_key varchar := nullif(trim(coalesce(p_idempotency_key, '')), '');
BEGIN
  IF v_caller IS NULL OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller) THEN
    RAISE EXCEPTION 'Sesión no autorizada.';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de cuenta requerido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text || ':archive:' || p_account_id::text, 0));

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.financial_audit_log
    WHERE user_id = v_caller AND idempotency_key = v_key;

    IF FOUND THEN
      IF v_existing.entity_id IS DISTINCT FROM p_account_id OR v_existing.event_type <> 'ACCOUNT_ARCHIVED' THEN
        RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada en otra operación.', v_key;
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'is_replayed', true,
        'audit_id', v_existing.id,
        'account_id', p_account_id,
        'is_archived', true
      );
    END IF;
  END IF;

  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada o no pertenece al usuario';
  END IF;

  IF v_account.is_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_replayed', true,
      'account_id', v_account.id,
      'is_archived', true
    );
  END IF;

  UPDATE public.accounts
  SET is_archived = true,
      updated_at = v_now
  WHERE id = v_account.id AND user_id = v_caller;

  INSERT INTO public.financial_audit_log (
    user_id,
    event_type,
    entity_type,
    entity_id,
    amount,
    idempotency_key,
    payload,
    created_at
  ) VALUES (
    v_caller,
    'ACCOUNT_ARCHIVED',
    'accounts',
    v_account.id,
    v_account.current_balance,
    v_key,
    jsonb_build_object(
      'account_id', v_account.id,
      'account_name', v_account.name,
      'performed_by', v_caller,
      'operation', 'ACCOUNT_ARCHIVED',
      'previous_state', jsonb_build_object('is_archived', false),
      'new_state', jsonb_build_object('is_archived', true),
      'recorded_at', v_now
    ),
    v_now
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_replayed', false,
    'audit_id', v_audit_id,
    'account_id', v_account.id,
    'is_archived', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_financial_account(uuid, uuid, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_financial_account(uuid, uuid, varchar) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_financial_account(
  p_user_id uuid,
  p_account_id uuid,
  p_idempotency_key varchar DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_account public.accounts;
  v_existing public.financial_audit_log;
  v_audit_id uuid;
  v_now timestamptz := timezone('utc', clock_timestamp());
  v_key varchar := nullif(trim(coalesce(p_idempotency_key, '')), '');
BEGIN
  IF v_caller IS NULL OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller) THEN
    RAISE EXCEPTION 'Sesión no autorizada.';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de cuenta requerido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text || ':restore:' || p_account_id::text, 0));

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.financial_audit_log
    WHERE user_id = v_caller AND idempotency_key = v_key;

    IF FOUND THEN
      IF v_existing.entity_id IS DISTINCT FROM p_account_id OR v_existing.event_type <> 'ACCOUNT_RESTORED' THEN
        RAISE EXCEPTION 'Conflicto de idempotencia: la clave % ya fue utilizada en otra operación.', v_key;
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'is_replayed', true,
        'audit_id', v_existing.id,
        'account_id', p_account_id,
        'is_archived', false
      );
    END IF;
  END IF;

  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada o no pertenece al usuario';
  END IF;

  IF NOT v_account.is_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_replayed', true,
      'account_id', v_account.id,
      'is_archived', false
    );
  END IF;

  UPDATE public.accounts
  SET is_archived = false,
      updated_at = v_now
  WHERE id = v_account.id AND user_id = v_caller;

  INSERT INTO public.financial_audit_log (
    user_id,
    event_type,
    entity_type,
    entity_id,
    amount,
    idempotency_key,
    payload,
    created_at
  ) VALUES (
    v_caller,
    'ACCOUNT_RESTORED',
    'accounts',
    v_account.id,
    v_account.current_balance,
    v_key,
    jsonb_build_object(
      'account_id', v_account.id,
      'account_name', v_account.name,
      'performed_by', v_caller,
      'operation', 'ACCOUNT_RESTORED',
      'previous_state', jsonb_build_object('is_archived', true),
      'new_state', jsonb_build_object('is_archived', false),
      'recorded_at', v_now
    ),
    v_now
  ) RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_replayed', false,
    'audit_id', v_audit_id,
    'account_id', v_account.id,
    'is_archived', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_financial_account(uuid, uuid, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_financial_account(uuid, uuid, varchar) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE ON public.accounts FROM authenticated;
    GRANT UPDATE (updated_at, name, color, statement_cutoff_day) ON public.accounts TO authenticated;
  END IF;
END $$;

