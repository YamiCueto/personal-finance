# BRAVISO: seguimiento de deudas y eliminación segura de cuentas

Fecha: 24 de octubre de 2026. Cambios locales, sin commit, push, despliegue ni migraciones remotas.

## Diagnóstico

- `CreditProduct` ya es la identidad maestra del pasivo; `PeriodObligation` referencia ese producto y `ObligationPayment` referencia la cuota. Se conserva esa relación, sin una segunda contabilidad.
- El saldo original desembolsado y el capital vigente existían, pero faltaba un saldo inicial confirmado con fecha de corte. Registrar una deuda preexistente como un crédito nuevo confundía ambos importes.
- `RecurrentObligation` representa gastos periódicos. El flujo existente de gastos recurrentes se conserva separado de las deudas y compromisos con saldo; no se convierten servicios o suscripciones en préstamos.
- La tabla física de cuentas es `accounts`, no `financial_accounts`. La migración V2 renombra `account_transfers` a `internal_transfers`.
- `archiveAccount()` ya existía. El listado conservaba las cuentas archivadas, pero los selectores de ingresos y pagos todavía las mostraban.
- El adaptador demo debitaba pagos y transferencias sin conservar sus nuevos registros en los mapas históricos; únicamente implementaba el reverso de ingresos. Se corrigieron esos puntos porque impedían proteger las cuentas con historial.
- La cascada anterior podía aplicar nuevamente intereses y seguros en cada pago parcial. Ahora descuenta lo ya pagado y no revertido.

## Arquitectura entregada

### Seguimiento

Se extiende `CreditProduct` con saldo de apertura, fecha de corte, próximo vencimiento, cuota acordada, intereses conocidos y clase de obligación. El capital originalmente desembolsado puede ser nulo. Una tasa desconocida queda nula en PostgreSQL y explícitamente identificada como no registrada en el dominio/UI.

La acción **Registrar deuda existente** permite seleccionar o crear una entidad y registrar una deuda financiada o un compromiso con saldo. No crea pagos históricos ni reconstruye amortizaciones anteriores. Las cuotas se generan explícitamente por período, con unicidad por producto y mes. El vencimiento se ajusta al último día válido del mes cuando corresponde.

El detalle muestra saldo inicial, capital amortizado, intereses, seguros/cargos, total desembolsado, saldo actual, cuotas restantes, observaciones y estado. La consulta carga el historial del producto completo, independiente del período seleccionado en el dashboard. El resumen anual y los doce meses se calculan en centavos. Los meses anteriores al corte muestran **Sin historial registrado**.

Los pagos conservan fecha, referencia, cuenta, desglose e idempotencia. Los abonos extraordinarios afectan solo capital, sin aumentar el valor pagado de la cuota. Los reversos conservan el registro original y su motivo. La cuenta se debita por el total y la deuda disminuye solo por capital.

`debt_reconciliations` contiene ajustes explícitos e inmutables con saldo calculado, saldo reportado, diferencia, fecha y motivo. La conciliación exige que el extracto incluya los movimientos registrados y comprueba el saldo esperado para rechazar una pantalla obsoleta. No reescribe pagos históricos.

### Cuentas: archivado, restauración y eliminación auditada independientes

Las acciones **Archivar cuenta** y **Eliminar cuenta** son independientes y visibles en cada tarjeta de cuenta activa. Nunca se convierte automáticamente una solicitud de eliminación en una operación de archivado sin confirmación del usuario:

- **Eliminar cuenta** (`<app-icon name="trash" />`, esquina superior derecha): abre un diálogo nativo de confirmación con motivo opcional y ejecuta `delete_financial_account(p_user_id, p_account_id, p_reason, p_operation_id)` únicamente si la cuenta carece por completo de historial financiero (ingresos, pagos de obligaciones, transferencias internas o eventos monetarios de auditoría). Si la cuenta posee movimientos, la eliminación es rechazada explícitamente informando la causa y ofreciendo la acción explícita **Archivar cuenta** como alternativa tras el rechazo, además de estar disponible directamente en la tarjeta.
- **Archivar cuenta** (`<app-icon name="archive" />`): abre un diálogo independiente de confirmación y ejecuta `archive_financial_account(p_user_id, p_account_id, p_idempotency_key)`, cambiando `is_archived = true`, conservando todos los movimientos y saldos, retirando la cuenta de los selectores operativos y registrando el evento `ACCOUNT_ARCHIVED` en `financial_audit_log` (con estado anterior/nuevo y deduplicación por estado e idempotencia).
- **Cuentas archivadas y restauración**: el módulo de cuentas incorpora filtros (`Todas`, `Cuentas activas`, `Cuentas archivadas`), una sección dedicada **Cuentas archivadas**, consulta de historial (`Ver historial`) y la acción explícita **Restaurar cuenta** (`<app-icon name="restore" />`), que ejecuta `restore_financial_account(p_user_id, p_account_id, p_idempotency_key)` reactivando la misma identidad financiera (`id`) y registrando `ACCOUNT_RESTORED` en `financial_audit_log`.

### Auditoría obligatoria de eliminación (`public.financial_account_deletion_audit`)

La migración incremental [`20261024180000_independent_archive_delete_audit.sql`](../supabase/migrations/20261024180000_independent_archive_delete_audit.sql) incorpora la tabla independiente `public.financial_account_deletion_audit`:

- **Columnas**: `id`, `account_id` (sin FK en cascada hacia `accounts` para sobrevivir al borrado), `account_name`, `institution_id`, `account_type`, `owner_user_id`, `deleted_by` (obtenido exclusivamente mediante `auth.uid()`), `deleted_at` (reloj UTC del servidor), `deletion_reason`, `operation_id` (UUID único de operación) y `metadata` (JSONB con RPC ejecutada, tipo de operación, `txid_current()`, resultado, origen verificado o `'No disponible'` y estado anterior/nuevo).
- **Integridad transaccional atómica**: `public.delete_financial_account` ejecuta en una sola transacción:
  1. Verificación de identidad autenticada (`auth.uid()`).
  2. Bloqueo transaccional (`pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`) y verificación de propiedad (`user_id = auth.uid()`).
  3. Verificación de cero dependencias financieras.
  4. Inserción del registro en `public.financial_account_deletion_audit` y del evento `ACCOUNT_DELETED` en `public.financial_audit_log`.
  5. Ejecución de `DELETE FROM public.accounts`, validada además por el trigger `BEFORE DELETE` (`guard_account_deletion`), el cual exige que exista el registro correspondiente en `public.financial_account_deletion_audit`. Si falla la auditoría o falla el borrado, toda la transacción se revierte (`ROLLBACK`).
- **Inmutabilidad y límites de protección**:
  - `financial_account_deletion_audit` y `financial_audit_log` tienen `ENABLE` y `FORCE ROW LEVEL SECURITY`, política `SELECT` exclusiva para el propietario (`auth.uid() = owner_user_id` / `user_id`), `REVOKE ALL` de mutaciones directas para `anon` y `authenticated`, y triggers `BEFORE UPDATE OR DELETE` (`prevent_account_deletion_audit_mutation` y `prevent_financial_audit_log_mutation`) que rechazan cualquier intento de alteración o purga desde sesiones de aplicación o funciones ordinarias.
  - Se revoca `UPDATE (is_archived)` directo sobre `public.accounts` para `authenticated`, obligando a pasar por las RPC auditadas.
  - **Límite técnico frente a superusuarios**: en PostgreSQL, un rol con atributo `SUPERUSER` o propietario directo del esquema con capacidad de ejecutar `ALTER TABLE ... DISABLE TRIGGER` o `DROP TRIGGER` en la consola administrativa de base de datos puede eludir triggers y RLS. La mitigación completa frente a administradores de infraestructura requiere replicación externa de logs (WAL/log shipping a almacenamiento WORM inmutable fuera de la instancia PostgreSQL).

### Seguridad y persistencia

Las mutaciones monetarias remotas se ejecutan mediante RPC transaccionales. Se conservan los controles de propiedad, las claves foráneas compuestas y RLS existentes. La nueva tabla tiene RLS por usuario y acceso de solo lectura para `authenticated`; sus escrituras se realizan mediante la RPC. Se restringe `EXECUTE` y se fijan los esquemas de búsqueda. No se incorpora ninguna clave privilegiada al cliente.

El historial de pagos requiere `SELECT` para `authenticated`, ausente en la migración de privilegios anterior; la nueva migración lo concede conservando RLS. Las funciones monetarias existentes se reemplazan de forma incremental para corregir pagos parciales y reversos de abonos, sin editar migraciones históricas.

## Migración

[`20261024161622_obligation_tracking_safe_accounts.sql`](../supabase/migrations/20261024161622_obligation_tracking_safe_accounts.sql), creada mediante la CLI. **No aplicada a Supabase remoto ni producción.** Se ejecutó en PGlite aislado sobre la secuencia completa de migraciones anteriores.

## Archivos

| Grupo | Archivos modificados o nuevos |
|---|---|
| Dominio y contratos | `src/app/core/models/financial-v2.model.ts`, `debt-tracking.model.ts`, `src/app/core/repositories/financial-repositories.contract.ts` |
| Persistencia | `src/app/core/repositories/local-financial.adapter.ts`, `supabase-financial.adapter.ts` |
| Servicios y estado | `src/app/core/services/credit-products.service.ts`, `financial-accounts.service.ts`, `debt-history.ts`, `src/app/core/state/financial.facade.ts` |
| Interfaz | `src/app/features/app-shell/app-shell.component.ts`, `.html`; `src/app/features/credits/credits-manager.component.ts`, `.html`; `debt-tracker.component.ts`, `.html`, `.scss`; `src/app/shared/components/account-delete-dialog.component.ts` |
| Pruebas | `src/app/core/repositories/debt-tracking.spec.ts`, `supabase-tracking.spec.ts`, `src/app/features/app-shell/app-shell.component.spec.ts`, `supabase/tests/tracking_accounts.spec.ts`, `e2e/tracking-accounts.spec.ts` |
| Entrega | Este informe y `docs/evidence/2026-10-24-tracking-accounts/` |

## Validación

| Verificación | Resultado |
|---|---|
| `npm.cmd test -- --watch=false` | 141 pruebas aprobadas, 21 archivos |
| `npx.cmd vitest run supabase/tests/tracking_accounts.spec.ts supabase/tests/database_integrity.spec.ts` | 27 pruebas aprobadas, incluidas 8 nuevas |
| Playwright, `tracking-accounts.spec.ts`, Chromium 360/390/1440 px | 6 escenarios aprobados |
| `npm.cmd run build` | Producción compilada; advertencia de presupuesto inicial: 594,85 kB frente a 500 kB |
| `git diff --check` | Sin errores de espacios |

La suite comprueba registro desde corte, ausencia de pagos inventados, navegación anual/mensual, generación única, pagos completos/parciales, desglose, saldo del ejemplo de **$17.430.000**, patrimonio, abonos, reversos, conciliación e idempotencia. También cubre eliminación sin movimientos, ingresos revertidos, pagos y transferencias protegidos, usuario ajeno, archivado, actualización reactiva, cancelación, bloqueo de doble ejecución y contratos RPC. Las pruebas SQL cambian al rol `authenticated` para comprobar aislamiento de lectura y autorización.

Las verificaciones usan únicamente fixtures y almacenamiento aislado. Las pruebas E2E utilizan autenticación simulada y el adaptador demo. Los tests de RPC verifican el contrato cliente; no equivalen a una ejecución remota de PostgREST/Supabase.

## Evidencia visual

- [Modal en escritorio, tema claro](evidence/2026-10-24-tracking-accounts/eliminar-escritorio-claro.png).
- [Modal móvil de 360 px, tema oscuro](evidence/2026-10-24-tracking-accounts/eliminar-movil-oscuro.png).
- [Detalle financiero en escritorio](evidence/2026-10-24-tracking-accounts/deuda-escritorio-claro.png).
- [Detalle financiero móvil, tema oscuro](evidence/2026-10-24-tracking-accounts/deuda-movil-oscuro.png).

Se inspeccionaron capturas reales del navegador. La prueba móvil comprueba además ausencia de desbordamiento horizontal del documento.

## Límites y pendientes

- Falta aplicar y validar la migración en un entorno Supabase de pruebas autorizado. No se probaron datos reales ni se ejecutaron migraciones de producción.
- La validación con WebKit/iPhone no llegó a ejecutarse: faltaba el binario y la descarga agotó sus tiempos de espera en los servidores de Playwright. Los resultados a 390 px corresponden a Chromium, no a Safari real.
- El detalle anual nuevo corresponde a las deudas y compromisos registrados con saldo de corte. No migra automáticamente créditos anteriores ni transforma gastos recurrentes sin saldo en deudas.
- Las cuotas usan los importes confirmados de capital, intereses y cargos; no se presenta esa repetición como una liquidación bancaria ni se infieren tasas desconocidas. No hay importación automática de extractos.
- El modo demo mantiene su almacenamiento en memoria; recargar o reiniciarlo no constituye persistencia remota.
- Las pruebas de PostgreSQL aislado no sustituyen una prueba de carga concurrente contra Supabase/PostgREST.

Referencias consultadas: [funciones de base de datos](https://supabase.com/docs/guides/database/functions) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
