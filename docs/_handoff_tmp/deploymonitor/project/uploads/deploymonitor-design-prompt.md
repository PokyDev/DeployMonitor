# DeployMonitor — Prompt para Claude Design

---

## IDENTIDAD Y CONCEPTO

Diseña la interfaz completa de **DeployMonitor**, una aplicación de escritorio nativa (Tauri V2 + React) para monitoreo y automatización de instancias SSH en la nube. La identidad visual es **"Terminal Refinada"**: fusiona la densidad técnica de una terminal SSH con la elegancia de una herramienta DevOps premium. El usuario objetivo es un desarrollador o profesional DevOps que valora eficiencia, precisión y control sobre cualquier decoración innecesaria.

**Resoluciones objetivo**: diseñar únicamente para `700×600px` (ventana compacta) y `1920×1080px` (pantalla completa).

---

## LOGO / BRANDING

El logotipo es una composición fija:

- **Ícono (mascotIcon)**: Pato blanco cartoon con corona dorada, estilo ilustración 2D limpia sobre fondo oscuro. Conocido como "DuckyShell". El pato tiene expresión seria/neutral con corona metálica brillante amarilla. Úsalo como asset visual ya definido.
- **Texto del nombre**: `DeployMonitor` renderizado en la fuente `'Stack Sans Notch', 'IBM Plex Mono', monospace` con peso alto (Bold/ExtraBold). `Deploy` en color blanco `#FFFFFF`, `Monitor` en el dorado característico `#D4AF37`. Sin espacios extra, como una sola palabra bicolor.
- En la **landing page**, el logo va en formato vertical (ícono arriba, texto abajo).
- En la **titlebar del dashboard**, va en horizontal (ícono pequeño izquierda + texto derecha).

---

## SISTEMA DE COLOR

```css
/* Tema Oscuro (modo por defecto) */
--bg-base:       #111111;
--bg-surface:    #1A1A1A;
--bg-elevated:   #222222;
--bg-overlay:    #2A2A2A;
--border-subtle: #2E2E2E;
--border-default:#3D3D3D;
--border-strong: #555555;
--text-primary:  #F0F0F0;
--text-secondary:#9A9A9A;
--text-muted:    #555555;
--text-code:     #D4AF37;
--color-gold:    #D4AF37;
--color-ink:     #111111;

/* Semáforo macOS-style de la titlebar */
--traffic-red:    #FF6B00;
--traffic-yellow: #FFC857;
--traffic-green:  #E6D12C;

/* Estados semánticos */
--color-success:       #2D7A4F;
--color-success-light: #3D9E68;
--color-error:         #9B2335;
--color-error-light:   #C4394D;
--color-warning:       #8B6914;
--color-running:       #D4AF37;
--color-idle:          #3D3D3D;
--color-info-light:    #2874A6;

/* Tema Claro */
--bg-base-light:       #F5F4F0;
--bg-surface-light:    #FFFFFF;
--bg-elevated-light:   #FAFAF8;
--bg-overlay-light:    #F0EFE9;
--border-subtle-light: #E8E6DF;
--border-default-light:#D4D0C4;
--text-primary-light:  #111111;
--text-secondary-light:#5A5A5A;
--text-code-light:     #8B6914;
```

**Regla de oro**: `#D4AF37` es el único color "caliente" del sistema. Se usa disciplinadamente para: CTA primarios, indicador de conexión activa, estado "corriendo", ítem seleccionado, borde de notificaciones, texto de rutas y comandos en terminal.

---

## TIPOGRAFÍA

| Rol | Fuente | Peso | Uso |
|---|---|---|---|
| Logo / Títulos | `'Stack Sans Notch', 'IBM Plex Mono', monospace` | Bold / ExtraBold | Nombre de la app, headings de sección |
| UI General | `'Geist', sans-serif` | 400 / 500 / 600 | Cuerpo, labels, botones, badges |
| Código / Terminal | `'JetBrains Mono', monospace` | 400 / 700 | Rutas, connection strings, outputs, editor |

- Labels de botones y badges: `Geist` SemiBold 600, UPPERCASE, `letter-spacing: 0.06em`, `font-size: 11px`
- Headings de sección: `IBM Plex Mono` Medium 500, `letter-spacing: -0.02em`
- Todo lo técnico (rutas `.pem`, cadenas SSH, outputs de terminal): `JetBrains Mono`

---

## ESTRUCTURA DE LAYOUT — COMPONENTES SIEMPRE PRESENTES

### 1. TITLEBAR (siempre visible, en ambas pestañas)

Barra superior personalizada de **36px** de alto. Fondo `--bg-surface` con borde inferior `--border-subtle`. Región draggable completa (excepto botones interactivos).

**Esquina izquierda** — Semáforo estilo macOS:
- Tres botones circulares de ~12px, sin texto, solo color:
  - Rojo-naranja: `#FF6B00`
  - Amarillo: `#FFC857`
  - Amarillo-verde: `#E6D12C`
- Espaciado entre botones: 8px
- Los íconos dentro de cada botón son SVG inline que aparecen en hover (×, −, ⤢)
- Función futura (decorativos en el diseño, pero con apariencia interactiva)

**Centro** — En la landing: vacío o tagline mínimo. En el dashboard: logo horizontal (ícono 16×16px + texto `DeployMonitor` bicolor).

**Esquina derecha** — Tres botones de control de ventana con íconos SVG:
- 🌙 Luna (tema oscuro activo) / ☀️ Sol (tema claro activo) — toggle de tema
- − Minimizar (SVG: línea horizontal)
- ⃞ Maximizar/restaurar (SVG: cuadrado o dos cuadrados superpuestos)
- × Cerrar (SVG: X)
- Fondo de botones: transparente con hover `--bg-overlay`, color de íconos: `--text-secondary`

---

### 2. PESTAÑA DE LANDING (pantalla de aterrizaje)

Layout centrado vertical y horizontalmente sobre fondo `--bg-base`. Decoración de fondo sutil: patrón de grid técnico muy fino (líneas de 1px en `--border-subtle` con opacidad 40%) que evoca papel de ingeniería.

**Contenido (de arriba a abajo):**

1. **Logo vertical**: Ícono del pato con corona (~100×100px) + texto `DeployMonitor` bicolor debajo. Efecto de glow suave dorado alrededor del pato (box-shadow o filter radial en amarillo con baja opacidad).

2. **Tagline**: `"Monitorea y automatiza tus instancias en tiempo real"` en `Geist` Regular, `--text-secondary`, tamaño ~14px. Centrado.

3. **Tarjetas de atajos de teclado** — Grid 2×2 con las 4 acciones principales:
   - `CONECTAR INSTANCIA` — `Ctrl + Shift + C` — ícono SVG de terminal (`>_`)
   - `MONITOREO EN VIVO` — `Ctrl + M` — ícono SVG de actividad/ondas (`~`)
   - `EJECUTAR SCRIPT` — `Ctrl + Enter` — ícono SVG de carpeta/play
   - `CONFIGURACIÓN` — `Ctrl + ,` — ícono SVG de engranaje
   
   Cada tarjeta: fondo `--bg-surface`, borde `--border-default`, border-radius 6px, padding 16px. El nombre de la acción en UPPERCASE `Geist` 600 11px `--text-secondary`. Los atajos de teclado como "key chips": fondos `--bg-elevated`, borde `--border-default`, border-radius 3px, `JetBrains Mono` 11px, padding 4px 8px. Ícono SVG lineal en la esquina superior derecha de cada tarjeta en `--text-muted`.

4. **Texto de entrada**: `USA ENTER PARA ACCEDER AL DASHBOARD` en `Geist` SemiBold 600 UPPERCASE ~11px `--text-muted` con `letter-spacing: 0.1em`. **Animación de opacidad en ciclo infinito**: `opacity` oscila suavemente entre 0.3 y 1.0 en un ciclo de ~2 segundos (`ease-in-out`), para que el usuario lo note y entienda que debe presionar Enter. Esta es la única indicación de interacción y debe ser claramente perceptible.

---

### 3. PESTAÑA DE DASHBOARD (área principal post-acceso)

Layout de 3 zonas bajo la titlebar:

```
┌──────────┬────────────────────────────────────────┐
│          │                                        │
│ SIDEBAR  │     ÁREA DE CONTENIDO                  │
│ (220px   │     (sección activa)                   │
│ / 56px   │                                        │
│ colaps.) │                                        │
│          ├────────────────────────────────────────┤
│          │  TERMINAL (minimizada por defecto)     │
└──────────┴────────────────────────────────────────┘
```

#### SIDEBAR (navegación lateral izquierda)

Fondo `--bg-surface`, borde derecho `--border-subtle`. Colapsable/expandible con transición suave `width 250ms ease`.

**Estado expandido (220px)**: Ícono + texto de cada ítem.
**Estado colapsado (56px)**: Solo íconos, tooltip en hover con el nombre.

Ítems de navegación (íconos SVG lineales, stroke-width 1.5, 18px):
- 🏠 `Dashboard` — ícono home — ruta principal
- 📊 `Monitoreo` — ícono de onda/actividad — con badge de estado de conexión
- 🗒️ `Scripts` — ícono de terminal/código — con badge numérico si hay scripts corriendo
- 🕐 `Historial` — ícono de reloj/lista — historial de ejecuciones
- ⚙️ `Configuración` — ícono de engranaje — siempre al fondo del sidebar

**Ítem activo**: Borde izquierdo 2px `--color-gold`, fondo `--bg-overlay`, texto `--text-primary`. El borde izquierdo aparece con animación `scaleY(0) → scaleY(1)` al cambiar de sección.

**Indicador de estado de conexión** (parte inferior, sobre Configuración):
- Badge circular 8px
- Gold pulsante = conectado (animación `pulse` de opacidad)
- Gris `--color-idle` = desconectado
- Rojo `--color-error-light` = error

**Toggle collapse** en la parte superior derecha del sidebar: botón ghost con SVG de flechas (← colapsar / → expandir).

---

#### SECCIÓN: OVERVIEW / DASHBOARD (sección por defecto al entrar)

Contiene:

**Panel de Conexión SSH** (card principal, siempre visible en esta sección):
- Header: `🔑 Conexión SSH` en `IBM Plex Mono` 500 + badge de estado a la derecha (`● SIN VERIFICAR` / `● CONECTADO` / `● ERROR`)
- Campo `CLAVE PRIVADA (.PEM)`: Input con botón `[ 📁 EXPLORAR ]` a la derecha. Al seleccionar archivo, muestra la ruta en `JetBrains Mono`. Label en UPPERCASE `Geist` 600 11px `--text-secondary`.
- Campo `CADENA DE CONEXIÓN`: Input en `JetBrains Mono` con ícono de editar a la derecha. Formato esperado: `usuario@host`. Placeholder: `ubuntu@ec2-xxx.compute-1.amazonaws.com`
- Botones de acción:
  - `⚡ CONECTAR` — botón primario (fondo `--color-gold`, texto `--color-ink`, UPPERCASE Geist 600)
  - `📡 PROBAR CONEXIÓN` — botón secundario (borde `--border-default`, texto `--text-primary`)

**Grid de Métricas del Sistema** (2×2, con label `MÉTRICAS DEL SISTEMA` + sublabel `datos de muestra` en `--text-muted`):

Cada card de métrica tiene:
- Label en UPPERCASE `Geist` 600 11px `--text-secondary` con ícono SVG a la izquierda
- Badge de estado en esquina superior derecha: `NORMAL` (verde), `WARNING` (amarillo), `CRITICAL` (rojo). Fondo semitransparente del color, texto UPPERCASE 10px.
- Valor principal en `IBM Plex Mono` Medium, tamaño grande (~26px), `--text-primary`
- Sparkline/miniatura: gráfica de línea con trazo `--color-gold` sobre fondo `rgba(212,175,55,0.06)`, últimos N puntos de datos, sin ejes ni labels
- Barra de progreso horizontal fina (4px) bajo la gráfica en `--color-gold` con track `--border-subtle`
- Subtexto de detalle en `--text-secondary` pequeño (ej: `de 7.8 GB`, `1 min`)

Cards:
- **CPU** — ícono de chip — valor en `%`
- **MEMORIA** — ícono de RAM — valor en `%` + detalle `de X GB`
- **DISCO** — ícono de disco — valor en `%` + detalle `de X GB`
- **LOAD AVG** — ícono de actividad — valor numérico + detalle `1 min`

---

#### SECCIÓN: MONITOR (monitoreo extendido)

Igual que el Dashboard pero con gráficas expandidas full-width. Cada métrica tiene su propia card con:
- Gráfica de línea histórica completa (últimos 30 min)
- Selector de rango temporal: `30min | 1h | 6h | 24h` como tabs/pills en `Geist` 600 UPPERCASE
- Eje X con timestamps, eje Y con valores
- Trazo dorado sobre fondo oscuro con área rellena semi-transparente (gradiente vertical `rgba(212,175,55,0.15)` → `transparent`)
- Load Average muestra 3 valores: 1min, 5min, 15min como líneas diferenciadas

---

#### SECCIÓN: SCRIPTS (editor tipo IDE)

Layout dividido en dos paneles:

**Panel izquierdo (~280px)** — Lista de scripts:
- Botón `+ NUEVO SCRIPT` en la parte superior (botón secundario full-width)
- Lista de ítems, cada uno con:
  - Ícono de tipo de archivo (`.sh` → ícono de terminal)
  - Nombre del script en `Geist` Medium
  - Badge de tipo: `SYNC` / `CUSTOM` (pill pequeño)
  - Timestamp de última ejecución en `--text-muted` `JetBrains Mono` 11px
  - Indicador de estado de última ejecución: punto de color (verde/rojo/gris)
- Ítem seleccionado: borde izquierdo `--color-gold`, fondo `--bg-overlay`
- Hover: aparecen íconos fantasma de `Editar` y `Eliminar`

**Panel derecho** — Editor de código estilo **Codex / VS Code dark**:
- Fondo del editor: `#0D0D0D` (más oscuro que el resto de la UI)
- Header: nombre del archivo + tabs de archivos abiertos en la parte superior (estilo VS Code)
- Numeración de líneas en columna izquierda: `--text-muted`, `JetBrains Mono` 12px, ancho fijo 40px
- Área de código: `JetBrains Mono` 13px, `--text-primary`
- Highlight de sintaxis básico para `.sh`:
  - Keywords (`#!/bin/bash`, `echo`, `if`, `for`, `do`, `done`, `fi`) → `#D4AF37` (gold)
  - Strings (`"texto"`) → `#3D9E68` (verde)
  - Comentarios (`# comentario`) → `#555555` (muted)
  - Variables (`$VAR`) → `#2874A6` (azul info)
- Barra de acciones bajo el editor:
  - `[ GUARDAR ]` — botón secundario
  - `[ ⚡ EJECUTAR ]` — botón primario gold
  - `[ ✕ CANCELAR ]` — solo visible durante ejecución, botón destructivo
- Durante ejecución: botón "Ejecutar" cambia a `EJECUTANDO...` con animación de pulso en el borde

---

#### SECCIÓN: HISTORIAL

Lista paginada de ejecuciones pasadas de scripts. Cada fila:
- Nombre del script en `Geist` Medium
- Instancia objetivo en `JetBrains Mono` `--text-code`
- Estado con badge: `ÉXITO` (verde) / `ERROR` (rojo) / `CANCELADO` (gris) / `CORRIENDO` (gold pulsante)
- Duración: `JetBrains Mono` `--text-secondary`
- Timestamp: `JetBrains Mono` `--text-muted`
- Al hover: borde izquierdo `--color-gold` + botón ghost `Ver detalle` a la derecha

---

#### SECCIÓN: CONFIGURACIÓN

Secciones con separadores:

**Apariencia**:
- Toggle `TEMA`: tres opciones con íconos SVG — `🌑 OSCURO` / `☀️ CLARO` / `💻 SISTEMA`
- El toggle activo tiene fondo `--color-gold` texto `--color-ink`

**Conexión SSH** (resumen + enlace):
- Muestra el host configurado en `JetBrains Mono` o `"No configurada"` en `--text-muted`
- Botón `IR AL DASHBOARD` para volver a configurar

**Cuenta**:
- Nombre de usuario en `Geist` Medium
- Botón `CERRAR SESIÓN` (destructivo)
- Botón `CAMBIAR CONTRASEÑA` (secundario)

**Acerca de**:
- Versión de la app: `v0.1.0` en `JetBrains Mono`
- Stack: `Tauri V2 · React · Rust` en `--text-muted`

---

### 4. TERMINAL (panel inferior colapsable)

Siempre presente en el dashboard, **minimizada por defecto** — solo su header (40px) es visible en la parte inferior.

**Header de terminal**:
- Texto `>_ TERMINAL` en `Geist` 600 UPPERCASE `--text-secondary` 11px, ícono SVG de `>_` a la izquierda
- Badge `ACTIVO` en verde cuando hay una sesión SSH activa
- Botón ghost de expandir/colapsar (SVG de flecha ↑ / ↓) en la esquina derecha
- Botón ghost de limpiar terminal (SVG de basurero) a la izquierda del expansor
- Separador horizontal `--border-default` en la parte superior del header

**Cuerpo de terminal (cuando está expandida)**:
- Fondo: `#0D0D0D` — **siempre oscuro, independientemente del tema activo**
- Fuente: `JetBrains Mono` 13px
- El path del usuario/prompt usa `--color-gold` → `ubuntu@ec2-xxx:~$` en dorado
- Outputs normales (stdout) en `#D4D0C4` (blanco cálido)
- Errores (stderr) en `--color-error-light`
- Líneas de sistema/info en `--color-info-light`
- Éxito en `--color-success-light`
- Scrollbar custom: 4px, color `--border-default`, hover `--border-strong`
- Altura de la terminal expandida: animada con `transition: height 250ms ease`

---

## ANIMACIONES Y MICROINTERACCIONES

- **Hover en sidebar**: El borde izquierdo gold aparece con `scaleY(0) → scaleY(1)`, transform-origin bottom. `150ms ease`.
- **Botón primario**: `scale(0.97)` en active, `brightness(1.1)` + `box-shadow: 0 2px 8px rgba(212,175,55,0.3)` en hover.
- **Cambio de tema**: `transition: background-color 200ms, color 200ms` en todos los tokens CSS.
- **Colapsar/expandir terminal**: `height` animado `250ms cubic-bezier(0.16, 1, 0.3, 1)`.
- **Colapsar/expandir sidebar**: `width` animado `250ms cubic-bezier(0.16, 1, 0.3, 1)`.
- **Output de terminal**: Cada línea entra con `translateY(4px) → 0` + `opacity 0 → 1`, `100ms` staggered.
- **Valores de métricas**: Al actualizarse, hacen un counter animation suave o flip numérico.
- **Badge de conexión activa**: Animación de pulso continuo `pulse` sobre el badge gold.
- **Texto "USA ENTER PARA CONTINUAR"** en la landing: ciclo infinito de opacidad `0.3 ↔ 1.0`, `2s ease-in-out`.
- **Conexión SSH exitosa**: Flash verde en el borde del panel de conexión + badge gold aparece con fade-in.
- **Script ejecutándose**: Pulso en el borde del botón "EJECUTAR" → cambia a "EJECUTANDO..." con border animado.
- Respetar `prefers-reduced-motion` — fallback estático para todas las animaciones.

---

## REFERENCIA VISUAL DEL DISEÑO ACTUAL

El diseño ya desarrollado muestra:
- Ventana de escritorio con borde redondeado y botones de ventana en esquina superior izquierda (semáforo naranja-amarillo-amarillo/verde)
- Barra superior derecha con toggle de tema oscuro/claro (ícono luna), botones minimizar/maximizar/cerrar en SVG
- Landing (splash screen): Fondo negro profundo `#0D0D0D`, logo del pato con glow dorado, nombre bicolor, tagline en gris, grid 2×2 de tarjetas de atajos, texto de Enter parpadeante
- Dashboard: Sidebar oscura con íconos lineales, sección "Conexión SSH" con inputs, dos botones de acción (gold + secundario), grid 2×2 de métricas con sparklines doradas y badges de estado
- Terminal colapsada en la parte inferior con badge "ACTIVO" en verde

Mantén EXACTAMENTE esta estética: oscura, industrial-refinada, dorado como único acento, tipografía monoespaciada donde todo es técnico, sin elementos decorativos innecesarios.

---

## RESTRICCIONES FINALES

1. **Solo dos pestañas/vistas**: Landing Page y Dashboard (con sus sub-secciones en el sidebar).
2. **Resoluciones**: Solo `700×600px` y `1920×1080px`.
3. **Sin elementos decorativos vacuos**: Cada pixel debe justificarse funcionalmente.
4. **Terminal siempre oscura**: `#0D0D0D` en ambos temas.
5. **Íconos**: Solo SVG lineales, stroke-width 1.5, de Lucide Icons. Sin íconos filled.
6. **Interactividad real**: El sidebar debe colapsar/expandir. La terminal debe expandir/colapsar. El toggle de tema debe cambiar el CSS. El texto de Enter debe parpadear.
7. **Paleta estricta**: No usar ningún color que no esté definido en el sistema de tokens. El dorado es el único acento.
8. **Layout funcional**: El diseño debe responder a las dos resoluciones objetivo sin elementos rotos.
