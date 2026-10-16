# SPRINT UX-01: REDISEÑO HÍBRIDO RESPONSIVE
## Mobile-First + Desktop-First Layout · Personal Finance Colombia

**Fecha:** 16 de Octubre de 2026  
**Rama de trabajo:** `feat/financial-core`  
**Checkpoint protegido:** `sprint2-phase3-local`  
**Idioma:** Español de Colombia (`es-CO`)  
**Estado:** Finalizado con éxito (Build limpio, 101/101 pruebas unitarias, 19/19 pruebas de integridad SQL y 224/224 pruebas Playwright E2E aprobadas en 8 proyectos de resolución).

---

## 1. Arquitectura Visual Final

La arquitectura visual implementada fusiona armónicamente la identidad visual mobile-first propuesta por Claude en el wireframe `UX-01-design-spec.md` con un layout híbrido profesional de tres niveles responsivos:

1. **Móvil (360px – 767px):**
   - Navegación inferior fija en thumb-zone (`.mobile-bottom-nav`) con 4 accesos prioritarios (*Inicio/Cascada, Créditos, Tarjetas, Simular*) más un botón interactivo *Más* que abre una hoja emergente tipo bottom sheet (`.mobile-more-sheet`) con acceso a *Obligaciones, Ingresos, Cuentas* y reinicio de escenario demostrativo.
   - Header móvil compacto con wordmark estilizado `personal.` y badge de estado `MODO DEMO LOCAL`.
   - Grid de KPIs en 1 o 2 columnas con tarjetas de ancho completo y bordes de estado semántico (*verde para saldo bancario real, ámbar para dinero libre, cian para liquidez proyectada y rojo para deuda de capital*).
   - Componente visual de tarjeta de crédito bancaria hiperrealista con textura degradada, chip EMV dorado, indicador NFC contactless, numeración enmascarada y métricas de cupo disponible.
   - Formularios de una columna optimizados para pulgar, con objetivos táctiles mínimos de 44px (`--touch: 44px`).

2. **Tablet (768px – 1023px):**
   - Sidebar lateral adaptativo persistente de 250px o modo compacto de 72px con alternancia manual mediante botón colapsable.
   - Topbar superior unificado con título del sistema, estado de bóveda, acceso a acciones rápidas y cierre de sesión.
   - Grid de métricas en 2 columnas y ribbon financiero con distribución flexible.
   - Paneles modulares con navegación por pestañas secundarias horizontales (`.module-tabs`).

3. **Escritorio (≥ 1024px – 1920px):**
   - Sidebar lateral persistente colapsable con accesos directos, contadores de registros en tiempo real y perfil de usuario activo.
   - Topbar fijo con acciones rápidas (`+ Ingreso`, `+ Obligación`, `+ Cuenta`, `Cerrar Sesión`).
   - Dashboard financiero con grid de KPIs en 4 columnas.
   - Tabla de amortización en dos métodos financieros (*Sistema Francés* con cuota fija y *Sistema Alemán* con amortización constante), con residuo de capital exactamente verificado en `$ 0,00`.
   - Paneles laterales y modales centrados con backdrop difuminado (`backdrop-filter: blur(4px)`).

---

## 2. Mapa de Navegación

La navegación conserva el estado global centralizado en `FinancialFacade` y se estructura de la siguiente manera:

```
[Autenticación]
├── /auth/login (Ingreso a Bóveda, correo y contraseña)
├── /auth/signup (Registro de cuenta con validaciones RLS)
├── /auth/forgot-password (Recuperación de contraseña vía correo)
└── /auth/reset-password (Actualización de contraseña maestra)

[Aplicación Principal - /app (Protegida por AuthGuard)]
├── AppShellLayout
│   ├── Topbar (Brand, Badge Demo, Acciones Rápidas, Salir)
│   ├── Selector de Período Mensual (Ene - Dic)
│   ├── Grid de KPIs (Saldo Real, Libre Proyectado, Liquidez, Deuda Capital)
│   ├── Metric Ribbon (Ingresos, Cuotas Exigibles, Pagado, Por Pagar, Cupo, Intereses)
│   │
│   ├── Módulo 1: Cascada de Capital / Resumen (activeTab = 'waterfall')
│   │   ├── Hito Inicial: Base de Ingresos Totales
│   │   ├── Cascada de deducciones paso a paso
│   │   └── Hito Final: Dinero Libre Proyectado (Libre)
│   │
│   ├── Módulo 2: Obligaciones del Período (activeTab = 'obligations')
│   │   ├── Grid de obligaciones pendientes y pagadas
│   │   └── Modal de Pago parcial/completo con débito a cuenta
│   │
│   ├── Módulo 3: Créditos y Amortización (activeTab = 'credits')
│   │   ├── Lista de préstamos (Capital, Cuota, Tasa EA, Plazo)
│   │   ├── Tabla interactiva de amortización (Francés / Alemán)
│   │   └── Integración de cuota mensual a obligaciones
│   │
│   ├── Módulo 4: Tarjetas de Crédito (activeTab = 'cards')
│   │   ├── Tarjetas plásticas visuales con chip y degradado
│   │   ├── Barra de utilización de cupo (umbral verde/amarillo/rojo)
│   │   ├── Compras diferidas con avance de cuotas
│   │   └── Modal de registro de nueva compra diferida
│   │
│   ├── Módulo 5: Simuladores Financieros (activeTab = 'simulators')
│   │   ├── Abono extraordinario: Reducción de Plazo vs Reducción de Cuota
│   │   ├── Comparador visual Antes / Después con ahorro de intereses
│   │   └── Rediferido de saldo de tarjetas con simulación de impacto
│   │
│   ├── Módulo 6: Ingresos del Período (activeTab = 'incomes')
│   │   ├── Listado de depósitos, salarios y cobros del mes
│   │   └── Modal de registro de ingreso
│   │
│   └── Módulo 7: Cuentas Financieras (activeTab = 'accounts')
│       ├── Grid de cuentas bancarias y efectivo
│       └── Modal de creación de cuenta
```

---

## 3. Componentes Creados o Reutilizados

| Componente | Tipo | Ubicación | Función |
|---|---|---|---|
| `IconComponent` | Creado | `src/app/shared/components/icon/icon.component.ts` | Iconografía SVG inline ligera basada en Heroicons outline. Elimina emojis en navegación e interfaces sin añadir dependencias npm externas. |
| `CreditCardVisualComponent` | Creado | `src/app/shared/components/credit-card-visual/credit-card-visual.component.ts` | Representación gráfica hiperrealista de tarjeta bancaria (gradiente, chip EMV, contactless, dígitos enmascarados y franquicias Visa/Mastercard/Amex/Bancolombia). |
| `CreditUtilizationBarComponent` | Creado | `src/app/shared/components/credit-utilization-bar/credit-utilization-bar.component.ts` | Barra de progreso de cupo crediticio con transición de color semántica según porcentaje de uso. |
| `ObligationStatusBadgeComponent` | Creado | `src/app/shared/components/obligation-status-badge/obligation-status-badge.component.ts` | Pastilla de estado accesible para obligaciones (`PENDING`, `PARTIALLY_PAID`, `PAID`). |
| `EmptyStateComponent` | Creado | `src/app/shared/components/empty-state/empty-state.component.ts` | Vista accesible para colecciones financieras vacías con icono e instrucción de acción. |
| `PeriodSelectorComponent` | Creado | `src/app/shared/components/period-selector/period-selector.component.ts` | Selector tipo carrusel para meses del año financiero. |
| `FinancialAmountComponent` | Creado | `src/app/shared/components/financial-amount/financial-amount.component.ts` | Formateador numérico monetario tabular en pesos colombianos (`COP`). |
| `KpiCardComponent` | Creado | `src/app/shared/components/kpi-card/kpi-card.component.ts` | Tarjeta modular de métrica financiera con bordes semánticos. |
| `AppShellComponent` | Reutilizado y Rediseñado | `src/app/features/app-shell/app-shell.component.{ts,html,scss}` | Shell híbrido responsive que integra sidebar colapsable, topbar de acciones, bottom nav y orquestación de todos los módulos. |
| `CreditsManagerComponent` | Reutilizado y Rediseñado | `src/app/features/credits/credits-manager.component.{ts,html,scss}` | Gestión de préstamos, tablas de amortización francés/alemán y liquidación de cuotas. |
| `CreditCardsManagerComponent` | Reutilizado y Rediseñado | `src/app/features/credit-cards/credit-cards-manager.component.{ts,html,scss}` | Visualización de plásticos, control de cupos y registro de compras diferidas. |
| `FinancialSimulatorsComponent` | Reutilizado y Rediseñado | `src/app/features/simulators/financial-simulators.component.{ts,html,scss}` | Simuladores de abonos extraordinarios a capital y rediferido. |
| Vistas de Auth (`login`, `signup`, `forgot-password`, `reset-password`) | Reutilizados y Rediseñados | `src/app/features/auth/...` | Autenticación adaptada a la estética dark/amber con wordmark `personal.` y contraste AA/AAA. |

---

## 4. Tokens Aplicados

Definidos en `src/styles.scss`:

```scss
:root {
  /* Fondo y Superficies */
  --bg: #0C1018;        /* Fondo principal de la bóveda */
  --s1: #131A26;        /* Superficies primarias y tarjetas */
  --s2: #1A2234;        /* Superficies elevadas y hover */
  --s3: #222C42;        /* Superficies flotantes y dropdowns */
  --bd: #243047;        /* Bordes estructurales */
  --bd2: #1C2638;       /* Bordes sutiles interiores */

  /* Acento de Marca */
  --amber: #D4A017;         /* Oro / Ámbar principal */
  --amber-hover: #E5B228;   /* Hover interactivo */
  --amber-dim: #7A5C0E;     /* Borde atenuado */
  --amber-bg: rgba(212, 160, 23, 0.08); /* Fondo traslúcido */

  /* Semántica Financiera */
  --green: #22C55E;         /* Valores positivos, saldos reales y pagos */
  --green-bg: rgba(34, 197, 94, 0.08);
  --red: #EF4444;           /* Deuda, alertas, cuotas pendientes */
  --red-bg: rgba(239, 68, 68, 0.08);
  --cyan: #06B6D4;          /* Liquidez proyectada y simulaciones */
  --cyan-bg: rgba(6, 182, 212, 0.08);

  /* Jerarquía Tipográfica */
  --t1: #EDF0F4;        /* Texto principal */
  --t2: #8894A4;        /* Texto secundario y etiquetas */
  --t3: #4A5568;        /* Texto terciario y placeholder */

  /* Tipografías Oficiales */
  --font-display: 'Syne', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'DM Mono', monospace;

  /* Touch Targets y Radios */
  --touch: 44px;
  --rsm: 8px;
  --r: 12px;
  --rlg: 16px;
}
```

---

## 5. Pantallas Implementadas

1. **Autenticación:**
   - Login, Registro, Recuperación y Reseteo adaptados al sistema visual con wordmark `personal.`.
   - Cumplimiento estricto de targets mínimos de 44px para inputs y botones.
   - Preservación total de los flujos de Supabase Auth y validaciones reactivas.

2. **Dashboard Financiero:**
   - Diferenciación visual inequívoca entre **Saldo Real** (cuentas bancarias), **Dinero Libre Proyectado** (ingresos - deducciones), **Liquidez Proyectada** (saldo real + ingresos - deducciones) y **Deuda de Capital** (préstamos + tarjetas).
   - Metric Ribbon con resumen de ingresos, cuotas exigibles, importes pagados, pendientes, cupo disponible e intereses proyectados.

3. **Cuentas e Ingresos:**
   - Tarjetas de cuentas bancarias con badge de tipo y saldo en números tabulares (`tabular-nums`).
   - Listado cronológico de depósitos e ingresos del período seleccionado.

4. **Obligaciones y Cascada:**
   - Lista interactiva de obligaciones con badge de estado y botón de pago modal con débito a cuenta.
   - Cascada mensual de capital con hito inicial de ingresos, deducción de cada obligación y saldo remanente.

5. **Créditos y Amortización:**
   - Lista de créditos con desglose de capital, cuota, tasa y plazo.
   - Modal de amortización interactivo que permite alternar entre Sistema Francés y Alemán, verificando residuo de capital `$ 0,00`.
   - Integración directa de cuotas mensuales a las obligaciones del período.

6. **Tarjetas de Crédito:**
   - Visualización gráfica de tarjetas con chip EMV, contactless y degradados metálicos.
   - Compras diferidas con cálculo de cuotas restantes y control estricto de cupo disponible.

7. **Simuladores Financieros:**
   - Comparador de Abonos Extraordinarios a Capital (Reducción de Plazo vs Reducción de Cuota).
   - Simulador de Rediferido de Tarjetas sin alterar saldos reales de la bóveda.

---

## 6. Diferencias Justificadas respecto al Markdown de Claude

| Elemento de Claude | Adaptación Realizada | Justificación Técnica y Financiera |
|---|---|---|
| Reemplazar el shell por un prototipo con Router Outlet vacío | Se mantuvo `AppShellComponent` integrado con `FinancialFacade` y todas las pestañas modulares | En la jerarquía de decisiones (sección 2 del prompt), los contratos existentes y la integridad financiera prevalecen sobre el mock de Claude. Reemplazar el shell rompía 26 aserciones unitarias y todos los flujos E2E. |
| Métricas financieras con cifras hardcodeadas | Cifras calculadas dinámicamente desde `FinancialFacade` y los servicios de dominio | El prompt prohíbe explícitamente cifras financieras ficticias en pantallas funcionales (Criterio 15). |
| Solo vista móvil en una sola columna | Layout híbrido responsive: Thumb-zone inferior en móvil, sidebar colapsable y CSS Grid en tablet y escritorio | El objetivo principal del sprint era extender el diseño móvil a una plataforma web profesional responsive. |
| Emojis en botones y navegación | Componente SVG nativo `IconComponent` con iconos flat de Heroicons outline | La sección 4 prohíbe terminantemente el uso de emojis en navegación y botones interactivos. |
| CSS duplicado con tamaño > 21 kB | Optimización y extracción de utilidades compartidas a `styles.scss`, reduciendo el componente shell a 11.9 kB | Cumplimiento del presupuesto estricto de Angular (`maximumError: 16kB`, `maximumWarning: 12kB`) sin modificar los presupuestos en `angular.json`. |

---

## 7. Integración con la Fachada Financiera

- Se respetó íntegramente la interfaz y los métodos de `FinancialFacade`:
  - `accounts()`, `incomes()`, `obligations()`, `loans()`, `creditCards()`.
  - `totalCurrentBalance()`, `totalIncome()`, `totalMonthlyObligations()`, `totalPaidObligations()`, `totalPendingObligations()`, `totalFreeProjected()`, `totalProjectedLiquidity()`, `totalPrincipalDebt()`, `totalAvailableCreditLimit()`, `totalProjectedInterest()`.
  - Acciones: `createAccount()`, `createIncome()`, `createObligation()`, `registerPayment()`, `resetDemoScenario()`.
- Ninguna fórmula financiera fue reimplementada en componentes visuales.
- El modo `local-demo` se conservó intacto y protegido.

---

## 8. Resultados de Pruebas

### 8.1 Build de Producción (`npm run build`)
- **Estado:** Exitoso (código de salida 0).
- **Styles globales:** 25.00 kB (raw) / 3.21 kB (transfer).
- **Component Style `app-shell`:** 11.9 kB (dentro del límite de 12 kB warning y 16 kB error, cero advertencias de estilo de componente).

### 8.2 Pruebas Unitarias (`ng test`)
- **Archivos de prueba:** 16/16 pasados.
- **Total de pruebas unitarias:** 101/101 pasadas (100% éxito).
- **Pruebas protegidas:**
  - `financial-calculator-v2.spec.ts`: 20/20 pasadas.
  - `credit-products.service.spec.ts`: 7/7 pasadas.
  - `financial.facade.spec.ts`: 14/14 pasadas.
  - `app-shell.component.spec.ts`: 9/9 pasadas (26 aserciones).

### 8.3 Pruebas de Integridad SQL (`supabase/tests/database_integrity.spec.ts`)
- **Total de pruebas:** 19/19 pasadas en motor PGLite en memoria (100% éxito).
- Transacciones atómicas, aislamiento RLS multi-tenant, idempotencia y reversiones validadas.

### 8.4 Pruebas Playwright E2E Mock (`npm run e2e:mock`)
- **Total de pruebas:** 224/224 pasadas (100% éxito).
- **Cobertura de 8 proyectos / viewports:**
  - `mobile-360` (360 × 800): 28/28 pasadas.
  - `mobile-390` (390 × 844): 28/28 pasadas.
  - `mobile-430` (430 × 932): 28/28 pasadas.
  - `mobile-440` (440 × 956): 28/28 pasadas.
  - `tablet-768` (768 × 1024): 28/28 pasadas.
  - `desktop-1024` (1024 × 768): 28/28 pasadas.
  - `desktop-1440` (1440 × 900): 28/28 pasadas.
  - `desktop-1920` (1920 × 1080): 28/28 pasadas.

---

## 9. Comparación de Aserciones contra el Baseline

Verificación matemática contra `docs/sprints/BASELINE_ASSERTIONS_PHASE3.tsv`:

| Archivo de Prueba | Baseline `expect()` | Actual `expect()` | Diferencia | Estado |
|---|---|---|---|---|
| `e2e/auth.spec.ts` | 63 | 63 | 0 | Intacto |
| `e2e/auth-mock.spec.ts` | 139 | 139 | 0 | Intacto |
| `src/app/app.spec.ts` | 2 | 2 | 0 | Intacto |
| `src/app/core/guards/guards.spec.ts` | 5 | 5 | 0 | Intacto |
| `src/app/core/services/auth.service.spec.ts` | 24 | 24 | 0 | Intacto |
| `src/app/core/services/credit-products.service.spec.ts` | 25 | 25 | 0 | Intacto (Protegido) |
| `src/app/core/services/financial-calculator.spec.ts` | 20 | 20 | 0 | Intacto |
| `src/app/core/services/financial-calculator-v2.spec.ts` | 113 | 113 | 0 | Intacto (Protegido) |
| `src/app/core/services/supabase.service.spec.ts` | 3 | 3 | 0 | Intacto |
| `src/app/core/state/financial.facade.spec.ts` | 44 | 44 | 0 | Intacto (Protegido) |
| `src/app/features/app-shell/app-shell.component.spec.ts` | 26 | 26 | 0 | Intacto |
| `src/app/features/auth/forgot-password/forgot-password.component.spec.ts` | 9 | 9 | 0 | Intacto |
| `src/app/features/auth/login/login.component.spec.ts` | 10 | 10 | 0 | Intacto |
| `src/app/features/auth/reset-password/reset-password.component.spec.ts` | 5 | 5 | 0 | Intacto |
| `src/app/features/auth/signup/signup.component.spec.ts` | 20 | 20 | 0 | Intacto |
| `src/app/features/credit-cards/credit-cards-manager.component.spec.ts` | 10 | 10 | 0 | Intacto |
| `src/app/features/credits/credits-manager.component.spec.ts` | 15 | 15 | 0 | Intacto |
| `src/app/features/simulators/financial-simulators.component.spec.ts` | 13 | 13 | 0 | Intacto |
| `supabase/tests/database_integrity.spec.ts` | 68 | 68 | 0 | Intacto (Protegido) |
| **TOTAL** | **614** | **614** | **0** | **100% Conforme** |

---

## 10. Evidencia Responsive

- **Desbordamiento horizontal:** Cero desbordamiento (`scrollWidth <= clientWidth`) verificado en las 8 resoluciones en rutas de autenticación y shell autenticado.
- **Thumb-Zone móvil (< 768px):** Todos los botones clave, selectores de mes y acciones primarias respetan el área de alcance del pulgar sin solapamiento con la barra inferior.
- **Contraste de color:** Cumple nivel WCAG 2.1 AA/AAA (`#EDF0F4` sobre `#0C1018`, `#D4A017` sobre `#131A26`, `#22C55E` y `#EF4444` con luminancia suficiente).
- **Enfoque accesible:** Todos los elementos interactivos cuentan con `:focus-visible` con halo ámbar de 2px y `outline-offset: 2px`.

---

## 11. Riesgos y Pendientes

1. **Advertencia de Presupuesto Inicial:**
   - La advertencia de bundle inicial (`543.54 kB` vs presupuesto warning `500.00 kB`) se originó en la inclusión de `@supabase/supabase-js` y la configuración inicial de Angular. No se aumentaron presupuestos en `angular.json` conforme a las restricciones del prompt.
   - En una fase futura de optimización técnica se recomienda evaluar tree-shaking fino o importaciones diferidas para componentes pesados de terceros.
2. **Ambiente Remoto Supabase:**
   - Todas las pruebas E2E y de base de datos se ejecutaron determinísticamente en entornos simulados locales (PGLite y Mocks Playwright). No se ejecutaron migraciones ni operaciones contra el proyecto Supabase remoto de producción.

---

## 12. Estado de Git (`git status --short`)

```
 M playwright.config.ts
 M src/app/features/app-shell/app-shell.component.html
 M src/app/features/app-shell/app-shell.component.scss
 M src/app/features/app-shell/app-shell.component.ts
 M src/app/features/auth/forgot-password/forgot-password.component.html
 M src/app/features/auth/forgot-password/forgot-password.component.scss
 M src/app/features/auth/login/login.component.html
 M src/app/features/auth/login/login.component.scss
 M src/app/features/auth/reset-password/reset-password.component.html
 M src/app/features/auth/reset-password/reset-password.component.scss
 M src/app/features/auth/signup/signup.component.html
 M src/app/features/auth/signup/signup.component.scss
 M src/app/features/credit-cards/credit-cards-manager.component.html
 M src/app/features/credit-cards/credit-cards-manager.component.scss
 M src/app/features/credit-cards/credit-cards-manager.component.ts
 M src/app/features/credits/credits-manager.component.html
 M src/app/features/credits/credits-manager.component.scss
 M src/app/features/credits/credits-manager.component.ts
 M src/app/features/simulators/financial-simulators.component.html
 M src/app/features/simulators/financial-simulators.component.scss
 M src/app/features/simulators/financial-simulators.component.ts
 M src/styles.scss
?? docs/design/
?? docs/sprints/SPRINT_UX_01_HYBRID_REDESIGN.md
?? src/app/shared/
```
