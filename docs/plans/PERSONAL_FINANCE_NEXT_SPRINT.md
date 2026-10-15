# PLAN DE IMPLEMENTACIÓN FUNCIONAL — SIGUIENTE SPRINT (SPRINT 2)
## INTEGRACIÓN DEL NÚCLEO FINANCIERO V2 EN PERSONAL FINANCE (ANGULAR 22)

**Proyecto:** Personal Finance  
**Rama Base:** `feat/financial-core`  
**Moneda:** Pesos Colombianos (COP) — Visualización y almacenamiento exacto con dos decimales  
**Diseño:** Mobile-First Estricto (optimizaciones específicas para 360px, 390px, 430px y 440px)  
**Idioma:** Español (Colombia)  
**Objetivo:** Desarrollar la capa de servicios tipados, store reactivo con Angular Signals, integración de RPCs de base de datos seguras y pantallas funcionales para la gestión patrimonial, deudas, créditos, cuotas y flujo de caja mensual.

---

## 1. Alcance General y Principios de Diseño

El Sprint 2 tiene como propósito transformar el motor matemático y el esquema de base de datos V2 en una experiencia de usuario fluida, comprensible y estéticamente impecable. Se reutilizarán al 100% las definiciones de [`financial-v2.model.ts`](file:///c:/Users/YAMI/Documents/projects/personal-finance/src/app/core/models/financial-v2.model.ts), el motor [`FinancialCalculatorV2`](file:///c:/Users/YAMI/Documents/projects/personal-finance/src/app/core/services/financial-calculator-v2.ts) y las funciones PostgreSQL existentes.

### Principios Mandatorios:
1. **Diferenciación Visual Estricta:** Las pantallas de dashboard y de detalle deberán distinguir sin ambigüedades entre **Saldo Confirmado por Extracto Bancario** (saldo real en cuenta) y **Saldo Proyectado / Estimado** (derivado de la tabla de amortización o cuotas pendientes).
2. **Ergonomía Mobile-First:** Todo formulario, tabla, tarjeta y modal debe estar adaptado para interacción con una sola mano en pantallas de smartphones estándar colombianos (desde 360px en dispositivos económicos hasta 440px en teléfonos Pro Max), garantizando zonas táctiles mínimas de 48px y cero desbordamiento horizontal.
3. **Aislamiento Multi-Inquilino de Extremo a Extremo:** Toda consulta y mutación estará ligada al identificador del usuario autenticado a través del servicio [`AuthService`](file:///c:/Users/YAMI/Documents/projects/personal-finance/src/app/core/services/auth.service.ts).
4. **Trazabilidad y No-Destructividad:** Las acciones de anulación se ejecutan mediante reversos contables registrados en auditoría, sin borrados silenciosos.
5. **Cero Datos Ficticios Inventados:** Las categorías, tasas y productos se configuran directamente por el usuario o se inicializan vacíos con onboarding guiado.

---

## 2. Componentes y Orden de Construcción Priorizado

El desarrollo del Sprint 2 se ejecutará en 5 fases secuenciales:

```
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Capa de Servicios Angular Tipados y Abstracción de RPCs       │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 2: Store Reactivo de Estado Financiero (Signals + Computed)       │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 3: Módulo de Cuentas y Transferencias Internas                    │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 4: Módulo de Créditos, Tarjetas de Crédito y Rediferidos          │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 5: Dashboard Financiero, Cascada de Pagos y Calendario           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 1: Capa de Servicios Angular Tipados e Integración RPC

#### Objetivo:
Crear los servicios de dominio que interactúan con el cliente de Supabase (`@supabase/supabase-js`), encapsulando las llamadas a las funciones `SECURITY DEFINER` y las consultas a las tablas del núcleo V2.

#### Entregables Técnicos:
1. `src/app/core/services/financial-accounts.service.ts`:
   - `getAccounts()`: Lista cuentas activas y archivadas del usuario.
   - `createAccount(payload)`: Creación con saldo inicial y tipo de cuenta.
   - `archiveAccount(id)`: Archivado lógico (`is_archived = true`).
   - `transferFunds(payload)`: Invocación de RPC `record_internal_transfer(from, to, amount, fee, idempotency_key)`.
2. `src/app/core/services/credit-products.service.ts`:
   - `getCreditProducts()`: Consulta de créditos, préstamos y tarjetas.
   - `createCreditProduct(payload)`: Registro con tasa EA, plazo, método francés y seguros.
   - `recordRestructure(payload)`: Invocación de RPC `record_debt_restructure(credit_id, new_balance, new_ea, new_installments, reason)`.
3. `src/app/core/services/period-obligations.service.ts`:
   - `getPeriodObligations(year, month)`: Consulta de cuotas y gastos del período.
   - `recordPayment(payload)`: Invocación de RPC `record_obligation_payment(...)` con soporte de desglose explícito o cascada automática.
   - `reverseOperation(payload)`: Invocación de RPC `reverse_operation(operation_type, operation_id, reason)`.
4. `src/app/core/services/incomes.service.ts`:
   - `getIncomes(year, month)`: Consulta de ingresos del período.
   - `recordIncome(payload)`: Invocación de RPC `record_income(account_id, year, month, source, amount)`.

---

### FASE 2: Store Reactivo de Estado Financiero (Angular Signals)

#### Objetivo:
Centralizar el estado de la aplicación mediante `signal()`, `computed()` y `resource()` (o efectos de carga), garantizando que las mutaciones (pagos, transferencias) actualicen reactivamente saldos y cascadas sin recargas de página.

#### Entregables Técnicos:
- `src/app/core/state/financial-store.service.ts`:
  - `selectedPeriod = signal<{ year: number; month: number }>`
  - `accounts = signal<FinancialAccount[]>`
  - `creditProducts = signal<CreditProduct[]>`
  - `obligations = signal<PeriodObligation[]>`
  - `incomes = signal<IncomeRecord[]>`
  - `totalLiquidBalance = computed(...)`: Suma exacta de saldos en cuentas líquidas.
  - `totalPrincipalDebt = computed(...)`: Deuda total de capital en créditos activos.
  - `netWorth = computed(...)`: Patrimonio neto (Activos Líquidos - Deuda Total de Capital).
  - `monthlyWaterfall = computed(...)`: Cascada de ingresos vs compromisos usando `FinancialCalculatorV2.calculateCascadeWaterfall()`.

---

### FASE 3: Módulo de Cuentas y Transferencias Internas

#### Vistas y Componentes:
- `src/app/features/accounts/accounts-list/`:
  - Grid y tarjetas móviles optimizadas para cuentas bancarias, billeteras digitales (Nequi, Daviplata) y efectivo.
  - Indicador de saldo actual y moneda COP.
  - Botón de acción rápida: «Transferir entre Cuentas».
- `src/app/features/accounts/transfer-modal/`:
  - Selector de cuenta origen y cuenta destino (con validación de cuentas distintas).
  - Campo de monto y campo opcional de comisión/costo de transferencia.
  - Confirmación con desglose de débitos y créditos antes de ejecutar la RPC.

---

### FASE 4: Módulo de Créditos, Tarjetas de Crédito y Rediferidos

#### Vistas y Componentes:
- `src/app/features/credits/credit-detail/`:
  - Resumen del crédito: Capital adeudado, cuotas restantes, tasa E.A. y mensual equivalente.
  - Barra de progreso de amortización de capital.
  - Tabla de amortización proyectada (calculada con `FinancialCalculatorV2.generateFrenchAmortizationSchedule`).
  - Distinción visual: «Cuotas Facturadas» vs «Proyecciones Futuras».
- `src/app/features/credits/restructure-modal/`:
  - Formulario de rediferido / reestructuración de alivio financiero.
  - Simulador en tiempo real: el usuario ingresa la nueva tasa propuesta y el nuevo plazo, y la vista calcula la nueva cuota estimada antes de solicitar confirmación.
  - Registro auditable llamando a `record_debt_restructure`.

---

### FASE 5: Dashboard Financiero, Cascada de Pagos y Calendario de Vencimientos

#### Vistas y Componentes:
- `src/app/features/dashboard/`:
  - **Métricas de Encabezado (KPIs):**
    1. Dinero Disponible en Cuentas (COP).
    2. Deuda Total Vigente (COP).
    3. Patrimonio Neto (COP).
    4. Balance Libre Proyectado del Mes (Ingresos - Obligaciones).
  - **Selector de Período (Mes / Año):** Selector horizontal táctil tipo *pill* con desplazamiento fluido en móviles.
  - **Componente Cascada de Prelación (Waterfall):**
    - Visualización gráfica de cómo cada ingreso cubre secuencialmente las obligaciones del mes según su prioridad y vencimiento.
    - Estado de cada obligación: `PENDING`, `PARTIAL`, `PAID`.
  - **Modal de Pago / Abono Rápido:**
    - Opciones de pago: «Pago Completo», «Pago Parcial» o «Abono Extraordinario a Capital».
    - Selector de cuenta de débito con verificación inmediata de fondos.
    - Despacho seguro hacia `record_obligation_payment`.
- `src/app/features/calendar/`:
  - Vista mensual o semanal de vencimientos ordenados cronológicamente por día de pago (`due_date`).
  - Alerta de compromisos en mora o próximos a vencer en los siguientes 3 días.

---

## 3. Criterios de Aceptación del Sprint 2

| Requisito | Criterio de Aceptación |
| :--- | :--- |
| **Aritmética COP** | Todo monto mostrado al usuario debe formatearse como moneda colombiana (`$ 1.250.000,00 COP`) y almacenarse con precisión fija de dos decimales. Cero errores de coma flotante. |
| **Responsive Mobile-First** | Verificación visual y funcional sin scroll horizontal en viewports de 360x640, 390x844, 430x932 y 440x956 px. Botones de acción accesibles con tamaño mínimo de toque de 48x48 px. |
| **Integridad Transaccional** | Al registrar un pago, la cuenta se debita, la cuota disminuye su pendiente y el crédito reduce su capital en la misma transacción atómica. Si falla un paso, ningún saldo muta. |
| **Idempotencia en UI** | Los botones de pago y transferencia deben inhabilitarse durante la ejecución de la petición y enviar un `idempotency_key` (UUID v4) para evitar dobles cobros por doble toque del usuario. |
| **Aislamiento RLS** | Un usuario nunca podrá visualizar cuentas, créditos, ingresos u obligaciones de otro usuario ni interceptar sus identificadores. |
| **Trazabilidad de Reversos** | Cualquier pago revertido restaura automáticamente los saldos de la cuenta y el crédito, conservando la nota de justificación en `financial_audit_log`. |
| **Cobertura de Pruebas** | Mínimo 90% de cobertura en nuevos servicios y pruebas Playwright E2E para el flujo completo: Crear cuenta $\rightarrow$ Registrar crédito $\rightarrow$ Pagar cuota $\rightarrow$ Revertir pago. |

---

## 4. Dependencias y Pre-requisitos Técnicos

1. **Esquema de Base de Datos:** Las migraciones `20261015000001_financial_core_schema.sql` y `20261015000002_financial_core_v2.sql` constituyen el contrato de base inmutable.
2. **Dependencias NPM:** Se utilizarán las librerías ya instaladas en el repositorio:
   - `@angular/core`, `@angular/forms`, `@angular/router` (^22.1.0)
   - `@supabase/supabase-js` (^2.117.2)
   - `rxjs` (~7.8.0)
3. **No se requieren librerías de componentes pesadas:** Se implementará la interfaz con Vanilla CSS / SCSS moderno y utilidades reutilizables del sistema de diseño ya definido en `app-shell`.

---

## 5. Estimación y Plan de Trabajo por Historias de Usuario

- **HU-01: Servicios Core y Store Reactivo (Fase 1 y 2)**
  - Implementación de `FinancialAccountsService`, `CreditProductsService`, `PeriodObligationsService`, `IncomesService` y `FinancialStoreService`.
  - Pruebas unitarias de servicios con mocks de Supabase Client.
- **HU-02: Gestión de Cuentas y Transferencias (Fase 3)**
  - Componentes de listado, modal de alta y modal de transferencia entre cuentas con soporte de comisiones.
  - Pruebas E2E de transferencias e idempotencia.
- **HU-03: Gestión de Créditos y Amortización (Fase 4)**
  - Vista de detalle de crédito, tabla de cuotas francesa y simulador de rediferidos.
  - Integración de abonos a capital.
- **HU-04: Dashboard de Flujo de Caja y Cascada (Fase 5)**
  - Vista de métricas consolidadas, cascada de pagos por mes y registro de pagos atómicos.
  - Pruebas de integración visual en viewports móviles.

---
*Documento preparado como hoja de ruta técnica formal para el Sprint 2 de Personal Finance.*
