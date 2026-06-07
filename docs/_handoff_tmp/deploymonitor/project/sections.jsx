/* DeployMonitor — dashboard sections */
(function () {
  const { useState } = React;
  const I = window.Icons;
  const { Sparkline, AreaChart } = window.Charts;

  function StatusBadge({ status }) {
    const map = {
      normal: ['badge-normal', 'Normal'], warning: ['badge-warning', 'Warning'],
      critical: ['badge-critical', 'Critical'],
    };
    const [cls, label] = map[status] || map.normal;
    return React.createElement('span', { className: 'badge ' + cls },
      [React.createElement('span', { key: 'p', className: 'pip', style: { background: 'currentColor' } }), label]);
  }

  /* ============ DASHBOARD (overview) ============ */
  function ConnPanel({ pem, setPem, host, setHost, conn, onConnect, onTest, flash }) {
    const badge = conn === 'connected'
      ? ['badge-active', 'Conectado'] : conn === 'error'
      ? ['badge-critical', 'Error'] : conn === 'verifying'
      ? ['badge-running', 'Verificando'] : ['badge-idle', 'Sin verificar'];
    return React.createElement('div', { className: 'card conn-panel' + (flash ? ' flash-success' : '') }, [
      React.createElement('div', { className: 'cp-head', key: 'h' }, [
        React.createElement('div', { className: 'sec-head', key: 'l' }, [
          React.createElement(I.Key, { key: 'i', size: 16 }), 'Conexión SSH',
        ]),
        React.createElement('span', { key: 'b', className: 'badge ' + badge[0] },
          [React.createElement('span', { key: 'p', className: 'pip' + (conn === 'connected' ? ' pulse-dot' : ''), style: { background: 'currentColor' } }), badge[1]]),
      ]),
      React.createElement('div', { className: 'conn-fields', key: 'f' }, [
        React.createElement('div', { className: 'conn-field', key: 'pem' }, [
          React.createElement('span', { className: 'label', key: 'l' }, 'Clave privada (.pem)'),
          React.createElement('div', { className: 'input-row', key: 'r' }, [
            React.createElement('input', { key: 'i', className: 'input', value: pem, onChange: (e) => setPem(e.target.value), placeholder: 'C:\\Users\\...\\key.pem' }),
            React.createElement('button', { key: 'b', className: 'btn', onClick: () => setPem('C:\\Users\\Andre\\Desktop\\Coragem\\Auth\\Coragem.pem') }, [React.createElement(I.Folder, { key: 'i', size: 15 }), 'Explorar']),
          ]),
        ]),
        React.createElement('div', { className: 'conn-field', key: 'host' }, [
          React.createElement('span', { className: 'label', key: 'l' }, 'Cadena de conexión'),
          React.createElement('div', { className: 'input-row', key: 'r' }, [
            React.createElement('input', { key: 'i', className: 'input', value: host, onChange: (e) => setHost(e.target.value), placeholder: 'ubuntu@ec2-xxx.compute-1.amazonaws.com' }),
            React.createElement('button', { key: 'b', className: 'icon-btn', title: 'Editar' }, React.createElement(I.Edit, { size: 15 })),
          ]),
        ]),
      ]),
      React.createElement('div', { className: 'conn-actions', key: 'a' }, [
        React.createElement('button', { key: 'c', className: 'btn btn-primary', onClick: onConnect, disabled: conn === 'verifying' },
          [React.createElement(I.Zap, { key: 'i', size: 15 }), conn === 'connected' ? 'Reconectar' : 'Conectar']),
        React.createElement('button', { key: 't', className: 'btn', onClick: onTest, disabled: conn === 'verifying' },
          [React.createElement(I.Wifi, { key: 'i', size: 15 }), 'Probar conexión']),
      ]),
    ]);
  }

  const METRIC_META = {
    cpu:  { icon: 'Cpu', label: 'CPU', unit: '%' },
    mem:  { icon: 'Memory', label: 'Memoria', unit: '%' },
    disk: { icon: 'HardDrive', label: 'Disco', unit: '%' },
    load: { icon: 'Gauge', label: 'Load Avg', unit: '' },
    swap: { icon: 'Server', label: 'Swap', unit: '%' },
    net:  { icon: 'Network', label: 'Red', unit: '' },
  };

  function MetricCard({ id, data }) {
    const m = METRIC_META[id];
    const val = id === 'load' ? data.value.toFixed(2) : data.value.toFixed(1);
    const pct = id === 'load' ? Math.min(data.value / 4 * 100, 100) : data.value;
    return React.createElement('div', { className: 'card metric-card' }, [
      React.createElement('div', { className: 'mc-top', key: 't' }, [
        React.createElement('div', { className: 'mc-label', key: 'l' }, [
          React.createElement(I[m.icon], { key: 'i', size: 16 }),
          React.createElement('span', { key: 't', className: 't' }, m.label),
        ]),
        React.createElement(StatusBadge, { key: 'b', status: data.status }),
      ]),
      React.createElement('div', { className: 'mc-value-row', key: 'v' }, [
        React.createElement('div', { className: 'mc-value', key: 'v' }, [val, m.unit && React.createElement('span', { key: 'u', className: 'u' }, m.unit)]),
        data.detail && React.createElement('div', { className: 'mc-detail', key: 'd' }, data.detail),
      ]),
      React.createElement('div', { className: 'mc-chart', key: 'c' }, React.createElement(Sparkline, { values: data.history, height: 56 })),
      React.createElement('div', { className: 'mc-bar', key: 'b' }, React.createElement('i', { style: { width: pct + '%' } })),
    ]);
  }

  function DashboardSection(props) {
    return React.createElement('div', { className: 'content-inner' }, [
      React.createElement(ConnPanel, Object.assign({ key: 'cp' }, props.conn)),
      React.createElement('div', { key: 'm', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [
        React.createElement('div', { className: 'metrics-head', key: 'h' }, [
          React.createElement('div', { className: 'sec-head', key: 'l' }, [React.createElement(I.Activity, { key: 'i', size: 15 }), 'Métricas del sistema']),
          React.createElement('span', { className: 'metrics-sub', key: 's' }, 'datos de muestra'),
        ]),
        React.createElement('div', { className: 'metrics-grid', key: 'g' },
          ['cpu', 'mem', 'disk', 'load'].map((id) => React.createElement(MetricCard, { key: id, id, data: props.metrics[id] }))),
      ]),
    ]);
  }

  /* ============ MONITOR ============ */
  function KpiCard({ icon, label, children }) {
    return React.createElement('div', { className: 'card kpi' }, [
      React.createElement('div', { className: 'kpi-top', key: 't' }, [
        React.createElement(I[icon], { key: 'i', size: 15 }),
        React.createElement('span', { key: 'l', className: 'kpi-label' }, label),
      ]),
      children,
    ]);
  }

  function MonChart({ id, title, metrics, height, unit, yMax }) {
    const m = metrics[id];
    return React.createElement('div', { className: 'card monitor-card', key: id }, [
      React.createElement('div', { className: 'mon-top', key: 't' }, [
        React.createElement('div', { className: 'mon-title', key: 'l' }, [
          React.createElement(I[METRIC_META[id].icon], { key: 'i', size: 16, style: { color: 'var(--text-secondary)' } }),
          React.createElement('span', { key: 'lab', className: 'label' }, title),
          React.createElement('span', { key: 'v', className: 'v' }, [m.value.toFixed(1), React.createElement('span', { key: 'u', className: 'u' }, unit)]),
        ]),
        React.createElement(StatusBadge, { key: 'b', status: m.status }),
      ]),
      React.createElement(AreaChart, { key: 'c', series: m.longHistory, height, unit, yMax, xLabels: [] }),
    ]);
  }

  function MonitorSection({ metrics, extra, range, setRange }) {
    const ranges = ['30min', '1h', '6h', '24h'];
    const xLabels = { '30min': ['-30m', '-20m', '-10m', 'ahora'], '1h': ['-60m', '-40m', '-20m', 'ahora'], '6h': ['-6h', '-4h', '-2h', 'ahora'], '24h': ['-24h', '-16h', '-8h', 'ahora'] }[range];
    return React.createElement('div', { className: 'content-inner' }, [
      React.createElement('div', { className: 'sec-bar', key: 'bar' }, [
        React.createElement('div', { key: 'l' }, [
          React.createElement('div', { className: 'sec-title', key: 't' }, 'Monitoreo en vivo'),
          React.createElement('div', { className: 'sec-desc', key: 'd' }, 'Estado y series históricas de la instancia'),
        ]),
        React.createElement('div', { className: 'range-tabs', key: 'r' },
          ranges.map((r) => React.createElement('button', { key: r, className: 'range-tab' + (range === r ? ' active' : ''), onClick: () => setRange(r) }, r))),
      ]),
      // KPI strip
      React.createElement('div', { className: 'mon-kpis', key: 'kpis' }, [
        React.createElement(KpiCard, { key: 'up', icon: 'Clock', label: 'Uptime' },
          React.createElement('div', { key: 'b' }, [
            React.createElement('div', { className: 'kpi-value', key: 'v' }, extra.uptime),
            React.createElement('div', { className: 'kpi-sub', key: 's' }, 'sin reinicios'),
          ])),
        React.createElement(KpiCard, { key: 'net', icon: 'Network', label: 'Red' },
          React.createElement('div', { className: 'kpi-dual', key: 'd' }, [
            React.createElement('div', { className: 'd', key: 'rx' }, [
              React.createElement('span', { className: 'a', key: 'a' }, [React.createElement(I.ArrowDown, { key: 'i', size: 13, style: { verticalAlign: '-1px' } }), ' ' + metrics.net.value.toFixed(1)]),
              React.createElement('span', { className: 'l', key: 'l' }, 'MB/s ↓'),
            ]),
            React.createElement('div', { className: 'd', key: 'tx' }, [
              React.createElement('span', { className: 'a up', key: 'a' }, extra.tx.toFixed(1)),
              React.createElement('span', { className: 'l', key: 'l' }, 'MB/s ↑'),
            ]),
          ])),
        React.createElement(KpiCard, { key: 'proc', icon: 'Layers', label: 'Procesos' },
          React.createElement('div', { key: 'b' }, [
            React.createElement('div', { className: 'kpi-value', key: 'v' }, extra.processes),
            React.createElement('div', { className: 'kpi-sub', key: 's' }, extra.connections + ' conexiones'),
          ])),
        React.createElement(KpiCard, { key: 'temp', icon: 'Thermometer', label: 'Temperatura' },
          React.createElement('div', { key: 'b' }, [
            React.createElement('div', { className: 'kpi-value', key: 'v' }, [extra.temp, React.createElement('span', { className: 'u', key: 'u' }, '°C')]),
            React.createElement('div', { className: 'kpi-sub', key: 's' }, 'CPU package'),
          ])),
      ]),
      // resources
      React.createElement('div', { className: 'mon-grouplabel', key: 'gl1' }, 'Uso de recursos'),
      React.createElement('div', { className: 'mon-grid', key: 'res' }, [
        React.createElement(MonChart, { key: 'cpu', id: 'cpu', title: 'CPU', metrics, height: 150, unit: '%', yMax: 100 }),
        React.createElement(MonChart, { key: 'mem', id: 'mem', title: 'Memoria', metrics, height: 150, unit: '%', yMax: 100 }),
        React.createElement(MonChart, { key: 'disk', id: 'disk', title: 'Disco', metrics, height: 150, unit: '%', yMax: 100 }),
        React.createElement(MonChart, { key: 'swap', id: 'swap', title: 'Swap', metrics, height: 150, unit: '%', yMax: 100 }),
      ]),
      // network + load
      React.createElement('div', { className: 'mon-grouplabel', key: 'gl2' }, 'Red y carga'),
      React.createElement('div', { className: 'card monitor-card', key: 'netchart' }, [
        React.createElement('div', { className: 'mon-top', key: 't' }, [
          React.createElement('div', { className: 'mon-title', key: 'l' }, [
            React.createElement(I.Network, { key: 'i', size: 16, style: { color: 'var(--text-secondary)' } }),
            React.createElement('span', { key: 'lab', className: 'label' }, 'Tráfico de red'),
          ]),
          React.createElement('div', { className: 'legend', key: 'lg' }, [
            ['Entrada', 'var(--color-gold)'], ['Salida', 'var(--color-info-light)'],
          ].map(([t, col], i) => React.createElement('span', { key: i, className: 'li' }, [
            React.createElement('span', { key: 's', className: 'sw', style: { background: col } }), t,
          ]))),
        ]),
        React.createElement(AreaChart, { key: 'c', series: metrics.net.longHistory, height: 170, unit: '', yMax: 10, xLabels }),
      ]),
      React.createElement('div', { className: 'card monitor-card', key: 'load' }, [
        React.createElement('div', { className: 'mon-top', key: 't' }, [
          React.createElement('div', { className: 'mon-title', key: 'l' }, [
            React.createElement(I.Gauge, { key: 'i', size: 16, style: { color: 'var(--text-secondary)' } }),
            React.createElement('span', { key: 'lab', className: 'label' }, 'Load Average'),
          ]),
          React.createElement('div', { className: 'legend', key: 'lg' }, [
            ['1 min', 'var(--color-gold)'], ['5 min', 'var(--color-info-light)'], ['15 min', 'var(--text-secondary)'],
          ].map(([t, col], i) => React.createElement('span', { key: i, className: 'li' }, [
            React.createElement('span', { key: 's', className: 'sw', style: { background: col } }), t,
          ]))),
        ]),
        React.createElement(AreaChart, { key: 'c', series: metrics.load.longHistory, height: 170, unit: '', yMax: 4, xLabels }),
      ]),
    ]);
  }

  window.Sections = { DashboardSection, MonitorSection, StatusBadge };
})();
