# UX-03.2 — Certificación de Integración Local Supabase

**Sprint:** Financial Core  
**Branch:** `feat/financial-core`  
**Fecha:** 2026-10-18  
**Prerequisito:** UX-03.1 remediación + hardening completados (ver `UX_03_1_REMEDIATION_REPORT.md`)  
**Estado:** Fase 1–4 completadas ✓

---

## Alcance

Verificar que la configuración de build `local-supabase` activa correctamente `providerMode: 'supabase'` apuntando a la instancia local, que la autenticación es real (no `default-user`), y que el ciclo de vida de datos financieros y tarjetas de crédito funciona bajo RLS multi-tenant.

**Restricciones aplicadas:**
- Supabase Cloud: sin modificaciones
- `.env` existente: sin modificaciones
- Comportamiento predeterminado de producción (`local-demo`): sin cambios
- Sin commits, push ni despliegues

---

## Fase 1 — Configuración aislada

### Cambios realizados

| Archivo | Cambio |
|---|---|
| `src/app/core/config/environment.model.ts` | `providerMode?: 'local-demo' \| 'supabase'` añadido a `Environment` |
| `src/environments/environment.local-supabase.ts` | Nuevo: URL local `http://127.0.0.1:54421`, `providerMode: 'supabase'` |
| `src/app/app.config.ts` | `provideFinancialCore(environment.providerMode ? { providerMode: environment.providerMode } : {})` |
| `angular.json` | Build + serve `local-supabase` con `fileReplacements` |
| `supabase/config.toml` | Puertos exclusivos `5442x` (no colisionan con `curso-ia-generativa` en `5432x`) |

### Verificación de build

```
npx ng build --configuration=local-supabase
→ Application bundle generation complete [1.383s]
```

### Verificación de puertos

| Servicio | Puerto local |
|---|---|
| API (PostgREST + Auth) | 54421 |
| DB (PostgreSQL) | 54422 |
| Studio | 54423 |
| SMTP local | 54424 |
| Analytics | 54427 |

---

## Fase 2 — Autenticación real

### Usuarios sintéticos creados

| Usuario | Email | UUID | Contraseña |
|---|---|---|---|
| Alice | `alice@localtest.dev` | `aaaaaaaa-0000-0000-0000-000000000001` | `Test1234!` |
| Bob | `bob@localtest.dev` | `bbbbbbbb-0000-0000-0000-000000000002` | `Test1234!` |

Script de seed: `supabase/tests/seed_local_test_users.sql`

**Nota de setup:** GoTrue requiere campos no-NULL en `auth.users` (`confirmation_token`, `recovery_token`, etc.) como `''` en lugar de `NULL`. El seed script los incluye correctamente. También requiere entradas en `auth.identities` para el proveedor `email`.

### Resultados AUTH

| Check | Descripción | Resultado |
|---|---|---|
| AUTH-01 | `auth.uid()` retorna UUID de alice al simular contexto JWT | PASS |
| AUTH-02 | `auth.uid()` retorna UUID de bob al simular contexto JWT | PASS |
| AUTH-03 | `auth.uid()` = `NULL` cuando JWT no tiene `sub` (bloquea operaciones remotas) | PASS |
| AUTH-04 | Login alice vía `POST /auth/v1/token?grant_type=password` | PASS |
| AUTH-04b | `user.id` en respuesta = UUID correcto de alice | PASS |
| AUTH-05 | Login bob exitoso | PASS |
| AUTH-05b | `user.id` bob = UUID correcto | PASS |
| AUTH-06 | JWT `sub` = alice UUID — nunca `default-user` | PASS |
| AUTH-07 | Logout alice sin error | PASS |
| AUTH-08 | Re-login alice exitoso tras logout | PASS |
| AUTH-09 | Refresh token (restauración de sesión) exitoso | PASS |

**8/8 checks de flujo REST + 3/3 checks SQL = 11 checks totales PASADOS**

---

## Fase 3 — Persistencia financiera

Todos los checks usan transacción con rollback final — datos de prueba no persisten.

| Check | Descripción | Resultado |
|---|---|---|
| PERS-01 | Alice crea institución financiera | PASS |
| PERS-02 | Alice crea cuenta bancaria | PASS |
| PERS-03 | Bob NO puede leer institución de alice (RLS activo) | PASS |
| PERS-04 | Bob NO puede leer cuenta de alice (RLS activo) | PASS |
| PERS-05 | Alice registra ingreso vía `record_income()` | PASS |
| PERS-06 | Bob NO puede leer ingreso de alice | PASS |
| PERS-07 | Alice crea tarjeta de crédito | PASS |
| PERS-08 | Alice crea obligación de período | PASS |
| PERS-09 | Bob NO puede leer obligación de alice | PASS |
| PERS-10 | Alice paga obligación → estado `PAID` | PASS |

**10/10 PASADOS**

### Bug encontrado y corregido

La función `record_income` (migración V3) no incluía las columnas V1 `month`, `year`, `received_at` que son `NOT NULL` en la tabla. Corregido en migración correctiva:

**`supabase/migrations/20261018000004_fix_record_income_v1_columns.sql`**

La función ahora popula `year = p_period_year`, `month = p_period_month`, `received_at = p_received_date::TIMESTAMPTZ`.

---

## Fase 4 — Tarjetas de crédito y concurrencia

| Check | Descripción | Resultado |
|---|---|---|
| CC-01 | Alice crea compra con tarjeta de crédito (3 cuotas, $300,000) | PASS |
| CC-02 | Cupo descontado correctamente: $2,000,000 → $1,700,000 | PASS |
| CC-03 | Segunda llamada con misma clave idempotente retorna `is_replayed: true`, mismo `purchase_id` | PASS |
| CC-04 | Cupo NO descontado dos veces — idempotencia preserva integridad financiera | PASS |
| CC-05 | Clave idempotente con parámetros distintos lanza excepción de conflicto | PASS |
| CC-06 | Compra que excede cupo disponible lanza excepción `Fondos insuficientes` | PASS |

**6/6 PASADOS**

---

## Servidor de desarrollo

```
npx ng serve --configuration=local-supabase --port=4201
→ http://localhost:4201/
```

La app carga con `providerMode: 'supabase'` apuntando a `http://127.0.0.1:54421`. El build predeterminado (`development` / `production`) sigue usando `local-demo` sin ninguna modificación.

---

## Resumen ejecutivo

| Fase | Checks | Estado |
|---|---|---|
| 1 — Configuración aislada | Build + puertos | ✓ |
| 2 — Autenticación real | 11/11 | ✓ |
| 3 — Persistencia financiera | 10/10 | ✓ |
| 4 — Tarjetas y concurrencia | 6/6 | ✓ |
| **Total** | **27/27** | **✓** |

**Invariante crítico verificado:** El JWT nunca contiene `default-user` como `sub`. `resolveUserId()` en modo `supabase` lanza excepción si `auth.uid()` es `NULL`, bloqueando cualquier operación financiera no autenticada.
