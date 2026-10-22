# BRAVISO — Tu dinero, en perspectiva.

Implementación local para revisión del propietario · 22 de octubre de 2026.

El rebranding conserva la interfaz verde y crema aprobada, los encabezados editoriales, las tarjetas, la navegación y los temas. La revisión se realizó sobre el diseño existente en `edceb78`. No se realizaron commit, push ni despliegue durante el rebranding.

## A. Identidad visual

[Ver lámina de identidad](identidad.html) · [Abrir lámina PNG](identidad.png)

El isotipo es una B construida con dos planos geométricos unidos por un eje vertical. El plano inferior es ligeramente más amplio y ambos terminan hacia la derecha: estructura, equilibrio y dirección sin recurrir a monedas, bancos o gráficas. Los espacios interiores permiten reconocerlo en tamaños pequeños.

El nombre BRAVISO utiliza letras geométricas dibujadas como trazados SVG. No requiere archivos de fuentes, servicios externos ni imágenes remotas. La interfaz conserva DM Sans, DM Mono y los encabezados serif con Georgia del diseño aprobado; su carga existente no se modificó.

| Uso | Color |
| --- | --- |
| Verde de marca, versión clara | `#285444` |
| Fondo bosque de los iconos | `#173E35` |
| Versión oscura del logotipo | `#D4E5AA` |
| Isotipo de instalación sobre bosque | `#DCE7B1` |
| Fondo crema existente | `#F5F5EF` |
| Fondo oscuro existente | `#14251F` |

El componente Angular utiliza `--accent` y hereda la paleta existente. No se añadió una segunda arquitectura de estilos.

| Variante SVG | Fondo claro | Fondo oscuro | Monocromática |
| --- | --- | --- | --- |
| Horizontal | [Abrir](../../public/brand/braviso-horizontal-light.svg) | [Abrir](../../public/brand/braviso-horizontal-dark.svg) | [Abrir](../../public/brand/braviso-horizontal-mono.svg) |
| Compacta, apilada | [Abrir](../../public/brand/braviso-compact-light.svg) | [Abrir](../../public/brand/braviso-compact-dark.svg) | [Abrir](../../public/brand/braviso-compact-mono.svg) |
| Isotipo | [Abrir](../../public/brand/braviso-symbol-light.svg) | [Abrir](../../public/brand/braviso-symbol-dark.svg) | [Abrir](../../public/brand/braviso-symbol-mono.svg) |

Usar el isotipo en espacios estrechos. Mantener la proporción del SVG; no estirarlo. Las variantes para instalación reservan margen dentro de la zona central para el recorte de plataformas con iconos adaptables.

## B. Implementación

### Archivos creados

- `src/app/shared/brand/brand-shapes.ts`: trazados únicos para símbolo y letras.
- `src/app/shared/components/brand-logo/brand-logo.component.ts`: componente standalone reutilizable, versión horizontal o isotipo, con nombre accesible.
- `public/brand/braviso-{horizontal,compact,symbol}-{light,dark,mono}.svg`: nueve variantes vectoriales.
- `public/favicon.svg`, `public/icons/favicon-32.png` y `public/icons/icon-192-maskable.png`.
- `scripts/generate-brand-assets.mjs`: genera SVG, PNG, ICO y la lámina de identidad usando Playwright ya instalado.
- `scripts/collect-brand-evidence.mjs`: recopila las capturas de las pruebas visuales.
- `e2e/branding.spec.ts`: valida identidad, temas, manifiestos, rutas y tamaños de iconos.
- `docs/branding/identidad.html`, `identidad.png`, este informe y 32 capturas en `evidence/`.

### Archivos modificados

| Grupo | Archivos y propósito |
| --- | --- |
| Navegación | `src/app/features/app-shell/app-shell.component.{html,scss,ts}`: marca en sidebar y header, isotipo en sidebar compacto y navegación móvil, nombres accesibles al colapsar y color del navegador al alternar tema. |
| Autenticación | `src/app/features/auth/{login,signup,forgot-password,reset-password}/*.component.{html,ts}`: reemplazo de la marca e importación del componente, sin modificar métodos de autenticación. |
| Presentación de acceso | `src/app/features/auth/auth-story.component.ts` y `_auth-layout.scss`: marca y dimensiones del logo. |
| Estilos compartidos | `src/styles.scss`: ubicación global del enlace para saltar al contenido; el componente shell queda dentro de su presupuesto de estilos. |
| Ajuste responsive pendiente | `src/app/features/simulators/financial-simulators.component.scss`: columnas con `minmax(0, 1fr)` y controles acotados para evitar desbordamiento en 360 px. No cambia cálculos. |
| Limpieza | `src/app/features/{credits,credit-cards}/*.component.scss`: retirada de comentarios introducidos durante la etapa anterior. |
| Metadatos | `src/index.html`: título, descripción, favicon, nombre iOS y colores de navegador por tema. `public/404.html`: solo el título de marca. |
| Instalación | `public/manifest.webmanifest`, `public/manifest.github-pages.webmanifest`, `public-github-pages/manifest.webmanifest`: nombre, descripción, colores e iconos; `start_url` y `scope` conservados. |
| Iconos existentes | `public/favicon.ico`, `public/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png`: sustituidos por el isotipo. |
| Pruebas | `e2e/helpers/navigation.ts`: espera explícita a la aplicación antes de elegir controles móviles o desktop. `e2e/redesign.spec.ts`: marca, ambos temas, sidebar compacto y capturas. `e2e/github-pages-routing.spec.ts`: MIME SVG y comprobación de recursos de marca bajo el subdirectorio. |
| Presentación del proyecto | `README.md`: título BRAVISO. |

### Iconos entregados

| Archivo | Tamaño | Uso |
| --- | --- | --- |
| `public/favicon.svg` | Vectorial | Pestaña del navegador |
| `public/favicon.ico` | 32 × 32 | Compatibilidad de favicon |
| `public/icons/favicon-32.png` | 32 × 32 | Favicon PNG |
| `public/icons/apple-touch-icon.png` | 180 × 180 | Pantalla de inicio iOS |
| `public/icons/icon-192.png` | 192 × 192 | PWA |
| `public/icons/icon-512.png` | 512 × 512 | PWA |
| `public/icons/icon-192-maskable.png` | 192 × 192 | PWA adaptable |
| `public/icons/icon-512-maskable.png` | 512 × 512 | PWA adaptable |

No se añadieron dependencias npm. El nombre del repositorio y del paquete, las URLs de Supabase, las rutas, los modelos, servicios, cálculos, migraciones, políticas RLS y contratos permanecen sin cambios respecto al inicio del rebranding. La comprobación del diff de `src/app/core`, `supabase`, `src/environments`, `app.routes.ts`, `angular.json`, `package*.json` y `.github` no mostró modificaciones.

## C. Validación

| Verificación | Resultado |
| --- | --- |
| Build de producción | Aprobado: `npm.cmd run build`. |
| Build GitHub Pages | Aprobado: `npm.cmd run build -- --configuration github-pages`. |
| Unitarias | 18 archivos; **122/122 pruebas aprobadas**. |
| Flujos E2E y rediseño | **120/120 aprobadas**, Chromium en 360, 390, 430 y 1440 px. Incluyen acceso, recuperación, sesión, ingresos, obligaciones, pagos, créditos, compras y simulaciones con datos de prueba. |
| Marca y responsive final | **15/15 aprobadas**, Chromium en 360, 390, 430, 768 y 1440 px. Incluyen cuatro pantallas de autenticación en ambos temas, variantes SVG, dimensiones PNG, navegación compacta y límites de los componentes. |
| GitHub Pages | **10/10 aprobadas** contra el build servido mediante simulación local: restauración de rutas, fragmentos de recuperación, favicon y manifiesto/iconos bajo `/personal-finance/`. |
| Revisión visual | Lámina, acceso, dashboard, sidebar compacto, tarjetas y simuladores. Capturas claras y oscuras conservadas. |
| Referencias visibles antiguas | No quedan nombres de producto `personal.` ni `Personal Finance` en las superficies revisadas. Permanecen identificadores internos y texto genérico como «finanzas personales». |
| Diff | `git diff --check` aprobado. |

Los conteos corresponden a ejecuciones separadas; algunas pruebas de rediseño se repiten entre suites. Las pruebas funcionales usan autenticación simulada y datos demo locales, no cuentas ni pagos de producción.

### Fallos encontrados y límites

- La primera revisión responsive detectó desbordamiento del simulador en 360 px: corregido y vuelto a verificar.
- Las pruebas de navegación consultaban visibilidad antes de que la aplicación terminara de aparecer: se añadió una espera explícita; los flujos posteriores pasaron.
- Una comprobación inicial de marca confundía la frase genérica «bóveda personal.» con el antiguo logotipo. Se acotó a nombres de producto; las 15 pruebas finales pasaron.
- La captura inmediata tras cambiar de tema podía adelantarse a la actualización visual de los SVG. Las capturas finales esperan el color calculado y el repintado; las dos variantes son legibles.
- **Safari/WebKit pendiente:** la prueba no pudo iniciar porque falta `webkit-2359/Playwright.exe`. Se intentó descargar mediante `npx.cmd playwright install webkit`; los servidores de descarga agotaron el tiempo de espera. No se afirma validación Safari ni instalación en iPhone físico.
- **Advertencia de compilación:** bundle inicial de **559,24 kB** frente al umbral de aviso de 500 kB. Ambos builds finalizan correctamente. No se elevaron presupuestos; el aviso de tamaño del SCSS del shell quedó resuelto.
- La instalación PWA, los nombres/iconos previamente almacenados por iOS y el comportamiento del sitio publicado requieren comprobación en dispositivo tras un despliegue autorizado. No se desplegó esta versión.

## D. Evidencia visual

Las 32 capturas muestran datos ficticios del entorno demo. Los archivos de escritorio capturan la ventana y su panel con scroll interno; los móviles capturan la página completa.

| Pantalla | Claro | Oscuro |
| --- | --- | --- |
| Acceso, escritorio 1440 px | [Ver](evidence/desktop-1440-login-light.png) | [Ver](evidence/desktop-1440-login-dark.png) |
| Dashboard, escritorio 1440 px | [Ver](evidence/desktop-1440-dashboard-light.png) | [Ver](evidence/desktop-1440-dashboard-dark.png) |
| Dashboard, tablet 768 px | [Ver](evidence/tablet-768-dashboard-light.png) | [Ver](evidence/tablet-768-dashboard-dark.png) |
| Dashboard, móvil 360 px | [Ver](evidence/mobile-360-dashboard-light.png) | [Ver](evidence/mobile-360-dashboard-dark.png) |
| Dashboard, móvil 390 px | [Ver](evidence/mobile-390-dashboard-light.png) | [Ver](evidence/mobile-390-dashboard-dark.png) |
| Dashboard, móvil 430 px | [Ver](evidence/mobile-430-dashboard-light.png) | [Ver](evidence/mobile-430-dashboard-dark.png) |
| Acceso, móvil 390 px | [Ver](evidence/mobile-390-login-light.png) | [Ver](evidence/mobile-390-login-dark.png) |

[Sidebar compacto](evidence/desktop-1440-sidebar-compact.png) · [Tarjetas en 360 px](evidence/mobile-360-cards.png) · [Simulador en 360 px](evidence/mobile-360-simulators.png)

### Reproducir

```powershell
node scripts/generate-brand-assets.mjs
npm.cmd test -- --watch=false
npm.cmd run build
npx.cmd playwright test e2e/auth-mock.spec.ts e2e/redesign.spec.ts --project=desktop-1440 --project=mobile-360 --project=mobile-390 --project=mobile-430 --workers=4
npx.cmd playwright test e2e/branding.spec.ts e2e/redesign.spec.ts --project=desktop-1440 --project=mobile-360 --project=mobile-390 --project=mobile-430 --project=tablet-768 --workers=3
node scripts/collect-brand-evidence.mjs
npm.cmd run build -- --configuration github-pages
npx.cmd playwright test e2e/github-pages-routing.spec.ts --project=desktop-1440 --workers=2
```

La recopilación de capturas debe ejecutarse antes de otra suite que limpie `test-results`. Playwright requiere Chromium disponible; las pruebas de desarrollo utilizan el servidor Angular local configurado en el repositorio.
