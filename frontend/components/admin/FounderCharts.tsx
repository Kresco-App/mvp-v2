'use client'

// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatMoneyCentimes, formatNumber } from '@/lib/founderOps'

export function FounderGrowthChart({ data }: { data: Array<Record<string, unknown>> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="growthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(8)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip formatter={(value) => [formatNumber(value), 'New students']} labelFormatter={(value) => String(value)} />
        <Area type="monotone" dataKey="new_students" stroke="#2563eb" strokeWidth={3} fill="url(#growthFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function FounderBarChartPanel({ title, data }: { title: string; data: Array<{ key: string; value: number }> }) {
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <h3 className="m-0 mb-3 text-[13px] font-black text-[#111827]">{title}</h3>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="key" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => `${Math.round(Number(value) / 100)}`} />
            <Tooltip formatter={(value) => [formatMoneyCentimes(value), 'Amount']} />
            <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
