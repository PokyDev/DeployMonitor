# Manual técnico: Terminal de DeployMonitor

> Estado actual: implementado el modo **`local`** (shell del sistema vía PTY).
> El modo **`ssh`** (PTY remoto vía `russh`) está documentado en `docs/spec-terminal.md`
> pero todavía no existe en `src-tauri/src/` — este manual describe lo que
> realmente está construido hoy, no el plan completo.

---

## 1. Visión general — ¿qué piezas intervienen?

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React/TS, WebView)                                     │
│                                                                   │
│   terminal.tsx                                                    │
│     ├── xterm.js  (Terminal + FitAddon)  ← renderiza, captura     │
│     │                                       teclado, scrollback   │
│     └── use-terminal-store.ts (Zustand)  ← invoke()/listen()      │
│                                                                   │
└───────────────────────────────┬────────────────────────────────┘
                                  │ invoke("pty_start"/"pty_write"/
                                  │        "pty_resize"/"pty_stop")
                                  │ listen("pty:data")
┌───────────────────────────────▼────────────────────────────────┐
│  Backend (Rust, proceso nativo de Tauri)                          │
│                                                                   │
│   commands/pty.rs   ← controladores finos (validan, delegan)      │
│     │                                                             │
│   services/pty_service.rs                                         │
│     ├── portable-pty  → abre un PTY real y lanza el shell del OS  │
│     └── std::thread::spawn → hilo lector dedicado (bloqueante)    │
│                                                                   │
│   tokio  ← runtime async que sostiene los `async fn` de Tauri     │
│            y de sqlx (no interviene en el bucle de lectura del    │
│            PTY, que es un hilo de OS aparte)                      │
│                                                                   │
└────────────────────────────────────────────────────────────────┘
```

Cuatro piezas hacen el trabajo pesado:

| Pieza | Capa | Rol en una frase |
|---|---|---|
| **`portable-pty`** | Rust (backend) | Abre un pseudo-terminal real y lanza el shell del sistema operativo dentro de él. |
| **`tokio`** | Rust (backend) | Runtime asíncrono que ejecuta los comandos `async` de Tauri y las consultas de `sqlx`. |
| **`xterm.js`** | TS (frontend) | Emulador de terminal VT100/VT220 maduro: dibuja la pantalla, interpreta secuencias ANSI, captura el teclado. |
| **Zustand store** | TS (frontend) | Pega ambos mundos: registra el listener de eventos y expone `start/write/resize/stop`. |

---

## 2. `portable-pty` — ¿qué hace exactamente?

**Ubicación:** `src-tauri/src/services/pty_service.rs`, crate `portable-pty = "0.9.0"`.

Un *pseudo-terminal* (PTY) es la abstracción que necesita cualquier programa
interactivo (`bash`, `pwsh`, `vim`, `htop`...) para creer que está hablando con
una terminal física: necesita un par maestro/esclavo (`master`/`slave`), un
tamaño en columnas×filas, y un canal de lectura/escritura de bytes crudos.

`portable-pty` es la capa que abstrae esto entre Windows (ConPTY), macOS y
Linux (pty de POSIX) con la misma API. Lo que hace `pty_service.rs` con él:

1. **`detect_shell()`** — decide qué shell lanzar: `pwsh.exe` → `powershell.exe`
   → `cmd.exe` en Windows, o `$SHELL`/`/bin/bash` en Unix.
2. **`spawn()`** — abre el par PTY (`pty_system.openpty(PtySize { cols, rows, .. })`),
   lanza el shell detectado como proceso hijo dentro del lado *slave*, y se
   queda con:
   - `master`: el extremo que la app controla (debe mantenerse vivo todo el
     tiempo o el PTY se cierra).
   - `writer`: para enviar bytes *al* shell (lo que el usuario tipea).
   - un hilo de OS dedicado que **lee** del PTY en bucle bloqueante.
3. **`write()`** — escribe bytes crudos en el `writer` (cada tecla, cada pegado,
   cada secuencia de control que xterm.js genera).
4. **`resize()`** — `master.resize(PtySize { cols, rows, .. })`. Le dice al
   shell "tu terminal ahora mide X×Y", para que `vim`/`htop`/etc. redibujen
   correctamente. Esto es lo que conecta con `FitAddon` del frontend.
5. **`kill()`** — mata el proceso hijo del shell al cerrar la sesión.

### El "handshake" de ConPTY (Windows)

Hay un detalle no obvio: en Windows, ConPTY (la implementación moderna de PTY)
**bloquea toda la sesión** hasta recibir una respuesta a una *Cursor Position
Report* (`\x1b[6n`) que el shell envía al arrancar. `pty_service.rs` detecta
esa secuencia en el primer chunk leído y responde sintéticamente
(`\x1b[1;1R`) — sin esto, PowerShell se queda colgado sin mostrar el prompt.

También es el momento en que se inyecta el **prompt dorado** (`inject_prompt`):
para PowerShell se difiere hasta después de este handshake porque escribir
antes haría que ConPTY "se coma" el comando como parte del escaneo del CPR.

### ¿Por qué un hilo de OS y no una tarea de tokio?

`reader.read(&mut buf)` de `portable-pty` es una llamada **bloqueante** del
sistema operativo. Ejecutarla dentro de una tarea async de tokio congelaría
ese hilo del runtime. Por eso `spawn_reader_thread` usa
`std::thread::spawn` — un hilo de OS normal, fuera del pool de tokio — que
hace `app.emit("pty:data", chunk)` cada vez que llegan bytes nuevos.

---

## 3. `tokio` — ¿qué hace exactamente?

**Ubicación:** declarado en `Cargo.toml` (`tokio = { version = "1.52.3", features = ["full"] }`),
usado de forma *implícita* por Tauri y por `sqlx`.

Tokio es el **runtime asíncrono** de Rust: el motor que ejecuta funciones
`async fn` (tareas que pueden "pausarse" mientras esperan I/O sin bloquear un
hilo). En este proyecto, tokio **no participa directamente en el bucle de
lectura del PTY** (eso es un hilo de OS aparte, ver arriba). Su rol es:

- **Sostener los comandos Tauri.** Todo comando está marcado `async fn`
  (`pty_start`, `pty_write`, `pty_resize`, `pty_stop`...). Tauri necesita un
  runtime async para poder ejecutarlos — ese runtime es tokio, inicializado
  automáticamente por `tauri::Builder`.
- **Sostener `sqlx`** (cuando se implemente la persistencia SQLite —
  `sqlx` con `runtime-tokio` necesita tokio para sus consultas async).
- **Futuro:** cuando se implemente el modo `ssh` (`russh`), las conexiones SSH
  sí correrán como tareas de tokio (a diferencia del PTY local, `russh` está
  diseñado para async I/O sobre sockets, no bloqueante).

En resumen: hoy, para la terminal **local**, tokio es la "tubería" que
permite que `invoke("pty_write", ...)` desde el frontend llegue a una función
Rust y vuelva una respuesta — pero el trabajo pesado de leer el PTY ocurre en
un hilo de OS clásico, no en una tarea de tokio.

---

## 4. xterm.js — ¿qué es y qué reemplazó?

### 4.1 Qué es

[`@xterm/xterm`](https://xtermjs.org/) es la misma librería que usa
**Visual Studio Code, Hyper y Theia** para su terminal integrada: un emulador
de terminal **VT100/VT220** completo, escrito en JS/DOM puro (sin bindings
nativos), que:

- Mantiene su propio **buffer de pantalla** (grid de celdas: carácter + estilo).
- Interpreta **todas** las secuencias de escape ANSI/VT: movimiento de cursor,
  borrado de línea/pantalla, **pantalla alternativa** (*alt-screen buffer*,
  la que usan `vim`, `htop`, `less`, `nano`, `top`...), scroll regions, etc.
- Captura el teclado y traduce automáticamente flechas, `Ctrl+<letra>`,
  teclas de función, etc. a las secuencias de bytes correctas (`term.onData`).
- Aplica colores vía un objeto `ITheme` (mapeo SGR → color).

En `terminal.tsx`, una instancia de `XTerm` + `FitAddon` se monta sobre un
`<div>` (`term.open(container)`), y:

```ts
term.onData((data) => useTerminalStore.getState().write(data)); // teclado → PTY
listen('pty:data', (e) => term.write(e.payload));                 // PTY → pantalla
```

`FitAddon.fit()` mide el contenedor y calcula cuántas columnas/filas entran,
y ese tamaño se le pasa al backend vía `pty_resize` para que el shell sepa su
tamaño real.

### 4.2 Qué había **antes** de xterm.js (y por qué se cambió)

Antes existía un **renderer ANSI casero** (`src/lib/ansi-to-html.ts`, ya
eliminado) que convertía el stream crudo del PTY a HTML, junto con
`src/lib/terminal-keymap.ts` (mapa manual de teclas → secuencias de escape) y
un estado adicional en el store (`outputChunks`, `MAX_CHUNKS`, `postClear`,
`isLocked`).

Ese renderer:

- Interpretaba **solo códigos SGR** (color/negrita) — `SGR_MAP` con un puñado
  de códigos (0, 1, 31-34, 90).
- Modelaba la línea actual como una fila de celdas (`LineBuffer`) y replicaba
  *manualmente* `\r`, backspace, `\x1b[K` (erase-in-line), `\x1b[G`/`\x1b[C`/`\x1b[D`
  (mover cursor) — un intento de emulación mínima para que PSReadLine pudiera
  "redibujar" la línea de entrada sin duplicar texto.
- **No tenía pantalla alternativa ni grid 2D real** — era un buffer de
  scrollback "append-only" de líneas HTML.
- Para manejar `cls`/`Clear-Host`, detectaba la secuencia de limpieza de
  pantalla (`extractClearScreen`) y "vaciaba" el buffer manualmente, mostrando
  un mensaje sintético ("Terminal limpia, presiona una tecla...") y
  **bloqueando la entrada** (`isLocked`/`postClear`) hasta que el usuario
  pulsara algo — un parche para evitar que PSReadLine reinyectara texto
  basura durante el redibujado.

### 4.3 Por qué esto generaba bugs

Cualquier programa que usa la **pantalla alternativa** o cursor 2D real
(`vim`, `htop`, `less`, `nano`, menús de `apt`/`pacman`, `top`, editores TUI en
general) escribe secuencias de control que el `LineBuffer` de una sola línea
no puede representar: mover el cursor a una fila arbitraria, dibujar una
ventana completa, restaurar la pantalla anterior al salir, etc. El resultado
era texto "roto" — fragmentos repetidos, código de escape visible, contenido
desordenado o la pantalla completa hecha basura.

Además, toda la lógica de `cls`/lock era un parche específico para un caso
(PSReadLine + `Clear-Host`) que no generalizaba a otros programas.

### 4.4 Qué cambia con xterm.js

| Antes (renderer casero) | Ahora (xterm.js) |
|---|---|
| Solo SGR básico (`SGR_MAP`, ~7 códigos) | VT100/VT220 completo vía `ITheme` |
| 1 línea de celdas (`LineBuffer`), buffer "append-only" de HTML | Grid 2D real + **pantalla alternativa** |
| `vim`/`htop`/`less`/`nano` → texto roto | Se renderizan correctamente (igual que en VS Code) |
| Mapa manual de teclas (`terminal-keymap.ts`) | `term.onData()` traduce todo automáticamente |
| `cls` → mensaje sintético + `isLocked` (bloquea input) | `Clear-Host`/`\x1b[2J` se interpretan de forma nativa, sin parches ni bloqueo |
| `outputChunks` (array de strings, cap manual a 2000) | Scrollback nativo de xterm (`scrollback: 5000`) |
| Backend (`portable-pty`) sin cambios | Backend sin cambios — solo se agregó `pty_resize` (faltaba) |

En otras palabras: **el backend Rust (`portable-pty`, hilo lector, CPR
handshake, inyección de prompt) es exactamente el mismo de antes** — sigue
emitiendo bytes crudos por `pty:data`. Lo único que cambió es *quién*
interpreta esos bytes del lado del frontend: antes un parser parcial hecho a
mano, ahora un emulador de terminal completo y battle-tested.

---

## 5. Flujo de datos end-to-end (modo `local`)

```
1. terminal.tsx monta → crea XTerm + FitAddon → term.open(div) → fitAddon.fit()
2. useTerminalStore.init()  → listen("pty:data", chunk => term.write(chunk))
3. useTerminalStore.start() → invoke("pty_start", { cols, rows })
                              └─ Rust: portable-pty abre PTY, lanza shell,
                                 lanza hilo lector, inyecta prompt dorado
4. Usuario teclea            → term.onData(data) → invoke("pty_write", { data })
                              └─ Rust: writer.write_all(data.as_bytes())
5. El shell responde (stdout/stderr del PTY)
                              → hilo lector → app.emit("pty:data", chunk)
                              → listen() del store → term.write(chunk)
                              → xterm.js actualiza su grid/pantalla
6. Usuario redimensiona panel → ResizeObserver → fitAddon.fit()
                              → invoke("pty_resize", { cols: term.cols, rows: term.rows })
                              └─ Rust: master.resize(PtySize { cols, rows })
7. Terminal se desmonta      → term.dispose() + invoke("pty_stop")
                              └─ Rust: kill del proceso hijo del shell
```

---

## 6. Gotchas conocidos (para no repetir bugs)

- **Padding del contenedor de xterm:** con `box-sizing: border-box` global,
  el padding debe ir en `.xterm` (elemento interno que crea `term.open()`),
  **no** en su contenedor — `FitAddon` resta el padding de `term.element` al
  calcular filas/columnas disponibles. Padding en el contenedor hace que
  sobrecalcule filas y la última línea (el prompt) quede recortada por
  `overflow: hidden`. Ver `src/layout/molecule/terminal/terminal.css`.
- **`fitAddon.fit()` en contenedor de tamaño cero** (panel colapsado,
  `display: none`) devuelve `1x1`. El `ResizeObserver` en `terminal.tsx`
  vuelve a llamar `fit()` cuando el panel recupera tamaño real.
- **`term.dispose()` en unmount** es obligatorio — cada instancia de
  `Terminal` adjunta nodos DOM y listeners a su contenedor; sin `dispose()`
  se filtran en cada montaje/desmontaje (cambio de ruta, cierre de tab).
- **CSS de xterm** (`@xterm/xterm/css/xterm.css`) debe importarse una vez —
  sin ella la terminal se renderiza sin estilos / invisible.

---

## 7. Dónde mirar el código

| Qué | Archivo |
|---|---|
| UI de la terminal + ciclo de vida de xterm.js | `src/layout/molecule/terminal/terminal.tsx` |
| Estado global (Zustand) + listener de eventos | `src/stores/use-terminal-store.ts` |
| Paleta SGR → `ITheme` de xterm | `src/lib/terminal-theme.ts` |
| Wrappers `invoke()` tipados | `src/lib/tauri-commands.ts` |
| Comandos Tauri (controladores finos) | `src-tauri/src/commands/pty.rs` |
| Lógica del PTY (portable-pty, hilo lector, prompt) | `src-tauri/src/services/pty_service.rs` |
| Estado compartido de la app (incluye la sesión PTY) | `src-tauri/src/state.rs` |
| Especificación completa + decisiones arquitectónicas | `docs/spec-terminal.md` |
