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
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                <XAxis dataKey="period" tick={{ fill: '#8892A4', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#1E2D45' }} />
                <YAxis tick={{ fill: '#8892A4', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#1E2D45' }} tickFormatter={v => `${v}%`} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={{ background: '#141B2D', border: '1px solid #1E2D45', borderRadius: 4, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }} formatter={(v: any) => `${v}%`} />
                <Bar dataKey="Gross" fill="#C9A84C" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Operating" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Net" fill="#4ade80" radius={[3, 3, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
