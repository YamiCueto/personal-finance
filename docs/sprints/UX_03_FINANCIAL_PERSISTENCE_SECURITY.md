# UX-03 — Auditoría de Persistencia Financiera y Seguridad Multi-Usuario

**Sprint:** Financial Core  
**Branch:** `feat/financial-core`  
**Fecha de auditoría:** 2026-10-18  
**Estado:** Auditoría completada — Remediación UX-03.1 aplicada el 2026-10-18

---

## Índice

1. [Alcance y Metodología](#1-alcance-y-metodología)
2. [Phase 1 — Diagnóstico de Arquitectura](#2-phase-1--diagnóstico-de-arquitectura)
3. [Phase 2 — Modelo e Integridad](#3-phase-2--modelo-e-integridad)
4. [Phase 3 — Seguridad RLS](#4-phase-3--seguridad-rls)
5. [Phase 4 — Estrategia de Integración Angular + Supabase](#5-phase-4--estrategia-de-integración-angular--supabase)
6. [Phase 5 — Especificación de Pruebas](#6-phase-5--especificación-de-pruebas)
7. [Plan de Implementación Priorizado](#7-plan-de-implementación-priorizado)
8. [Matriz de Riesgos](#8-matriz-de-riesgos)

---

## 1. Alcance y Metodología

### Alcance

Archivos auditados (lectura estática, sin ejecución):

| Archivo | Tipo |
|---|---|
| `src/app/core/models/financial.model.ts` | Modelo V1 |
| `src/app/core/models/financial-v2.model.ts` | Modelo V2 |
| `src/app/core/repositories/financial-repositories.contract.ts` | Contratos DI |
| `src/app/core/repositories/local-financial.adapter.ts` | Adaptador local (mock) |
| `src/app/core/repositories/supabase-financial.adapter.ts` | Adaptador remoto (Supabase) |
| `src/app/core/providers/financial-core.provider.ts` | Proveedor de inyección |
| `src/app/core/config/financial.config.ts` | Configuración de modo |
| `src/app/core/services/financial-accounts.service.ts` | Servicio cuentas |
| `src/app/core/services/financial-operations.service.ts` | Servicio operaciones |
| `src/app/core/services/incomes.service.ts` | Servicio ingresos |
| `src/app/core/services/period-obligations.service.ts` | Servicio obligaciones |
| `src/app/core/services/credit-products.service.ts` | Servicio créditos |
| `src/app/core/services/supabase.service.ts` | Cliente Supabase |
| `src/app/core/services/auth.service.ts` | Servicio autenticación |
| `src/app/app.config.ts` | Configuración raíz Angular |
| `supabase/migrations/20261015000001_financial_core_schema.sql` | Migración V1 |
| `supabase/migrations/20261015000002_financial_core_v2.sql` | Migración V2 |
| `supabase/tests/rls_isolation_test.sql` | Script de prueba RLS |

### Metodología

- Análisis estático de código fuente (sin ejecución contra base de datos remota)
- Trazado de flujos de datos desde componente Angular hasta RPC PostgreSQL
- Verificación de aislamiento multi-inquilino a nivel de contrato y SQL
- Identificación de brechas entre el adaptador local (mock) y el adaptador Supabase

---

## 2. Phase 1 — Diagnóstico de Arquitectura

### 2.1 Estado Actual del Sistema

**El sistema opera completamente en modo demo (`local-demo`) sin acceso a datos reales.**

`src/app/app.config.ts:13` llama a `provideFinancialCore()` sin argumentos, lo que activa `DEFAULT_FINANCIAL_CONFIG.providerMode = 'local-demo'`. Ningún componente Angular toca la base de datos de Supabase en producción actual.

```
Angular Component
    └── Service (FinancialAccountsService, etc.)
         └── InjectionToken (FINANCIAL_ACCOUNT_REPOSITORY, ...)
              └── LocalFinancialAdapter  ← activo hoy
              └── SupabaseFinancialAdapter  ← preparado, no activado
```

### 2.2 Árbol de Entidades

**V1 (6 tablas):** `accounts`, `categories`, `incomes`, `obligations`, `obligation_payments`, `account_transfers`

**V2 (11 tablas):** `institutions`, `accounts` (evolucionada), `credit_products`, `credit_card_purchases`, `recurrent_obligations`, `period_obligations`, `obligation_payments` (evolucionada), `debt_restructure_events`, `incomes` (evolucionada), `internal_transfers`, `financial_audit_log`

Las migraciones están marcadas `FOR REVIEW ONLY (DO NOT RUN REMOTELY YET)`. La base de datos remota de Supabase no tiene el esquema V2 aplicado.

### 2.3 Contratos y Tokens de Inyección

Definidos en `financial-repositories.contract.ts`:

| Token | Interfaz |
|---|---|
| `FINANCIAL_ACCOUNT_REPOSITORY` | `IFinancialAccountRepository` |
| `CREDIT_PRODUCT_REPOSITORY` | `ICreditProductRepository` |
| `PERIOD_OBLIGATION_REPOSITORY` | `IPeriodObligationRepository` |
| `INCOME_REPOSITORY` | `IIncomeRepository` |
| `TRANSACTIONAL_OPERATION_REPOSITORY` | `ITransactionalOperationRepository` |

El `provideFinancialCore()` asigna todos los tokens a `LocalFinancialAdapter` o `SupabaseFinancialAdapter` según `providerMode`.

### 2.4 Patrón de userId en Servicios

Los cinco servicios de dominio comparten el mismo getter:

```typescript
private get userId(): string {
  return this.auth.currentUser()?.id || 'default-user';
}
```

Este patrón aparece en:
- `financial-accounts.service.ts:14`
- `financial-operations.service.ts:21`
- `incomes.service.ts:20`
- `period-obligations.service.ts:23`
- `credit-products.service.ts:21`

**Riesgo identificado:** Si el servicio es invocado antes de que `AuthService.initSession()` complete (race condition), `currentUser()` retorna `null` y todas las operaciones usan `'default-user'`. En modo `local-demo` esto es inofensivo porque el adaptador siembra datos bajo `'default-user'`. En modo `supabase`, el string `'default-user'` no es un UUID válido y la base de datos rechazará la operación con error de tipo. Ver R-01 en la matriz de riesgos.

### 2.5 Semilla de Datos Mock (`LocalFinancialAdapter`)

El constructor llama `seedDefaultUserData('default-user')` que inyecta:
- 2 instituciones financieras (Banco de Occidente, Nequi Colombia)
- 2 cuentas (Ahorros Principal COP 4.500.000, Billetera Nequi COP 750.000)
- 4 productos crediticios (2 créditos de amortización francesa + 2 tarjetas)
- 4 compras de tarjeta de crédito
- Obligaciones e ingresos del mes actual + mayo 2026 como semilla fija de regresión

`ensureUserInitialized(userId)` auto-siembra datos para cualquier userId nuevo que llame al adaptador, excepto los que empiezan con `'empty-'` (reservados para pruebas de estado vacío).

### 2.6 Estado del Adaptador Supabase

`SupabaseFinancialAdapter` está arquitectónicamente completo para las operaciones principales, pero tiene tres métodos que lanzan `Error` en tiempo de ejecución:

```typescript
// supabase-financial.adapter.ts:213
async getCreditCardPurchases(...) {
  throw new Error('getCreditCardPurchases no está soportado...');
}

// supabase-financial.adapter.ts:217
async createCreditCardPurchase(...) {
  throw new Error('createCreditCardPurchase no está soportado...');
}

// supabase-financial.adapter.ts:221
async generateCreditInstallmentObligation(...) {
  throw new Error('generateCreditInstallmentObligation no está soportado...');
}
```

Cambiar a modo `supabase` sin completar estos métodos rompe el módulo de Créditos y Tarjetas.

---

## 3. Phase 2 — Modelo e Integridad

### 3.1 Precisión Monetaria COP

**SQL:** `NUMERIC(15,2)` en todas las columnas monetarias de V2. Cubre correctamente rangos COP (billones con 2 decimales de centavos).

**Angular:** `FinancialCalculatorV2.toCents()` y `fromCents()` convierten a enteros para aritmética, evitando drift de punto flotante IEEE 754. Los mappeadores en `SupabaseFinancialAdapter` envuelven valores con `Number(raw.amount || 0)` — correcto para NUMERIC de PostgreSQL que llega como string en JSON.

**Riesgo menor:** El default `|| 0` en los mappeadores silencia columnas NULL. Para columnas NOT NULL en el esquema esto es inofensivo, pero para opcionales (ej. `management_fee_monthly`) convierte NULL en 0, que puede alterar cálculos de estado de tarjeta.

### 3.2 Propiedad y Claves Foráneas

**V2 usa claves foráneas compuestas `(user_id, id)`** en todas las referencias cruzadas:

```sql
FOREIGN KEY (user_id, credit_product_id) REFERENCES credit_products(user_id, id)
FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id)
```

Esto impide que un usuario B inserte registros que referencien entidades del usuario A, incluso si conoce el UUID. Verificado en `rls_isolation_test.sql:56-68`: el intento de User B de insertar un ingreso con `account_id` de User A falla con `foreign_key_violation`.

### 3.3 Invariantes de Integridad Contable

**Trigger `fn_trg_period_obligations_integrity()`** valida antes de INSERT/UPDATE en `period_obligations`:

```sql
NEW.amount_paid + NEW.amount_pending = NEW.amount
```

El `LocalFinancialAdapter.recordPayment` mantiene esta invariante correctamente usando aritmética centavos. El `SupabaseFinancialAdapter.createPeriodObligation` inserta con `amount_paid: 0, amount_pending: dto.amount` — satisface la invariante en la creación.

**Trigger `fn_prevent_financial_deletion()`** aplica a `obligation_payments`, `internal_transfers`, `financial_audit_log`: las filas son inmutables, solo se admite el reverso lógico mediante `is_reversed = true`.

### 3.4 Idempotencia

Implementada en tres capas:

| Capa | Implementación |
|---|---|
| Angular Service | `Set<string>` de intenciones activas (previene doble clic en misma sesión) |
| LocalFinancialAdapter | `Map<string, result>` en memoria (`userId:key` → resultado previo) |
| Supabase RPC | `idempotency_key` UNIQUE en tabla; función retorna resultado anterior con `is_replayed: true` |

La clave de idempotencia se genera en el servicio si no se provee externamente: `crypto.randomUUID()` (preferido) o `pay-${obligationId}-${Date.now()}-${random}` (fallback). El UUID v4 de `crypto` es correcto para evitar colisiones entre recargas.

**Brecha:** La idempotencia en memoria del `LocalFinancialAdapter` se pierde al recargar la página (no es persistida). Para pruebas de idempotencia entre sesiones, solo el backend Supabase es autoritativo.

### 3.5 Prevención de Duplicados de Cuota

`LocalFinancialAdapter.generateCreditInstallmentObligation` verifica antes de crear:

```typescript
const existing = existingObs.find(
  (o) => o.creditProductId === dto.creditProductId &&
         o.periodYear === dto.periodYear &&
         o.periodMonth === dto.periodMonth
);
if (existing) return existing;  // Idempotente
```

El `SupabaseFinancialAdapter` lanza `Error` en este método — la lógica equivalente debe estar en una función RPC o aplicarse como constraint UNIQUE en V2 (`credit_product_id, period_year, period_month`).

---

## 4. Phase 3 — Seguridad RLS

### 4.1 Estado de RLS en Migraciones

**V1:** 4 políticas por tabla (SELECT/INSERT/UPDATE/DELETE), todas usando `auth.uid() = user_id`. Sin `FORCE ROW LEVEL SECURITY`.

**V2:** 1 política `FOR ALL` por tabla, con `FORCE ROW LEVEL SECURITY` en todas las tablas. Más robusto que V1: `FORCE RLS` aplica incluso a propietarios de tabla.

### 4.2 Riesgo: p_user_id en Funciones SECURITY DEFINER

Las cinco funciones `SECURITY DEFINER` reciben `p_user_id` como parámetro desde el cliente Angular:

```typescript
// supabase-financial.adapter.ts:282
await this.client.rpc('record_obligation_payment', {
  p_user_id: userId,  // ← viene del cliente
  ...
})
```

**Riesgo crítico de seguridad:** Si las funciones `SECURITY DEFINER` confían ciegamente en `p_user_id` sin validar `p_user_id = auth.uid()`, un cliente malicioso podría pasar el UUID de otro usuario y ejecutar operaciones en su nombre.

Las funciones `SECURITY DEFINER` se ejecutan con los privilegios del owner (generalmente superusuario en Supabase), lo que **elude RLS por diseño**. La barrera de seguridad debe ser la verificación interna `p_user_id = auth.uid()` al inicio de cada función.

**Acción requerida antes de activar modo supabase:** Verificar que cada función V2 incluya:

```sql
IF p_user_id != auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized: user_id mismatch';
END IF;
```

### 4.3 Mutaciones Directas (sin RPC) en SupabaseFinancialAdapter

Las siguientes operaciones usan `client.from().insert()/.update()` directamente, confiando en RLS de tabla:

| Método | Tabla | Política V2 |
|---|---|---|
| `createInstitution` | `institutions` | INSERT: `auth.uid() = user_id` ✓ |
| `createAccount` | `accounts` | INSERT: `auth.uid() = user_id` ✓ |
| `archiveAccount` | `accounts` | UPDATE: `auth.uid() = user_id` ✓ |
| `createCreditProduct` | `credit_products` | INSERT: `auth.uid() = user_id` ✓ |
| `createPeriodObligation` | `period_obligations` | INSERT: `auth.uid() = user_id` ✓ |

Estas operaciones son seguras siempre que el cliente Supabase esté autenticado y RLS esté activo. Sin embargo, `createPeriodObligation` inserta en `period_obligations` sin pasar por la lógica de negocio que `generateCreditInstallmentObligation` tiene localmente (cálculo de cuota, amortización, deduplicación). Riesgo de inconsistencia si se usa para cuotas de crédito.

### 4.4 Verificación de Aislamiento Multi-Inquilino

El script `supabase/tests/rls_isolation_test.sql` verifica:
1. User B no puede hacer SELECT en cuentas de User A
2. User B no puede hacer SELECT en instituciones de User A
3. User B no puede INSERT un ingreso referenciando una cuenta de User A (falla FK compuesta)

El script usa `RAISE EXCEPTION` para rollback al finalizar — no persiste datos de prueba. Está preparado para ejecutarse en el SQL Editor de Supabase contra el entorno de desarrollo.

**Cobertura faltante en el script:**
- No prueba UPDATE cruzado (User B intentando modificar obligación de User A)
- No prueba DELETE cruzado
- No prueba las funciones SECURITY DEFINER con p_user_id diferente a auth.uid()
- No prueba `period_obligations` con FK compuesta cruzada

### 4.5 Política Adicional Recomendada: anon vs authenticated

El cliente Supabase usa la `publishableKey` (antes `anonKey`). En Supabase, las políticas RLS distinguen entre rol `anon` y `authenticated`. Las políticas V2 deben restringir todas las operaciones al rol `authenticated` explícitamente para prevenir acceso sin sesión.

---

## 5. Phase 4 — Estrategia de Integración Angular + Supabase

### 5.1 El Mecanismo de Activación

El switch entre adaptadores es único punto de control:

```typescript
// app.config.ts:13
provideFinancialCore()  // ← sin args = local-demo
provideFinancialCore({ providerMode: 'supabase' })  // ← activa Supabase
```

No hay feature flag en tiempo de ejecución ni posibilidad de rollout gradual. El cambio es todo o nada.

### 5.2 Precondiciones para Activar Modo Supabase

Las siguientes condiciones deben cumplirse **antes** de cambiar `providerMode`:

| Precondición | Estado actual |
|---|---|
| Migración V2 aplicada en Supabase (staging) | ❌ No aplicada |
| Funciones SECURITY DEFINER validan `p_user_id = auth.uid()` | ⚠️ Sin verificar |
| `getCreditCardPurchases` implementado en SupabaseFinancialAdapter | ❌ Lanza Error |
| `createCreditCardPurchase` implementado en SupabaseFinancialAdapter | ❌ Lanza Error |
| `generateCreditInstallmentObligation` implementado como RPC | ❌ Lanza Error |
| Pruebas de aislamiento RLS ejecutadas contra staging | ❌ No ejecutadas |
| `userId` race condition mitigada | ⚠️ En análisis |

### 5.3 Race Condition: userId antes de auth.init()

`AuthService.waitForInitialization()` existe y resuelve cuando `initSession()` completa. Sin embargo, ningún servicio financiero llama a `waitForInitialization()` antes de operar.

**Escenario de riesgo:** Route guard permite acceso a `/app` → componente carga → servicio financiero se invoca → `auth.currentUser()` aún es `null` → `userId = 'default-user'` → en modo supabase, RPC falla porque `'default-user'` no es UUID.

**Solución recomendada:** Guards o el propio servicio deben esperar `auth.waitForInitialization()` antes de cualquier operación financiera. En modo local-demo es inofensivo pero el mismo código irá a producción.

### 5.4 Mapeo de Columnas: Supabase → Angular

El `SupabaseFinancialAdapter` tiene mappeadores privados (`mapAccount`, `mapCreditProduct`, etc.) que traducen el snake_case de PostgreSQL al camelCase de los modelos TypeScript. 

**Brecha detectada en `mapCreditProduct`:** La columna `due_payment_day` se mapea a `duePaymentDay` pero el modelo V2 (`financial-v2.model.ts`) usa `paymentDueDay`. El adaptador local usa `paymentDueDay` en su seed. Esta inconsistencia de nombre silenciará el valor en producción (será `undefined`).

### 5.5 Estrategia de Migración de Datos

La migración V2 incluye un bloque de migración V1→V2 (`INSERT INTO institutions SELECT ...`, etc.). Al aplicar la migración en producción, los datos existentes en V1 se copiarán a V2.

**El orden de precondición es:**
1. Aplicar migración V1 (si no está aplicada)
2. Aplicar migración V2 (incluye migración automática V1→V2)
3. Ejecutar script `rls_isolation_test.sql` en staging
4. Completar métodos faltantes en `SupabaseFinancialAdapter`
5. Activar `providerMode: 'supabase'` en staging
6. Validar funcionalidad completa
7. Activar en producción

---

## 6. Phase 5 — Especificación de Pruebas

Las siguientes pruebas deterministas deben implementarse antes de activar modo `supabase`. Se organizan en dos categorías: pruebas Angular (usando `LocalFinancialAdapter` como referencia de comportamiento) y pruebas SQL (contra staging).

### 6.1 Pruebas Angular — Aislamiento de Usuario

**Archivo propuesto:** `src/app/core/repositories/local-financial.adapter.spec.ts`

| ID | Descripción | Expectativa |
|---|---|---|
| LA-01 | Usuario A crea cuenta; Usuario B llama `getAccounts()` | Usuario B recibe array vacío (no ve datos de A) |
| LA-02 | Usuario A registra pago; Usuario B llama `recordPayment()` con obligationId de A | `Error: 'Obligación no encontrada o no pertenece al usuario'` |
| LA-03 | Usuario A registra transferencia; Usuario B llama `recordTransfer()` con fromAccountId de A | `Error: 'Una de las cuentas no existe...'` |
| LA-04 | Usuario registra pago con idempotencyKey; llama de nuevo con mismos parámetros | `isReplayed: true`, saldo no cambia |
| LA-05 | Usuario registra pago con idempotencyKey; llama con diferente amount | `Error: Conflicto de idempotencia` |
| LA-06 | Usuario genera cuota del mismo crédito+período dos veces | Devuelve la misma obligación (idempotente) |
| LA-07 | `recordPayment` con amount > `amountPending` | `Error: Intento de sobrepago` |
| LA-08 | `recordPayment` sobre obligación con `status: 'PAID'` | `Error: La obligación ya se encuentra totalmente cancelada` |
| LA-09 | Recarga simulada (resetUserScenario) | `getAccounts()` devuelve datos de semilla, no datos de la sesión anterior |

### 6.2 Pruebas Angular — Integridad Monetaria COP

**Archivo propuesto:** `src/app/core/services/period-obligations.service.spec.ts`

| ID | Descripción | Expectativa |
|---|---|---|
| MI-01 | Pago parcial: `amount_paid + amount_pending === amount` después del pago | Invariante mantenida con aritmética centavos |
| MI-02 | Pago total: `status === 'PAID'`, `amountPending === 0` | Correcto |
| MI-03 | Cuenta debita exactamente el monto pagado (sin drift) | `newBalance === prevBalance - amount` |
| MI-04 | Transferencia con comisión: cuenta origen pierde `amount + feeAmount` | Correcto |
| MI-05 | Ingreso: cuenta destino suma exactamente `amount` | Correcto |
| MI-06 | `recordIncome` con `accountId: undefined` — no modifica ninguna cuenta | `Income` creado, balances sin cambio |

### 6.3 Pruebas SQL — Aislamiento RLS (para staging)

**Archivo propuesto:** `supabase/tests/rls_isolation_test_v2.sql` (extensión del existente)

| ID | Descripción | Expectativa |
|---|---|---|
| RLS-01 | User B SELECT en `accounts` de User A | 0 filas devueltas |
| RLS-02 | User B UPDATE en `accounts` de User A | 0 filas afectadas (no error, no efecto) |
| RLS-03 | User B DELETE en `obligation_payments` (inmutabilidad + RLS) | Excepción de trigger |
| RLS-04 | User B llama RPC `record_obligation_payment` con `p_user_id` de User A | Excepción `Unauthorized: user_id mismatch` |
| RLS-05 | User B llama RPC `record_internal_transfer` con cuentas de User A | Excepción |
| RLS-06 | INSERT en `period_obligations` con FK (user_b, account_id_de_user_a) | `foreign_key_violation` |
| RLS-07 | User A registra pago; User A revierte; User A intenta rever de nuevo | `Error: ya fue revertido` |
| RLS-08 | Acceso sin JWT (rol `anon`) a cualquier tabla financiera | 0 filas o error de política |

### 6.4 Pruebas Angular — Persistencia tras Recarga

| ID | Descripción | Expectativa |
|---|---|---|
| PR-01 | Registrar pago → simular reload (resetUserScenario) → leer obligación | Estado reseteado (local) |
| PR-02 | En modo supabase (mock de cliente): recordIncome → getIncomes | Ingreso persiste entre llamadas |
| PR-03 | Idempotencia cross-reload: mismo idempotencyKey en nueva instancia del adaptador Supabase | RPC retorna `is_replayed: true` desde BD |

---

## 7. Plan de Implementación Priorizado

### P0 — Bloqueantes de seguridad (antes de cualquier activación remota)

| Tarea | Archivo(s) | Descripción |
|---|---|---|
| P0-1 | `supabase/migrations/20261015000002_financial_core_v2.sql` | Verificar que cada función SECURITY DEFINER incluye `IF p_user_id != auth.uid() THEN RAISE EXCEPTION` al inicio |
| P0-2 | `src/app/core/services/*.service.ts` (5 servicios) | Reemplazar el getter `userId` con un getter `async` que espere `auth.waitForInitialization()`, o asegurar que todos los puntos de llamada estén protegidos por el guard |
| P0-3 | `supabase/tests/rls_isolation_test.sql` | Ampliar con casos RLS-04 a RLS-08 (ver §6.3) |

### P1 — Completar adaptador Supabase (antes de activar modo supabase)

| Tarea | Archivo | Descripción |
|---|---|---|
| P1-1 | `supabase-financial.adapter.ts:213` | Implementar `getCreditCardPurchases` consultando tabla `credit_card_purchases` en V2 |
| P1-2 | `supabase-financial.adapter.ts:217` | Implementar `createCreditCardPurchase` con INSERT + actualización de cupo |
| P1-3 | `supabase-financial.adapter.ts:221` | Implementar `generateCreditInstallmentObligation` como llamada RPC o lógica SQL-side |
| P1-4 | `supabase-financial.adapter.ts:443` | Corregir `duePaymentDay` → `paymentDueDay` en `mapCreditProduct` (columna: `payment_due_day`) |

### P2 — Aplicar migraciones y validar en staging

| Tarea | Descripción |
|---|---|
| P2-1 | Aplicar `20261015000001_financial_core_schema.sql` en entorno staging Supabase |
| P2-2 | Aplicar `20261015000002_financial_core_v2.sql` en staging |
| P2-3 | Ejecutar `rls_isolation_test.sql` (extendido) en SQL Editor de staging |
| P2-4 | Activar `providerMode: 'supabase'` en `app.config.ts` (solo en staging) |
| P2-5 | Ejecutar suite E2E completa contra staging con usuario autenticado real |

### P3 — Pruebas deterministas Angular

| Tarea | Archivo |
|---|---|
| P3-1 | Crear `local-financial.adapter.spec.ts` con casos LA-01 a LA-09 |
| P3-2 | Crear `period-obligations.service.spec.ts` con casos MI-01 a MI-06 |
| P3-3 | Crear `incomes.service.spec.ts` y `financial-operations.service.spec.ts` para casos de reversión |

### P4 — Preparación para producción

| Tarea | Descripción |
|---|---|
| P4-1 | Definir política de rol `anon` explícita en V2 (DENY ALL para tablas financieras) |
| P4-2 | Agregar índices compuestos en `period_obligations(user_id, period_year, period_month)` y `incomes(user_id, period_year, period_month)` |
| P4-3 | Definir constraint UNIQUE en `period_obligations(user_id, credit_product_id, period_year, period_month)` para prevenir duplicación de cuotas a nivel de BD |
| P4-4 | Activar `providerMode: 'supabase'` en producción |

---

## 8. Matriz de Riesgos

| ID | Descripción | Severidad | Probabilidad | Estado |
|---|---|---|---|---|
| ID | Descripción | Severidad | Probabilidad | Estado |
|---|---|---|---|---|
| R-01 | `userId = 'default-user'` si auth no inicializó antes de la llamada al servicio | **Crítico** | Media (race condition al cargar app) | **Corregido UX-03.1** |
| R-02 | 3 métodos de `SupabaseFinancialAdapter` lanzan `Error` en runtime | **Crítico** | Alta (al activar modo supabase) | **Corregido UX-03.1** |
| R-03 | Funciones SECURITY DEFINER pueden no validar `p_user_id = auth.uid()` | **Crítico** | Sin verificar | **Corregido UX-03.1** (migración pendiente de aplicar) |
| R-04 | Migración V2 no aplicada remotamente — `SupabaseFinancialAdapter` no tiene tablas | **Alto** | Alta (al activar modo supabase) | Pendiente (UX-03.2) |
| R-05 | `mapCreditProduct` mapea `due_payment_day` → `duePaymentDay` (incorrecto, modelo usa `paymentDueDay`) | **Alto** | Alta (al usar Supabase) | **Corregido UX-03.1** |
| R-06 | `createPeriodObligation` directo sin lógica de deduplicación de cuota | **Medio** | Media | **Corregido UX-03.1** (índice UNIQUE parcial en migración) |
| R-07 | `reverseOperation` local solo implementa tipo `INCOME`; tipos `PAYMENT` y `TRANSFER` no revertibles localmente | **Medio** | Media | Aceptado (limitación documentada) |
| R-08 | Idempotencia en memoria pierde estado al recargar; pruebas locales no pueden verificar idempotencia cross-session | **Bajo** | Alta | Aceptado (Supabase es autoritativo) |
| R-09 | Valor NULL de columnas opcionales silenciado como `0` en mappeadores | **Bajo** | Baja | Aceptado con monitoreo |

---

*Auditoría completada el 2026-10-18. Remediación UX-03.1 aplicada el 2026-10-18: riesgos R-01, R-02, R-03, R-05 y R-06 corregidos localmente. No se ejecutaron migraciones remotas, deploys, commits ni push. Ver `UX_03_1_REMEDIATION_REPORT.md` para detalle completo de la remediación.*
