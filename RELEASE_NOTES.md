# Deploy Monitor — v0.1.0-beta Release Notes

**Fecha de lanzamiento:** 29/06/2026  
**Canal:** Beta  
**Plataforma:** Windows 10 / 11 (x64)

---

## Descripción

Deploy Monitor es una aplicación de escritorio para Windows que permite gestionar instancias cloud mediante SSH, ejecutar scripts de automatización de forma remota y monitorear el historial de ejecuciones, todo desde una interfaz nativa sin depender de un navegador.

Esta es la primera versión beta pública. Representa el ciclo inicial de desarrollo completo para uso personal.

---

## Características incluidas en esta versión

### Terminal SSH interactivo
- Conexión SSH autenticada mediante clave pública (archivo `.pem`)
- Terminal completo con soporte ANSI/SGR (colores, estilos) renderizado via `xterm.js`
- Selector nativo de archivo `.pem` integrado en la app

### Gestión de Scripts
- Crear, editar, renombrar y eliminar scripts localmente
- Sincronización automática con la instancia remota via SFTP al ejecutar
- Ejecución de scripts directamente desde la interfaz, con salida en el terminal interactivo

### Historial de ejecuciones
- Registro automático de cada ejecución con código de salida, duración y salida completa
- Visor de logs con renderizado ANSI real (mismo motor xterm.js) — sin pérdida de colores ni formato
- Búsqueda y filtrado de ejecuciones anteriores
- Copiar salida completa o expandir log en vista detallada
- Sistema de eliminación con checkboxes para borrado múltiple

### Configuración
- Directorio de scripts configurable con selector nativo de carpeta
- Directorio de historial independiente del directorio de scripts
- Configuración persistida entre sesiones

---

## Instalación

### Requisitos
- Windows 10 o Windows 11 (64-bit)
- Instancia cloud accesible por SSH con autenticación por clave pública
- Archivo `.pem` de la instancia disponible en el equipo local

### Pasos

1. Descarga el instalador desde la sección **Assets** de esta release:
   - **`.msi`** — recomendado, instalador de Windows nativo
   - **`.exe`** — instalador alternativo (NSIS)

2. Ejecuta el instalador y sigue el asistente. No se requieren permisos de administrador.

3. Al abrir la aplicación por primera vez:
   - Ve a la pantalla de **conexión**
   - Ingresa el host, usuario SSH y selecciona tu archivo `.pem` con el selector nativo
   - Haz clic en **Conectar** para abrir el terminal interactivo

4. Para ejecutar scripts:
   - Ve a la pestaña **Scripts**
   - Configura el directorio local donde guardarás tus scripts (botón de carpeta en la toolbar)
   - Crea o importa tus scripts `.sh`
   - Selecciona un script y presiona **Ejecutar** — la app lo sube a la instancia y lo corre en el terminal

5. Para ver el historial:
   - Ve a la pestaña **Historial**
   - Configura el directorio de logs (puede ser el mismo que scripts o uno separado)
   - Cada ejecución queda registrada automáticamente con su salida completa

---

## Notas de la versión beta

- Esta versión es para uso **personal**. No hay sistema de actualizaciones automáticas.
- La pantalla de **Monitoreo** (snapshots de métricas en rangos de tiempo) está visible pero no persiste datos entre sesiones todavía — está programada para la siguiente iteración.
- La pantalla de **Configuración** es funcional para paths y conexión; opciones avanzadas vendrán en versiones futuras.
- En caso de error de conexión SSH, verificar que el host esté accesible y que el archivo `.pem` tenga los permisos correctos.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework desktop | Tauri v2 |
| UI | React 19 + TypeScript + Vite 7 |
| Backend | Rust |
| Terminal | xterm.js |
| SSH | russh |
| Estado global | Zustand |
| Estilos | CSS Modules |
