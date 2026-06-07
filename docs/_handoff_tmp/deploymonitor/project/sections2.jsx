/* DeployMonitor — sections part 2: Scripts (IDE), History, Settings */
(function () {
  const { useState } = React;
  const I = window.Icons;

  /* ---- bash syntax highlight ---- */
  function highlightBash(code) {
    let s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const re = /(#![^\n]*)|(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|echo|export|local|read|exit|cd|set|source|sudo|systemctl|docker|git|npm|node|curl|grep|awk|sed|chmod|mkdir|rm|cp|mv|tar)\b/g;
    return s.replace(re, (m, sh, cmt, str, vr, kw) => {
      if (sh) return `<span class="kw">${sh}</span>`;
      if (cmt) return `<span class="cmt">${cmt}</span>`;
      if (str) return `<span class="str">${str}</span>`;
      if (vr) return `<span class="var">${vr}</span>`;
      if (kw) return `<span class="kw">${kw}</span>`;
      return m;
    });
  }

  function ScriptsSection({ scripts, selectedId, onSelect, onRun, running, runningId }) {
    const sel = scripts.find((s) => s.id === selectedId) || scripts[0];
    const lines = sel.code.split('\n');
    const isRunning = running && runningId === sel.id;
    return React.createElement('div', { className: 'content-inner', style: { height: '100%' } },
      React.createElement('div', { className: 'scripts-wrap' }, [
        // left list
        React.createElement('div', { className: 'scripts-list', key: 'l' }, [
          React.createElement('button', { key: 'new', className: 'btn', style: { width: '100%', justifyContent: 'center' } }, [React.createElement(I.Plus, { key: 'i', size: 15 }), 'Nuevo script']),
          React.createElement('div', { className: 'scripts-list-inner scroll', key: 'list' },
            scripts.map((sc) => React.createElement('div', {
              key: sc.id, className: 'script-item' + (sc.id === selectedId ? ' active' : ''), onClick: () => onSelect(sc.id),
            }, [
              React.createElement('div', { className: 'si-top', key: 't' }, [
                React.createElement(I.FileCode, { key: 'i', size: 15, className: 'si-icon' }),
                React.createElement('span', { key: 'n', className: 'si-name' }, sc.name),
                React.createElement('span', { key: 'p', className: 'pill' }, sc.type),
              ]),
              React.createElement('div', { className: 'si-meta', key: 'm' }, [
                React.createElement('span', { key: 'd', className: 'si-dot', style: { background: sc.last === 'ok' ? 'var(--color-success-light)' : sc.last === 'err' ? 'var(--color-error-light)' : 'var(--color-idle)' } }),
                React.createElement('span', { key: 't', className: 'si-time' }, sc.time),
              ]),
              React.createElement('div', { className: 'si-actions', key: 'a' }, [
                React.createElement('button', { key: 'e', className: 'wc-btn', title: 'Editar' }, React.createElement(I.Edit, { size: 13 })),
                React.createElement('button', { key: 'd', className: 'wc-btn', title: 'Eliminar' }, React.createElement(I.Trash, { size: 13 })),
              ]),
            ]))),
        ]),
        // editor
        React.createElement('div', { className: 'editor', key: 'e' }, [
          React.createElement('div', { className: 'editor-tabs', key: 'tabs' },
            React.createElement('div', { className: 'editor-tab active' }, [
              React.createElement(I.FileCode, { key: 'i', size: 14, className: 'ti' }),
              sel.name,
            ])),
          React.createElement('div', { className: 'editor-body scroll', key: 'body' }, [
            React.createElement('div', { className: 'gutter', key: 'g' }, lines.map((_, i) => React.createElement('div', { key: i }, i + 1))),
            React.createElement('pre', { key: 'c', className: 'code', dangerouslySetInnerHTML: { __html: highlightBash(sel.code) } }),
          ]),
          React.createElement('div', { className: 'editor-actions', key: 'act' }, [
            React.createElement('span', { key: 'sp', className: 'spacer' }),
            React.createElement('button', { key: 's', className: 'btn btn-sm' }, [React.createElement(I.Save, { key: 'i', size: 14 }), 'Guardar']),
            isRunning
              ? React.createElement('button', { key: 'c', className: 'btn btn-sm btn-danger' }, [React.createElement(I.X, { key: 'i', size: 14 }), 'Cancelar'])
              : null,
            React.createElement('button', {
              key: 'r', className: 'btn btn-sm btn-primary', onClick: () => onRun(sel),
              style: isRunning ? { animation: 'borderRun 1s ease-in-out infinite' } : null, disabled: isRunning,
            }, [React.createElement(isRunning ? I.Activity : I.Zap, { key: 'i', size: 14, className: isRunning ? 'spin' : '' }), isRunning ? 'Ejecutando…' : 'Ejecutar']),
          ]),
        ]),
      ]));
  }

  /* ============ HISTORY ============ */
  function HistorySection({ history, onDetail }) {
    const badgeFor = (st) => ({
      ok: ['badge-normal', 'Éxito'], err: ['badge-critical', 'Error'],
      cancel: ['badge-idle', 'Cancelado'], run: ['badge-running', 'Corriendo'],
    }[st]);
    return React.createElement('div', { className: 'content-inner' }, [
      React.createElement('div', { className: 'sec-bar', key: 'bar' },
        React.createElement('div', { key: 'l' }, [
          React.createElement('div', { className: 'sec-title', key: 't' }, 'Historial de ejecuciones'),
          React.createElement('div', { className: 'sec-desc', key: 'd' }, history.length + ' ejecuciones registradas'),
        ])),
      React.createElement('div', { className: 'card history-table', key: 'tbl' }, [
        React.createElement('div', { className: 'hist-row head', key: 'h' }, [
          React.createElement('span', { key: 'a', className: 'hh' }, 'Script'),
          React.createElement('span', { key: 'b', className: 'hh' }, 'Instancia'),
          React.createElement('span', { key: 'c', className: 'hh' }, 'Estado'),
          React.createElement('span', { key: 'd', className: 'hh' }, 'Duración'),
          React.createElement('span', { key: 'e', className: 'hh' }, 'Fecha'),
          React.createElement('span', { key: 'f' }),
        ]),
        ...history.map((h, i) => {
          const [cls, lab] = badgeFor(h.status);
          return React.createElement('div', { className: 'hist-row', key: i }, [
            React.createElement('span', { key: 'a', className: 'hist-name' }, h.name),
            React.createElement('span', { key: 'b', className: 'hist-host', title: h.host }, h.host),
            React.createElement('span', { key: 'c' }, React.createElement('span', { className: 'badge ' + cls }, [React.createElement('span', { key: 'p', className: 'pip' + (h.status === 'run' ? ' pulse-dot' : ''), style: { background: 'currentColor' } }), lab])),
            React.createElement('span', { key: 'd', className: 'hist-meta' }, h.duration),
            React.createElement('span', { key: 'e', className: 'hist-time' }, h.date),
            React.createElement('button', { key: 'f', className: 'btn btn-ghost btn-sm hist-detail', onClick: () => onDetail(h) }, 'Ver detalle'),
          ]);
        }),
      ]),
    ]);
  }

  /* ============ SETTINGS ============ */
  function SettingsSection({ theme, setTheme, host }) {
    const themes = [['dark', 'Oscuro', 'Moon'], ['light', 'Claro', 'Sun'], ['system', 'Sistema', 'Monitor']];
    const [themeSel, setThemeSel] = useState(theme);
    return React.createElement('div', { className: 'content-inner' }, [
      React.createElement('div', { className: 'sec-bar', key: 'bar' },
        React.createElement('div', { key: 'l' }, [
          React.createElement('div', { className: 'sec-title', key: 't' }, 'Configuración'),
          React.createElement('div', { className: 'sec-desc', key: 'd' }, 'Preferencias de la aplicación'),
        ])),
      React.createElement('div', { className: 'settings-wrap', key: 'w' }, [
        // Apariencia
        React.createElement('div', { className: 'card set-card', key: 'ap' }, [
          React.createElement('div', { className: 'set-label', key: 'l' }, 'Apariencia'),
          React.createElement('div', { className: 'set-row', key: 'r' }, [
            React.createElement('div', { className: 'sr-info', key: 'i' }, [
              React.createElement('span', { className: 'sr-title', key: 't' }, 'Tema'),
              React.createElement('span', { className: 'sr-desc', key: 'd' }, 'Esquema de color de la interfaz'),
            ]),
            React.createElement('div', { className: 'seg', key: 's' }, themes.map(([id, lab, ic]) =>
              React.createElement('button', {
                key: id, className: 'seg-btn' + ((id === 'system' ? themeSel === 'system' : theme === id && themeSel !== 'system') ? ' active' : ''),
                onClick: () => { setThemeSel(id); if (id !== 'system') setTheme(id); else setTheme('dark'); },
              }, [React.createElement(I[ic], { key: 'i', size: 14 }), lab]))),
          ]),
        ]),
        // Conexión
        React.createElement('div', { className: 'card set-card', key: 'cn' }, [
          React.createElement('div', { className: 'set-label', key: 'l' }, 'Conexión SSH'),
          React.createElement('div', { className: 'set-row', key: 'r' }, [
            React.createElement('div', { className: 'sr-info', key: 'i' }, [
              React.createElement('span', { className: 'sr-title', key: 't' }, 'Instancia configurada'),
              React.createElement('span', { className: 'sr-mono', key: 'd' }, host || 'No configurada'),
            ]),
            React.createElement('button', { key: 'b', className: 'btn btn-sm' }, 'Ir al dashboard'),
          ]),
        ]),
        // Cuenta
        React.createElement('div', { className: 'card set-card', key: 'ac' }, [
          React.createElement('div', { className: 'set-label', key: 'l' }, 'Cuenta'),
          React.createElement('div', { className: 'set-row', key: 'r' }, [
            React.createElement('div', { className: 'sr-info', key: 'i' }, [
              React.createElement('span', { className: 'sr-title', key: 't' }, 'André Coragem'),
              React.createElement('span', { className: 'sr-desc', key: 'd' }, 'andre@coragem.dev'),
            ]),
            React.createElement('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
              React.createElement('button', { key: 'p', className: 'btn btn-sm' }, [React.createElement(I.Lock, { key: 'i', size: 14 }), 'Cambiar contraseña']),
              React.createElement('button', { key: 'l', className: 'btn btn-sm btn-danger' }, [React.createElement(I.LogOut, { key: 'i', size: 14 }), 'Cerrar sesión']),
            ]),
          ]),
        ]),
        // Acerca de
        React.createElement('div', { className: 'card set-card', key: 'ab' }, [
          React.createElement('div', { className: 'set-label', key: 'l' }, 'Acerca de'),
          React.createElement('div', { className: 'set-row', key: 'r' }, [
            React.createElement('div', { className: 'sr-info', key: 'i' }, [
              React.createElement('span', { className: 'sr-title', key: 't' }, 'DeployMonitor'),
              React.createElement('span', { className: 'sr-desc', key: 'd' }, 'Tauri V2 · React · Rust'),
            ]),
            React.createElement('span', { key: 'v', className: 'sr-mono' }, 'v0.1.0'),
          ]),
        ]),
      ]),
    ]);
  }

  window.Sections2 = { ScriptsSection, HistorySection, SettingsSection, highlightBash };
})();
