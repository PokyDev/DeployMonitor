import { Area, AreaChart, ResponsiveContainer, YAxis, CartesianGrid } from 'recharts';
import type { MetricPoint } from './metrics';

const GOLD = '#D4AF37';
const SERIES_COLORS = [GOLD, '#2874A6', '#9A9A9A'];

type SparklineProps = {
  data: MetricPoint[];
  height?: number;
};

/** Minimal single-series area chart for metric-card previews — no axes, no grid. */
export function Sparkline({ data, height = 56 }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={GOLD}
          strokeWidth={1.5}
          fill="url(#sparkline-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

type SeriesAreaChartProps = {
  series: MetricPoint[][];
  height: number;
  yMax?: number;
};

/** Multi-series area chart for the Monitor view — renders up to three overlaid series. */
export function SeriesAreaChart({ series, height, yMax }: SeriesAreaChartProps) {
  const longest = series.reduce((max, s) => (s.length > max.length ? s : max), series[0] ?? []);
  const data = longest.map((point, i) => {
    const row: Record<string, number> = { t: point.t };
    series.forEach((s, idx) => {
      row[`s${idx}`] = s[i]?.v ?? s[s.length - 1]?.v ?? 0;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((_, idx) => (
            <linearGradient key={idx} id={`series-fill-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[idx % SERIES_COLORS.length]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SERIES_COLORS[idx % SERIES_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="rgba(154, 154, 154, 0.14)" vertical={false} />
        <YAxis
          domain={[0, yMax ?? 'auto']}
          width={28}
          tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-code)' }}
          axisLine={false}
          tickLine={false}
        />
        {series.map((_, idx) => (
          <Area
            key={idx}
            type="monotone"
            dataKey={`s${idx}`}
            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
            strokeWidth={1.5}
            fill={`url(#series-fill-${idx})`}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
