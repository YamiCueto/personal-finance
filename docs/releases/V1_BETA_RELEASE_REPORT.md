# V1 Beta — Release Report

**Versión:** V1 Beta  
**Fecha de preparación:** 2026-10-18  
**Rama:** `feat/financial-core` → `main`  
**URL pública (pendiente de publicación):** `https://yamicueto.github.io/personal-finance/`  
**Estado:** Listo para publicación — **pendiente de aprobación del propietario**

---

## Cambios incluidos

### Sprints completados

| Sprint | Descripción | Estado |
|---|---|---|
| UX-01 | Rediseño responsive híbrido, mobile-first 360px | Incluido |
| UX-02 | Auditoría PWA iOS — 5 riesgos documentados | Incluido |
| UX-03.1 | Remediación seguridad: race condition, adaptadores, auth gap, paymentDueDay, deduplicación | Incluido |
| UX-03.2 | Integración local Supabase — 27/27 verificaciones | Incluido |
| UX-03.3 | Certificación E2E real Chromium — 13/13 tests | Incluido |

### Commits de la PR

| Hash | Mensaje |
|---|---|
| `21fbeaa` | feat(config): add local-supabase isolated build configuration |
| `83429ef` | fix(adapter): correct recordPayment check order and add purchase idempotency store |
| `f5cf8e6` | fix(supabase): harden security patch and fix record_income V1 column gap |
| `67e1a57` | docs(sprints): add UX-03.1 remediation report and UX-03.2/03.3 certification |
| `3476784` | test(e2e): add UX-03.3 Playwright real E2E certification spec |

**Pull Request:** https://github.com/YamiCueto/personal-finance/pull/2  
**Base:** `feat/financial-core` → `main` (corregido — era `setup/sprint-0-baseline`)

---

## Resultados de pruebas

| Suite | Herramienta | Resultado |
|---|---|---|
| Unitarias | `ng test` (Vitest + TestBed) | **117/117** |
| RLS SQL | psql + DO block | **6/6** |
| Integración local Supabase (psql) | Fases 2–4 | **27/27** |
| E2E Playwright Chromium | `playwright.ux033.config.ts` | **13/13** |
| Build `github-pages` | `ng build --configuration=github-pages` | **OK** |
| Manifest PWA | `manifest.webmanifest` + iconos | **OK** |
| 404.html deep links | `dist/personal-finance/browser/404.html` | **OK** |

### Warning conocido

`Bundle initial exceeded maximum budget. Budget 500.00 kB was not met by 49.19 kB with a total of 549.19 kB.`

No bloquea el build. Pendiente de optimización (lazy loading adicional o tree-shaking).

---

## Configuración de la versión Beta

### Modo de operación

| Aspecto | Configuración |
|---|---|
| Operaciones financieras | `supabase` — persistencia real en Supabase Cloud |
| Autenticación | Supabase Auth Cloud (`https://hlehsgwsjphvuyngzjry.supabase.co`) |
| Persistencia | **Real — Supabase Cloud** (requiere migraciones V1–V4 aplicadas) |
| `providerMode` | `'supabase'` en `environment.ts` |

### Archivos de build para GitHub Pages

| Archivo | Apunta a |
|---|---|
| `environment.ts` | `https://hlehsgwsjphvuyngzjry.supabase.co` — `providerMode: 'supabase'` |
| Build config | `github-pages` — sin `fileReplacements` |
| `local-supabase` build | Excluido del deploy — solo para desarrollo local |

---

## Auditoría Supabase Cloud (2026-10-18)

### Estado actual del proyecto Cloud `hlehsgwsjphvuyngzjry`

| Aspecto | Estado |
|---|---|
| Región | `us-east-1` |
| PostgreSQL | 17.11.0 |
| Estado | `ACTIVE_HEALTHY` |
| Tablas en `public` | **0 — schema vacío** |
| Funciones en `public` | Solo `rls_auto_enable` (default Supabase) |
| Historial de migraciones | **No existe** — tabla `supabase_migrations.schema_migrations` ausente |
| Migraciones aplicadas | **Ninguna** — V1 a V4 solo en local |
| Usuarios en `auth.users` | 1 usuario real |

### Gap de migraciones

| Migración | Local | Cloud |
|---|---|---|
| `20261015000001_financial_core_schema.sql` | Aplicada | **Pendiente** |
| `20261015000002_financial_core_v2.sql` | Aplicada | **Pendiente** |
| `20261015000003_financial_security_patch.sql` | Aplicada | **Pendiente** |
| `20261018000004_fix_record_income_v1_columns.sql` | Aplicada | **Pendiente** |

**Conclusión:** El build con `providerMode: 'supabase'` está configurado y listo. El deploy funcional requiere que las 4 migraciones sean aplicadas a Cloud primero.

---

## Plan de migraciones (requiere aprobación)

### Prerequisito de verificación antes de aplicar

```bash
# 1. Verificar usuario real en auth.users (NO modificar)
npx supabase db query --linked "SELECT id, email, created_at FROM auth.users;"

# 2. Confirmar schema público vacío
npx supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

### Comando de aplicación (REQUIERE AUTORIZACIÓN EXPLÍCITA)

```bash
npx supabase db push --linked
```

Este comando aplica V1→V4 en orden. Es idempotente en caso de reintento.

### Plan de rollback (si las migraciones fallan)

Las migraciones V1–V4 son `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE FUNCTION` — no destructivas. En caso de error:

```bash
# Opción 1: Drop manual de tablas creadas (sin afectar auth.users)
# Ejecutar solo si las migraciones fallan a mitad:
npx supabase db query --linked "
  DROP TABLE IF EXISTS credit_card_purchases CASCADE;
  DROP TABLE IF EXISTS transactional_operations CASCADE;
  DROP TABLE IF EXISTS period_obligations CASCADE;
  DROP TABLE IF EXISTS incomes CASCADE;
  DROP TABLE IF EXISTS credit_products CASCADE;
  DROP TABLE IF EXISTS accounts CASCADE;
  DROP TABLE IF EXISTS institutions CASCADE;
"
# Esto restaura el estado actual: schema público vacío, auth intacto
```

**Impacto:** `auth.users` nunca se ve afectado por las migraciones financieras. El único usuario real no corre riesgo.

---

## Seguridad verificada

| Check | Resultado |
|---|---|
| `.env` en `.gitignore` y no tracked | PASS |
| `supabase/.temp/` en `.gitignore` | PASS |
| `config.toml` sin URLs de producción | PASS |
| `environment.local-supabase.ts` contiene solo localhost:54421 | PASS |
| Scan de `service_role` en archivos trackeados | 0 ocurrencias |
| Scan de `127.0.0.1` / `localhost:54` en archivos trackeados | 0 ocurrencias |
| No hay workflows que ejecuten migraciones automáticas | PASS — sin `.github/workflows/` |
| `seed_local_test_users.sql` excluido del build | PASS — no en `src/` |
| Evidencias E2E no contienen datos reales | PASS — solo datos sintéticos con RUN_ID |
| `publishableKey` en `environment.ts` | Clave pública — seguro para repositorio público |
| `service_role` nunca expuesto en Angular | PASS — prohibido por diseño |

---

## Riesgos residuales

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Budget bundle 549 kB excede 500 kB | Activo | Bajo (solo warning) | Optimizar en V1.1 con lazy loading |
| R-02 | Migraciones V1–V4 no aplicadas en Cloud | **Activo — bloqueante para persistencia** | Alto | Aplicar con `supabase db push --linked` tras aprobación |
| R-03 | `local-supabase` build accidentalmente desplegado | Bajo | Medio | Documentado; requiere flag explícito `--configuration=local-supabase` |
| R-04 | `providerMode: 'supabase'` sin schema en Cloud lanza errores de RPC | Alto hasta aplicar V1–V4 | Alto | Deploy solo después de confirmar migraciones aplicadas |

---

## Checklist de publicación

### Preparado (completado)

- [x] 117/117 pruebas unitarias pasadas
- [x] 13/13 pruebas E2E Playwright Chromium pasadas
- [x] Build `github-pages` exitoso
- [x] PWA manifest, iconos y 404.html presentes
- [x] 5 commits en `feat/financial-core` con mensajes convencionales
- [x] PR #2 corregida: `feat/financial-core` → `main`
- [x] Scan de secretos sin hallazgos
- [x] `environment.ts` configurado con `providerMode: 'supabase'`
- [x] Auditoría Cloud completada — estado documentado
- [x] Plan de migración y rollback preparado

### Pendiente de aprobación

- [ ] **Aplicar migraciones V1–V4 en Cloud** — `supabase db push --linked` — requiere aprobación
- [ ] **Merge PR #2** — requiere aprobación del propietario
- [ ] Ejecutar `ng build --configuration=github-pages` post-merge
- [ ] Deploy manual a GitHub Pages
- [ ] Verificar `https://yamicueto.github.io/personal-finance/`
- [ ] Comprobar login, creación de cuenta, ingreso — datos persistentes en Cloud
- [ ] Confirmar que deep links funcionan con `404.html`

---

## Procedimiento de rollback de frontend

Si la publicación presenta problemas críticos:

```bash
# Opción 1: Revert de los commits de esta PR
git revert 21fbeaa 83429ef f5cf8e6 67e1a57 3476784
git push origin main

# Opción 2: Forzar rama main al estado anterior
git checkout main
git reset --hard <commit-previo-al-merge>
git push --force-with-lease origin main
```

Supabase Cloud no se ve afectado por ningún rollback de frontend.

---

## Diferencia entre acciones preparadas y ejecutadas

| Acción | Estado |
|---|---|
| Commits creados en `feat/financial-core` | **Ejecutado** |
| Push a `origin/feat/financial-core` | **Ejecutado** |
| PR #2 base corregida a `main` | **Ejecutado** |
| `environment.ts` con `providerMode: 'supabase'` | **Ejecutado** |
| Auditoría Cloud en modo lectura | **Ejecutado** |
| Aplicar migraciones V1–V4 en Cloud | **NO ejecutado — pendiente aprobación** |
| Merge PR #2 | **NO ejecutado — pendiente aprobación** |
| Deploy a GitHub Pages | **NO ejecutado — pendiente aprobación** |
