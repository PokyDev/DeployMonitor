/* DeployMonitor — shell: Titlebar, Sidebar, Terminal */
(function () {
  const { useState, useEffect, useRef } = React;
  const I = window.Icons;

  /* ============ TITLEBAR ============ */
  function Titlebar({ theme, onTheme, showLogo, onTraffic }) {
    return React.createElement('div', { className: 'titlebar' }, [
      React.createElement('div', { className: 'traffic', key: 'tr' }, [
        React.createElement('button', { key: 'r', className: 'dot red', title: 'Control reservado', onClick: () => onTraffic(null) },
          React.createElement(I.X, { size: 8 })),
        React.createElement('button', { key: 'y', className: 'dot yellow', title: 'Control reservado', onClick: () => onTraffic(null) },
          React.createElement('svg', { width: 8, height: 8, viewBox: '0 0 24 24', stroke: 'rgba(0,0,0,.65)', strokeWidth: 3, fill: 'none', strokeLinecap: 'round' },
            React.createElement('line', { x1: 5, y1: 12, x2: 19, y2: 12 }))),
        React.createElement('button', { key: 'g', className: 'dot green', title: 'Control reservado', onClick: () => onTraffic(null) },
          React.createElement('svg', { width: 8, height: 8, viewBox: '0 0 24 24', stroke: 'rgba(0,0,0,.65)', strokeWidth: 2.5, fill: 'none', strokeLinejoin: 'round' },
            React.createElement('rect', { x: 5, y: 5, width: 14, height: 14, rx: 2 }))),
      ]),
      React.createElement('div', { className: 'titlebar-center', key: 'c' },
        showLogo && React.createElement('div', { className: 'tb-logo' }, [
          React.createElement('img', { key: 'i', src: 'assets/duck-king.png', alt: '' }),
          React.createElement('span', { key: 't', className: 'name' }, ['Deploy', React.createElement('span', { key: 'g', className: 'gold' }, 'Monitor')]),
        ])),
      React.createElement('div', { className: 'win-controls', key: 'wc' }, [
        React.createElement('button', { key: 'th', className: 'wc-btn', title: theme === 'dark' ? 'Tema oscuro' : 'Tema claro', onClick: onTheme },
          React.createElement(theme === 'dark' ? I.Moon : I.Sun, { size: 15 })),
        React.createElement('button', { key: 'min', className: 'wc-btn', title: 'Minimizar', onClick: () => onTraffic('Minimizar') }, React.createElement(I.Minimize, { size: 15 })),
        React.createElement('button', { key: 'max', className: 'wc-btn', title: 'Maximizar', onClick: () => onTraffic('Maximizar') }, React.createElement(I.Maximize, { size: 13 })),
        React.createElement('button', { key: 'cl', className: 'wc-btn close', title: 'Cerrar', onClick: () => onTraffic('Cerrar') }, React.createElement(I.Close, { size: 15 })),
      ]),
    ]);
  }

  /* ============ SIDEBAR ============ */
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'Grid' },
    { id: 'monitor', label: 'Monitoreo', icon: 'Activity' },
    { id: 'scripts', label: 'Scripts', icon: 'FileCode' },
    { id: 'history', label: 'Historial', icon: 'History' },
  ];

  function NavItem({ item, active, collapsed, onClick, badge }) {
    const I = window.Icons;
    const [hover, setHover] = useState(false);
    return React.createElement('button', {
      className: 'nav-item' + (active ? ' active' : ''),
      onClick, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
    }, [
      active && React.createElement('span', { key: 'b', className: 'nav-bar' }),
      React.createElement(I[item.icon], { key: 'i', size: 18 }),
      !collapsed && React.createElement('span', { key: 'l', className: 'nav-label' }, item.label),
      !collapsed && badge && React.createElement('span', { key: 'bd', className: 'nav-badge' }, badge),
      collapsed && hover && React.createElement('span', { key: 't', className: 'nav-tip' }, item.label),
    ]);
  }

  function Sidebar({ collapsed, onToggle, active, onNavigate, conn, runningScripts, onLogout }) {
    const I = window.Icons;
    const connColor = conn === 'connected' ? 'var(--color-gold)' : conn === 'error' ? 'var(--color-error-light)' : 'var(--color-idle)';
    const connLabel = conn === 'connected' ? 'Conectado' : conn === 'error' ? 'Error de conexión' : 'Sin conexión';
    const FootBtn = ({ icon, label, danger, isActive, onClick }) => {
      const [h, setH] = useState(false);
      return React.createElement('button', {
        className: 'foot-btn' + (danger ? ' danger' : '') + (isActive ? ' active' : ''),
        onClick, title: label, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
      }, [
        React.createElement(I[icon], { key: 'i', size: 18 }),
        collapsed && h && React.createElement('span', { key: 't', className: 'nav-tip' }, label),
      ]);
    };
    return React.createElement('aside', { className: 'sidebar' + (collapsed ? ' collapsed' : '') }, [
      React.createElement('div', { className: 'sidebar-head', key: 'h' },
        React.createElement('button', { className: 'wc-btn', style: { marginLeft: 'auto' }, onClick: onToggle, title: collapsed ? 'Expandir' : 'Colapsar' },
          React.createElement(I.PanelLeft, { size: 17 }))),
      React.createElement('nav', { className: 'nav', key: 'n' },
        NAV.map((it) => React.createElement(NavItem, {
          key: it.id, item: it, collapsed, active: active === it.id,
          onClick: () => onNavigate(it.id),
          badge: it.id === 'scripts' && runningScripts ? runningScripts : (it.id === 'monitor' && conn === 'connected' ? '●' : null),
        }))),
      React.createElement('div', { className: 'sidebar-foot', key: 'f' },
        React.createElement('div', { className: 'foot-row', key: 'fr' }, [
          React.createElement('div', { className: 'conn-status' + (collapsed ? ' collapsed' : ''), key: 'cs' }, [
            React.createElement('span', { key: 'd', className: 'conn-dot' + (conn === 'connected' ? ' pulse-dot' : ''), style: { background: connColor } }),
            !collapsed && React.createElement('span', { key: 'l', className: 'conn-label' }, connLabel),
          ]),
          React.createElement(FootBtn, { key: 'cfg', icon: 'Settings', label: 'Configuración', isActive: active === 'settings', onClick: () => onNavigate('settings') }),
          React.createElement(FootBtn, { key: 'out', icon: 'LogOut', label: 'Cerrar sesión', danger: true, onClick: onLogout }),
        ])),
    ]);
  }

  /* ============ TERMINAL ============ */
  function Terminal({ expanded, onToggle, lines, onClear, active }) {
    const I = window.Icons;
    const bodyRef = useRef(null);
    useEffect(() => {
      if (expanded && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [lines, expanded]);

    const colorFor = (t) => ({
      prompt: 'var(--color-gold)', out: '#D4D0C4', err: 'var(--color-error-light)',
      info: 'var(--color-info-light)', ok: 'var(--color-success-light)',
    }[t] || '#D4D0C4');

    return React.createElement('div', { className: 'terminal' + (expanded ? ' expanded' : '') }, [
      React.createElement('div', { className: 'terminal-head', key: 'h', onClick: onToggle }, [
        React.createElement('div', { className: 'th-left', key: 'l' }, [
          React.createElement(I.Terminal, { key: 'i', size: 15, style: { color: 'var(--text-secondary)' } }),
          React.createElement('span', { key: 't', className: 'th-title' }, 'Terminal'),
          active && React.createElement('span', { key: 'b', className: 'badge badge-active' }, 'Activo'),
        ]),
        React.createElement('div', { className: 'th-right', key: 'r' }, [
          React.createElement('button', { key: 'c', className: 'wc-btn', title: 'Limpiar', onClick: (e) => { e.stopPropagation(); onClear(); } },
            React.createElement(I.Trash, { size: 14 })),
          React.createElement('button', { key: 'e', className: 'wc-btn', title: expanded ? 'Colapsar' : 'Expandir' },
            React.createElement(expanded ? I.ChevronDown : I.ChevronUp, { size: 16 })),
        ]),
      ]),
      React.createElement('div', { className: 'terminal-body scroll', key: 'b', ref: bodyRef },
        lines.map((ln, i) => React.createElement('div', {
          key: i, className: 'term-line', style: { color: colorFor(ln.t), animationDelay: Math.min(i, 12) * 18 + 'ms' },
        }, ln.text))),
    ]);
  }

  /* ============ MODAL ============ */
  function Modal({ icon, title, onClose, children, foot, wide }) {
    const I = window.Icons;
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return React.createElement('div', { className: 'modal-overlay', onMouseDown: onClose },
      React.createElement('div', { className: 'modal', style: wide ? { width: 'min(680px, 100%)' } : null, onMouseDown: (e) => e.stopPropagation() }, [
        React.createElement('div', { className: 'modal-head', key: 'h' }, [
          React.createElement('div', { className: 'modal-title', key: 't' }, [
            icon && React.createElement('span', { className: 'mt-icon', key: 'i' }, React.createElement(I[icon], { size: 16 })),
            React.createElement('span', { className: 'mt-text', key: 'x' }, title),
          ]),
          React.createElement('button', { className: 'wc-btn', key: 'c', onClick: onClose, title: 'Cerrar' }, React.createElement(I.Close, { size: 16 })),
        ]),
        React.createElement('div', { className: 'modal-body', key: 'b' }, children),
        foot && React.createElement('div', { className: 'modal-foot', key: 'f' }, foot),
      ]));
  }

  window.Shell = { Titlebar, Sidebar: React.memo(Sidebar), Terminal, Modal, NAV };
})();
