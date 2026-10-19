# Personal Finance — Cierre UX-01 + Pulido UX Final PWA iOS

## 1. Contexto y Hallazgos de Pruebas Reales en iPhone

Tras la instalación y ejecución exitosa de la PWA en un iPhone físico en modo standalone (sin barras del navegador, con navegación funcional entre Inicio y Tarjetas, dashboard con cuatro KPI en distribución 2×2, bottom navigation persistente y respeto general de safe areas), se detectaron dos hallazgos prioritarios para pulir la experiencia de usuario:

1. **Desbordamiento horizontal en el Header Móvil:**
   - La cabecera concentraba en una única fila horizontal: la marca `personal.`, el indicador `MODO DEMO LOCAL`, las tres acciones rápidas (`+ Ingreso`, `+ Obligación`, `+ Cuenta`) y el botón de cierre de sesión.
   - En el ancho de viewport del iPhone (390 px), la suma de anchos de estos elementos excedía los 465 px, provocando un desbordamiento horizontal accidental en el shell de la aplicación.
2. **Textos en inglés en el Subsistema de Autenticación:**
   - Las pantallas de autenticación presentaban inconsistencias de idioma con términos en inglés: `Access Vault`, `Master Password`, `Show/Hide`, `Sign In to Vault`, `Forgot your password?`, `Create Vault Account`, y mensajes de error y validación en inglés.

---

## 2. Hito 1 — Header Móvil Responsive

### 2.1 Causa Raíz Técnica
- En `src/app/features/app-shell/app-shell.component.scss`, `.app-topbar` utilizaba `display: flex; align-items: center; justify-content: space-between;`.
- La sumatoria intrínseca de los anchos de los elementos hijos (marca: ~70 px, badge demo: ~115 px, 3 botones de acción: ~240 px, botón logout: ~40 px, márgenes y paddings: ~32 px) alcanzaba ~497 px.
- Al no permitir salto de línea ni acomodación vertical en pantallas de 360 px a 440 px, el ancho de desplazamiento (`scrollWidth`) superaba el ancho del cliente (`clientWidth`), violando la restricción de cero desplazamiento horizontal involuntario.

### 2.2 Solución Arquitectónica Implementada
Se diseñó e implementó un encabezado **mobile-first en dos niveles** mediante CSS Grid, conservando intacta la vista en fila única para desktop:

- **Nivel 1 (Superior Móvil `< 768px`):**
  - **Izquierda:** Wordmark `personal.` con su tipografía identitaria y punto dorado ámbar, acompañado inmediatamente por el badge `MODO DEMO LOCAL`.
  - **Derecha:** Botón de cierre de sesión (`btn-topbar-signout`), dimensionado a **44×44 px** para estricto cumplimiento táctil de Apple Human Interface Guidelines y WCAG 2.2.
- **Nivel 2 (Inferior Móvil `< 768px`):**
  - Grid de tres columnas iguales (`repeat(3, 1fr)`) que aloja las tres acciones existentes: `+ Ingreso`, `+ Obligación`, `+ Cuenta`.
  - Cada botón cuenta con una altura táctil de **44 px** (`min-height: 44px; height: 44px;`), iconos vectoriales nítidos, texto centrado legible y prevención de desbordamiento de texto.
  - En un viewport de 360 px (el más angosto testeado), los tres botones disponen de ~106 px cada uno, garantizando que ninguna etiqueta se corte ni desborde.
- **Transición Desktop (`>= 768px`):**
  - Reversión fluida a layout flexbox horizontal tradicional: la marca se oculta (pues se visualiza en la barra lateral expandida/colapsada), el badge de demo permanece visible, y los tres botones de acción junto con el logout se agrupan en el extremo derecho en formato compacto (altura 36 px).
- **Safe Areas:**
  - El contenedor superior incorpora `padding-top: calc(0.75rem + env(safe-area-inset-top, 0px))` para convivir armoniosamente con el Notch y la Dynamic Island de iOS en modo standalone.
- **Optimización de Presupuesto SCSS:**
  - Se optimizaron las reglas de `app-shell.component.scss` (eliminando anidamientos redundantes y unificando propiedades comunes de botones), logrando una compilación de producción con **0 advertencias de presupuesto de estilos** (SCSS de componentes por debajo del límite estricto de 12 kB).

---

## 3. Hito 2 — Login Completamente en Español

### 3.1 Centralización Arquitectónica
Se creó el archivo de configuración centralizado:
`src/app/core/config/auth-messages.config.ts`

Este módulo expone el objeto inmutable `AUTH_MESSAGES` con:
- `SYSTEM_BADGE`: `"Control Financiero Personal"`
- `ERRORS`: Mensajes normalizados en español para credenciales inválidas, confirmación pendiente de email, cuenta duplicada, contraseñas débiles, límites de tasa (*rate limit*), errores de red y enlaces expirados.
- `SUCCESS`: Mensajes de confirmación para inicio de sesión, registro inmediato, envío de enlace de confirmación, solicitud de recuperación y contraseña maestra actualizada.

### 3.2 Componentes Actualizados
- **`LoginComponent` (`login.component.html`, `login.component.ts`):**
  - Encabezado: `"Acceso a la Bóveda"`
  - Subtítulo: `"Tu estado financiero real, siempre a mano. Ingresa tus credenciales maestras para desbloquear tu bóveda."`
  - Campos: `"Correo electrónico"`, `"Contraseña maestra"`
  - Toggle de contraseña: `"Ver"` / `"Ocultar"` (con `aria-label="Ver contraseña"` / `"Ocultar contraseña"`)
  - Enlace de recuperación: `"¿Olvidaste tu contraseña?"`
  - Botón de envío: `"Ingresar a la Bóveda"` (y estado de carga: `"Accediendo a la Bóveda..."`)
  - Enlace a registro: `"¿No tienes cuenta? Crear cuenta en la Bóveda"`
- **`SignupComponent` (`signup.component.html`, `signup.component.ts`):**
  - Encabezado: `"Crear Cuenta en la Bóveda"`
  - Confirmación de contraseña: `"Confirmar contraseña maestra"`
  - Botón: `"Crear Cuenta en la Bóveda"`
  - Validaciones reactivas en español: requeridos, formato de correo válido, longitud mínima de 8 caracteres, requisito de letras y números, y coincidencia de contraseñas.
- **`ForgotPasswordComponent` (`forgot-password.component.html`, `forgot-password.component.ts`):**
  - Encabezado: `"Recuperar Contraseña"`
  - Botón: `"Enviar enlace de recuperación"`
- **`ResetPasswordComponent` (`reset-password.component.html`, `reset-password.component.ts`):**
  - Encabezado: `"Establecer Nueva Contraseña"`
  - Botón: `"Actualizar Contraseña Maestra"`
- **`AuthService` (`auth.service.ts`):**
  - La función `normalizeAuthError` traduce internamente todos los códigos de error de Supabase Auth (`invalid_credentials`, `user_already_exists`, `weak_password`, etc.) a los mensajes centralizados de `AUTH_MESSAGES.ERRORS`.

---

## 4. Hito 3 — Auditoría de Experiencia Standalone PWA

| Requisito Standalone | Configuración Auditada | Estado |
| :--- | :--- | :--- |
| **`manifest.webmanifest`** | `display: standalone`, `start_url: /app`, `scope: /`, colores `#0C1018` | **Conforme** |
| **`apple-touch-icon`** | Icono cuadrado 180×180 px en `public/icons/apple-touch-icon.png`, declarado en `<head>` | **Conforme** |
| **`viewport-fit=cover`** | Declarado en `<meta name="viewport" ... viewport-fit=cover>` para visualización borde a borde | **Conforme** |
| **Safe Areas Notch / Dynamic Island** | `env(safe-area-inset-top, 0px)` en `.app-topbar` | **Conforme** |
| **Safe Area Home Indicator** | `env(safe-area-inset-bottom, 12px)` en `.mobile-bottom-nav` y `padding-bottom` en wrapper | **Conforme** |
| **Prevención de Zoom en iOS** | Tamaños de fuente en `input` de 16 px (1rem) que previenen zoom automático al enfocar | **Conforme** |
| **Modales con Teclado Virtual** | Modales con `max-height: 90dvh` y `overflow-y: auto` interno | **Conforme** |
| **Desplazamiento Vertical** | Scroll fluido e independiente sin colisiones con la barra fija | **Conforme** |
| **Detección Standalone Limpia** | Cero sniffing de User-Agent (Safari/Chrome); compatibilidad web total conservada | **Conforme** |
| **Caché y Service Workers** | Ningún Service Worker añadido (almacenamiento y sincronización remota intactos) | **Conforme** |

---

## 5. Hito 4 — Evidencias Visuales y Capturas Comparativas

Las capturas generadas se encuentran en `docs/sprints/evidence/`:

| Evidencia | Archivo | Descripción |
| :--- | :--- | :--- |
| **Header Móvil (Después)** | `docs/sprints/evidence/header-after-mobile-grid-390.png` | Encabezado en dos niveles: Nivel 1 marca + demo + logout (44×44); Nivel 2 grid 3 acciones (44px) sin desbordamiento. |
| **Header Desktop** | `docs/sprints/evidence/header-desktop-1440.png` | Encabezado en fila única desktop alineado a la derecha. |
| **Login en Español** | `docs/sprints/evidence/login-after-spanish-390.png` | Pantalla de inicio de sesión unificada al 100% en español. |
| **Signup en Español** | `docs/sprints/evidence/signup-after-spanish-390.png` | Pantalla de registro completa en español con validaciones. |
| **Shell Móvil Integral** | `docs/sprints/evidence/app-shell-after-mobile-390.png` | Pantalla móvil completa de la bóveda (Header dos niveles, KPIs 2×2, Cascada, Bottom Nav). |
| **Selector de Meses Desktop** | `docs/sprints/evidence/month-selector-after-fix-1440.png` | Regresión de los 12 meses visibles sin recorte vertical. |

---

## 6. Resultados de Verificación y Pruebas

```
-------------------------------------------------------------------------------------
Prueba / Verificación                                       Resultado      Detalles
-------------------------------------------------------------------------------------
1. Compilación de Producción (npm run build)                EXITOSA        0 errores, 0 warnings de presupuesto SCSS
2. Pruebas Unitarias Angular (npx ng test --watch=false)     101 / 101      16 suites pasadas (100%)
3. Integridad SQL Supabase (npx vitest run integrity)        19 / 19       19 pruebas locales superadas (100%)
4. Playwright E2E Mock Multi-Viewport (npm run e2e:mock)    232 / 232      8 viewports: 360, 390, 430, 440, 768, 1024, 1440, 1920 px
-------------------------------------------------------------------------------------
```

### Comprobaciones Específicas de Regresión:
1. **Header sin desbordamiento horizontal:** Verificado en 360, 390, 430 y 440 px (`scrollWidth <= clientWidth`).
2. **Acceso a las tres acciones rápidas:** Acceso inmediato y funcional a `+ Ingreso`, `+ Obligación` y `+ Cuenta` en el segundo nivel.
3. **Login y registro en español:** Formularios, enlaces, labels accesibles y banners de alerta 100% en español.
4. **Selector de meses:** Los 12 meses totalmente visibles sin recorte vertical ni horizontal.
5. **Dashboard KPI 2×2:** Cuadrícula de 4 tarjetas en móvil (Saldo Real, Capital Libre, Liquidez Proyectada, Deuda Total).
6. **Navegación inferior:** Persistente, accesible en zona del pulgar y respetando el safe area inferior.
7. **Modales:** Apertura y cierre fluidos sin alterar el viewport.

---

## 7. Archivos Modificados en este Pulido UX

### Archivos Modificados (Locales / Unstaged / Sin Commit):
- `src/app/core/config/auth-messages.config.ts` (Nuevo — Mensajes centralizados en español)
- `src/app/core/services/auth.service.ts` (Normalización de errores en español)
- `src/app/core/services/auth.service.spec.ts` (Aserciones en español)
- `src/app/features/app-shell/app-shell.component.html` (Reorganización de header para 2 niveles móviles)
- `src/app/features/app-shell/app-shell.component.scss` (Grid 2 niveles móvil, layout desktop y optimización <12 kB)
- `src/app/features/auth/login/login.component.html` (Traducción completa)
- `src/app/features/auth/login/login.component.ts` (Mensajes fallback en español)
- `src/app/features/auth/login/login.component.spec.ts` (Aserciones en español)
- `src/app/features/auth/signup/signup.component.html` (Traducción completa)
- `src/app/features/auth/signup/signup.component.ts` (Mensajes fallback en español)
- `src/app/features/auth/signup/signup.component.spec.ts` (Aserciones en español)
- `src/app/features/auth/forgot-password/forgot-password.component.html` (Traducción completa)
- `src/app/features/auth/forgot-password/forgot-password.component.ts` (Mensajes en español)
- `src/app/features/auth/forgot-password/forgot-password.component.spec.ts` (Aserciones en español)
- `src/app/features/auth/reset-password/reset-password.component.html` (Traducción completa)
- `src/app/features/auth/reset-password/reset-password.component.ts` (Mensajes en español)
- `src/app/features/auth/reset-password/reset-password.component.spec.ts` (Aserciones en español)
- `e2e/auth-mock.spec.ts` (Aserciones Playwright para español)
- `e2e/auth.spec.ts` (Aserciones Playwright para español)
- `e2e/capture-audit.spec.ts` (Prueba de captura de evidencias visuales)
- `docs/sprints/UX_01_PWA_PREPARATION.md` (Este informe actualizado)

---

## 8. Limitaciones Conocidas y Validación Manual Pendiente

1. **Pruebas en iPhone Físico (Validación Manual de Cierre):**
   - Se recomienda que el usuario abra la PWA en el iPhone real mediante `http://<IP-LOCAL>:4200` y confirme visualmente:
     - El nuevo header en 2 niveles sin ningún tipo de scroll horizontal residual.
     - La facilidad ergonómica para pulsar con el pulgar los botones de `+ Ingreso`, `+ Obligación` y `+ Cuenta` (44 px).
     - La apariencia limpia y profesional de la pantalla de login completamente en español.
2. **Estado Git:**
   - Conforme a las restricciones obligatorias, **ningún commit, push ni rebase ha sido ejecutado**.
   - Todos los cambios permanecen en el árbol de trabajo local a la espera de la autorización explícita para el checkpoint.
