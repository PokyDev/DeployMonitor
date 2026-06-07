/* DeployMonitor — chart primitives (sparkline + area chart) */
(function () {
  // Build a smooth-ish polyline path from values normalized to box
  function pathFrom(values, w, h, pad = 2) {
    const n = values.length;
    if (n < 2) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (n - 1);
    const pts = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return [x, y];
    });
    // Catmull-Rom -> bezier smoothing
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return { d, pts };
  }

  function Sparkline({ values, width = 300, height = 56, color = 'var(--color-gold)', fill = true }) {
    const res = pathFrom(values, width, height);
    if (!res) return null;
    const { d, pts } = res;
    const last = pts[pts.length - 1];
    const areaD = `${d} L ${last[0].toFixed(2)} ${height} L ${pts[0][0].toFixed(2)} ${height} Z`;
    const gid = React.useMemo(() => 'sg' + Math.random().toString(36).slice(2, 8), []);
    return React.createElement('svg', {
      viewBox: `0 0 ${width} ${height}`, width: '100%', height,
      preserveAspectRatio: 'none', style: { display: 'block' },
    }, [
      React.createElement('defs', { key: 'd' },
        React.createElement('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          React.createElement('stop', { key: 0, offset: '0%', stopColor: color, stopOpacity: 0.22 }),
          React.createElement('stop', { key: 1, offset: '100%', stopColor: color, stopOpacity: 0 }),
        ])
      ),
      fill && React.createElement('path', { key: 'a', d: areaD, fill: `url(#${gid})`, stroke: 'none' }),
      React.createElement('path', { key: 'l', d, fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }),
      React.createElement('circle', { key: 'p', cx: last[0], cy: last[1], r: 2.2, fill: color }),
    ]);
  }

  // Larger chart with grid lines, y labels, x timestamps
  function AreaChart({ series, width = 900, height = 220, color = 'var(--color-gold)', unit = '%', yMax = 100, xLabels = [] }) {
    const padL = 40, padR = 12, padT = 14, padB = 24;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const gid = React.useMemo(() => 'ac' + Math.random().toString(36).slice(2, 8), []);

    function linePath(values) {
      const n = values.length;
      const stepX = innerW / (n - 1);
      const pts = values.map((v, i) => [padL + i * stepX, padT + innerH * (1 - v / yMax)]);
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
      }
      return { d, pts };
    }

    const list = Array.isArray(series[0]) ? series : [series];
    const colors = [color, 'var(--color-info-light)', 'var(--text-secondary)'];
    const ticks = [0, 0.25, 0.5, 0.75, 1];

    return React.createElement('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, style: { display: 'block', overflow: 'visible' } }, [
      React.createElement('defs', { key: 'def' },
        React.createElement('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          React.createElement('stop', { key: 0, offset: '0%', stopColor: color, stopOpacity: 0.16 }),
          React.createElement('stop', { key: 1, offset: '100%', stopColor: color, stopOpacity: 0 }),
        ])
      ),
      // grid + y labels
      ...ticks.map((t, i) => {
        const y = padT + innerH * t;
        const val = Math.round(yMax * (1 - t));
        return React.createElement('g', { key: 'g' + i }, [
          React.createElement('line', { key: 'l', x1: padL, y1: y, x2: width - padR, y2: y, stroke: 'var(--border-subtle)', strokeWidth: 1 }),
          React.createElement('text', { key: 't', x: padL - 8, y: y + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }, `${val}${unit === '%' ? '' : ''}`),
        ]);
      }),
      // x labels
      ...xLabels.map((lab, i) => {
        const x = padL + (innerW * i) / (xLabels.length - 1);
        return React.createElement('text', { key: 'x' + i, x, y: height - 6, textAnchor: i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle', fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }, lab);
      }),
      // series
      ...list.map((vals, si) => {
        const { d, pts } = linePath(vals);
        const areaD = `${d} L ${pts[pts.length - 1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;
        const col = colors[si] || color;
        return React.createElement('g', { key: 's' + si }, [
          si === 0 && React.createElement('path', { key: 'a', d: areaD, fill: `url(#${gid})` }),
          React.createElement('path', { key: 'l', d, fill: 'none', stroke: col, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: si === 0 ? 1 : 0.7 }),
        ]);
      }),
    ]);
  }

  window.Charts = { Sparkline, AreaChart, pathFrom };
})();
