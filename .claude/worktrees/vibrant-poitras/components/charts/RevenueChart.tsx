'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { IncomeStatement } from '@/types/financial';

export default function RevenueChart({ data }: { data: IncomeStatement[] }) {
    const chartData = data.map(d => ({
        period: d.period,
        Revenue: Math.round(d.revenue),
        'Gross Profit': Math.round(d.grossProfit),
        'Net Income': Math.round(d.netIncome),
    }));

    return (
        <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
                <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="niGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                <XAxis dataKey="period" tick={{ fill: '#8892A4', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#1E2D45' }} />
                <YAxis tick={{ fill: '#8892A4', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#1E2D45' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: '#141B2D', border: '1px solid #1E2D45', borderRadius: 4, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }} />
                <Area type="monotone" dataKey="Revenue" stroke="#C9A84C" fill="url(#revGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Gross Profit" stroke="#3B82F6" fill="url(#gpGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Net Income" stroke="#4ade80" fill="url(#niGrad)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
