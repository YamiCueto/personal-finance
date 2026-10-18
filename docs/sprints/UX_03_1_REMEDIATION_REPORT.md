# UX-03.1 — Informe de Remediación: Seguridad y Persistencia Financiera

**Sprint:** Financial Core  
**Branch:** `feat/financial-core`  
**Fecha de remediación:** 2026-10-18 (UX-03.1) | Hardening: 2026-10-18 (UX-03.1.1)  
**Auditoría base:** `UX_03_FINANCIAL_PERSISTENCE_SECURITY.md`  
**Estado:** Remediación P0/P1 + hardening SQL completados — pruebas: 117/117 ✓

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Correcciones Aplicadas](#2-correcciones-aplicadas)
3. [Archivos Modificados](#3-archivos-modificados)
4. [Resultados de Pruebas](#4-resultados-de-pruebas)
5. [Riesgos Confirmados y Descartados](#5-riesgos-confirmados-y-descartados)
6. [Condiciones para Activar Modo Supabase (Staging)](#6-condiciones-para-activar-modo-supabase-staging)
7. [Riesgos Residuales](#7-riesgos-residuales)

---

## 1. Resumen Ejecutivo

La auditoría UX-03 identificó cinco riesgos bloqueantes (R-01 a R-03, R-05, R-06) antes de poder activar el modo `supabase`. Esta remediación los corrige en su totalidad:

| Riesgo | Severidad | Resultado |
|---|---|---|
| R-01: Race condition `userId = 'default-user'` | Crítico | **Corregido** |
| R-02: 3 métodos Supabase no implementados | Crítico | **Corregido** |
| R-03: Auth gap en funciones SECURITY DEFINER | Crítico | **Corregido** (SQL preparado, pendiente de aplicar) |
| R-05: `paymentDueDay` sin mapear en SupabaseAdapter | Alto | **Corregido** |
| R-06: Sin deduplicación de cuota en BD | Medio | **Corregido** (SQL preparado, pendiente de aplicar) |

La base de código Angular queda lista para integración con Supabase una vez que se aplique la migración `20261015000003_financial_security_patch.sql` en el entorno staging.

---

## 2. Correcciones Aplicadas

### C-01 — Función `resolveUserId` compartida (R-01)

**Archivo creado:** `src/app/core/utils/resolve-user-id.ts`

Reemplaza el getter síncrono `userId = 'default-user'` en los 5 servicios financieros. La función:
- En modo `local-demo`: retorna el usuario actual o `'default-user'` sin bloquear (comportamiento anterior preservado).
- En modo `supabase`: espera `auth.waitForInitialization()` y lanza `Error('Sesión no autenticada: inicie sesión para continuar')` si no hay sesión activa.

Los 5 servicios modificados para usar `resolveUserId`:
- `financial-accounts.service.ts`
- `financial-operations.service.ts`
- `incomes.service.ts`
- `period-obligations.service.ts`
- `credit-products.service.ts`

---

### C-02 — Métodos Supabase implementados (R-02)

**Archivo modificado:** `src/app/core/repositories/supabase-financial.adapter.ts`

#### `getCreditCardPurchases`
Consulta directa a `credit_card_purchases` con filtros opcionales por `product_id`. Orden descendente por `purchase_date`.

#### `createCreditCardPurchase`
Usa RPC atómica `create_credit_card_purchase` (definida en la migración de parche). La RPC ejecuta en una sola transacción:
1. INSERT en `credit_card_purchases`
2. UPDATE en `credit_products` (incrementa `used_credit_limit`, decrementa `available_credit_limit`)

Después de la RPC, consulta el registro creado por `purchase_id` para retornar el objeto completo.

#### `generateCreditInstallmentObligation`
Implementado en Angular (no como RPC), siguiendo el mismo flujo que `LocalFinancialAdapter`:
1. Obtiene el producto de crédito vía `getCreditProductById`.
2. Verifica idempotencia: busca obligación existente para `(creditProductId, periodYear, periodMonth)`.
3. Calcula la cuota con `FinancialCalculatorV2` (amortización francesa/alemana o estado de cuenta para tarjeta).
4. Inserta en `period_obligations` directamente.
5. Maneja error PostgreSQL `23505` (violación UNIQUE) como retorno idempotente: consulta y devuelve la obligación existente.

---

### C-03 — Auth guard en funciones SECURITY DEFINER (R-03)

**Archivo creado:** `supabase/migrations/20261015000003_financial_security_patch.sql`

Reescribe las 5 funciones SECURITY DEFINER con el guard seguro al inicio:

```sql
v_caller := auth.uid();
IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
END IF;
IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
    RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
END IF;
p_user_id := v_caller;
```

El bug en el guard original era un gap lógico: si `auth.uid() IS NULL` **y** `p_user_id IS NOT NULL`, ninguna rama del `IF/ELSIF` disparaba, permitiendo que la función continuara con una identidad inyectada por el cliente.

La migración también incluye:
- RPC atómica `create_credit_card_purchase` (INSERT + UPDATE en una transacción).
- Índice UNIQUE parcial `uq_period_obligation_credit_period` en `period_obligations(user_id, credit_product_id, period_year, period_month) WHERE credit_product_id IS NOT NULL` para deduplicación de cuotas a nivel de BD.
- `REVOKE EXECUTE FROM anon` en todas las funciones (defensa en profundidad).

---

### C-04 — Mapeo `paymentDueDay` en SupabaseAdapter (R-05)

**Archivo modificado:** `src/app/core/repositories/supabase-financial.adapter.ts`

`mapCreditProduct` ahora popula ambos alias del modelo:

```typescript
duePaymentDay: raw.due_payment_day,
paymentDueDay: raw.due_payment_day,
```

El modelo `financial-v2.model.ts` declara ambos como campos del tipo `CreditProduct` (líneas 86–87). La columna SQL es `due_payment_day`.

---

### C-05 — Corrección de orden de checks en `recordPayment` (descubierto en pruebas)

**Archivo modificado:** `src/app/core/repositories/local-financial.adapter.ts`

El check `status === 'PAID'` se verificaba *después* del check `amount > amountPending`. Para una obligación PAID (`amountPending === 0`), cualquier pago `> 0` disparaba "Intento de sobrepago" en lugar de "La obligación ya se encuentra totalmente cancelada". El orden correcto es: verificar PAID antes de verificar sobrepago.

---

## 3. Archivos Modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `src/app/core/utils/resolve-user-id.ts` | Creado | Función compartida de resolución de userId con gate de autenticación |
| `src/app/core/services/financial-accounts.service.ts` | Modificado | Usa `resolveUserId()` en todos los métodos async |
| `src/app/core/services/financial-operations.service.ts` | Modificado | Usa `resolveUserId()` en todos los métodos async |
| `src/app/core/services/incomes.service.ts` | Modificado | Usa `resolveUserId()` en todos los métodos async |
| `src/app/core/services/period-obligations.service.ts` | Modificado | Usa `resolveUserId()` en todos los métodos async |
| `src/app/core/services/credit-products.service.ts` | Modificado | Usa `resolveUserId()` en todos los métodos async |
| `src/app/core/repositories/supabase-financial.adapter.ts` | Modificado | 3 métodos implementados, `paymentDueDay` mapeado, `mapCreditCardPurchase` añadido |
| `src/app/core/repositories/local-financial.adapter.ts` | Modificado | Orden de checks corregido en `recordPayment` (PAID antes de sobrepago) |
| `supabase/migrations/20261015000003_financial_security_patch.sql` | Creado | Auth guard seguro en 5 funciones SECURITY DEFINER, RPC atómica, índice UNIQUE parcial |
| `src/app/core/repositories/local-financial.adapter.spec.ts` | Creado | 10 pruebas de aislamiento y comportamiento del adaptador local |
| `src/app/core/services/period-obligations.service.spec.ts` | Creado | 6 pruebas de integridad monetaria COP y autenticación |
| `supabase/tests/rls_isolation_test_v2.sql` | Creado | 6 escenarios de aislamiento RLS (SELECT, UPDATE, FK cruzada, RPC con identidad manipulada, sesión anónima, doble reverso) |

---

## 4. Resultados de Pruebas

### 4.1 Pruebas Unitarias Angular

**Comando ejecutado:** `npx ng test --no-watch`  
**Resultado:** 18 archivos de prueba, 117 pruebas — **todas aprobadas**

```
Test Files  18 passed (18)
     Tests  117 passed (117)
  Duration  2.61s
```

**Cobertura de pruebas nuevas:**

| ID | Descripción | Estado |
|---|---|---|
| LA-01 | Cuenta creada para User B no aparece en lista de User A | ✓ Aprobado |
| LA-02 | User B no puede pagar obligación de User A (ID único) | ✓ Aprobado |
| LA-03 | User B no puede transferir usando cuenta única de User A como origen | ✓ Aprobado |
| LA-04 | Segundo pago con misma clave devuelve `isReplayed: true` | ✓ Aprobado |
| LA-05 | Reutilizar clave con `amount` diferente lanza conflicto de idempotencia | ✓ Aprobado |
| LA-06 | Generar cuota dos veces para mismo crédito+período es idempotente | ✓ Aprobado |
| LA-07 | Pago > `amountPending` lanza "Intento de sobrepago" | ✓ Aprobado |
| LA-08 | Pago sobre obligación PAID lanza "ya se encuentra totalmente cancelada" | ✓ Aprobado |
| LA-09 | `resetUserScenario` restaura datos de semilla | ✓ Aprobado |
| LA-10 | Usuario con prefijo `empty-` devuelve listas vacías | ✓ Aprobado |
| MI-01 | `amountPaid + amountPending === amount` tras pago parcial | ✓ Aprobado |
| MI-02 | Pago total marca `status: 'PAID'` y `amountPending: 0` | ✓ Aprobado |
| MI-03 | Cuenta debita exactamente el monto pagado | ✓ Aprobado |
| MI-04 | Sobrepago rechazado | ✓ Aprobado |
| MI-05 | Saldo insuficiente rechazado | ✓ Aprobado |
| MI-06 | Modo supabase sin sesión lanza error de autenticación | ✓ Aprobado |

**Nota sobre el diseño de los IDs de semilla:** El `LocalFinancialAdapter` genera IDs fijos para los datos de semilla (ej: `'acc-ahorros-principal'`). Esto significa que dos usuarios seeded comparten los mismos IDs. Las pruebas LA-01, LA-02 y LA-03 fueron diseñadas para usar `createAccount`/`createPeriodObligation` con IDs dinámicos (`Date.now()`) para garantizar unicidad real en los escenarios de aislamiento.

### 4.2 Pruebas E2E

No ejecutadas en esta sesión. El binario de WebKit requiere instalación previa (`npx playwright install webkit`). Pendiente para UX-03.2.

### 4.3 Pruebas SQL (RLS)

`supabase/tests/rls_isolation_test_v2.sql` preparado con 6 escenarios. Requiere aplicación de la migración en staging para ejecutarse. Pendiente para UX-03.2.

---

## 5. Riesgos Confirmados y Descartados

### Confirmados y corregidos

**R-03 (SECURITY DEFINER auth gap) — Confirmado como crítico**

El bug era un gap lógico en la estructura `IF/ELSIF`:
```sql
-- CÓDIGO ORIGINAL (vulnerable):
IF v_caller IS NOT NULL THEN
    -- Solo ejecuta si hay sesión autenticada
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
        RAISE EXCEPTION '...';
    END IF;
ELSIF p_user_id IS NULL THEN
    RAISE EXCEPTION '...';
END IF;
-- GAP: si v_caller IS NULL AND p_user_id IS NOT NULL → ninguna rama dispara

-- CÓDIGO CORREGIDO (seguro):
IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada: operación denegada';
END IF;
IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
    RAISE EXCEPTION 'No autorizado: no puede operar en nombre de otro usuario';
END IF;
p_user_id := v_caller;
```

**R-01 (race condition userId) — Confirmado como crítico**

El getter síncrono `get userId()` es inherentemente inseguro en modo supabase: no puede esperar la inicialización de la sesión. La solución fue convertirlo a función async `resolveUserId()` con gate diferenciado por `providerMode`.

**R-05 (`paymentDueDay` sin mapear) — Confirmado**

El modelo define ambos campos (`duePaymentDay` y `paymentDueDay`) en líneas 86–87 de `financial-v2.model.ts`. El adaptador Supabase solo poblaba `duePaymentDay`. En producción, cualquier componente que leyera `creditProduct.paymentDueDay` obtenía `undefined`.

### Descartados como no aplicables

Ningún riesgo de la auditoría fue descartado. R-04 (migración no aplicada remotamente) y R-07 a R-09 se mantienen en su estado documentado.

---

## 6. Condiciones para Activar Modo Supabase (Staging)

Las siguientes condiciones deben cumplirse antes de cambiar `providerMode: 'supabase'` en cualquier entorno:

| # | Condición | Estado |
|---|---|---|
| 1 | Aplicar `20261015000001_financial_core_schema.sql` en staging | ❌ Pendiente |
| 2 | Aplicar `20261015000002_financial_core_v2.sql` en staging | ❌ Pendiente |
| 3 | Aplicar `20261015000003_financial_security_patch.sql` en staging | ❌ Pendiente |
| 4 | Ejecutar `rls_isolation_test_v2.sql` en SQL Editor de staging | ❌ Pendiente |
| 5 | Verificar 6 casos RLS todos PASSED en el output del script | ❌ Pendiente |
| 6 | `getCreditCardPurchases` implementado | ✅ Completado (UX-03.1) |
| 7 | `createCreditCardPurchase` implementado | ✅ Completado (UX-03.1) |
| 8 | `generateCreditInstallmentObligation` implementado | ✅ Completado (UX-03.1) |
| 9 | `paymentDueDay` mapeado correctamente | ✅ Completado (UX-03.1) |
| 10 | Auth guard en funciones SECURITY DEFINER | ✅ SQL preparado (pendiente de aplicar) |
| 11 | Race condition `userId` mitigada en 5 servicios | ✅ Completado (UX-03.1) |
| 12 | Suite unitaria Angular 117/117 ✓ | ✅ Completado (UX-03.1) |
| 13 | Pruebas E2E (WebKit) pasando | ❌ Pendiente (requiere `playwright install webkit`) |
| 14 | Agregar `https://yamicueto.github.io/personal-finance/auth/reset-password` a Redirect URLs en Supabase Dashboard | ❌ Pendiente (acción manual) |

---

## 6.1 Correcciones UX-03.1.1 — Hardening SQL previo a staging

Hallazgos detectados en revisión del propietario corregidos antes de aplicar en staging:

| # | Hallazgo | Corrección aplicada |
|---|---|---|
| H-01 | Idempotencia del índice UNIQUE usaba `pg_constraint` (incorrecto para índices) | Reemplazado por consulta a `pg_indexes` con `IF NOT EXISTS` explícito |
| H-02 | Las 5 funciones SECURITY DEFINER existentes no tenían `REVOKE FROM PUBLIC` ni `GRANT TO authenticated` explícitos | Añadido `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated/service_role` para las 6 funciones |
| H-03 | `rls_isolation_test_v2.sql` incluía `CREATE ROLE` y `GRANT ALL ON ALL TABLES` | Eliminados; el script asume los roles nativos de Supabase y no modifica permisos |
| H-04 | RLS-03 aceptaba cualquier excepción como satisfactoria | Ahora solo acepta `foreign_key_violation`; cualquier otra excepción falla el caso |
| H-05 | RLS-06 podía aprobar el segundo rechazo aunque el primer reverso hubiera fallado | El script verifica que el primer reverso retornó `success: true` antes de probar el segundo |
| H-06 | `create_credit_card_purchase` no tenía clave de idempotencia | Añadido `p_idempotency_key` al RPC SQL; `idempotencyKey` al DTO `CreateCreditCardPurchaseDTO`; idempotencia en adaptador local y Supabase |

---

## 7. Riesgos Residuales

| ID | Descripción | Severidad | Estado |
|---|---|---|---|
| R-04 | Migración V2 no aplicada remotamente | **Alto** | Pendiente UX-03.2 |
| R-07 | `reverseOperation` local solo implementa INCOME | **Medio** | Aceptado |
| R-08 | Idempotencia en memoria pierde estado al recargar | **Bajo** | Aceptado (Supabase autoritativo) |
| R-09 | NULL de columnas opcionales silenciado como `0` | **Bajo** | Aceptado con monitoreo |

### Próximos sprints

**UX-03.2:** Aplicar las tres migraciones en Supabase staging, ejecutar `rls_isolation_test_v2.sql` con dos usuarios sintéticos, instalar WebKit y ejecutar suite E2E.

**UX-03.3:** Activar `providerMode: 'supabase'` en staging, validar persistencia tras logout/reload, confirmar funcionamiento de `createCreditCardPurchase` con la RPC atómica.

---

*Remediación ejecutada localmente. Sin migraciones remotas, deploys, commits ni push. El modo activo permanece `local-demo` en `app.config.ts`. Propiedad intelectual y autoría del proyecto: YamiCueto.*
