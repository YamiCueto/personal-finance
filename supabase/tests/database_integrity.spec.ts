import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Integridad Financiera de Base de Datos — PostgreSQL / Supabase V2', () => {
  let db: PGlite;

  const v1Script = fs.readFileSync(
    path.resolve(__dirname, '../migrations/20261015000001_financial_core_schema.sql'),
    'utf-8'
  );

  const v2Script = fs.readFileSync(
    path.resolve(__dirname, '../migrations/20261015000002_financial_core_v2.sql'),
    'utf-8'
  );

  // Setup de entorno Supabase simulado (auth schema y función auth.uid())
  async function setupSupabaseAuth(pg: PGlite) {
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;
    `);
  }

  beforeEach(async () => {
    db = new PGlite();
    await setupSupabaseAuth(db);
  });

  // 1. Migración desde base vacía
  it('Prueba 1: debe ejecutar la migración completa desde base vacía (V1 seguido de V2)', async () => {
    await db.exec(v1Script);
    await db.exec(v2Script);

    // Verificar que las tablas principales existan
    const res = await db.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    const tables = res.rows.map((r) => r.tablename);
    expect(tables).toContain('institutions');
    expect(tables).toContain('accounts');
    expect(tables).toContain('credit_products');
    expect(tables).toContain('period_obligations');
    expect(tables).toContain('obligation_payments');
    expect(tables).toContain('internal_transfers');
    expect(tables).toContain('debt_restructure_events');
    expect(tables).toContain('financial_audit_log');
  });

  // 2. Evolución de V1 a V2 sin pérdida de datos
  it('Prueba 2: debe evolucionar una base preexistente en V1 a V2 conservando todos los datos intactos', async () => {
    // 1. Aplicar V1
    await db.exec(v1Script);

    const user1 = '11111111-1111-1111-1111-111111111111';
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'user1@example.com')`, [user1]);

    // Insertar datos en V1
    await db.query(`
      INSERT INTO public.accounts (id, user_id, name, type, current_balance, is_active)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${user1}', 'Bancolombia Ahorros', 'SAVINGS', 3500000, true);
    `);

    await db.query(`
      INSERT INTO public.incomes (id, user_id, month, year, source_name, amount)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${user1}', 5, 2026, 'Sueldo Mayo', 4500000);
    `);

    await db.query(`
      INSERT INTO public.obligations (id, user_id, month, year, name, amount, status)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '${user1}', 5, 2026, 'Servicio Gas', 80000, 'PENDING');
    `);

    await db.query(`
      INSERT INTO public.obligation_payments (id, user_id, obligation_id, amount)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '${user1}', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 30000);
    `);

    // 2. Ejecutar la migración V2 sobre la base poblada
    await db.exec(v2Script);

    // 3. Comprobar que la cuenta tiene las nuevas columnas y el mapeo is_archived = false
    const accRes = await db.query<{ name: string; is_archived: boolean; current_balance: string }>(`
      SELECT name, is_archived, current_balance FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    `);
    expect(accRes.rows[0].name).toBe('Bancolombia Ahorros');
    expect(accRes.rows[0].is_archived).toBe(false);
    expect(parseFloat(accRes.rows[0].current_balance)).toBe(3500000);

    // 4. Comprobar que incomes migró month/year a period_month/period_year
    const incRes = await db.query<{ period_month: number; period_year: number; amount: string }>(`
      SELECT period_month, period_year, amount FROM public.incomes WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    `);
    expect(incRes.rows[0].period_month).toBe(5);
    expect(incRes.rows[0].period_year).toBe(2026);
    expect(parseFloat(incRes.rows[0].amount)).toBe(4500000);

    // 5. Comprobar que la obligación de V1 fue migrada a period_obligations con sus abonos
    const obRes = await db.query<{ name: string; amount: string; amount_paid: string; amount_pending: string }>(`
      SELECT name, amount, amount_paid, amount_pending FROM public.period_obligations
      WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    `);
    expect(obRes.rows[0].name).toBe('Servicio Gas');
    expect(parseFloat(obRes.rows[0].amount)).toBe(80000);
    expect(parseFloat(obRes.rows[0].amount_paid)).toBe(30000);
    expect(parseFloat(obRes.rows[0].amount_pending)).toBe(50000);
  });

  // 3. Aislamiento multiusuario con claves foráneas compuestas
  it('Prueba 3: debe rechazar referencias cruzadas entre usuarios mediante FK compuesta (user_id, id)', async () => {
    await db.exec(v1Script);
    await db.exec(v2Script);

    const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'usera@test.com'), ($2, 'userb@test.com')`, [
      userA,
      userB,
    ]);

    // User A crea una cuenta
    const accA = '11111111-1111-1111-1111-111111111111';
    await db.query(`
      INSERT INTO public.accounts (id, user_id, name, type, current_balance)
      VALUES ('${accA}', '${userA}', 'Cuenta Privada A', 'SAVINGS', 10000000);
    `);

    // Intento malicioso / bug: User B intenta asociar su ingreso a la cuenta de User A
    await expect(
      db.query(`
        INSERT INTO public.incomes (user_id, account_id, period_year, period_month, source_name, amount)
        VALUES ('${userB}', '${accA}', 2026, 1, 'Intento de Secuestro', 500000);
      `)
    ).rejects.toThrow();

    // User A crea una institución
    const instA = '22222222-2222-2222-2222-222222222222';
    await db.query(`
      INSERT INTO public.institutions (id, user_id, name, type)
      VALUES ('${instA}', '${userA}', 'Banco de Occidente A', 'BANK');
    `);

    // User B intenta crear un crédito referenciando la institución de User A
    await expect(
      db.query(`
        INSERT INTO public.credit_products (user_id, institution_id, name, type, original_principal)
        VALUES ('${userB}', '${instA}', 'Crédito Ilegítimo', 'PERSONAL_LOAN', 5000000);
      `)
    ).rejects.toThrow();

    // Ejecutar script formal de pruebas RLS supabase/tests/rls_isolation_test.sql
    const rlsSql = fs.readFileSync(path.resolve(__dirname, 'rls_isolation_test.sql'), 'utf-8');
    await db.query(`
      INSERT INTO auth.users (id, email)
      VALUES
        ('00000000-0000-0000-0000-00000000000a', 'usera@test.com'),
        ('00000000-0000-0000-0000-00000000000b', 'userb@test.com')
      ON CONFLICT (id) DO NOTHING;
    `);

    // El script ejecuta un ROLLBACK controlado que termina con éxito
    await expect(db.exec(rlsSql)).resolves.not.toThrow();
  });

  // 4, 5, 6, 7, 9, 11: Pruebas Transaccionales y de Integridad
  describe('Operaciones Atómicas de Pago, Idempotencia, Sobrepago y Reversos', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const accId = '11111111-1111-1111-1111-111111111111';
    const obId = '22222222-2222-2222-2222-222222222222';
    const creditId = '33333333-3333-3333-3333-333333333333';
    const instId = '44444444-4444-4444-4444-444444444444';

    beforeEach(async () => {
      await db.exec(v1Script);
      await db.exec(v2Script);

      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.com')`, [userId]);

      // Institución y Cuenta
      await db.query(`
        INSERT INTO public.institutions (id, user_id, name, type)
        VALUES ('${instId}', '${userId}', 'Banco Occidente', 'BANK');
      `);

      await db.query(`
        INSERT INTO public.accounts (id, user_id, institution_id, name, type, current_balance)
        VALUES ('${accId}', '${userId}', '${instId}', 'Cuenta Principal', 'SAVINGS', 10000000);
      `);

      // Crédito
      await db.query(`
        INSERT INTO public.credit_products (
          id, user_id, institution_id, name, type, original_principal, current_principal_balance,
          nominal_rate_monthly, effective_annual_rate, total_installments, remaining_installments
        ) VALUES (
          '${creditId}', '${userId}', '${instId}', 'Crédito Vehículo', 'VEHICLE_LOAN', 50000000, 40000000,
          1.4, 18.0, 60, 48
        );
      `);

      // Cuota exigible del período: 1,250,000 (Seguro: 50k, Interés: 400k, Capital: 800k)
      await db.query(`
        INSERT INTO public.period_obligations (
          id, user_id, credit_product_id, source_type, period_year, period_month, name, amount,
          capital_component, interest_current_component, insurance_component
        ) VALUES (
          '${obId}', '${userId}', '${creditId}', 'CREDIT_INSTALLMENT', 2026, 1, 'Cuota 13/60', 1250000,
          800000, 400000, 50000
        );
      `);
    });

    // 4. Pago Parcial
    it('Prueba 4: debe registrar un pago parcial debitando la cuenta y actualizando la cuota con prelación', async () => {
      const res = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID,
          '${obId}'::UUID,
          '${accId}'::UUID,
          500000.00,
          'PARTIAL_PAYMENT'
        ) AS record_obligation_payment;
      `);

      const paymentResult = res.rows[0].record_obligation_payment;
      expect(paymentResult.success).toBe(true);

      // Comprobar saldo en cuenta (10,000,000 - 500,000 = 9,500,000)
      const accRes = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accId}'`);
      expect(parseFloat(accRes.rows[0].current_balance)).toBe(9500000);

      // Comprobar estado de cuota
      const obRes = await db.query<{ status: string; amount_paid: string; amount_pending: string }>(`
        SELECT status, amount_paid, amount_pending FROM public.period_obligations WHERE id = '${obId}'
      `);
      expect(obRes.rows[0].status).toBe('PARTIAL');
      expect(parseFloat(obRes.rows[0].amount_paid)).toBe(500000);
      expect(parseFloat(obRes.rows[0].amount_pending)).toBe(750000);

      // Prelación contractual: 50k seguro + 400k interés + 50k capital = 500k
      expect(paymentResult.applied_to_capital).toBe(50000);
      expect(paymentResult.applied_to_interest).toBe(400000);
    });

    // 5. Pago Completo
    it('Prueba 5: debe registrar un pago completo cambiando el estado a PAID y amount_pending a 0', async () => {
      await db.query(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID,
          '${obId}'::UUID,
          '${accId}'::UUID,
          1250000.00,
          'FULL_PAYMENT'
        );
      `);

      const obRes = await db.query<{ status: string; amount_paid: string; amount_pending: string }>(`
        SELECT status, amount_paid, amount_pending FROM public.period_obligations WHERE id = '${obId}'
      `);
      expect(obRes.rows[0].status).toBe('PAID');
      expect(parseFloat(obRes.rows[0].amount_paid)).toBe(1250000);
      expect(parseFloat(obRes.rows[0].amount_pending)).toBe(0);

      // Crédito redujo su capital en 800,000 (40M -> 39.2M)
      const creditRes = await db.query<{ current_principal_balance: string }>(`
        SELECT current_principal_balance FROM public.credit_products WHERE id = '${creditId}'
      `);
      expect(parseFloat(creditRes.rows[0].current_principal_balance)).toBe(39200000);
    });

    // 6. Pago extraordinario a capital
    it('Prueba 6: debe aplicar un abono extraordinario a capital reduciendo el saldo del crédito', async () => {
      await db.query(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID,
          '${obId}'::UUID,
          '${accId}'::UUID,
          5000000.00,
          'PREPAYMENT_CAPITAL'
        );
      `);

      // Saldo de capital del crédito se redujo de 40M a 35M
      const creditRes = await db.query<{ current_principal_balance: string }>(`
        SELECT current_principal_balance FROM public.credit_products WHERE id = '${creditId}'
      `);
      expect(parseFloat(creditRes.rows[0].current_principal_balance)).toBe(35000000);
    });

    // 7. Intento de sobrepago
    it('Prueba 7: debe rechazar un intento de sobrepago cuando excede el saldo pendiente', async () => {
      // Intentar pagar 1,500,000 en cuota de 1,250,000
      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            '${userId}'::UUID,
            '${obId}'::UUID,
            '${accId}'::UUID,
            1500000.00,
            'REGULAR_INSTALLMENT'
          );
        `)
      ).rejects.toThrow(/Intento de sobrepago/);
    });

    // 8. Dos pagos simultáneos / concurrencia y prevención de sobrepago
    it('Prueba 8: dos intentos de pago secuenciales no deben permitir sobrepagar la cuota', async () => {
      // Pago 1: 1,000,000 (pendiente queda 250,000)
      await db.query(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID, '${obId}'::UUID, '${accId}'::UUID, 1000000.00, 'PARTIAL_PAYMENT'
        );
      `);

      // Pago 2 simultáneo intentando pagar otros 500,000 (excede 250,000 pendientes)
      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            '${userId}'::UUID, '${obId}'::UUID, '${accId}'::UUID, 500000.00, 'PARTIAL_PAYMENT'
          );
        `)
      ).rejects.toThrow(/Intento de sobrepago/);
    });

    // 9. Reintento de la misma operación (Idempotencia)
    it('Prueba 9: reintento de la misma operación con idempotency_key devuelve el pago sin debitar doble', async () => {
      const idempotencyKey = 'IDEMPOTENCY-TEST-KEY-001';

      // Primer intento
      const res1 = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID,
          '${obId}'::UUID,
          '${accId}'::UUID,
          300000.00,
          'PARTIAL_PAYMENT',
          '${idempotencyKey}'
        ) AS record_obligation_payment;
      `);
      expect(res1.rows[0].record_obligation_payment.is_replayed).toBe(false);

      // Saldo después del primer pago: 10,000,000 - 300,000 = 9,700,000
      const acc1 = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accId}'`);
      expect(parseFloat(acc1.rows[0].current_balance)).toBe(9700000);

      // Segundo intento con la misma clave (ej. reintento por timeout de red)
      const res2 = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID,
          '${obId}'::UUID,
          '${accId}'::UUID,
          300000.00,
          'PARTIAL_PAYMENT',
          '${idempotencyKey}'
        ) AS record_obligation_payment;
      `);
      expect(res2.rows[0].record_obligation_payment.is_replayed).toBe(true);
      expect(res2.rows[0].record_obligation_payment.payment_id).toBe(
        res1.rows[0].record_obligation_payment.payment_id
      );

      // La cuenta NO debe haberse debitado por segunda vez
      const acc2 = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accId}'`);
      expect(parseFloat(acc2.rows[0].current_balance)).toBe(9700000);
    });

    // 10. Transferencia entre cuentas
    it('Prueba 10: debe ejecutar una transferencia entre cuentas propias con débito, crédito y comisión', async () => {
      const accDestId = '55555555-5555-5555-5555-555555555555';
      await db.query(`
        INSERT INTO public.accounts (id, user_id, institution_id, name, type, current_balance)
        VALUES ('${accDestId}', '${userId}', '${instId}', 'Billetera Digital Nequi', 'DIGITAL_WALLET', 200000);
      `);

      // Transferir 1,000,000 de Cuenta Principal a Nequi con comisión de 5,000
      await db.query(`
        SELECT public.record_internal_transfer(
          '${userId}'::UUID,
          '${accId}'::UUID,
          '${accDestId}'::UUID,
          1000000.00,
          5000.00,
          'TRANS-001',
          'Recarga Nequi para gastos'
        );
      `);

      // Cuenta origen: 10,000,000 - 1,005,000 = 8,995,000
      const fromAcc = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accId}'`);
      expect(parseFloat(fromAcc.rows[0].current_balance)).toBe(8995000);

      // Cuenta destino: 200,000 + 1,000,000 = 1,200,000
      const toAcc = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accDestId}'`);
      expect(parseFloat(toAcc.rows[0].current_balance)).toBe(1200000);
    });

    // 11. Reverso de una operación
    it('Prueba 11: debe revertir atómicamente un pago restituyendo saldos y evitando borrados silenciosos', async () => {
      // Registrar pago de 500,000
      const payRes = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userId}'::UUID, '${obId}'::UUID, '${accId}'::UUID, 500000.00, 'PARTIAL_PAYMENT'
        ) AS record_obligation_payment;
      `);
      const paymentId = payRes.rows[0].record_obligation_payment.payment_id;

      // Revertir el pago
      await db.query(`
        SELECT public.reverse_operation(
          '${userId}'::UUID,
          'PAYMENT',
          '${paymentId}'::UUID,
          'Error en debito de extracto'
        );
      `);

      // Cuenta restaurada a 10,000,000
      const acc = await db.query<{ current_balance: string }>(`SELECT current_balance FROM public.accounts WHERE id = '${accId}'`);
      expect(parseFloat(acc.rows[0].current_balance)).toBe(10000000);

      // Cuota restaurada a 1,250,000 pendiente y estado PENDING
      const ob = await db.query<{ status: string; amount_paid: string; amount_pending: string }>(`
        SELECT status, amount_paid, amount_pending FROM public.period_obligations WHERE id = '${obId}'
      `);
      expect(ob.rows[0].status).toBe('PENDING');
      expect(parseFloat(ob.rows[0].amount_paid)).toBe(0);
      expect(parseFloat(ob.rows[0].amount_pending)).toBe(1250000);

      // Comprobar que DELETE directo sobre la tabla de pagos es rechazado por el trigger anti-tamper
      await expect(
        db.query(`DELETE FROM public.obligation_payments WHERE id = '${paymentId}'`)
      ).rejects.toThrow(/inmutables y no pueden eliminarse/);
    });

    // 14. Rediferido con conservación del historial
    it('Prueba 14: debe registrar un rediferido guardando el histórico de condiciones previas y actualizando el crédito', async () => {
      // Saldo previo: 40,000,000 a 18.0% EA en 48 cuotas restantes
      await db.query(`
        SELECT public.record_debt_restructure(
          '${userId}'::UUID,
          '${creditId}'::UUID,
          40000000.00,
          15.50, -- Nueva tasa
          72,    -- Plazo ampliado a 72 meses
          0.00,
          'Rediferido de crédito de vehículo por solicitud de alivio de cuota'
        );
      `);

      // Verificar que el evento de reestructuración contiene las condiciones previas
      const eventRes = await db.query<{
        previous_principal_balance: string;
        previous_effective_annual_rate: string;
        new_effective_annual_rate: string;
        new_total_installments: number;
        reason: string;
      }>(`
        SELECT previous_principal_balance, previous_effective_annual_rate,
               new_effective_annual_rate, new_total_installments, reason
        FROM public.debt_restructure_events
        WHERE credit_product_id = '${creditId}';
      `);

      expect(parseFloat(eventRes.rows[0].previous_principal_balance)).toBe(40000000);
      expect(parseFloat(eventRes.rows[0].previous_effective_annual_rate)).toBe(18.0);
      expect(parseFloat(eventRes.rows[0].new_effective_annual_rate)).toBe(15.5);
      expect(eventRes.rows[0].new_total_installments).toBe(72);
      expect(eventRes.rows[0].reason).toContain('Rediferido de crédito');

      // Verificar que el crédito quedó con status 'RESTRUCTURED' y nueva tasa
      const creditRes = await db.query<{ status: string; effective_annual_rate: string; total_installments: number }>(`
        SELECT status, effective_annual_rate, total_installments
        FROM public.credit_products
        WHERE id = '${creditId}';
      `);
      expect(creditRes.rows[0].status).toBe('RESTRUCTURED');
      expect(parseFloat(creditRes.rows[0].effective_annual_rate)).toBe(15.5);
      expect(creditRes.rows[0].total_installments).toBe(72);
    });
  });

  // 15. Pruebas Negativas de Seguridad, Aislamiento y Anti-tampering
  describe('Pruebas de Seguridad Negativas y Aislamiento de Funciones SECURITY DEFINER', () => {
    const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const accA = '11111111-1111-1111-1111-111111111111';
    const accB = '22222222-2222-2222-2222-222222222222';
    const instA = '33333333-3333-3333-3333-333333333333';
    const instB = '44444444-4444-4444-4444-444444444444';
    const obA = '55555555-5555-5555-5555-555555555555';

    beforeEach(async () => {
      await db.exec(v1Script);
      await db.exec(v2Script);

      await db.query(`
        INSERT INTO auth.users (id, email)
        VALUES ('${userA}', 'usera@test.com'), ('${userB}', 'userb@test.com')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Instituciones y cuentas para A y B
      await db.query(`
        INSERT INTO public.institutions (id, user_id, name, type)
        VALUES
          ('${instA}', '${userA}', 'Banco A', 'BANK'),
          ('${instB}', '${userB}', 'Banco B', 'BANK');
      `);

      await db.query(`
        INSERT INTO public.accounts (id, user_id, institution_id, name, type, current_balance)
        VALUES
          ('${accA}', '${userA}', '${instA}', 'Cuenta Ahorros A', 'SAVINGS', 5000000),
          ('${accB}', '${userB}', '${instB}', 'Cuenta Ahorros B', 'SAVINGS', 2000000);
      `);

      // Obligación exigible de A
      await db.query(`
        INSERT INTO public.period_obligations (
          id, user_id, source_type, period_year, period_month, name, amount,
          capital_component, interest_current_component
        ) VALUES (
          '${obA}', '${userA}', 'AD_HOC_COMMITMENT', 2026, 2, 'Factura Internet A', 200000,
          150000, 50000
        );
      `);
    });

    it('Prueba Negativa 1: Usuario B no puede pagar una obligación de Usuario A ni suplantar su identidad', async () => {
      // Simular sesión autenticada como Usuario B
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userB}', false);`);

      // 1. Intento de Parameter Tampering: Usuario B pasa p_user_id = userA en RPC
      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            '${userA}'::UUID, '${obA}'::UUID, '${accA}'::UUID, 100000.00, 'PARTIAL_PAYMENT'
          );
        `)
      ).rejects.toThrow(/No autorizado: no puede operar en nombre de otro usuario/);

      // 2. Intento de Cross-Tenant: Usuario B pasa su propio user_id pero referencia obA de Usuario A
      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            '${userB}'::UUID, '${obA}'::UUID, '${accB}'::UUID, 100000.00, 'PARTIAL_PAYMENT'
          );
        `)
      ).rejects.toThrow(/Obligación .* no encontrada o no pertenece al usuario/);
    });

    it('Prueba Negativa 2: Usuario B no puede transferir dinero desde una cuenta de Usuario A', async () => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userB}', false);`);

      // Intento de Parameter Tampering
      await expect(
        db.query(`
          SELECT public.record_internal_transfer(
            '${userA}'::UUID, '${accA}'::UUID, '${accB}'::UUID, 100000.00
          );
        `)
      ).rejects.toThrow(/No autorizado: no puede operar en nombre de otro usuario/);

      // Intento legítimo fingido: Cuenta origen de A no le pertenece a B
      await expect(
        db.query(`
          SELECT public.record_internal_transfer(
            '${userB}'::UUID, '${accA}'::UUID, '${accB}'::UUID, 100000.00
          );
        `)
      ).rejects.toThrow(/Una de las cuentas no existe o no pertenece al usuario/);
    });

    it('Prueba Negativa 3: Usuario B no puede revertir una operación de Usuario A', async () => {
      // Usuario A registra un pago legítimo
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userA}', false);`);
      const payRes = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userA}'::UUID, '${obA}'::UUID, '${accA}'::UUID, 100000.00, 'PARTIAL_PAYMENT'
        ) AS record_obligation_payment;
      `);
      const paymentId = payRes.rows[0].record_obligation_payment.payment_id;

      // Cambiar a sesión de Usuario B
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userB}', false);`);

      // Intento de revertir como userB
      await expect(
        db.query(`
          SELECT public.reverse_operation(
            '${userB}'::UUID, 'PAYMENT', '${paymentId}'::UUID, 'Ataque de reverso cruzado'
          );
        `)
      ).rejects.toThrow(/Pago .* no encontrado o no pertenece al usuario/);

      // Intento de suplantar userA
      await expect(
        db.query(`
          SELECT public.reverse_operation(
            '${userA}'::UUID, 'PAYMENT', '${paymentId}'::UUID, 'Ataque con parameter tampering'
          );
        `)
      ).rejects.toThrow(/No autorizado: no puede operar en nombre de otro usuario/);
    });

    it('Prueba Negativa 4: Invocación anónima (sin auth.uid()) de funciones privilegiadas debe ser rechazada', async () => {
      // Resetear contexto de autenticación a NULL
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);

      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            NULL::UUID, '${obA}'::UUID, '${accA}'::UUID, 50000.00
          );
        `)
      ).rejects.toThrow(/Usuario no autenticado/);

      await expect(
        db.query(`
          SELECT public.record_internal_transfer(
            NULL::UUID, '${accA}'::UUID, '${accB}'::UUID, 50000.00
          );
        `)
      ).rejects.toThrow(/Usuario no autenticado/);

      await expect(
        db.query(`
          SELECT public.record_income(
            NULL::UUID, '${accA}'::UUID, 2026, 2::SMALLINT, 'Anon Income'::VARCHAR, 50000.00
          );
        `)
      ).rejects.toThrow(/Usuario no autenticado/);
    });

    it('Prueba Negativa 5: Reutilización de clave de idempotencia con payload diferente debe ser rechazada', async () => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userA}', false);`);
      const key = 'IDEM-TAMPER-TEST-001';

      // Registro original con monto 50,000
      await db.query(`
        SELECT public.record_obligation_payment(
          '${userA}'::UUID, '${obA}'::UUID, '${accA}'::UUID, 50000.00, 'PARTIAL_PAYMENT', '${key}'
        );
      `);

      // Reintento malicioso o inconsistente con la misma clave pero monto 80,000
      await expect(
        db.query(`
          SELECT public.record_obligation_payment(
            '${userA}'::UUID, '${obA}'::UUID, '${accA}'::UUID, 80000.00, 'PARTIAL_PAYMENT', '${key}'
          );
        `)
      ).rejects.toThrow(/Conflicto de idempotencia: la clave .* ya fue utilizada con parámetros diferentes/);
    });

    it('Prueba Negativa 6: No se puede revertir una operación más de una vez (doble reverso)', async () => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userA}', false);`);

      const payRes = await db.query<{ record_obligation_payment: any }>(`
        SELECT public.record_obligation_payment(
          '${userA}'::UUID, '${obA}'::UUID, '${accA}'::UUID, 50000.00, 'PARTIAL_PAYMENT'
        ) AS record_obligation_payment;
      `);
      const paymentId = payRes.rows[0].record_obligation_payment.payment_id;

      // Primer reverso legítimo
      await db.query(`
        SELECT public.reverse_operation(
          '${userA}'::UUID, 'PAYMENT', '${paymentId}'::UUID, 'Motivo de prueba 1'
        );
      `);

      // Segundo reverso debe ser rechazado
      await expect(
        db.query(`
          SELECT public.reverse_operation(
            '${userA}'::UUID, 'PAYMENT', '${paymentId}'::UUID, 'Segundo intento de reverso'
          );
        `)
      ).rejects.toThrow(/El pago ya fue revertido con anterioridad/);
    });

    it('Prueba Negativa 7: Protección contra alteración o borrado de auditoría y registros inmutables', async () => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userA}', false);`);

      // 1. Insertar un registro en auditoría para probar que el trigger BEFORE DELETE bloquea la eliminación
      await db.query(`
        INSERT INTO public.financial_audit_log (user_id, event_type, entity_type, entity_id, amount)
        VALUES ('${userA}', 'SECURITY_TEST', 'accounts', '${accA}', 1000.00);
      `);

      // Intentar eliminar del log de auditoría
      await expect(
        db.query(`DELETE FROM public.financial_audit_log WHERE user_id = '${userA}'`)
      ).rejects.toThrow(/inmutables y no pueden eliminarse/);

      // 2. Crear una segunda cuenta para userA y registrar una transferencia para probar el trigger anti-delete
      const accA2 = '66666666-6666-6666-6666-666666666666';
      await db.query(`
        INSERT INTO public.accounts (id, user_id, institution_id, name, type, current_balance)
        VALUES ('${accA2}', '${userA}', '${instA}', 'Cuenta Secundaria A', 'CHECKING', 1000000);
      `);

      await db.query(`
        SELECT public.record_internal_transfer(
          '${userA}'::UUID, '${accA}'::UUID, '${accA2}'::UUID, 50000.00
        );
      `);

      // Intentar eliminar la transferencia directamente
      await expect(
        db.query(`DELETE FROM public.internal_transfers WHERE user_id = '${userA}'`)
      ).rejects.toThrow(/inmutables y no pueden eliminarse/);
    });
  });
});
