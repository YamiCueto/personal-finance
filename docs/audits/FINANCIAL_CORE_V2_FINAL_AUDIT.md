# INFORME DE AUDITORÍA FINAL DEL NÚCLEO FINANCIERO V2 — PERSONAL FINANCE

**Fecha:** 2026-10-15  
**Rama:** `feat/financial-core`  
**Auditor:** Arquitecto Principal de Software, Auditor de Seguridad PostgreSQL/Supabase y Especialista en Sistemas Financieros  
**Estado de Aprobación:** **CONDICIONADO** (Evidencia local completa al 100% en 32 pruebas automatizadas; condicionado a prueba de carga y concurrencia física en clúster multi-proceso de Supabase Staging antes de despliegue a producción).

---

## 1. RESUMEN EJECUTIVO

Se ha ejecutado una auditoría de código, seguridad PostgreSQL y precisión matemática sobre el núcleo financiero V2 de **Personal Finance**. La evaluación abarcó las migraciones de esquema SQL (`20261015000001_financial_core_schema.sql` y `20261015000002_financial_core_v2.sql`), las 5 funciones transaccionales con privilegios elevados (`SECURITY DEFINER`), los modelos de TypeScript (`financial-v2.model.ts`), el motor de cálculo (`FinancialCalculatorV2`), la suite de integridad y pruebas de integración en base de datos (`database_integrity.spec.ts`), y el aislamiento RLS (`rls_isolation_test.sql`).

### Hallazgos Principales:
1. **Blindaje de Funciones `SECURITY DEFINER`:** Se eliminó el riesgo crítico de *Parameter Tampering* al forzar la asignación estricta desde `auth.uid()`, bloqueando cualquier intento de suplantar o manipular cuentas ajenas. Se configuró `SET search_path = public, pg_temp` para prevenir *Search-Path Hijacking*, y se revocaron privilegios a `PUBLIC` y roles anónimos.
2. **Evolución de Migraciones V1 a V2:** Se confirmó la preservación íntegra de datos históricos en cuentas, ingresos, obligaciones y pagos sin pérdida de información, migrando esquemas mediante scripts deterministas e idempotentes.
3. **Precisión Matemática y Consistencia Financiera:** Tanto en TypeScript (`FinancialCalculatorV2`) como en PostgreSQL se opera con aritmética exacta de enteros (centavos en TypeScript y `NUMERIC(15, 2)` / `NUMERIC(7, 4)` en Postgres), redondeo simétrico *Half-Up* sin signo negativo espurio (`-0.00`), soporte de tasa cero ($0\%$), y prelación contractual de pagos sin invención de comisiones.
4. **Validación Automatizada:** 32 pruebas superadas con éxito (13 pruebas unitarias y 19 pruebas de integración/seguridad en base de datos con emulación Supabase).
5. **Diferencias Críticas PGlite vs Supabase:** PGlite se ejecuta en WebAssembly monohilo dentro del runtime de Node.js, por lo que la contención de transacciones concurrentes simultáneas sobre la misma fila debe ser validada en el clúster real con PgBouncer.

---

## 2. ESTADO DE CADA FUNCIÓN PRIVILEGIADA (SECURITY DEFINER)

| Función | search_path | auth.uid() & Authz | Privilegios EXECUTE | Concurrencia / Locks | Idempotencia / Anti-Tamper | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `record_obligation_payment` | `public, pg_temp` | Validado vs `p_user_id` | Solo `authenticated` y `service_role` | `SELECT FOR UPDATE` en obligación y cuenta | Clave + Validación de Payload | **CONFORME** |
| `record_internal_transfer` | `public, pg_temp` | Validado vs `p_user_id` | Solo `authenticated` y `service_role` | `FOR UPDATE` ordenado por ID (Anti-deadlock) | Clave + Validación de Payload | **CONFORME** |
| `record_income` | `public, pg_temp` | Validado vs `p_user_id` | Solo `authenticated` y `service_role` | `SELECT FOR UPDATE` en cuenta destino | Clave + Validación de Payload | **CONFORME** |
| `reverse_operation` | `public, pg_temp` | Validado vs `p_user_id` | Solo `authenticated` y `service_role` | `SELECT FOR UPDATE` en operación y registros | Bloqueo de doble reverso (`is_reversed`) | **CONFORME** |
| `record_debt_restructure` | `public, pg_temp` | Validado vs `p_user_id` | Solo `authenticated` y `service_role` | `SELECT FOR UPDATE` en producto de crédito | Registro histórico inmutable previo | **CONFORME** |

### Análisis Detallado por Función:

#### 1. `record_obligation_payment`
- **Autenticación y Autorización:** Extrae `v_caller := auth.uid()`. Si el invocador está autenticado y envía un `p_user_id` divergente, rechaza la operación inmediatamente (`RAISE EXCEPTION 'No autorizado...'`). Si no hay autenticación (`auth.uid() IS NULL` y `p_user_id IS NULL`), deniega el acceso.
- **Aislamiento Multi-inquilino:** Consulta `period_obligations` y `accounts` filtrando por `id = ... AND user_id = p_user_id`. Es imposible aplicar fondos desde una cuenta ajena o abonar a una obligación de otro usuario.
- **Idempotencia con Anti-Tampering:** Si se presenta un `p_idempotency_key` existente, valida que `amount`, `obligation_id` y `account_id` coincidan de manera exacta con el registro previo; de lo contrario, genera un error de conflicto de idempotencia.
- **Consistencia y Prelación:** Valida fondos suficientes (`current_balance >= p_amount`), rechaza sobrepagos que superen `amount_pending` (salvo abonos extraordinarios a capital `PREPAYMENT_CAPITAL`), aplica la cascada legal (Mora $\rightarrow$ Comisiones $\rightarrow$ Seguros $\rightarrow$ Interés Corriente $\rightarrow$ Capital), amortiza el saldo del crédito en `credit_products` y escribe en el log inmutable `financial_audit_log`.

#### 2. `record_internal_transfer`
- **Autenticación y Autorización:** Restringido al propietario verificado vía `auth.uid()`.
- **Prevención de Deadlocks:** Implementa bloqueo jerárquico determinista: compara lexicográficamente los identificadores (`IF p_from_account_id < p_to_account_id`) y adquiere los bloqueos `FOR UPDATE` en orden estricto, eliminando interbloqueos en transferencias bidireccionales concurrentes.
- **Conservación Contable:** Realiza el débito en la cuenta origen (`monto + comisión`) y el crédito en la cuenta destino (`monto`), manteniendo la ecuación patrimonial.

#### 3. `record_income`
- **Autenticación y Autorización:** Restringido a `auth.uid()`.
- **Integridad:** Acredita atómicamente el saldo en la cuenta vinculada (si aplica) con bloqueo `FOR UPDATE`.
- **Auditoría:** Registra el evento en `incomes` y `financial_audit_log` con verificación de payload en clave de idempotencia.

#### 4. `reverse_operation`
- **Control de Pertenencia:** Verifica que la operación a revertir pertenezca al usuario invocador (`WHERE id = p_operation_id AND user_id = p_user_id`).
- **Seguridad Contable:** Verifica el indicador `is_reversed`. Si la operación ya fue revertida, aborta la transacción impidiendo dobles acreditaciones.
- **Restitución Atómica:** En pagos, acredita a la cuenta debitada, restituye el `amount_pending` en la cuota y reversa la amortización en `credit_products`. En transferencias, restituye débitos y créditos con bloqueo ordenado.
- **Inmutabilidad:** Marca `is_reversed = true` y consigna el motivo obligatorio en `financial_audit_log`. El trigger `fn_prevent_financial_deletion` impide la eliminación física (`DELETE`) del registro histórico.

#### 5. `record_debt_restructure`
- **Control de Pertenencia:** Bloquea el crédito con `FOR UPDATE` asegurando pertenencia al usuario.
- **Precisión de Tasa:** Deriva la tasa periódica mensual desde la Tasa Efectiva Anual (E.A.) mediante la fórmula exponencial $i_m = (1 + EA)^{1/12} - 1$ con redondeo a 4 decimales (`NUMERIC(7, 4)`), garantizando paridad matemática con `FinancialCalculatorV2`.
- **Trazabilidad Contractual:** Almacena el snapshot íntegro de las condiciones previas en `debt_restructure_events` antes de mutar el crédito a estado `RESTRUCTURED`.

---

## 3. MATRIZ DE VULNERABILIDADES Y RIESGOS

| Identificador | Severidad | Componente / Función | Escenario de Explotación | Estado de Mitigación |
| :--- | :---: | :--- | :--- | :--- |
| **VULN-001** | **CRÍTICA** | Funciones `SECURITY DEFINER` (V1 baseline) | *Parameter Tampering*: Un usuario autenticado suministraba `p_user_id` de otra víctima, debitando sus cuentas sin restricción de rol. | **CORREGIDO**: Se fijó `v_caller := auth.uid()` y validación estricta de discrepancia en las 5 funciones. |
| **VULN-002** | **ALTA** | Funciones `SECURITY DEFINER` (V1 baseline) | *Search-Path Hijacking*: Ausencia de `SET search_path` permitía inyectar operadores maliciosos en esquemas temporales. | **CORREGIDO**: Establecido `SET search_path = public, pg_temp` en todas las funciones. |
| **VULN-003** | **CRÍTICA** | Privilegios en PostgreSQL | Invocación anónima: Por defecto Postgres otorga `EXECUTE` a `PUBLIC` en funciones creadas en `public`. | **CORREGIDO**: `REVOKE ALL ... FROM PUBLIC` y `GRANT` exclusivo condicional a `authenticated` y `service_role`. |
| **VULN-004** | **MEDIA** | Idempotencia en Pagos y Transferencias | *Payload Tampering*: Reutilizar una clave de idempotencia previa enviando cuentas o montos distintos para desviar fondos. | **CORREGIDO**: Se añadió verificación estricta de payload contra los parámetros del registro original. |
| **VULN-005** | **MEDIA** | Tablas Contables Históricas | Borrado silencioso: Un cliente ejecutaba `DELETE` directo en `obligation_payments` o `internal_transfers`. | **CORREGIDO**: Trigger `fn_prevent_financial_deletion` prohíbe `DELETE` físico forzando el uso de `reverse_operation`. |
| **VULN-006** | **BAJA** | Migración en entornos sin roles Supabase | Falla de migración en PostgreSQL estándar o PGlite al ejecutar `GRANT ... TO authenticated` sin existir el rol. | **CORREGIDO**: Grants envueltos en bloque condicional `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ...)`. |

---

## 4. COMPATIBILIDAD DE MIGRACIONES V1 / V2

### Escenario A: Base completamente vacía
- **Resultado:** Aprobado.
- **Detalle:** La ejecución secuencial de `20261015000001_financial_core_schema.sql` y `20261015000002_financial_core_v2.sql` construye el esquema completo sin conflictos de tipos, claves foráneas ni dependencias circulares.

### Escenario B: Base con V1 y datos preexistentes
- **Resultado:** Aprobado.
- **Detalle:** Verificado en la Prueba 2 de integración:
  - Cuentas en V1 conservan saldos, nombres y su bandera `is_active` se mapea limpiamente a `is_archived = false`.
  - Registros de `incomes` preservan montos y mapean `month`/`year` a `period_month`/`period_year`.
  - Registros de `obligations` se transforman a `period_obligations` calculando coherentemente `amount_paid` y `amount_pending`.
  - Pagos previos en `obligation_payments` conservan sus relaciones y llaves compuestas.

### Escenario C: Migraciones previamente aplicadas
- **Resultado:** Aprobado.
- **Detalle:** La migración V1 se mantiene intacta como línea base histórica inmutable. La migración V2 opera como evolución diferencial aditiva y transformativa, garantizando reproducibilidad en repositorios con despliegues previos de V1.

### Escenario D: Ejecución repetida (Idempotencia de migración)
- **Resultado:** Aprobado.
- **Detalle:** Las sentencias DDL utilizan cláusulas condicionales (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, reemplazo `CREATE OR REPLACE FUNCTION` y regeneración dinámica de políticas RLS mediante cursor PL/pgSQL). No se duplican índices ni tablas en ejecuciones repetidas.

---

## 5. AUDITORÍA DE PRECISIÓN FINANCIERA

### Análisis de Algoritmos y Motor de Cálculo:
1. **Representación de Moneda:**
   - En TypeScript (`financial-calculator-v2.ts`): Todas las operaciones monetarias se computan en centavos enteros (`cents = Math.round(amount * 100)`), eliminando residuos de coma flotante IEEE 754 de JavaScript.
   - En PostgreSQL: Columnas numéricas tipadas como `NUMERIC(15, 2)`, garantizando precisión fija exacta en el motor de almacenamiento relacional.
2. **Redondeo Half-Up y Manejo de Signo:**
   - Se implementa `roundHalfUp(val, decimals)` con corrección de precisión epsilon (`Number.EPSILON`).
   - Se normaliza el resultado para evitar `-0.00` en amortizaciones y saldos cancelados (`if (Object.is(result, -0)) result = 0`).
3. **Conversión de Tasas (Efectiva Anual a Periódica Mensual):**
   - Ecuación exponencial exacta:
     $$i_m = \left(1 + \frac{EA}{100}\right)^{\frac{1}{12}} - 1$$
   - En TypeScript y PostgreSQL se conserva la tasa mensual con 4 decimales (`NUMERIC(7, 4)`), preservando la fidelidad frente a extractos bancarios del sistema financiero.
   - Soporte verificado para tasas al $0\%$ (sin divisiones por cero ni errores NaN).
4. **Fórmula de Cuota Constante (Sistema Francés):**
   - Ecuación:
     $$A = P \times \frac{i \times (1 + i)^n}{(1 + i)^n - 1}$$
   - Se valida el límite cuando $i \rightarrow 0$, donde la cuota se reduce exactamente a $A = \frac{P}{n}$.
5. **Cascada de Prelación de Pagos:**
   - Prelación legal: Intereses Moratorios $\rightarrow$ Otros Cobros/Comisiones $\rightarrow$ Seguros $\rightarrow$ Interés Corriente $\rightarrow$ Amortización a Capital.
   - Ni el frontend ni la base de datos inventan comisiones si no existen en el contrato o cuota exigible.

---

## 6. COBERTURA REAL DE PRUEBAS

Se auditaron y ejecutaron **32 pruebas automatizadas** en el entorno local:

### Desglose de Pruebas:
1. **Pruebas Unitarias de Lógica y Precisión Financiera (13 pruebas):**
   - Archivo: `src/app/core/services/financial-calculator-v2.spec.ts`
   - Motor: Vitest
   - Cobertura: Tasas nominales/efectivas, cuota fija francesa, tasa cero, tablas de amortización completas, cascada de pagos parciales, prepago extraordinario a capital, rediferido contractual, saldos netos consolidados.
   - **Resultado: 13/13 APROBADAS.**

2. **Pruebas de Integración SQL, Migraciones y Funciones (12 pruebas):**
   - Archivo: `supabase/tests/database_integrity.spec.ts` (Bloque base)
   - Motor: PGlite (PostgreSQL en WebAssembly)
   - Cobertura: Migración base vacía, migración con datos V1, claves foráneas compuestas anti-cruce, pago parcial con cascada, pago total, abono a capital, rechazo de sobrepago, prevención de sobrepago secuencial, idempotencia en pagos, transferencias neutras, reverso atómico y bloqueo de DELETE físico, rediferido con historial.
   - **Resultado: 12/12 APROBADAS.**

3. **Pruebas de Seguridad Negativas y Anti-Tampering (7 pruebas):**
   - Archivo: `supabase/tests/database_integrity.spec.ts` (Bloque de seguridad)
   - Motor: PGlite con emulación de `auth.uid()`
   - Cobertura:
     - *Prueba Negativa 1:* Usuario B intentando pagar obligación de Usuario A o suplantar su identidad $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 2:* Usuario B intentando transferir fondos desde la cuenta de Usuario A $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 3:* Usuario B intentando revertir un pago de Usuario A $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 4:* Invocación anónima (`auth.uid() IS NULL`) de funciones privilegiadas $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 5:* Reutilización de clave de idempotencia con payload diferente $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 6:* Intento de doble reverso sobre la misma operación $\rightarrow$ **RECHAZADO**.
     - *Prueba Negativa 7:* Eliminación física en `financial_audit_log` o `internal_transfers` $\rightarrow$ **RECHAZADO**.
   - **Resultado: 7/7 APROBADAS.**

4. **Pruebas de Aislamiento RLS en PostgreSQL (1 script):**
   - Archivo: `supabase/tests/rls_isolation_test.sql`
   - Ejecución: Evaluado dentro del pipeline de migración; aislamiento verificado bajo `FORCE ROW LEVEL SECURITY`.

5. **Pruebas de Concurrencia Física Real Multi-Proceso:**
   - **Estado: NO VERIFICADO EN PGLITE.**
   - Justificación: PGlite ejecuta PostgreSQL sobre WebAssembly en el proceso monohilo de Node.js. No emula las condiciones de contención multi-hilo, red de sockets de PgBouncer ni carreras críticas de transacciones concurrentes simultáneas sobre la misma tupla.

---

## 7. DIFERENCIAS ENTRE PGLITE Y SUPABASE REAL

| Dimensión | PGlite (Entorno de Pruebas Local) | Supabase (PostgreSQL en Producción / Staging) |
| :--- | :--- | :--- |
| **Arquitectura de Ejecución** | Monohilo WebAssembly integrado en Node.js V8. | Multi-proceso Linux nativo con PgBouncer y pooling de conexiones. |
| **Concurrencia Real** | Serializada por el event-loop de JavaScript. No reproduce *race conditions* de red concurrentes reales. | Concurrencia real multi-núcleo; contención de bloqueos a nivel de tupla (`FOR UPDATE`) en paralelo. |
| **Roles y Permisos** | Usuario por defecto es superusuario (`postgres`). Los roles `anon`, `authenticated`, `service_role` deben crearse manualmente si se invocan directamente. | Roles `anon`, `authenticated`, `service_role` preconfigurados por GoTrue y el API Gateway PostgREST. |
| **Row Level Security (RLS)** | El superusuario omite RLS a menos que se fuerce con `ALTER TABLE ... FORCE ROW LEVEL SECURITY` o se ejecute `SET ROLE authenticated`. | RLS se aplica estrictamente a todas las solicitudes de clientes autenticados. |
| **Contexto de Autenticación** | `auth.uid()` se simula escribiendo en `request.jwt.claim.sub` mediante `set_config()`. | `auth.uid()` es inyectado criptográficamente por PostgREST tras verificar la firma JWT expedida por GoTrue. |
| **Extensiones y PLs** | Soporte parcial para ciertas extensiones nativas C de PostgreSQL. | Soporte completo para `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `pgjwt`, etc. |

---

## 8. CORRECCIONES PUNTUALES REALIZADAS

Durante el ciclo de auditoría se aplicaron exclusivamente correcciones localizadas, justificadas y comprobadas mediante pruebas automatizadas:

1. **`supabase/migrations/20261015000002_financial_core_v2.sql`:**
   - Se protegieron las sentencias `GRANT EXECUTE ... TO authenticated, service_role` dentro de un bloque condicional PL/pgSQL (`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ...)`), asegurando que la migración no falle cuando se ejecute en PostgreSQL estándar o PGlite donde dichos roles aún no han sido aprovisionados.
2. **`supabase/tests/database_integrity.spec.ts`:**
   - Se corrigieron los tipos de datos en la invocación de `record_income` para el caso de prueba anónimo (`NULL::UUID`, `2::SMALLINT`).
   - Se ajustó el valor del enumerado `source_type` en la inserción de obligaciones de prueba para concordar con la restricción `CHECK (source_type IN ('CREDIT_INSTALLMENT', 'RECURRENT_EXPENSE', 'AD_HOC_COMMITMENT'))`.
   - Se añadieron 7 pruebas negativas de seguridad cubriendo cross-tenant, parameter tampering, denegación anónima, anti-tampering de payload en idempotencia y bloqueo de borrado de auditoría.

---

## 9. RIESGOS PENDIENTES Y OBSERVACIONES

1. **Prueba de Carga y Concurrencia en Supabase Staging:** Al no ser reproducible la concurrencia real distribuida en PGlite, se debe ejecutar una prueba de estrés (ej. k6 o Artillery) en un entorno Supabase remoto antes de habilitar el tráfico de producción.
2. **Discrepancias entre Saldo Estimado y Saldo Confirmado por Extracto:** Las instituciones financieras pueden aplicar cargos administrativos o redondeos particulares de días calendario (ej. 30/360 vs Exacto/365). La aplicación debe mantener separados el `current_balance` confirmado por el usuario frente al saldo proyectado por la tabla de amortización.

---

## 10. RECOMENDACIÓN FINAL DE AUTORIZACIÓN

### Veredicto: **CONDICIONADO**

**Criterios Cumplidos:**
- [x] Código SQL y TypeScript inspeccionado al 100%.
- [x] Correcciones de seguridad aplicadas y comprobadas en las 5 funciones `SECURITY DEFINER`.
- [x] Claves foráneas compuestas `(user_id, id)` impidiendo referencias cruzadas entre usuarios.
- [x] Preservación de datos de V1 demostrada.
- [x] Suite de pruebas automatizadas: 32 de 32 pruebas superadas con éxito.
- [x] Compilación exitosa de la aplicación Angular (`npm run build`).

**Condiciones Pendientes para Pase Definitivo a Producción (APROBADO):**
1. Despliegue de la migración `20261015000002_financial_core_v2.sql` en el entorno Supabase Staging.
2. Ejecución de prueba de estrés concurrente (múltiples transacciones paralelas compitiendo por la misma cuenta y obligación) para validar el comportamiento de los bloqueos `FOR UPDATE` bajo el pool de PgBouncer.

---
*Informe generado para el equipo de desarrollo y arquitectura de Personal Finance.*
