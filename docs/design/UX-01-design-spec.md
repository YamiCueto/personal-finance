# UX-01 · Personal Finance — Design System & Implementation Spec

> **Agente**: Antigravity  
> **Repo**: `YamiCueto/personal-finance` (Angular v22, standalone components, signals)  
> **Constraint absoluto**: cero cambios en lógica de negocio, servicios, guards, auth o tests. Solo UI: templates, SCSS y nuevos feature-components.  
> **Referencia visual**: wireframe publicado en https://claude.ai/artifact/6JyVY6oSnd5MdvgaxCqirt

---

## 0. Resumen de cambios

| Archivo / carpeta | Acción |
|---|---|
| `src/styles.scss` | Reemplazar tokens CSS + importar fuentes |
| `src/app/features/auth/login/login.component.{html,scss}` | Rediseño completo (misma lógica Angular) |
| `src/app/features/app-shell/app-shell.component.{html,scss,ts}` | Reemplazar shell placeholder por layout con bottom-nav |
| `src/app/features/dashboard/` | Nuevo feature (componente + ruta lazy) |
| `src/app/features/creditos/` | Nuevo feature: lista + detalle |
| `src/app/features/tarjetas/` | Nuevo feature |
| `src/app/features/simulador/` | Nuevo feature |
| `src/app/shared/components/` | Componentes reutilizables: bottom-nav, kpi-card, credit-row, cupo-bar |
| `src/app/app.routes.ts` | Agregar rutas lazy bajo el guard `app` existente |

---

## 1. Design Tokens — `src/styles.scss`

```scss
/* ── Google Fonts ─────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── DESIGN TOKENS — dark-first ───────────────── */
:root {
  /* Surfaces */
  --pf-bg:   #0C1018;
  --pf-s1:   #131A26;   /* card */
  --pf-s2:   #1A2234;   /* elevated */
  --pf-s3:   #212B3C;   /* active states */
  --pf-bd:   #243047;   /* border */
  --pf-bd2:  #1A2535;   /* border dim */

  /* Brand accent — ámbar */
  --pf-amber:     #D4A017;
  --pf-amber-bg:  rgba(212, 160, 23, 0.10);
  --pf-amber-dim: rgba(212, 160, 23, 0.28);

  /* Semánticos */
  --pf-green:    #22C55E;
  --pf-green-bg: rgba(34, 197, 94, 0.08);
  --pf-red:      #EF4444;
  --pf-red-bg:   rgba(239, 68, 68, 0.08);

  /* Texto */
  --pf-t1: #EDF0F4;   /* primario */
  --pf-t2: #8894A4;   /* secundario */
  --pf-t3: #4A5568;   /* placeholder / disabled */

  /* Tipografía */
  --pf-font-display: 'Syne', system-ui, sans-serif;
  --pf-font-body:    'Inter', system-ui, sans-serif;
  --pf-font-mono:    'DM Mono', monospace;

  /* Radios */
  --pf-r:   12px;
  --pf-rsm:  8px;
  --pf-rlg: 18px;

  /* Touch target mínimo */
  --pf-touch: 44px;

  color-scheme: dark;
}

/* ── Light mode ───────────────────────────────── */
@media (prefers-color-scheme: light) {
  :root {
    --pf-bg:   #F3F5FA;
    --pf-s1:   #FFFFFF;
    --pf-s2:   #EBEEF5;
    --pf-s3:   #E2E7F0;
    --pf-bd:   #D8DEEC;
    --pf-bd2:  #E8ECF5;
    --pf-amber:     #A07000;
    --pf-amber-bg:  rgba(160, 112, 0, 0.08);
    --pf-amber-dim: rgba(160, 112, 0, 0.25);
    --pf-green:    #16A34A;
    --pf-green-bg: rgba(22, 163, 74, 0.08);
    --pf-red:      #DC2626;
    --pf-red-bg:   rgba(220, 38, 38, 0.08);
    --pf-t1: #0F1117;
    --pf-t2: #56637A;
    --pf-t3: #9CA3AF;
    color-scheme: light;
  }
}

/* ── Reset base ───────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background-color: var(--pf-bg);
  color: var(--pf-t1);
  font-family: var(--pf-font-body);
  -webkit-font-smoothing: antialiased;
}
```

> **Nota**: Los tokens anteriores (`--color-bg-base`, `--color-accent`, etc.) se eliminan del archivo. Los componentes existentes de auth usan clases propias, no variables globales, por lo que no hay colisión.

---

## 2. Iconografía — Heroicons (flat, outline)

Instalar:
```bash
npm install @ng-icons/core @ng-icons/heroicons
```

Íconos usados en el proyecto:

| Lugar | Ícono Heroicons | Import |
|---|---|---|
| Bottom nav — Inicio | `heroHome` | `HeroHomeOutline` |
| Bottom nav — Créditos | `heroDocumentText` | `HeroDocumentTextOutline` |
| Bottom nav — Tarjetas | `heroCreditCard` | `HeroCreditCardOutline` |
| Bottom nav — Simular | `heroBoltSlash` → `heroBolt` | `HeroBoltOutline` |
| Back button | `heroChevronLeft` | `HeroChevronLeftOutline` |
| Chevron selector | `heroChevronDown` | `HeroChevronDownOutline` |
| Chevron lateral | `heroChevronRight` | `HeroChevronRightOutline` |
| Check / Al día | `heroCheckCircle` | `HeroCheckCircleOutline` |
| Alerta | `heroExclamationCircle` | `HeroExclamationCircleOutline` |
| Ver contraseña | `heroEye` / `heroEyeSlash` | hero outline |
| Ámbar arrow simulador | `heroArrowRight` | `HeroArrowRightOutline` |

Configuración global en `app.config.ts`:
```typescript
import { provideIcons } from '@ng-icons/core';
import {
  heroHome, heroDocumentText, heroCreditCard, heroBolt,
  heroChevronLeft, heroChevronDown, heroChevronRight,
  heroCheckCircle, heroExclamationCircle,
  heroEye, heroEyeSlash, heroArrowRight
} from '@ng-icons/heroicons/outline';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... providers existentes ...
    provideIcons({
      heroHome, heroDocumentText, heroCreditCard, heroBolt,
      heroChevronLeft, heroChevronDown, heroChevronRight,
      heroCheckCircle, heroExclamationCircle,
      heroEye, heroEyeSlash, heroArrowRight
    })
  ]
};
```

Uso en templates:
```html
<ng-icon name="heroHome" size="22" />
```

---

## 3. Componentes Shared

### 3.1 BottomNavComponent
**Path**: `src/app/shared/components/bottom-nav/bottom-nav.component.ts`

```typescript
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroHome, heroDocumentText, heroCreditCard, heroBolt } from '@ng-icons/heroicons/outline';

export type NavTab = 'inicio' | 'creditos' | 'tarjetas' | 'simular';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIconComponent],
  viewProviders: [provideIcons({ heroHome, heroDocumentText, heroCreditCard, heroBolt })],
  template: `
    <nav class="bottom-nav">
      <a class="bn-item" routerLink="/app/dashboard" routerLinkActive="active">
        <ng-icon name="heroHome" size="22" />
        <span>Inicio</span>
      </a>
      <a class="bn-item" routerLink="/app/creditos" routerLinkActive="active">
        <ng-icon name="heroDocumentText" size="22" />
        <span>Créditos</span>
      </a>
      <a class="bn-item" routerLink="/app/tarjetas" routerLinkActive="active">
        <ng-icon name="heroCreditCard" size="22" />
        <span>Tarjetas</span>
      </a>
      <a class="bn-item" routerLink="/app/simular" routerLinkActive="active">
        <ng-icon name="heroBolt" size="22" />
        <span>Simular</span>
      </a>
    </nav>
  `,
  styleUrl: './bottom-nav.component.scss'
})
export class BottomNavComponent {}
```

**SCSS**:
```scss
.bottom-nav {
  display: flex;
  background: var(--pf-s1);
  border-top: 1px solid var(--pf-bd);
  padding: 6px 0 env(safe-area-inset-bottom, 20px);
  position: sticky;
  bottom: 0;
  z-index: 10;
}

.bn-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 0;
  text-decoration: none;
  color: var(--pf-t3);
  font-size: 10px;
  font-weight: 500;
  transition: color 0.15s;

  ng-icon { color: var(--pf-t3); transition: color 0.15s; }

  &.active {
    color: var(--pf-amber);
    ng-icon { color: var(--pf-amber); }
  }
}
```

---

### 3.2 KpiCardComponent
**Path**: `src/app/shared/components/kpi-card/kpi-card.component.ts`

```typescript
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  template: `
    <div class="kpi" [class]="colorClass()">
      <div class="kpi-lbl">{{ label() }}</div>
      <div class="kpi-val">{{ value() }}</div>
    </div>
  `,
  styleUrl: './kpi-card.component.scss'
})
export class KpiCardComponent {
  label = input.required<string>();
  value = input.required<string>();
  /** 'green' | 'red' | 'amber' | 'neutral' */
  color = input<string>('neutral');
  colorClass = computed(() => `kpi--${this.color()}`);
}
```

**SCSS**:
```scss
.kpi {
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r);
  padding: 14px;

  &--green { border-color: rgba(34, 197, 94, 0.25); .kpi-val { color: var(--pf-green); } }
  &--red   { border-color: rgba(239, 68, 68, 0.22);  .kpi-val { color: var(--pf-red);   } }
  &--amber { border-color: rgba(212, 160, 23, 0.25); .kpi-val { color: var(--pf-amber); } }
}

.kpi-lbl {
  font-size: 11px;
  color: var(--pf-t2);
  line-height: 1.3;
  margin-bottom: 6px;
}

.kpi-val {
  font-family: var(--pf-font-mono);
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
```

---

### 3.3 CreditRowComponent
**Path**: `src/app/shared/components/credit-row/credit-row.component.ts`

```typescript
export interface CreditRowData {
  nombre: string;
  entidad: string;
  tipo: 'francesa' | 'alemana';
  saldo: string;
  tasaEA: string;
  proximaCuota: string;
  fechaVence: string;
  cuotasPagadas: number;
  cuotasTotal: number;
  estado: 'al-dia' | 'mora';
}

@Component({
  selector: 'app-credit-row',
  standalone: true,
  imports: [NgIconComponent],
  viewProviders: [provideIcons({ heroCheckCircle, heroExclamationCircle, heroChevronRight })],
  template: `
    <div class="credit-row" (click)="clicked.emit(credit())">
      <div class="cr-top">
        <div>
          <div class="cr-name">{{ credit().nombre }}</div>
          <div class="cr-sub">{{ credit().entidad }} · {{ credit().tipo | titlecase }}</div>
        </div>
        <span class="pill" [class.pill--green]="credit().estado === 'al-dia'" [class.pill--red]="credit().estado === 'mora'">
          <ng-icon [name]="credit().estado === 'al-dia' ? 'heroCheckCircle' : 'heroExclamationCircle'" size="12" />
          {{ credit().estado === 'al-dia' ? 'Al día' : 'En mora' }}
        </span>
      </div>
      <div class="cr-meta">
        <div class="cr-m"><label>Saldo capital</label><span>{{ credit().saldo }}</span></div>
        <div class="cr-m"><label>Tasa EA</label><span>{{ credit().tasaEA }}</span></div>
        <div class="cr-m"><label>Próx. cuota</label><span>{{ credit().proximaCuota }}</span></div>
      </div>
      <div class="cr-progress">
        <div class="pbar"><div class="pbar-fill" [style.width.%]="porcentaje()"></div></div>
        <div class="pbar-sub">
          <span>{{ credit().cuotasPagadas }} / {{ credit().cuotasTotal }} cuotas</span>
          <span class="pbar-date">{{ credit().fechaVence }} <ng-icon name="heroChevronRight" size="10" /></span>
        </div>
      </div>
    </div>
  `,
  styleUrl: './credit-row.component.scss'
})
export class CreditRowComponent {
  credit = input.required<CreditRowData>();
  clicked = output<CreditRowData>();
  porcentaje = computed(() =>
    Math.round((this.credit().cuotasPagadas / this.credit().cuotasTotal) * 100)
  );
}
```

**SCSS**:
```scss
.credit-row {
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r);
  padding: 13px 14px;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover { border-color: var(--pf-amber-dim); }
}

.cr-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.cr-name { font-size: 13px; font-weight: 600; }
.cr-sub  { font-size: 10px; color: var(--pf-t3); margin-top: 2px; }

.cr-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.cr-m label {
  display: block;
  font-size: 9px;
  color: var(--pf-t3);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 3px;
}
.cr-m span {
  font-family: var(--pf-font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pbar {
  height: 3px;
  background: var(--pf-bd);
  border-radius: 2px;
  overflow: hidden;
}
.pbar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--pf-amber);
  transition: width 0.3s ease;
}
.pbar-sub {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--pf-t3);
  margin-top: 3px;
}
.pbar-date { color: var(--pf-amber); }

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}
.pill--green { background: var(--pf-green-bg); color: var(--pf-green); }
.pill--red   { background: var(--pf-red-bg);   color: var(--pf-red);   }
```

---

## 4. App Shell — Refactor

### `app-shell.component.html`
El shell es ahora el layout principal: contiene `<router-outlet>` + `<app-bottom-nav>`.

```html
<div class="app-shell">
  <main class="shell-content">
    <router-outlet />
  </main>
  <app-bottom-nav />
</div>
```

### `app-shell.component.scss`
```scss
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--pf-bg);
}

.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
```

### `app-shell.component.ts`
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, BottomNavComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {}
```

> **Mantener**: El `authGuard` en la ruta `app` no cambia.

---

## 5. Rutas — `app.routes.ts`

Agregar rutas hijas bajo el path `'app'`:

```typescript
{
  path: 'app',
  canActivate: [authGuard],
  component: AppShellComponent,
  children: [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    {
      path: 'dashboard',
      loadComponent: () =>
        import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
    },
    {
      path: 'creditos',
      loadComponent: () =>
        import('./features/creditos/creditos-list/creditos-list.component').then(m => m.CreditosListComponent)
    },
    {
      path: 'creditos/:id',
      loadComponent: () =>
        import('./features/creditos/credito-detail/credito-detail.component').then(m => m.CreditoDetailComponent)
    },
    {
      path: 'tarjetas',
      loadComponent: () =>
        import('./features/tarjetas/tarjetas.component').then(m => m.TarjetasComponent)
    },
    {
      path: 'simular',
      loadComponent: () =>
        import('./features/simulador/simulador.component').then(m => m.SimuladorComponent)
    },
  ]
}
```

---

## 6. Pantallas — Especificaciones Detalladas

### 6.1 Login — Refactor

**Objetivo**: Mismo formulario Angular reactivo, rediseño visual completo. Sin "vault", sin inglés.

**`login.component.html`** — estructura:
```html
<main class="login-viewport">
  <div class="login-inner">
    
    <!-- Wordmark -->
    <div class="wordmark">personal<em>.</em></div>
    <p class="tagline">Tu estado financiero real, siempre a mano.</p>

    <!-- Error alert (mismo @if existente) -->
    @if (errorMessage()) {
      <div class="alert-error" role="alert">
        <ng-icon name="heroExclamationCircle" size="18" />
        <span>{{ errorMessage() }}</span>
      </div>
    }

    <!-- Formulario — misma lógica Angular, nuevas clases CSS -->
    <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" novalidate class="login-form">
      
      <div class="fg">
        <label for="login-email">Correo electrónico</label>
        <input id="login-email" type="email" formControlName="email"
               autocomplete="email" placeholder="nombre@ejemplo.com"
               class="fi" [class.fi--error]="email?.invalid && (email?.dirty || email?.touched)" />
        @if (email?.invalid && (email?.dirty || email?.touched)) {
          <p class="field-error">
            @if (email?.hasError('required')) { El correo es requerido. }
            @else if (email?.hasError('email')) { Formato de correo inválido. }
          </p>
        }
      </div>

      <div class="fg">
        <label for="login-password">Contraseña</label>
        <div class="input-wrap">
          <input id="login-password" [type]="showPassword() ? 'text' : 'password'"
                 formControlName="password" autocomplete="current-password"
                 placeholder="Tu contraseña"
                 class="fi" [class.fi--error]="password?.invalid && (password?.dirty || password?.touched)" />
          <button type="button" class="toggle-vis" (click)="togglePasswordVisibility()"
                  [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
            <ng-icon [name]="showPassword() ? 'heroEyeSlash' : 'heroEye'" size="18" />
          </button>
        </div>
        @if (password?.invalid && (password?.dirty || password?.touched)) {
          <p class="field-error">La contraseña es requerida.</p>
        }
      </div>

      <div class="forgot-row">
        <a routerLink="/auth/forgot" class="forgot-link">¿Olvidaste tu contraseña?</a>
      </div>

      <button type="submit" class="btn-primary"
              [disabled]="loginForm.invalid || isSubmitting()" [attr.aria-busy]="isSubmitting()">
        @if (isSubmitting()) {
          <span class="spinner" aria-hidden="true"></span>
          <span>Verificando...</span>
        } @else {
          Ingresar
        }
      </button>
    </form>

    <p class="login-foot">¿No tienes cuenta? <a routerLink="/auth/signup">Regístrate</a></p>
  </div>
</main>
```

**`login.component.scss`**:
```scss
.login-viewport {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
  background: var(--pf-bg);
}

.login-inner {
  width: 100%;
  max-width: 400px;
}

.wordmark {
  font-family: var(--pf-font-display);
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
  em { color: var(--pf-amber); font-style: normal; }
}

.tagline {
  font-size: 14px;
  color: var(--pf-t2);
  margin: 0 0 32px;
  line-height: 1.4;
}

.alert-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--pf-red-bg);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--pf-rsm);
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--pf-red);
}

.login-form { display: flex; flex-direction: column; gap: 14px; }

.fg {
  display: flex;
  flex-direction: column;
  gap: 5px;

  label {
    font-size: 12px;
    font-weight: 500;
    color: var(--pf-t2);
  }
}

.input-wrap { position: relative; }

.fi {
  width: 100%;
  min-height: var(--pf-touch);
  padding: 12px 14px;
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-rsm);
  color: var(--pf-t1);
  font-size: 15px;
  font-family: var(--pf-font-body);
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;

  &::placeholder { color: var(--pf-t3); }
  &:focus {
    outline: none;
    border-color: var(--pf-amber);
    box-shadow: 0 0 0 3px var(--pf-amber-bg);
  }
  &--error {
    border-color: var(--pf-red);
    &:focus { box-shadow: 0 0 0 3px var(--pf-red-bg); }
  }
}

.toggle-vis {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  min-height: 36px;
  min-width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--pf-t3);
  cursor: pointer;
  &:hover { color: var(--pf-t1); }
}

.field-error { font-size: 12px; color: var(--pf-red); margin: 0; }

.forgot-row { display: flex; justify-content: flex-end; margin-top: -6px; }
.forgot-link { font-size: 12px; color: var(--pf-t3); text-decoration: none; }

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: var(--pf-touch);
  padding: 12px;
  background: var(--pf-amber);
  border: none;
  border-radius: var(--pf-rsm);
  font-family: var(--pf-font-display);
  font-size: 15px;
  font-weight: 700;
  color: #0C1018;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-top: 4px;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(12, 16, 24, 0.3);
  border-top-color: #0C1018;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.login-foot {
  text-align: center;
  font-size: 13px;
  color: var(--pf-t3);
  margin-top: 24px;
  a { color: var(--pf-amber); font-weight: 600; text-decoration: none; }
}
```

---

### 6.2 Dashboard Component

**Path**: `src/app/features/dashboard/dashboard.component.ts`

```typescript
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [KpiCardComponent, CreditRowComponent, NgIconComponent, RouterLink],
  viewProviders: [provideIcons({ heroChevronLeft, heroChevronRight })],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  // Conectar con servicios reales cuando existan.
  // Por ahora: datos mock tipados.
  readonly kpis = signal([
    { label: 'Liquidez disponible',  value: '$2.340.000',  color: 'green'   },
    { label: 'Deuda de capital',     value: '$18.500.000', color: 'red'     },
    { label: 'Cuota exigible oct.',  value: '$1.125.000',  color: 'amber'   },
    { label: 'Costo financiero',     value: '$340.000',    color: 'neutral' },
  ]);

  readonly creditos = signal<CreditRowData[]>([
    /* datos mock — reemplazar con servicio */
  ]);

  readonly periodoLabel = signal('Octubre 2026');
}
```

**`dashboard.component.html`**:
```html
<div class="dashboard">

  <!-- Header -->
  <header class="dash-header">
    <div>
      <div class="greet-name">Hola, Yamid</div>
      <div class="greet-sub">Tu resumen de {{ periodoLabel() }}</div>
    </div>
    <div class="avatar" aria-hidden="true">YC</div>
  </header>

  <!-- Período selector -->
  <div class="period-row">
    <button class="period-btn" aria-label="Período anterior">
      <ng-icon name="heroChevronLeft" size="16" />
    </button>
    <span class="period-lbl">{{ periodoLabel() }}</span>
    <button class="period-btn" aria-label="Período siguiente">
      <ng-icon name="heroChevronRight" size="16" />
    </button>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    @for (kpi of kpis(); track kpi.label) {
      <app-kpi-card [label]="kpi.label" [value]="kpi.value" [color]="kpi.color" />
    }
  </div>

  <!-- Créditos mini -->
  <section class="section">
    <div class="section-row">
      <h2 class="section-title">Mis créditos</h2>
      <a routerLink="/app/creditos" class="section-link">Ver todos</a>
    </div>
    <div class="credit-list">
      @for (c of creditos(); track c.nombre) {
        <app-credit-row [credit]="c" (clicked)="onCreditClick($event)" />
      }
    </div>
  </section>

</div>
```

**`dashboard.component.scss`**:
```scss
.dashboard {
  padding: 0 0 16px;
  max-width: 600px;
  margin: 0 auto;
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 16px 14px;
}

.greet-name {
  font-family: var(--pf-font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.greet-sub { font-size: 12px; color: var(--pf-t2); margin-top: 2px; }

.avatar {
  width: 38px; height: 38px;
  border-radius: 50%;
  background: var(--pf-amber-bg);
  border: 1px solid var(--pf-amber-dim);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--pf-font-display);
  font-size: 13px; font-weight: 700;
  color: var(--pf-amber);
  flex-shrink: 0;
}

.period-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 14px;
}
.period-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-rsm);
  color: var(--pf-t2);
  cursor: pointer;
}
.period-lbl { font-size: 13px; font-weight: 500; flex: 1; text-align: center; }

.kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 0 16px 24px;
}

.section { padding: 0 16px; }
.section-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.section-title { font-size: 13px; font-weight: 600; margin: 0; }
.section-link {
  font-size: 12px;
  color: var(--pf-amber);
  font-weight: 500;
  text-decoration: none;
}
.credit-list { display: flex; flex-direction: column; gap: 8px; }
```

---

### 6.3 Créditos Lista Component

**Path**: `src/app/features/creditos/creditos-list/creditos-list.component.ts`

```html
<!-- creditos-list.component.html -->
<div class="screen">

  <header class="scr-header">
    <h1 class="scr-title">Créditos</h1>
    <button class="btn-add" aria-label="Agregar crédito">+</button>
  </header>

  <!-- Resumen strip -->
  <div class="summary-strip">
    <div class="ss-item">
      <div class="ss-lbl">Deuda total</div>
      <div class="ss-val ss-val--red">$18.500.000</div>
    </div>
    <div class="ss-divider"></div>
    <div class="ss-item">
      <div class="ss-lbl">Cuota mensual</div>
      <div class="ss-val ss-val--amber">$1.125.000</div>
    </div>
  </div>

  <!-- Lista -->
  <div class="credit-list">
    @for (c of creditos(); track c.nombre) {
      <app-credit-row [credit]="c" (clicked)="onCreditClick($event)" />
    }
  </div>

</div>
```

```scss
/* creditos-list.component.scss */
.screen { padding: 0 16px 20px; }

.scr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 14px;
}
.scr-title {
  font-family: var(--pf-font-display);
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}
.btn-add {
  width: 32px; height: 32px;
  background: var(--pf-amber-bg);
  border: 1px solid var(--pf-amber-dim);
  border-radius: var(--pf-rsm);
  color: var(--pf-amber);
  font-size: 20px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

.summary-strip {
  display: flex;
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r);
  overflow: hidden;
  margin-bottom: 20px;
}
.ss-item { flex: 1; padding: 12px 14px; }
.ss-divider { width: 1px; background: var(--pf-bd); }
.ss-lbl { font-size: 10px; color: var(--pf-t3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.ss-val { font-family: var(--pf-font-mono); font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
.ss-val--red   { color: var(--pf-red); }
.ss-val--amber { color: var(--pf-amber); }

.credit-list { display: flex; flex-direction: column; gap: 8px; }
```

---

### 6.4 Crédito Detalle Component

**Path**: `src/app/features/creditos/credito-detail/credito-detail.component.ts`

Estructura:
1. Back button (← Créditos)
2. Hero card (nombre, entidad, estado)
3. Stats grid: saldo / tasa EA / cuotas restantes / próxima cuota / vence / amortización
4. Tab bar: `Tabla` | `Simular abono` | `Detalle`
5. Tabla de amortización (scroll)
6. CTA → `/app/simular?creditoId=:id`

```html
<!-- credito-detail.component.html -->
<div class="screen">

  <header class="scr-header">
    <button class="back-btn" (click)="goBack()" aria-label="Volver">
      <ng-icon name="heroChevronLeft" size="20" />
    </button>
    <h1 class="scr-title">{{ credito().nombre }}</h1>
  </header>

  <!-- Hero -->
  <div class="credit-hero">
    <div class="ch-top">
      <span class="ch-entity">{{ credito().entidad }}</span>
      <span class="pill pill--green">
        <ng-icon name="heroCheckCircle" size="12" />
        Al día
      </span>
    </div>
    <div class="ch-stats">
      <div class="cs"><label>Saldo capital</label><value>{{ credito().saldo }}</value></div>
      <div class="cs"><label>Tasa EA</label><value>{{ credito().tasaEA }}</value></div>
      <div class="cs"><label>Cuotas rest.</label><value>{{ credito().cuotasRestantes }} de {{ credito().cuotasTotal }}</value></div>
      <div class="cs"><label>Próx. cuota</label><value class="val--amber">{{ credito().proximaCuota }}</value></div>
      <div class="cs"><label>Vence</label><value>{{ credito().fechaVence }}</value></div>
      <div class="cs"><label>Amortización</label><value>{{ credito().tipo | titlecase }}</value></div>
    </div>
  </div>

  <!-- Tab bar -->
  <div class="tab-bar">
    @for (tab of tabs; track tab.id) {
      <button class="tab" [class.tab--active]="activeTab() === tab.id"
              (click)="activeTab.set(tab.id)">{{ tab.label }}</button>
    }
  </div>

  <!-- Tabla amortización -->
  @if (activeTab() === 'tabla') {
    <div class="table-wrap">
      <table class="amort-table">
        <thead>
          <tr>
            <th>Cuota</th><th>Capital</th><th>Interés</th><th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          @for (row of amortizacion(); track row.numero) {
            <tr [class.row--current]="row.esCurrent">
              <td>{{ row.numero }}{{ row.esCurrent ? ' ←' : '' }}</td>
              <td>{{ row.capital }}</td>
              <td>{{ row.interes }}</td>
              <td>{{ row.saldo }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- CTA simular -->
  <div class="cta-row">
    <button class="btn-sim" [routerLink]="['/app/simular']" [queryParams]="{ creditoId: credito().id }">
      <ng-icon name="heroBolt" size="16" />
      Simular abono extraordinario
    </button>
  </div>

</div>
```

**SCSS** (`.amort-table`):
```scss
.credit-hero {
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-rlg);
  padding: 16px;
  margin: 0 16px 12px;
}
.ch-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.ch-entity {
  font-family: var(--pf-font-display);
  font-size: 15px;
  font-weight: 700;
}
.ch-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.cs label {
  display: block;
  font-size: 9px;
  color: var(--pf-t3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
}
.cs value {
  font-family: var(--pf-font-mono);
  font-size: 12px;
  display: block;
  font-variant-numeric: tabular-nums;
}
.val--amber { color: var(--pf-amber); }

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--pf-bd);
  padding: 10px 16px 0;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--pf-t3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  &--active { color: var(--pf-amber); border-bottom-color: var(--pf-amber); }
}

.table-wrap {
  overflow-x: auto;
  padding: 12px 16px;
}
.amort-table {
  width: 100%;
  border-collapse: collapse;
  th {
    font-size: 9px; font-weight: 500; color: var(--pf-t3);
    text-transform: uppercase; letter-spacing: 0.04em;
    text-align: right; padding: 8px 6px 8px 0;
    border-bottom: 1px solid var(--pf-bd);
    &:first-child { text-align: left; padding-left: 0; }
  }
  td {
    font-family: var(--pf-font-mono); font-size: 11px; color: var(--pf-t2);
    text-align: right; padding: 8px 6px 8px 0;
    border-bottom: 1px solid var(--pf-bd2);
    font-variant-numeric: tabular-nums;
    &:first-child { text-align: left; font-family: var(--pf-font-body); color: var(--pf-t3); padding-left: 0; }
  }
  .row--current td { color: var(--pf-t1); }
  .row--current td:first-child { color: var(--pf-amber); font-weight: 600; }
}

.cta-row { padding: 12px 16px 20px; }
.btn-sim {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 12px;
  background: var(--pf-amber-bg);
  border: 1px solid var(--pf-amber-dim);
  border-radius: var(--pf-rsm);
  font-family: var(--pf-font-display);
  font-size: 13px; font-weight: 700;
  color: var(--pf-amber);
  cursor: pointer;
}
```

---

### 6.5 Tarjetas Component

**Path**: `src/app/features/tarjetas/tarjetas.component.ts`

Estructura:
1. Header con título
2. Visual de tarjeta (solo CSS, sin imagen — gradiente `#1A2234 → #242B3A`)
3. Bloque cupo: aprobado / barra / usado / disponible
4. Lista compras diferidas: nombre, cuotas `X de N`, cuota mensual, total

```html
<!-- tarjetas.component.html -->
<div class="screen">
  <header class="scr-header">
    <h1 class="scr-title">Tarjetas</h1>
  </header>

  <!-- Tarjeta visual -->
  <div class="tarjeta" role="img" [attr.aria-label]="'Tarjeta ' + tarjeta().banco + ' ' + tarjeta().numero">
    <div class="t-bank">{{ tarjeta().banco }}</div>
    <div class="t-num">•••• •••• •••• {{ tarjeta().ultimosCuatro }}</div>
    <div class="t-footer">
      <span class="t-holder">{{ tarjeta().titular }}</span>
      <span class="t-network">{{ tarjeta().red }}</span>
    </div>
  </div>

  <!-- Cupo -->
  <div class="px16">
    <div class="section-row mb8">
      <span class="section-title">Cupo</span>
      <span class="section-sub">Corte: {{ tarjeta().fechaCorte }}</span>
    </div>
    <div class="cupo-card">
      <div class="cupo-row">
        <span class="cupo-lbl">Cupo aprobado</span>
        <span class="cupo-val">{{ tarjeta().cupoAprobado }}</span>
      </div>
      <div class="cupo-row">
        <span class="cupo-lbl">Cupo usado</span>
        <span class="cupo-val cupo-val--red">{{ tarjeta().cupoUsado }}</span>
      </div>
      <div class="cupo-bar">
        <div class="cupo-fill" [style.width.%]="tarjeta().porcentajeUsado"></div>
      </div>
      <div class="cupo-pct">{{ tarjeta().porcentajeUsado }}% utilizado</div>
      <div class="cupo-sep"></div>
      <div class="cupo-row">
        <span class="cupo-lbl">Disponible</span>
        <span class="cupo-val cupo-val--green">{{ tarjeta().cupoDisponible }}</span>
      </div>
    </div>

    <!-- Compras diferidas -->
    <div class="section-row">
      <span class="section-title">Compras diferidas</span>
      <span class="section-sub">{{ diferidas().length }} activas</span>
    </div>
    <div class="card">
      @for (d of diferidas(); track d.nombre; let last = $last) {
        <div class="dif-item" [class.dif-item--last]="last">
          <div class="di-l">
            <div class="di-name">{{ d.nombre }}</div>
            <div class="di-meta">{{ d.cuotasTotal }} cuotas · paga cuota {{ d.cuotaActual }} de {{ d.cuotasTotal }}</div>
          </div>
          <div class="di-r">
            <div class="di-cuota">{{ d.cuotaMensual }}/mes</div>
            <div class="di-total">{{ d.total }} total</div>
          </div>
        </div>
      }
    </div>
  </div>
</div>
```

**SCSS** (selectivo, lo más importante):
```scss
.tarjeta {
  background: linear-gradient(140deg, #1A2234 0%, #222C40 60%, #1E2A3C 100%);
  border: 1px solid var(--pf-bd);
  border-radius: 20px;
  padding: 22px 20px 20px;
  margin: 0 16px 16px;
  aspect-ratio: 1.586;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;

  /* Círculo decorativo */
  &::before {
    content: '';
    position: absolute;
    top: -30px; right: -30px;
    width: 130px; height: 130px;
    border-radius: 50%;
    background: var(--pf-amber-bg);
    border: 1px solid var(--pf-amber-dim);
    pointer-events: none;
  }
}

.t-bank {
  font-family: var(--pf-font-display);
  font-size: 14px; font-weight: 700;
  color: var(--pf-amber);
  position: relative; /* sobre el ::before */
}
.t-num {
  font-family: var(--pf-font-mono);
  font-size: 15px; letter-spacing: 0.15em;
  color: var(--pf-t2);
}
.t-footer { display: flex; justify-content: space-between; align-items: flex-end; }
.t-holder { font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
.t-network { font-size: 13px; font-weight: 700; color: var(--pf-t2); }

.cupo-card {
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r);
  padding: 14px;
  margin-bottom: 14px;
}
.cupo-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.cupo-lbl { font-size: 12px; color: var(--pf-t2); }
.cupo-val {
  font-family: var(--pf-font-mono);
  font-size: 13px; font-weight: 500;
  font-variant-numeric: tabular-nums;
  &--red   { color: var(--pf-red); }
  &--green { color: var(--pf-green); }
}
.cupo-bar {
  height: 7px; background: var(--pf-bd);
  border-radius: 4px; overflow: hidden; margin-top: 4px;
}
.cupo-fill {
  height: 100%; border-radius: 4px;
  background: linear-gradient(90deg, var(--pf-red), #FF7070);
  transition: width 0.4s ease;
}
.cupo-pct { font-size: 10px; color: var(--pf-t3); margin-top: 4px; }
.cupo-sep { height: 1px; background: var(--pf-bd); margin: 10px 0; }

.dif-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--pf-bd2);
  &--last { border-bottom: none; }
}
.di-name { font-size: 13px; font-weight: 500; }
.di-meta { font-size: 10px; color: var(--pf-t3); margin-top: 2px; }
.di-r { text-align: right; flex-shrink: 0; padding-left: 12px; }
.di-cuota { font-family: var(--pf-font-mono); font-size: 13px; color: var(--pf-amber); font-variant-numeric: tabular-nums; }
.di-total  { font-size: 10px; color: var(--pf-t3); margin-top: 1px; }
```

---

### 6.6 Simulador Component

**Path**: `src/app/features/simulador/simulador.component.ts`

Inputs:
- Selector de crédito (dropdown con lista de créditos activos)
- Monto del abono (input numérico con formato COP)
- Toggle: `Reducir plazo` | `Reducir cuota`

Output (calculado localmente en el componente):
- Cuota mensual antes/después
- Cuotas restantes antes/después
- Ahorro total / reducción de cuotas

```html
<!-- simulador.component.html -->
<div class="screen">

  <header class="scr-header">
    <button class="back-btn" (click)="goBack()">
      <ng-icon name="heroChevronLeft" size="20" />
    </button>
    <h1 class="scr-title">Simulador</h1>
  </header>

  <div class="px16">

    <!-- Selector crédito -->
    <div class="sim-select" (click)="openCreditoPicker()">
      <div class="ss-lbl">Crédito</div>
      <div class="ss-val">
        <span>{{ creditoSeleccionado()?.nombre ?? 'Selecciona un crédito' }}</span>
        <ng-icon name="heroChevronDown" size="16" style="color: var(--pf-t3)" />
      </div>
    </div>

    <!-- Monto abono -->
    <div class="sim-lbl">Abono extraordinario</div>
    <div class="sim-amount-input">
      <span class="si-cur">$</span>
      <input class="si-val" type="number" [value]="montoAbono()"
             (input)="onMontoChange($event)" placeholder="0" aria-label="Monto del abono en COP" />
    </div>

    <!-- Toggle objetivo -->
    <div class="sim-lbl">Objetivo del abono</div>
    <div class="toggle-row">
      <button class="tog" [class.tog--active]="objetivo() === 'plazo'"
              (click)="objetivo.set('plazo')">Reducir plazo</button>
      <button class="tog" [class.tog--active]="objetivo() === 'cuota'"
              (click)="objetivo.set('cuota')">Reducir cuota</button>
    </div>

    <!-- Resultado -->
    @if (resultado()) {
      <div class="sim-result">
        <div class="sr-eyebrow">Resultado de la simulación</div>
        <div class="sr-grid">
          <div class="sr-col sr-col--before">
            <div class="sr-col-lbl">Sin abono</div>
            <div class="sr-stat"><label>Cuota mensual</label><value>{{ resultado()!.antes.cuota }}</value></div>
            <div class="sr-stat"><label>Cuotas restantes</label><value>{{ resultado()!.antes.cuotas }}</value></div>
            <div class="sr-stat"><label>Costo total</label><value>{{ resultado()!.antes.costoTotal }}</value></div>
          </div>
          <div class="sr-arrow">
            <ng-icon name="heroArrowRight" size="18" />
          </div>
          <div class="sr-col sr-col--after">
            <div class="sr-col-lbl">Con abono</div>
            <div class="sr-stat"><label>Cuota mensual</label><value>{{ resultado()!.despues.cuota }}</value></div>
            <div class="sr-stat"><label>Cuotas restantes</label><value>{{ resultado()!.despues.cuotas }}</value></div>
            <div class="sr-stat"><label>Ahorras</label><value>{{ resultado()!.ahorro }}</value></div>
          </div>
        </div>
        @if (resultado()!.resumen) {
          <p class="sr-resumen">{{ resultado()!.resumen }}</p>
        }
      </div>
    }

    <!-- CTA -->
    <button class="btn-primary btn-sim-action" (click)="simular()" [disabled]="!puedeSimular()">
      Simular
    </button>

  </div>
</div>
```

**SCSS**:
```scss
.sim-select {
  background: var(--pf-s1); border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r); padding: 12px 14px;
  margin-bottom: 16px; cursor: pointer;
}
.ss-lbl { font-size: 9px; color: var(--pf-t3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.ss-val { font-size: 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

.sim-lbl { font-size: 12px; font-weight: 500; color: var(--pf-t2); margin-bottom: 6px; }

.sim-amount-input {
  display: flex; align-items: baseline; gap: 4px;
  background: var(--pf-s1);
  border: 1.5px solid var(--pf-amber-dim);
  border-radius: var(--pf-r);
  padding: 14px 16px;
  margin-bottom: 16px;
  &:focus-within { border-color: var(--pf-amber); box-shadow: 0 0 0 3px var(--pf-amber-bg); }
}
.si-cur { font-size: 22px; color: var(--pf-t3); }
.si-val {
  font-family: var(--pf-font-mono); font-size: 32px; font-weight: 500;
  color: var(--pf-t1); border: none; background: transparent;
  width: 100%; font-variant-numeric: tabular-nums;
  &:focus { outline: none; }
  &::placeholder { color: var(--pf-t3); }
}

.toggle-row {
  display: flex; background: var(--pf-s1);
  border: 1px solid var(--pf-bd); border-radius: var(--pf-r);
  overflow: hidden; margin-bottom: 20px;
}
.tog {
  flex: 1; padding: 11px 8px; text-align: center;
  font-size: 13px; font-weight: 500; color: var(--pf-t3);
  background: transparent; border: none; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &--active { background: var(--pf-amber-bg); color: var(--pf-amber); }
}

.sim-result {
  background: var(--pf-s1); border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r); padding: 16px; margin-bottom: 20px;
}
.sr-eyebrow { font-size: 9px; color: var(--pf-t3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
.sr-grid { display: grid; grid-template-columns: 1fr 28px 1fr; align-items: start; gap: 6px; }
.sr-col-lbl { font-size: 10px; font-weight: 600; margin-bottom: 10px; }
.sr-col--before .sr-col-lbl { color: var(--pf-t3); }
.sr-col--after  .sr-col-lbl { color: var(--pf-green); }
.sr-stat + .sr-stat { margin-top: 10px; }
.sr-stat label {
  display: block; font-size: 9px; color: var(--pf-t3);
  text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;
}
.sr-stat value {
  font-family: var(--pf-font-mono); font-size: 13px;
  display: block; font-variant-numeric: tabular-nums;
}
.sr-col--after .sr-stat value { color: var(--pf-green); }
.sr-arrow { display: flex; align-items: center; justify-content: center; padding-top: 20px; color: var(--pf-t3); }
.sr-resumen {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--pf-bd2);
  font-size: 11px; color: var(--pf-t2); margin-bottom: 0;
}

.btn-sim-action {
  width: 100%; padding: 14px;
  background: var(--pf-amber); border: none;
  border-radius: var(--pf-rsm);
  font-family: var(--pf-font-display); font-size: 15px; font-weight: 700;
  color: #0C1018; cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
```

---

## 7. Clases utilitarias globales

Agregar al final de `styles.scss`:

```scss
/* ── Utilidades ─── */
.px16 { padding-left: 16px; padding-right: 16px; }
.mb8  { margin-bottom: 8px; }
.mb14 { margin-bottom: 14px; }
.mb20 { margin-bottom: 20px; }

.card {
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-r);
  padding: 14px;
}

.scr-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 14px;
}

.scr-title {
  font-family: var(--pf-font-display);
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.back-btn {
  min-width: var(--pf-touch);
  min-height: var(--pf-touch);
  display: flex; align-items: center; justify-content: center;
  background: var(--pf-s1);
  border: 1px solid var(--pf-bd);
  border-radius: var(--pf-rsm);
  color: var(--pf-t2);
  cursor: pointer;
}

.section-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.section-title { font-size: 13px; font-weight: 600; margin: 0; }
.section-sub   { font-size: 12px; color: var(--pf-t2); }
.section-link  { font-size: 12px; color: var(--pf-amber); font-weight: 500; text-decoration: none; }
```

---

## 8. Checklist de implementación

```
[ ] npm install @ng-icons/core @ng-icons/heroicons
[ ] src/styles.scss — reemplazar tokens, agregar @import Google Fonts
[ ] app.config.ts — provideIcons(...)
[ ] shared/components/bottom-nav/ — crear componente
[ ] shared/components/kpi-card/ — crear componente
[ ] shared/components/credit-row/ — crear componente + interface CreditRowData
[ ] app-shell.component.{ts,html,scss} — refactor a layout shell
[ ] app.routes.ts — agregar children bajo 'app'
[ ] features/dashboard/ — nuevo componente
[ ] features/creditos/creditos-list/ — nuevo componente
[ ] features/creditos/credito-detail/ — nuevo componente
[ ] features/tarjetas/ — nuevo componente
[ ] features/simulador/ — nuevo componente
[ ] login.component.{html,scss} — rediseño (sin cambiar .ts ni formulario)
[ ] Verificar: ng build --configuration production (sin errores)
[ ] Verificar: ng test (tests existentes siguen pasando)
```

---

## 9. Nota sobre íconos — pendiente de ajustar

Los íconos en el wireframe de referencia usan emojis (placeholder). En la implementación deben ser **Heroicons outline** (flat, línea fina, 24px viewport). Tamaño estándar en bottom-nav: `22px`. En botones y pills: `12–16px`. No hay íconos rellenos (`solid`) salvo que el estado "activo" lo requiera explícitamente (en este diseño todo es outline).

---

*Documento generado para UX-01 · Personal Finance — Antigravity implementation brief*  
*Wireframe: https://claude.ai/artifact/6JyVY6oSnd5MdvgaxCqirt*
