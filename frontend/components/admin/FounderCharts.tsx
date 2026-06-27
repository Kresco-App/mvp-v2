'use client'

// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatNumber, numberValue } from '@/lib/founderOps'

const krescoChartColor = 'var(--primary, #453dee)'

export function FounderGrowthChart({
  data,
  dataKey = 'new_students',
  label = 'New students',
}: {
  data: Array<Record<string, unknown>>
  dataKey?: string
  label?: string
}) {
  const values = data.map((row) => numberValue(row[dataKey]))
  const maxValue = values.length ? Math.max(...values) : 0
  const minValue = values.length ? Math.min(...values) : 0
  const isTotalSeries = dataKey === 'total_students'
  const totalRange = maxValue - minValue
  const totalPadding = Math.max(1, Math.ceil(totalRange * 0.25))
  const yAxisMin = isTotalSeries ? Math.max(0, Math.floor(minValue - totalPadding)) : 0
  const yAxisMax = isTotalSeries
    ? Math.max(yAxisMin + 1, Math.ceil(maxValue + totalPadding))
    : Math.max(1, Math.ceil(maxValue * 1.12))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart key={dataKey} data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="growthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={krescoChartColor} stopOpacity={0.24} />
            <stop offset="100%" stopColor={krescoChartColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(8)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} domain={[yAxisMin, yAxisMax]} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip formatter={(value) => [formatNumber(value), label]} labelFormatter={(value) => String(value)} />
        {isTotalSeries ? (
          <Line
            key={dataKey}
            type="monotone"
            dataKey={dataKey}
            stroke={krescoChartColor}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        ) : (
          <Area key={dataKey} type="monotone" dataKey={dataKey} stroke={krescoChartColor} strokeWidth={3} fill="url(#growthFill)" />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
