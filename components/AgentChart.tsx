'use client';

// ─────────────────────────────────────────────────────────────────────────────
// AgentChart — renders a chart inside the agent message bubble.
//
// The agent outputs a fenced code block with language "chart":
//   ```chart
//   { "type": "bar", "title": "Top RMs MTD", "xKey": "name", "yKey": "cr",
//     "data": [{"name":"Raj","cr":12.3}, ...] }
//   ```
//
// Supported chart types: bar | line | pie | area | waterfall | histogram | scatter | funnel
// ─────────────────────────────────────────────────────────────────────────────

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

// ── Chart spec type ───────────────────────────────────────────────────────────
export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'pie' | 'waterfall' | 'histogram' | 'scatter' | 'funnel';
  title?: string;
  xKey: string;          // column name for X axis / pie label / scatter X
  yKey: string | string[]; // column name(s) for Y axis / pie value / scatter Y
  data: Record<string, any>[];
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;     // stack bars/areas
  colors?: string[];     // override palette
  // scatter-specific
  zKey?: string;         // optional bubble size key for scatter
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' ? p.value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Custom pie label ──────────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null; // skip tiny slices
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ── Waterfall chart helper ─────────────────────────────────────────────────────
// Transforms raw data into stacked bar data where the invisible bottom bar
// creates the "floating" waterfall effect.
function buildWaterfallData(data: Record<string, any>[], valueKey: string) {
  let running = 0;
  return data.map((row) => {
    const value = Number(row[valueKey] ?? 0);
    const isNegative = value < 0;
    const base = isNegative ? running + value : running;
    const bar = Math.abs(value);
    const result = {
      ...row,
      _base: base,        // invisible spacer bar
      _bar: bar,          // visible portion
      _negative: isNegative,
      _value: value,
      _running: running + value,
    };
    running += value;
    return result;
  });
}

// Custom waterfall tooltip
function WaterfallTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload.find((p: any) => p.dataKey === '_bar');
  if (!entry) return null;
  const originalValue = payload[0]?.payload?._value ?? 0;
  const runningTotal  = payload[0]?.payload?._running ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-gray-600">Change: <span className={`font-medium ${originalValue >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {originalValue >= 0 ? '+' : ''}{originalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span></p>
      <p className="text-gray-600">Cumulative: <span className="font-medium">{runningTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
    </div>
  );
}

// ── Histogram helper ───────────────────────────────────────────────────────────
// Takes raw data and a numeric column, bins it into N buckets, returns frequency data.
function buildHistogramData(data: Record<string, any>[], valueKey: string, bins = 10) {
  const values = data.map(r => Number(r[valueKey] ?? 0)).filter(v => !isNaN(v));
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binSize = (max - min) / bins || 1;
  const buckets: { range: string; count: number; _min: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + i * binSize;
    const hi = lo + binSize;
    const count = values.filter(v => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
    buckets.push({
      range: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
      count,
      _min: lo,
    });
  }
  return buckets;
}

// ── Funnel chart (horizontal) ─────────────────────────────────────────────────
// Pure SVG rendering — no extra Recharts dependency needed.
function FunnelChartCustom({ data, xKey, yKey, palette }: {
  data: Record<string, any>[];
  xKey: string;
  yKey: string;
  palette: string[];
}) {
  const values = data.map(d => Number(d[yKey] ?? 0));
  const maxVal = Math.max(...values, 1);
  const barHeight = 32;
  const gap = 6;
  const totalH = data.length * (barHeight + gap);

  return (
    <div className="px-2 py-1 w-full overflow-x-auto">
      <svg width="100%" height={totalH} viewBox={`0 0 400 ${totalH}`} preserveAspectRatio="xMidYMid meet">
        {data.map((row, i) => {
          const val = Number(row[yKey] ?? 0);
          const pct = val / maxVal;
          const barW = Math.max(pct * 360, 20);
          const x = (400 - barW) / 2;
          const y = i * (barHeight + gap);
          const color = palette[i % palette.length];
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barHeight} rx={4} fill={color} opacity={0.85} />
              <text x={200} y={y + barHeight / 2} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={10} fontWeight={600}>
                {String(row[xKey] ?? '')} — {val.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentChart({ spec }: { spec: ChartSpec }) {
  const palette = spec.colors ?? COLORS;
  const yKeys = Array.isArray(spec.yKey) ? spec.yKey : [spec.yKey];
  const height = 220;

  const axisProps = {
    tick: { fontSize: 10, fill: '#6b7280' },
    tickLine: false,
    axisLine: { stroke: '#e5e7eb' },
  };

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: '#f3f4f6',
    vertical: false,
  };

  const renderChart = () => {
    switch (spec.type) {

      case 'bar':
        return (
          <BarChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={40} label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: 'insideLeft', fontSize: 9, fill: '#9ca3af' } : undefined} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={palette[i % palette.length]}
                stackId={spec.stacked ? 'stack' : undefined}
                radius={[3, 3, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key}
                stroke={palette[i % palette.length]} strokeWidth={2}
                dot={{ r: 3 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={spec.data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              {yKeys.map((key, i) => (
                <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette[i % palette.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={palette[i % palette.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {yKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key}
                stroke={palette[i % palette.length]} strokeWidth={2}
                fill={`url(#grad-${i})`}
                stackId={spec.stacked ? 'stack' : undefined} />
            ))}
          </AreaChart>
        );

      case 'pie': {
        const valueKey = yKeys[0];
        return (
          <PieChart margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <Pie data={spec.data} dataKey={valueKey} nameKey={spec.xKey}
              cx="50%" cy="50%" outerRadius={80}
              labelLine={false} label={<PieLabel />}>
              {spec.data.map((_: any, i: number) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        );
      }

      // ── Waterfall ────────────────────────────────────────────────────────────
      // Shows cumulative changes (e.g. AUM bridge: opening → inflows → redemptions → closing)
      // Each bar "floats" at its running total via an invisible base bar stacked underneath.
      case 'waterfall': {
        const valueKey = yKeys[0];
        const wfData = buildWaterfallData(spec.data, valueKey);
        return (
          <BarChart data={wfData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<WaterfallTooltip />} />
            {/* Invisible spacer bar — no fill, no border */}
            <Bar dataKey="_base" stackId="wf" fill="transparent" legendType="none" />
            {/* Visible change bar — green for positive, red for negative */}
            <Bar dataKey="_bar" stackId="wf" radius={[3, 3, 0, 0]} maxBarSize={40} legendType="none">
              {wfData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry._negative ? '#ef4444' : palette[0]}
                />
              ))}
            </Bar>
          </BarChart>
        );
      }

      // ── Histogram ────────────────────────────────────────────────────────────
      // Bins a numeric column into frequency buckets.
      // Use for RM performance distribution, AUM spread analysis, etc.
      // yKey should be the numeric column to bin; xKey is used as a label if data is pre-binned.
      case 'histogram': {
        const valueKey = yKeys[0];
        // If data already has pre-computed bins (e.g. range + count), use as-is.
        // Otherwise compute bins from raw numeric column.
        const isPreBinned = spec.data.length > 0 && 'count' in spec.data[0];
        const histData = isPreBinned
          ? spec.data
          : buildHistogramData(spec.data, valueKey, Math.min(spec.data.length, 12));
        const xDataKey = isPreBinned ? spec.xKey : 'range';
        const yDataKey = isPreBinned ? valueKey : 'count';
        return (
          <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xDataKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={yDataKey} fill={palette[0]} radius={[2, 2, 0, 0]} maxBarSize={60}>
              {histData.map((_: any, i: number) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Bar>
          </BarChart>
        );
      }

      // ── Scatter ───────────────────────────────────────────────────────────────
      // XY correlation chart. xKey = X axis column, yKey = Y axis column.
      // Optional zKey = bubble size (ZAxis). Good for "AUM vs net inflow" correlation.
      case 'scatter': {
        const xDataKey = spec.xKey;
        const yDataKey = yKeys[0];
        const zDataKey = spec.zKey;
        return (
          <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey={xDataKey}
              type="number"
              name={spec.xLabel ?? xDataKey}
              {...axisProps}
              label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', offset: -2, fontSize: 9, fill: '#9ca3af' } : undefined}
            />
            <YAxis
              dataKey={yDataKey}
              type="number"
              name={spec.yLabel ?? yDataKey}
              {...axisProps}
              width={44}
              label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: 'insideLeft', fontSize: 9, fill: '#9ca3af' } : undefined}
            />
            {zDataKey && <ZAxis dataKey={zDataKey} range={[30, 200]} name={zDataKey} />}
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload ?? {};
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                    {Object.entries(d)
                      .filter(([k]) => !k.startsWith('_'))
                      .map(([k, v]: any) => (
                        <p key={k} className="text-gray-600">
                          <span className="font-medium">{k}:</span>{' '}
                          {typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : v}
                        </p>
                      ))}
                  </div>
                );
              }}
            />
            <Scatter
              data={spec.data}
              fill={palette[0]}
              fillOpacity={0.75}
            >
              {spec.data.map((_: any, i: number) => (
                <Cell key={i} fill={palette[i % palette.length]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        );
      }

      // ── Funnel ────────────────────────────────────────────────────────────────
      // Conversion funnel. xKey = stage label, yKey = count/value.
      // Rendered as proportional horizontal bars centered on the axis.
      case 'funnel': {
        const valueKey = yKeys[0];
        return (
          <FunnelChartCustom
            data={spec.data}
            xKey={spec.xKey}
            yKey={valueKey}
            palette={palette}
          />
        );
      }

      default:
        return null;
    }
  };

  // Funnel uses its own container (SVG)
  if (spec.type === 'funnel') {
    return (
      <div className="mt-2 mb-1 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
        {spec.title && (
          <div className="px-3 pt-2.5 pb-0">
            <p className="text-xs font-semibold text-gray-700">{spec.title}</p>
          </div>
        )}
        <div className="py-2">
          {renderChart()}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 mb-1 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      {spec.title && (
        <div className="px-3 pt-2.5 pb-0">
          <p className="text-xs font-semibold text-gray-700">{spec.title}</p>
        </div>
      )}
      <div className="px-1 py-2">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
