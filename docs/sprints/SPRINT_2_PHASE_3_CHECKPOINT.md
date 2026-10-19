# SPRINT 2 / FASE 3 — CHECKPOINT

**Rama:** `feat/financial-core` · **Fecha:** 2026-10-16 · **Alcance:** solo local, sin operaciones remotas.

> El SHA de este commit y el del tag `sprint2-phase3-local` se informan únicamente en la respuesta final.

## 1. Commits previos a este documento

| SHA | Mensaje |
|---|---|
| `6d06010` | feat(financiero): motor de amortizacion francesa/alemana, simuladores y modelos de credito |
| `f66769e` | feat(financiero): adaptadores, servicio y fachada de creditos, tarjetas y cuotas idempotentes |
| `e90a2ef` | feat(ui): modulos de creditos, tarjetas y simuladores con dashboard de deuda y estilos responsive |
| `8de32d2` | test(e2e): flujos Playwright de creditos, tarjetas, simuladores y viewport 440 |

Commit anterior de base: `9455a61`. Quinto commit (este): documentación.

## 2. Verificaciones (ejecutadas en esta fase)

| Verificación | Resultado |
|---|---|
| `npm run build` | Exit 0. Advertencia: presupuesto inicial 517,61 kB > 500 kB (+17,61 kB). No bloqueante, documentada. |
| `npm test -- --watch=false` | 16 archivos, 101/101 pruebas OK |
| `npx vitest run supabase/tests/database_integrity.spec.ts` | 19/19 OK |
| `npm run e2e:mock` | 168/168 OK (6 viewports × 28) |

No se repitieron las suites durante el checkpoint porque no se modificó código tras la última ejecución exitosa (solo documentación en `docs/sprints/`).

## 3. Auditoría de archivos

- **Specs protegidos:** `src/app/core/state/financial.facade.spec.ts` y `supabase/tests/database_integrity.spec.ts` permanecieron **sin modificaciones** (diff vacío, ausentes de `git status`).
- **`playwright.config.ts`:** única modificación = alta del proyecto `mobile-440` (+7 líneas, 0 eliminadas). `retries` sin cambios (`CI ? 2 : 0`); sin `skip`/`only`/`fixme` añadidos.
- **`e2e/auth-mock.spec.ts`:** +157 líneas, **0 eliminadas**. Los 24 tests previos no se tocaron. Se añadieron 4 tests de Fase 3.
- **`period-obligations.service.ts`:** cambio de la clave de idempotencia por defecto de `pay-<id>-<Date.now()>` a `crypto.randomUUID()` (con respaldo). Es una corrección legítima: la clave basada en milisegundos podía colisionar entre intentos distintos en el mismo instante y no aportaba idempotencia real; la idempotencia efectiva sigue dependiendo de la clave que pase quien llama. No altera contratos ni pruebas.
- **Specs nuevos revisados íntegramente:** `credit-products.service.spec.ts`, `credits-manager`, `credit-cards-manager`, `financial-simulators` (sin `skip`/`only`).
- **`test.skip` preexistentes** en `e2e/auth.spec.ts` (4, suite live condicionada a credenciales locales): archivo no modificado.
- **Baseline:** `BASELINE_ASSERTIONS_PHASE3.tsv` (conteo de `expect\s*\(` por spec, orden ordinal, rutas con `/`).

## 4. Hallazgos

**No bloqueantes (documentados, sin cambios de código en este checkpoint):**

1. **Error corregido en documentación:** el informe de implementación afirmaba que SQL V2 carecía de `credit_card_purchases` y columnas de tarjeta. Es falso; se corrigió la sección 13/14 del informe.
2. **Comentarios de los stubs del adaptador Supabase** indican migración pendiente aunque la tabla de compras existe. Pendiente de revisar en la fase de persistencia remota.
3. **Aserciones E2E de mensajes** se escribieron como subcadenas (`integrada exitosamente`, `ya fue generada previamente`) porque los mensajes reales de la UI difieren de los supuestos iniciales. Son tests nuevos, no debilitan los preexistentes; pueden endurecerse.
4. **Pruebas unitarias de UI** usan algunos `toBeGreaterThanOrEqual` sobre datos semilla; los invariantes críticos (cupo, idempotencia, saldo sin cambios en simulación) sí se verifican con valores exactos.
5. **Presupuesto de bundle** excedido en 17,61 kB.
6. **Cobertura:** pago parcial/total y amortización de capital se validan en `database_integrity.spec.ts` (SQL) y en la fachada; la UI de Fase 3 no los reproduce de punta a punta.
7. **Archivo ajeno:** `.hintrc` (configuración de webhint) aparece sin seguimiento; **excluido** de los commits, sin modificar `.gitignore`.

**Bloqueantes:** ninguno.

## 5. Artefactos generados (nunca versionados)

`dist/`, `playwright-report/`, `test-results/` y `.env` figuran como ignorados por `.gitignore`. No aparecen como untracked.

## 6. Inventario SQL (`supabase/migrations/`)

- `20261015000001_financial_core_schema.sql`, `20261015000002_financial_core_v2.sql`: **sin modificaciones**; no se creó ni ejecutó ninguna migración.
- Presente en V2: `credit_products` (cupos, corte, pago, método de amortización), `credit_card_purchases` (RLS `ENABLE`+`FORCE`), RPC `record_obligation_payment`, `record_internal_transfer`, `record_income`, `reverse_operation`, `record_debt_restructure`.
- Pendiente (propuesta, no ejecutada): índice único `(user_id, credit_product_id, period_year, period_month)` en `period_obligations`; RPC transaccionales para cuota/extracto y compra diferida; alinear `amortization_method` (`CUSTOM` del modelo no está en el `CHECK`); mapear `due_payment_day`.

## 7. Operaciones remotas

Ninguna: sin `push`, `merge`, `rebase`, `reset`, cambios de rama, despliegues ni migraciones.
