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
// Supported chart types: bar | line | pie | area
// ─────────────────────────────────────────────────────────────────────────────

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

// ── Chart spec type ───────────────────────────────────────────────────────────
export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'pie';
  title?: string;
  xKey: string;          // column name for X axis / pie label
  yKey: string | string[]; // column name(s) for Y axis / pie value
  data: Record<string, any>[];
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;     // stack bars/areas
  colors?: string[];     // override palette
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

      default:
        return null;
    }
  };

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
