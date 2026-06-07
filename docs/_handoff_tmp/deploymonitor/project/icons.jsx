/* DeployMonitor — Lucide-style line icons (stroke 1.5) */
(function () {
  const Svg = ({ size = 18, sw = 1.5, children, style, className }) =>
    React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round',
      strokeLinejoin: 'round', style, className,
    }, children);

  const P = (d) => React.createElement('path', { d, key: d });
  const make = (...nodes) => (props) => React.createElement(Svg, props, nodes.map((n, i) =>
    typeof n === 'string'
      ? React.createElement('path', { d: n, key: i })
      : React.cloneElement(n, { key: i })
  ));

  const c = (cx, cy, r) => React.createElement('circle', { cx, cy, r });
  const ln = (x1, y1, x2, y2) => React.createElement('line', { x1, y1, x2, y2 });
  const rc = (x, y, w, h, r) => React.createElement('rect', { x, y, width: w, height: h, rx: r });
  const pl = (points) => React.createElement('polyline', { points });

  const Icons = {
    Terminal:   make('m7 11 2-2-2-2', ln(11, 13, 17, 13)),
    TerminalBox:make(rc(2, 4, 20, 16, 2), 'm7 10 2 2-2 2', ln(13, 14, 16, 14)),
    Activity:   make('M22 12h-4l-3 9L9 3l-3 9H2'),
    Folder:     make('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
    FolderPlay: make('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z', 'm10 11 4 2.5L10 16Z'),
    Settings:   make('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', c(12, 12, 3)),
    Grid:       make(rc(3, 3, 7, 7, 1), rc(14, 3, 7, 7, 1), rc(14, 14, 7, 7, 1), rc(3, 14, 7, 7, 1)),
    Code:       make('m16 18 6-6-6-6', 'm8 6-6 6 6 6'),
    FileCode:   make('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v5h5', 'm10 13-2 2 2 2', 'm14 17 2-2-2-2'),
    Clock:      make(c(12, 12, 10), 'M12 6v6l4 2'),
    History:    make('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'),
    Key:        make(c(7.5, 15.5, 5.5), 'm21 2-9.6 9.6', 'm15.5 7.5 3 3L22 7l-3-3'),
    Edit:       make('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z'),
    Zap:        make('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'),
    Wifi:       make('M12 20h.01', 'M2 8.82a15 15 0 0 1 20 0', 'M5 12.859a10 10 0 0 1 14 0', 'M8.5 16.429a5 5 0 0 1 7 0'),
    Cpu:        make(rc(4, 4, 16, 16, 2), rc(9, 9, 6, 6, 0.5), ln(15, 2, 15, 4), ln(9, 2, 9, 4), ln(15, 20, 15, 22), ln(9, 20, 9, 22), ln(20, 15, 22, 15), ln(20, 9, 22, 9), ln(2, 15, 4, 15), ln(2, 9, 4, 9)),
    Memory:     make('M6 19v-3', 'M10 19v-3', 'M14 19v-3', 'M18 19v-3', 'M8 11V9', 'M16 11V9', 'M12 11V9', 'M2 15h20', 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.837V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.063A2 2 0 0 0 2 8.1Z'),
    HardDrive:  make(ln(22, 12, 2, 12), 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', ln(6, 16, 6.01, 16), ln(10, 16, 10.01, 16)),
    Gauge:      make('m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'),
    ChevronUp:   make('m18 15-6-6-6 6'),
    ChevronDown: make('m6 9 6 6 6-6'),
    ChevronLeft: make('m15 18-6-6 6-6'),
    ChevronRight:make('m9 18 6-6-6-6'),
    PanelLeft:  make(rc(3, 3, 18, 18, 2), ln(9, 3, 9, 21)),
    Moon:       make('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
    Sun:        make(c(12, 12, 4), 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'),
    Monitor:    make(rc(2, 3, 20, 14, 2), ln(8, 21, 16, 21), ln(12, 17, 12, 21)),
    Minimize:   make(ln(5, 12, 19, 12)),
    Maximize:   make(rc(4, 4, 16, 16, 2)),
    Close:      make(ln(18, 6, 6, 18), ln(6, 6, 18, 18)),
    X:          make(ln(18, 6, 6, 18), ln(6, 6, 18, 18)),
    Trash:      make('M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
    Plus:       make(ln(12, 5, 12, 19), ln(5, 12, 19, 12)),
    Play:       make('m6 3 14 9-14 9V3z'),
    Save:       make('M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', 'M7 3v4a1 1 0 0 0 1 1h7'),
    Check:      make('M20 6 9 17l-5-5'),
    ArrowRight: make(ln(5, 12, 19, 12), 'm12 5 7 7-7 7'),
    LogOut:     make('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', ln(21, 12, 9, 12)),
    Search:     make(c(11, 11, 8), 'm21 21-4.3-4.3'),
    Lock:       make(rc(3, 11, 18, 11, 2), 'M7 11V7a5 5 0 0 1 10 0v4'),
    Dot:        make(c(12, 12, 1)),
    Circle:     make(c(12, 12, 9)),
    Refresh:    make('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'),
    Filter:     make('M3 4h18l-7 8v6l-4 2v-8z'),
    ChevronExpand: make('m7 15 5 5 5-5', 'm7 9 5-5 5 5'),
    Wrench:     make('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'),
    Network:    make(rc(16, 16, 6, 6, 1), rc(2, 16, 6, 6, 1), rc(9, 2, 6, 6, 1), 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3', ln(12, 12, 12, 8)),
    Thermometer:make('M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z'),
    Layers:     make('m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z', 'm6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59', 'm6.08 14.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59'),
    Server:     make(rc(2, 2, 20, 8, 2), rc(2, 14, 20, 8, 2), ln(6, 6, 6.01, 6), ln(6, 18, 6.01, 18)),
    ArrowDown:  make(ln(12, 5, 12, 19), 'm19 12-7 7-7-7'),
    ArrowUp:    make(ln(12, 19, 12, 5), 'm5 12 7-7 7 7'),
    Globe:      make(c(12, 12, 10), 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', ln(2, 12, 22, 12)),
  };

  window.Icons = Icons;
})();
