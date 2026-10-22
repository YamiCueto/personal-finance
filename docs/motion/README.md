# BRAVISO — Motion Design System v1

Implementado el 22 de octubre de 2026. Listo para revisión local en http://127.0.0.1:4201. Sin commit ni push.

## Componentes y comportamiento

- Marca en las cuatro pantallas de autenticación: isotipo con opacidad y escala 0.96 → 1; nombre revelado progresivamente. Entrada única por montaje, sin bucles. Hover de escritorio de 1 px.
- Resumen: encabezado, cuatro KPI, métricas y paneles entran con desplazamiento de 8 px y escalonamiento de 50 ms. Los cambios de datos no vuelven a montar ni reproducen la entrada de las tarjetas.
- Saldo disponible, libre mensual, liquidez y deuda: interpolación visual de 600 ms. El formato sigue utilizando CurrencyPipe con COP, es-CO y dos decimales. Los lectores de pantalla reciben directamente el importe final mediante texto visualmente oculto; los fotogramas intermedios son decorativos.
- Progreso mensual: arco y porcentaje sincronizados durante 700 ms; nuevas metas interrumpen el recorrido anterior y parten del valor visual actual. El nombre accesible siempre contiene el porcentaje financiero real.
- Meses y navegación: cambios de superficie/color, indicadores activos mediante transform, feedback de presión y desplazamiento horizontal nativo.
- Sidebar: el cambio de geometría ocurre una vez; el contenido se acompaña mediante translateX y la navegación mediante opacidad. Se eliminó la transición continua de width. La envolvente recorta únicamente el desbordamiento horizontal temporal.
- Menú móvil y ocho modales financieros: entrada de fondo/panel de 220 ms, salida de 180 ms; Angular conserva el nodo durante la salida y lo retira al terminar. Las animaciones no añaden bloqueos de scroll ni modifican la gestión existente del teclado.
- Tema: transición de superficies, bordes, texto e iconos de 260 ms, habilitada exclusivamente al pulsar el control. La clase temporal se retira y su temporizador se limpia al destruir el componente. La inicialización y el mecanismo actual de elección de tema permanecen intactos.
- Formularios, botones y confirmaciones: foco conservado, hover de 180 ms, presión de 120 ms, errores y confirmaciones con entrada discreta. El pago muestra éxito después de resolver la operación existente.

## Tokens

| Variable | Valor |
|---|---|
| `--motion-micro` | 120 ms |
| `--motion-hover` | 180 ms |
| `--motion-state` | 220 ms |
| `--motion-entry` | 320 ms |
| `--motion-view` | 260 ms |
| `--motion-number` | 600 ms |
| `--motion-indicator` | 700 ms |
| `--motion-brand` | 800 ms |
| `--motion-step` | 50 ms |
| `--ease-out` | cubic-bezier(.2,.8,.2,1) |
| `--ease-in` | cubic-bezier(.4,0,1,1) |
| `--ease-state` | cubic-bezier(.4,0,.2,1) |

Los valores JS leen las duraciones desde CSS. El conteo usa una curva cúbica de salida. `prefers-reduced-motion` desactiva animaciones y transiciones CSS; la directiva muestra el valor final inmediatamente y cancela el conteo si la preferencia cambia durante su ejecución.

## Decisiones y alcance

CSS para entradas e interacciones, `animate.enter` / `animate.leave` nativos de Angular para desmontaje, Web Animations para el sidebar y requestAnimationFrame cancelable para los números. Sin dependencias nuevas, intervalos permanentes ni will-change global. Los listeners, fotogramas, temporizadores y animaciones del sidebar se limpian al destruir sus propietarios.

Se conservaron paleta, geometría del logo, composición, cálculos, servicios, esquemas, RLS y configuración de GitHub Pages. Las animaciones consumen las señales financieras existentes y no escriben en ellas.

## Archivos

- `src/app/shared/motion/_motion.scss`: tokens, keyframes y reglas reutilizables.
- `src/app/shared/motion/motion-value.directive.ts`: interpolación visual cancelable.
- `src/app/shared/motion/motion-value.directive.spec.ts`: metas interrumpidas, negativos, movimiento reducido y limpieza.
- `src/styles.scss`: inclusión del sistema global.
- `src/app/shared/components/brand-logo/brand-logo.component.ts`: opción de entrada y partes SVG identificables.
- `src/app/features/auth/{login,signup,forgot-password,reset-password}/*.component.html`: activación de entrada de marca.
- `src/app/features/app-shell/app-shell.component.{ts,html,scss}`: KPI, progreso, overlays, tema y sidebar.
- `src/app/features/app-shell/app-shell.component.spec.ts`: confirmación pendiente hasta éxito y bloqueo de envío duplicado.
- `src/app/features/credits/credits-manager.component.html` y `src/app/features/credit-cards/credit-cards-manager.component.html`: entrada/salida de modales.
- `e2e/motion.spec.ts`: escenarios de movimiento normal/reducido, importes exactos, pagos, temas, meses y navegación.
- `docs/motion/`: informe y evidencia.

## Validación

- `npm.cmd run build`: aprobado. Bundle inicial **572.15 kB**, advertencia sobre presupuesto de 500 kB; no se aumentaron presupuestos.
- `npm.cmd test -- --watch=false`: **126 pruebas aprobadas, 19 archivos**. Incluye interrupción del conteo, igualdad exacta con la meta, negativos, cambio de preferencia, cancelación de recursos y confirmación de pago únicamente después del éxito, con un solo envío.
- Playwright: **128/128 aprobadas**, suites `auth-mock`, `redesign` y `motion`; Chromium en **360, 390, 430 y 1440 px**. Ocho casos específicos de motion cubren modo normal y reducido, ambos temas, pago parcial, ausencia de repetición de entrada, cierre efectivo de overlays y valores finales del anillo/KPI.
- La regresión recorre créditos, tarjetas, simuladores, ingresos, cuentas y obligaciones, y comprueba desbordamientos.
- `git diff --check`: aprobado.
- Inspección visual directa de capturas: móvil oscuro y escritorio claro, sin recortes de KPI ni desbordamientos del contenido.

El servidor anterior de 4200 servía una compilación intermedia. Se descartó esa ejecución como validación final y se repitió la suite completa contra una instancia nueva en 4201. Angular necesitó ejecución fuera del sandbox por restricciones de lectura del compilador.

Para reproducir con el servidor habitual actualizado: `npx.cmd playwright test e2e/motion.spec.ts e2e/redesign.spec.ts e2e/auth-mock.spec.ts --project=mobile-360 --project=mobile-390 --project=mobile-430 --project=desktop-1440 --workers=4`.

## Evidencia

[Galería de capturas y videos](evidence.html): 16 PNG y 8 WebM con datos ficticios. Las capturas muestran estados finales; los videos permiten revisar el recorrido temporal.

- [Video móvil 390 px](evidence/mobile-390-standard-video.webm)
- [Video escritorio](evidence/desktop-1440-standard-video.webm)
- [Móvil oscuro](evidence/mobile-390-standard-motion-dark.png)
- [Escritorio claro](evidence/desktop-1440-standard-motion-light.png)

## Límites

No se validó Safari real, Chrome sobre iOS ni PWA instalada en un dispositivo. El ejecutable WebKit no está instalado en este entorno; la emulación de tamaños Chromium no sustituye estas pruebas. Las pruebas usan autenticación simulada y el escenario financiero local, no operaciones de producción. La advertencia del bundle sigue pendiente. El anillo con conic-gradient requiere repintado de su área durante 700 ms; no se realizó un perfil de rendimiento en hardware móvil real.
