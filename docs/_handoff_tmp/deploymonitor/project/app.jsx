/* DeployMonitor — main app: state, mock data, landing, dashboard */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const I = window.Icons;
  const { Titlebar, Sidebar, Terminal, Modal } = window.Shell;
  const { DashboardSection, MonitorSection } = window.Sections;
  const { ScriptsSection, HistorySection, SettingsSection } = window.Sections2;
  const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "resolution": "full",
    "liveData": true,
    "gridBackdrop": true
  }/*EDITMODE-END*/;

  /* ---------- mock data ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function walk(n, base, amp, lo, hi) {
    const out = []; let v = base;
    for (let i = 0; i < n; i++) { v = clamp(v + (Math.random() - 0.5) * amp, lo, hi); out.push(v); }
    return out;
  }
  const statusOf = (v, w, c) => (v >= c ? 'critical' : v >= w ? 'warning' : 'normal');

  function initialMetrics() {
    return {
      cpu:  { value: 30.8, history: walk(22, 30, 9, 8, 75), longHistory: walk(40, 32, 8, 8, 80), status: 'normal', detail: null, base: 32 },
      mem:  { value: 60.7, history: walk(22, 60, 4, 50, 72), longHistory: walk(40, 60, 5, 48, 75), status: 'normal', detail: 'de 7.8 GB', base: 60 },
      disk: { value: 48.1, history: walk(22, 48, 1.5, 46, 52), longHistory: walk(40, 48, 2, 45, 53), status: 'normal', detail: 'de 80 GB', base: 48 },
      swap: { value: 12.3, history: walk(22, 12, 1.5, 6, 22), longHistory: walk(40, 12, 2, 6, 24), status: 'normal', detail: 'de 2 GB', base: 12 },
      net:  { value: 4.2, history: walk(22, 4, 1.4, 0.4, 9), longHistory: [walk(40, 4.2, 1.4, 0.4, 9), walk(40, 1.1, 0.5, 0.1, 4)], status: 'normal', detail: 'MB/s', base: 4 },
      load: { value: 1.4, history: walk(22, 1.4, 0.4, 0.3, 3), longHistory: [walk(40, 1.4, 0.4, 0.2, 3), walk(40, 1.1, 0.2, 0.2, 2.4), walk(40, 0.9, 0.12, 0.2, 1.8)], status: 'normal', detail: '1 min', base: 1.3 },
    };
  }

  const INITIAL_TERM = [
    { t: 'info', text: '# DeployMonitor terminal — sesión local' },
    { t: 'info', text: '# Conecta una instancia para iniciar una sesión SSH remota.' },
  ];

  const SCRIPTS = [
    { id: 's1', name: 'deploy-sync.sh', type: 'sync', last: 'ok', time: 'hace 2 min', code: `#!/bin/bash\n# Sincroniza el build y reinicia el servicio\nset -e\n\nAPP_DIR="/var/www/coragem"\nBRANCH="main"\n\necho "==> Pull de últimos cambios"\ncd $APP_DIR\ngit fetch origin $BRANCH\ngit reset --hard origin/$BRANCH\n\necho "==> Instalando dependencias"\nnpm ci --production\n\necho "==> Reiniciando servicio"\nsudo systemctl restart coragem.service\necho "Deploy completado ✓"` },
    { id: 's2', name: 'health-check.sh', type: 'custom', last: 'ok', time: 'hace 18 min', code: `#!/bin/bash\n# Verifica el estado de los servicios\nfor svc in nginx coragem postgres; do\n  if systemctl is-active --quiet $svc; then\n    echo "$svc: activo"\n  else\n    echo "$svc: CAÍDO"\n  fi\ndone` },
    { id: 's3', name: 'backup-db.sh', type: 'custom', last: 'err', time: 'ayer 23:40', code: `#!/bin/bash\n# Backup de la base de datos a S3\nSTAMP=$(date +%Y%m%d_%H%M)\nFILE="db_$STAMP.sql.gz"\n\necho "Generando dump..."\npg_dump coragem | gzip > /tmp/$FILE\n\necho "Subiendo a S3"\naws s3 cp /tmp/$FILE s3://coragem-backups/\nrm /tmp/$FILE` },
    { id: 's4', name: 'cleanup-logs.sh', type: 'custom', last: 'idle', time: 'hace 3 días', code: `#!/bin/bash\n# Limpia logs antiguos (>14 días)\nfind /var/log -name "*.log" -mtime +14 -delete\necho "Logs antiguos eliminados"` },
  ];

  const HISTORY = [
    { name: 'deploy-sync.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'ok', duration: '12.4s', date: '01 jun · 14:32' },
    { name: 'health-check.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'ok', duration: '1.8s', date: '01 jun · 14:14' },
    { name: 'deploy-sync.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'ok', duration: '11.9s', date: '01 jun · 11:05' },
    { name: 'backup-db.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'err', duration: '4.2s', date: '31 may · 23:40' },
    { name: 'cleanup-logs.sh', host: 'ubuntu@ec2-54-82-11-90', status: 'cancel', duration: '0.6s', date: '31 may · 20:18' },
    { name: 'health-check.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'ok', duration: '1.6s', date: '31 may · 18:02' },
    { name: 'deploy-sync.sh', host: 'ubuntu@ec2-3-223-213-238', status: 'ok', duration: '13.1s', date: '30 may · 16:45' },
  ];

  /* ---------- log builder for history detail ---------- */
  function buildLogs(exec) {
    const sc = SCRIPTS.find((s) => s.name === exec.name);
    const prompt = exec.host + ':~$ ';
    const lines = [{ c: 'prompt', t: prompt + 'bash ' + exec.name }];
    const outs = sc ? sc.code.split('\n').filter((l) => l.trim().startsWith('echo ')).map((l) => l.replace(/.*echo\s+"?/, '').replace(/"$/, '')) : [];
    if (exec.status === 'err') {
      const upto = Math.max(1, outs.length - 1);
      outs.slice(0, upto).forEach((o) => lines.push({ c: 'out', t: o }));
      lines.push({ c: 'err', t: 'Error: upload failed — AccessDenied (403) al subir a s3://coragem-backups/' });
      lines.push({ c: 'err', t: `✗ ${exec.name} terminó con código 1` });
      lines.push({ c: 'prompt', t: prompt });
    } else if (exec.status === 'cancel') {
      (outs.slice(0, 1)).forEach((o) => lines.push({ c: 'out', t: o }));
      lines.push({ c: 'info', t: '^C Interrumpido — cancelado por el usuario' });
      lines.push({ c: 'prompt', t: prompt });
    } else {
      (outs.length ? outs : ['Ejecutando ' + exec.name + '…']).forEach((o) => lines.push({ c: 'out', t: o }));
      lines.push({ c: 'ok', t: `✓ ${exec.name} finalizó correctamente (código 0)` });
      lines.push({ c: 'prompt', t: prompt });
    }
    return lines;
  }

  /* ---------- LANDING ---------- */
  const SHORTCUTS = [
    { name: 'Conectar instancia', keys: ['Ctrl', 'Shift', 'C'], icon: 'Terminal' },
    { name: 'Monitoreo en vivo', keys: ['Ctrl', 'M'], icon: 'Activity' },
    { name: 'Ejecutar script', keys: ['Ctrl', 'Enter'], icon: 'FolderPlay' },
    { name: 'Configuración', keys: ['Ctrl', ','], icon: 'Settings' },
  ];

  function Landing({ onEnter, backdrop }) {
    return React.createElement('div', { className: 'landing' + (backdrop ? '' : ' no-grid') }, [
      React.createElement('div', { className: 'l-logo', key: 'logo' }, [
        React.createElement('div', { className: 'l-duck', key: 'd' }, React.createElement('img', { src: 'assets/duck-king.png', alt: 'DeployMonitor' })),
        React.createElement('div', { className: 'l-name', key: 'n' }, ['Deploy', React.createElement('span', { key: 'g', className: 'gold' }, 'Monitor')]),
      ]),
      React.createElement('div', { className: 'l-tag', key: 'tag' }, '“Monitorea y automatiza tus instancias en tiempo real”'),
      React.createElement('div', { className: 'l-divider', key: 'dv' }),
      React.createElement('div', { className: 'l-grid', key: 'grid' }, SHORTCUTS.map((s, i) =>
        React.createElement('div', { key: i, className: 'l-card', onClick: onEnter }, [
          React.createElement('div', { className: 'lc-top', key: 't' }, [
            React.createElement('span', { className: 'lc-name', key: 'n' }, s.name),
            React.createElement(I[s.icon], { key: 'i', size: 16, className: 'lc-icon' }),
          ]),
          React.createElement('div', { className: 'lc-keys', key: 'k' }, s.keys.flatMap((k, j) => [
            React.createElement('span', { key: 'k' + j, className: 'kchip' }, k),
            j < s.keys.length - 1 && React.createElement('span', { key: 'p' + j, className: 'plus' }, '+'),
          ]).concat([React.createElement('span', { key: 'ent', className: 'kchip', style: { marginLeft: 'auto', color: 'var(--text-muted)' } }, '↵')])),
        ]))),
      React.createElement('div', { className: 'l-enter anim-enter', key: 'enter' }, 'Usa Enter para acceder al dashboard'),
    ]);
  }

  /* ---------- APP ---------- */
  function App() {
    const [view, setView] = useState('landing');
    const [theme, setTheme] = useState('dark');
    const [collapsed, setCollapsed] = useState(false);
    const [active, setActive] = useState('dashboard');
    const [conn, setConn] = useState('idle');
    const [pem, setPem] = useState('C:\\Users\\Andre\\Desktop\\Coragem\\Auth\\Coragem.pem');
    const [host, setHost] = useState('ubuntu@ec2-3-223-213-238.compute-1.amazonaws.com');
    const [flash, setFlash] = useState(false);
    const [metrics, setMetrics] = useState(initialMetrics);
    const [termOpen, setTermOpen] = useState(false);
    const [termLines, setTermLines] = useState(INITIAL_TERM);
    const [range, setRange] = useState('30min');
    const [selScript, setSelScript] = useState('s1');
    const [running, setRunning] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const [history, setHistory] = useState(HISTORY);
    const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const [modal, setModal] = useState(null);
    const compact = tweaks.resolution === 'compact';

    const pushLines = useCallback((arr) => setTermLines((p) => [...p, ...arr]), []);

    /* live metrics tick */
    useEffect(() => {
      if (view !== 'dashboard' || !tweaks.liveData) return;
      const RANGES = {
        cpu:  { amp: 6,   lo: 8,  hi: 92 },
        mem:  { amp: 2.2, lo: 48, hi: 78 },
        disk: { amp: 0.6, lo: 45, hi: 54 },
        swap: { amp: 1.4, lo: 5,  hi: 26 },
        net:  { amp: 1.6, lo: 0.3, hi: 9.5 },
        load: { amp: 0.35, lo: 0.2, hi: 3.6 },
      };
      const iv = setInterval(() => {
        setMetrics((m) => {
          const next = {};
          for (const k of Object.keys(m)) {
            const cur = m[k];
            const r = RANGES[k];
            const nv = clamp(cur.value + (Math.random() - 0.5) * r.amp, r.lo, r.hi);
            const hist = [...cur.history.slice(1), nv];
            let longHistory;
            if (Array.isArray(cur.longHistory[0])) {
              longHistory = cur.longHistory.map((s, i) => [...s.slice(1), clamp(s[s.length - 1] + (Math.random() - 0.5) * r.amp * (1 - i * 0.25), r.lo, r.hi)]);
            } else {
              longHistory = [...cur.longHistory.slice(1), nv];
            }
            const status = k === 'load' ? statusOf(nv, 2.2, 3.0) : k === 'net' ? 'normal' : statusOf(nv, 75, 90);
            next[k] = Object.assign({}, cur, { value: nv, history: hist, longHistory, status });
          }
          return next;
        });
      }, 2000);
      return () => clearInterval(iv);
    }, [view, tweaks.liveData]);

    /* keyboard */
    const enterDash = useCallback((section) => { setView('dashboard'); if (section) setActive(section); }, []);
    useEffect(() => {
      const onKey = (e) => {
        if (modal) return;
        if (view === 'landing' && (e.key === 'Enter')) { e.preventDefault(); enterDash(); return; }
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); enterDash('dashboard'); }
        else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); enterDash('monitor'); }
        else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); enterDash('scripts'); }
        else if (e.ctrlKey && e.key === ',') { e.preventDefault(); enterDash('settings'); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [view, enterDash, modal]);

    const onConnect = useCallback(() => {
      setConn('verifying');
      setTermOpen(true);
      pushLines([
        { t: 'info', text: `> Conectando a ${host.split('@')[1] || host}…` },
        { t: 'info', text: `> Usando clave ${pem.split('\\').pop()}` },
      ]);
      setTimeout(() => {
        setConn('connected'); setFlash(true); setTimeout(() => setFlash(false), 1300);
        pushLines([
          { t: 'ok', text: '✓ Autenticación correcta' },
          { t: 'ok', text: '✓ Sesión SSH establecida' },
          { t: 'prompt', text: `${host.split('@')[0]}@ec2:~$ ` },
        ]);
      }, 1400);
    }, [host, pem, pushLines]);

    const onTest = useCallback(() => {
      setConn('verifying');
      setTermOpen(true);
      pushLines([{ t: 'info', text: `> Probando conexión a ${host.split('@')[1] || host}…` }]);
      setTimeout(() => {
        setConn('idle');
        pushLines([{ t: 'ok', text: '✓ Host alcanzable · latencia 24ms · puerto 22 abierto' }]);
      }, 1100);
    }, [host, pushLines]);

    const onRunScript = useCallback((sc) => {
      if (running) return;
      setRunning(true); setRunningId(sc.id); setTermOpen(true);
      const promptStr = `${host.split('@')[0]}@ec2:~$ `;
      pushLines([{ t: 'prompt', text: promptStr + 'bash ' + sc.name }]);
      const outs = sc.code.split('\n').filter((l) => l.trim().startsWith('echo ')).map((l) => l.replace(/.*echo\s+"?/, '').replace(/"$/, ''));
      const seq = outs.length ? outs : ['Ejecutando ' + sc.name + '…', 'Proceso finalizado'];
      let i = 0;
      const step = () => {
        if (i < seq.length) { pushLines([{ t: 'out', text: seq[i] }]); i++; setTimeout(step, 480); }
        else {
          pushLines([{ t: 'ok', text: `✓ ${sc.name} finalizó (código 0)` }, { t: 'prompt', text: promptStr }]);
          setRunning(false); setRunningId(null);
          setHistory((h) => [{ name: sc.name, host: host.split('@')[0] + '@' + (host.split('@')[1] || '').split('.')[0], status: 'ok', duration: (seq.length * 0.48 + 0.6).toFixed(1) + 's', date: '01 jun · ahora' }, ...h]);
        }
      };
      setTimeout(step, 500);
    }, [running, host, pushLines]);

    const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
    const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);
    const onTraffic = useCallback((label) => setModal({ type: 'wip', label }), []);
    const onDetail = useCallback((exec) => setModal({ type: 'log', exec }), []);
    const onLogout = useCallback(() => {
      setView('landing'); setConn('idle'); setActive('dashboard');
      setTermOpen(false); setTermLines(INITIAL_TERM);
    }, []);

    const extra = {
      uptime: '14d 06:32',
      processes: 142,
      connections: 28,
      temp: Math.round(46 + metrics.cpu.value * 0.2),
      tx: metrics.net.longHistory[1][metrics.net.longHistory[1].length - 1],
    };

    /* render sections */
    let section;
    if (active === 'dashboard') section = React.createElement(DashboardSection, { key: 'd', metrics, conn: { pem, setPem, host, setHost, conn, onConnect, onTest, flash } });
    else if (active === 'monitor') section = React.createElement(MonitorSection, { key: 'm', metrics, extra, range, setRange });
    else if (active === 'scripts') section = React.createElement(ScriptsSection, { key: 's', scripts: SCRIPTS, selectedId: selScript, onSelect: setSelScript, onRun: onRunScript, running, runningId });
    else if (active === 'history') section = React.createElement(HistorySection, { key: 'h', history, onDetail });
    else if (active === 'settings') section = React.createElement(SettingsSection, { key: 'cfg', theme, setTheme, host });

    /* modal content */
    let modalEl = null;
    if (modal && modal.type === 'wip') {
      modalEl = React.createElement(Modal, {
        icon: 'Wrench', title: 'Función en desarrollo', onClose: () => setModal(null),
        foot: React.createElement('button', { className: 'btn btn-primary', onClick: () => setModal(null) }, 'Entendido'),
      }, React.createElement('p', { className: 'modal-msg' }, modal.label
        ? ['La acción ', React.createElement('strong', { key: 's' }, modal.label), ' todavía no está disponible. Esta función se implementará en próximas versiones de DeployMonitor.']
        : ['Este control de ventana está ', React.createElement('strong', { key: 's' }, 'reservado'), ' y aún no tiene una función asignada. Se habilitará en una próxima versión de DeployMonitor.']));
    } else if (modal && modal.type === 'log') {
      const ex = modal.exec;
      const stMap = { ok: ['badge-normal', 'Éxito'], err: ['badge-critical', 'Error'], cancel: ['badge-idle', 'Cancelado'], run: ['badge-running', 'Corriendo'] };
      modalEl = React.createElement(Modal, {
        icon: 'FileCode', title: ex.name, wide: true, onClose: () => setModal(null),
        foot: React.createElement('button', { className: 'btn', onClick: () => setModal(null) }, 'Cerrar'),
      }, [
        React.createElement('div', { className: 'log-meta', key: 'meta' }, [
          React.createElement('span', { className: 'k', key: 'k1' }, 'Instancia'), React.createElement('span', { className: 'v gold', key: 'v1' }, ex.host),
          React.createElement('span', { className: 'k', key: 'k2' }, 'Estado'),
          React.createElement('span', { className: 'v', key: 'v2' }, React.createElement('span', { className: 'badge ' + stMap[ex.status][0] }, [React.createElement('span', { key: 'p', className: 'pip', style: { background: 'currentColor' } }), stMap[ex.status][1]])),
          React.createElement('span', { className: 'k', key: 'k3' }, 'Duración'), React.createElement('span', { className: 'v', key: 'v3' }, ex.duration),
          React.createElement('span', { className: 'k', key: 'k4' }, 'Fecha'), React.createElement('span', { className: 'v', key: 'v4' }, ex.date),
        ]),
        React.createElement('div', { className: 'label', key: 'll', style: { marginBottom: 8 } }, 'Salida de terminal'),
        React.createElement('div', { className: 'log-term scroll', key: 'term' },
          buildLogs(ex).map((ln, i) => React.createElement('div', { key: i, className: 'll ' + ln.c }, ln.t))),
      ]);
    }

    const shell = React.createElement('div', { className: 'win theme-' + theme }, [
      React.createElement(Titlebar, { key: 'tb', theme, onTheme: toggleTheme, showLogo: view === 'dashboard', onTraffic }),
      view === 'landing'
        ? React.createElement(Landing, { key: 'l', onEnter: () => enterDash(), backdrop: tweaks.gridBackdrop })
        : React.createElement('div', { className: 'shell-body', key: 'b' }, [
            React.createElement(Sidebar, { key: 'sb', collapsed, onToggle: toggleSidebar, active, onNavigate: setActive, conn, runningScripts: running ? '1' : null, onLogout }),
            React.createElement('div', { className: 'content-stack', key: 'cs' }, [
              React.createElement('div', { className: 'content scroll', key: 'c' }, section),
              React.createElement(Terminal, { key: 't', expanded: termOpen, onToggle: () => setTermOpen((o) => !o), lines: termLines, onClear: () => setTermLines([]), active: conn === 'connected' }),
            ]),
          ]),
      modalEl,
    ]);

    return React.createElement(React.Fragment, null, [
      React.createElement('div', { className: 'viewport-frame' + (compact ? ' compact' : ''), key: 'vf' }, shell),
      React.createElement(TweaksPanel, { key: 'twk', title: 'Tweaks' }, [
        React.createElement(TweakSection, { key: 's1', label: 'Vista' }),
        React.createElement(TweakRadio, {
          key: 'res', label: 'Resolución', value: tweaks.resolution,
          options: [{ value: 'full', label: 'Completa' }, { value: 'compact', label: '700×600' }],
          onChange: (v) => setTweak('resolution', v),
        }),
        React.createElement(TweakSection, { key: 's2', label: 'Comportamiento' }),
        React.createElement(TweakToggle, { key: 'live', label: 'Datos en vivo', value: tweaks.liveData, onChange: (v) => setTweak('liveData', v) }),
        React.createElement(TweakToggle, { key: 'grid', label: 'Grid en landing', value: tweaks.gridBackdrop, onChange: (v) => setTweak('gridBackdrop', v) }),
      ]),
    ]);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
