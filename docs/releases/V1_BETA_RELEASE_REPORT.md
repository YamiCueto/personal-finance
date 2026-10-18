# V1 Beta — Release Report

**Versión:** V1 Beta  
**Fecha de preparación:** 2026-10-18  
**Rama:** `feat/financial-core` → `setup/sprint-0-baseline`  
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

---

## Resultados de pruebas

| Suite | Herramienta | Resultado |
|---|---|---|
| Unitarias | `ng test` (Vitest + TestBed) | **117/117** |
| RLS SQL | psql + DO block | **6/6** |
| Integración local Supabase | psql checks fases 2–4 | **27/27** |
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
| Operaciones financieras | `local-demo` — in-memory, datos demostrativos |
| Autenticación | Supabase Auth Cloud (`https://hlehsgwsjphvuyngzjry.supabase.co`) |
| Persistencia | No persistente en V1 Beta — datos se pierden al recargar |
| `providerMode` | No definido en `environment.ts` → defaults a `local-demo` |

### Archivos de build para GitHub Pages

| Archivo | Apunta a |
|---|---|
| `environment.ts` | `https://hlehsgwsjphvuyngzjry.supabase.co` (Auth) |
| Build config | `github-pages` — sin `fileReplacements` |
| `local-supabase` build | Excluido del deploy — solo para desarrollo local |

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

---

## Riesgos residuales

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Budget bundle 549 kB excede 500 kB | Activo | Bajo (solo warning) | Optimizar en V1.1 con lazy loading |
| R-02 | Migraciones V1–V4 no aplicadas en Supabase Cloud | N/A para Beta | Alto si se activa Supabase | Aplicar manualmente cuando se despliegue persistencia real |
| R-03 | `local-supabase` build accidentalmente desplegado | Bajo | Medio | Documentado; requiere flag explícito `--configuration=local-supabase` |
| R-04 | Usuarios pueden crear cuentas reales en Auth Cloud | Activo | Bajo | Banner demo visible en UI; datos financieros no se persisten |

---

## Checklist de publicación

### Preparado (completado)

- [x] 117/117 pruebas unitarias pasadas
- [x] 13/13 pruebas E2E Playwright Chromium pasadas
- [x] Build `github-pages` exitoso
- [x] PWA manifest, iconos y 404.html presentes
- [x] 5 commits en `feat/financial-core` con mensajes convencionales
- [x] PR #2 abierta: `feat/financial-core` → `setup/sprint-0-baseline`
- [x] Scan de secretos sin hallazgos
- [x] Supabase Cloud sin modificaciones

### Pendiente de aprobación

- [ ] **Merge PR #2** — requiere aprobación del propietario
- [ ] Ejecutar `ng build --configuration=github-pages`
- [ ] Deploy manual a GitHub Pages
- [ ] Verificar `https://yamicueto.github.io/personal-finance/`
- [ ] Comprobar login, navegación, manifest PWA
- [ ] Confirmar que deep links funcionan con `404.html`
- [ ] Verificar que no se aplicaron migraciones a Supabase Cloud

---

## Procedimiento de rollback de frontend

Si la publicación presenta problemas críticos:

```bash
# Opción 1: Revert de los commits de esta PR
git revert 21fbeaa 83429ef f5cf8e6 67e1a57 3476784
git push origin main
# Re-deploy desde main con ng build --configuration=github-pages

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
| PR #2 creada | **Ejecutado** |
| Merge PR #2 | **NO ejecutado — pendiente aprobación** |
| Deploy a GitHub Pages | **NO ejecutado — pendiente aprobación** |
| Migraciones a Supabase Cloud | **NO ejecutado — no autorizado** |
