# UX-03.3 — Certificación E2E Real con Chromium

**Sprint:** Financial Core  
**Branch:** `feat/financial-core`  
**Fecha:** 2026-10-18  
**Prerequisito:** UX-03.2 completada  
**Estado:** 13/13 ✓ — Sin fallos

---

## Entorno de ejecución

| Componente | Valor |
|---|---|
| Angular | `http://localhost:4201` (config `local-supabase`) |
| Supabase API | `http://127.0.0.1:54421` |
| PostgreSQL | `127.0.0.1:54422` |
| Runner | Playwright 1.63.0 + Chromium headful |
| Viewport | 1440×900 |
| Duración total | 13.3 s |
| RUN_ID | `E2E-1792361099859` |

---

## Datos persistidos (inspeccionables en DBeaver)

```
ACCOUNT | 5a9135ef-953d-4203-a449-683cedc127e7 | Cuenta E2E Alice E2E-1792361099859 | 1250000.00
INCOME  | dde3cb91-a117-4c14-9435-3f39b41c4a0c | Ingreso E2E E2E-1792361099859      | 250000.00
```

Consulta de solo lectura para inspección:
```sql
SELECT 'ACCOUNT' tipo, id, name, current_balance FROM accounts
WHERE id = '5a9135ef-953d-4203-a449-683cedc127e7'
UNION ALL
SELECT 'INCOME', id, source_name, amount FROM incomes
WHERE id = 'dde3cb91-a117-4c14-9435-3f39b41c4a0c';
```

---

## Fase 2 — Alice: flujo funcional completo

| # | Test | Descripción | Resultado | Evidencia |
|---|---|---|---|---|
| F2-01 | Login | Alice inicia sesión — `user-email` = `alice@localtest.dev` | PASS | `01-alice-login-ok.png` |
| F2-02 | Crear cuenta | `Cuenta E2E Alice E2E-1792361099859`, tipo CHECKING, saldo inicial $1.000.000 | PASS | `02-alice-account-form.png`, `03-alice-account-created.png` |
| F2-03 | UI panel Cuentas | Cuenta aparece en el panel Cuentas | PASS | `04-alice-accounts-panel.png` |
| F2-04 | PostgreSQL | `accounts` contiene el registro con `id` correcto | PASS | — |
| F2-05 | Registrar ingreso | $250.000 vinculado a la cuenta creada | PASS | `05-alice-income-form.png`, `06-alice-income-saved.png` |
| F2-06 | Saldo en BD | `current_balance = 1.250.000` en PostgreSQL | PASS | — |
| F2-07 | Saldo en UI | KPI y tarjeta de cuenta muestran $1.250.000 | PASS | `07-alice-balance-updated.png` |
| F2-08 | Reload | Cuenta e ingreso persisten tras `page.reload()` | PASS | `08-alice-after-reload.png` |
| F2-09 | Logout + re-login | Datos siguen presentes tras ciclo completo de sesión | PASS | `09-alice-logged-out.png`, `10-alice-relogin-data-ok.png` |

---

## Fase 3 — Aislamiento Bob

| # | Test | Descripción | Resultado | Evidencia |
|---|---|---|---|---|
| F3-01 | UI Bob | Bob no ve `Cuenta E2E Alice ...` en su panel Cuentas | PASS | `11-bob-cannot-see-alice.png` |
| F3-02 | RLS PostgreSQL | `SELECT COUNT(*) FROM accounts WHERE id='5a9135ef...' AND user_id='bbbbbbbb...'` → 0 | PASS | — |
| F3-03 | Integridad Alice | `current_balance` de Alice = 1.250.000 tras sesión de Bob | PASS | `12-alice-data-intact-after-bob.png` |

---

## Fase 4 — Evidencia SQL

| # | Test | Descripción | Resultado |
|---|---|---|---|
| F4-01 | SQL final | UNION ALL confirma `account_id` e `income_id` en PostgreSQL | PASS |

Archivo: `docs/sprints/evidence/ux-03-3/sql-evidence.txt`

---

## Defectos encontrados y corregidos

| # | Defecto | Causa raíz | Corrección |
|---|---|---|---|
| D-01 | `selectOption` falló con `RegExp` label | API de Playwright no acepta RegExp en `{ label }` | Cambio a `{ value: aliceAccountId }` — el `<option>` usa el UUID como value |
| D-02 | `psql` con `-c "..."` silenciaba UNION ALL multilinea | Quoting de comillas simples en shell de Windows | Reemplazado por escritura a archivo temporal + `--file=` |

---

## Invariantes verificados

- La autenticación usa el JWT real de Supabase local — ninguna petición va a `supabase.co`
- `auth.uid()` en PostgreSQL coincide con el UUID de Alice en cada operación
- RLS bloquea acceso cruzado tanto en SELECT desde UI como en consulta directa a PostgreSQL
- El ciclo logout/re-login no rompe la sesión ni los datos
- El saldo observado en UI ($1.250.000) coincide exactamente con el valor en PostgreSQL

---

## Evidencias visuales

Capturas en `docs/sprints/evidence/ux-03-3/` (12 archivos PNG):

```
01-alice-login-ok.png
02-alice-account-form.png
03-alice-account-created.png
04-alice-accounts-panel.png
05-alice-income-form.png
06-alice-income-saved.png
07-alice-balance-updated.png
08-alice-after-reload.png
09-alice-logged-out.png
10-alice-relogin-data-ok.png
11-bob-cannot-see-alice.png
12-alice-data-intact-after-bob.png
```
