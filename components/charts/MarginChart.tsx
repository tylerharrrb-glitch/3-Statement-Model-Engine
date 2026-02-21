'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { IncomeStatement } from '@/types/financial';

export default function MarginChart({ data }: { data: IncomeStatement[] }) {
    const chartData = data.map(d => ({
        period: d.period,
        'Gross': +(d.grossMargin * 100).toFixed(1),
        'Operating': +(d.ebitMargin * 100).toFixed(1),
        'Net': +(d.netMargin * 100).toFixed(1),
    }));

    return (
        <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="period" tick={{ fill: '#a0a0b8', fontSize: 11 }} axisLine={{ stroke: '#2a2a3e' }} />
                <YAxis tick={{ fill: '#a0a0b8', fontSize: 11 }} axisLine={{ stroke: '#2a2a3e' }} tickFormatter={v => `${v}%`} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => `${v}%`} />
                <Bar dataKey="Gross" fill="#4f8cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Operating" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
