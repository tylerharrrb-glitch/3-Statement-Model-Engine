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
                        <stop offset="5%" stopColor="#4f8cff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4f8cff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="niGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="period" tick={{ fill: '#a0a0b8', fontSize: 11 }} axisLine={{ stroke: '#2a2a3e' }} />
                <YAxis tick={{ fill: '#a0a0b8', fontSize: 11 }} axisLine={{ stroke: '#2a2a3e' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="Revenue" stroke="#4f8cff" fill="url(#revGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Gross Profit" stroke="#34d399" fill="url(#gpGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Net Income" stroke="#8b5cf6" fill="url(#niGrad)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
