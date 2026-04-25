'use client';

import { useEffect } from 'react';
import { useModelStore } from '@/lib/store';

export default function LiveRatesPanel() {
    const { liveRates, lastRatesFetch, refreshLiveRates } = useModelStore();

    useEffect(() => {
        // Auto-fetch on first mount if no rates cached
        if (!liveRates) {
            refreshLiveRates();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fp = (v: number) => `${(v * 100).toFixed(2)}%`;
    const fx = (v: number) => v.toFixed(2);

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Live Market Rates</h2>
                    {liveRates && (
                        <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: 'var(--text-secondary)' }}>
                            Source: {liveRates.source} | Last MPC: {liveRates.lastMPCDate}
                        </p>
                    )}
                </div>
                <button
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '.78rem' }}
                    onClick={refreshLiveRates}
                >
                    Refresh Rates
                </button>
            </div>

            {!liveRates ? (
                <p style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                    Loading rates...
                </p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    {/* CBE Policy Rates */}
                    <div className="card" style={{ padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '.95rem', borderBottom: '2px solid var(--accent)', paddingBottom: 8 }}>
                            CBE Policy Rates
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <RateRow label="Deposit Rate (Overnight)" value={fp(liveRates.cbeDepositRate)} />
                            <RateRow label="Lending Rate (Overnight)" value={fp(liveRates.cbeLendingRate)} />
                            <RateRow label="Discount Rate" value={fp(liveRates.cbeDiscountRate)} />
                            <RateRow label="12M T-Bill Yield" value={fp(liveRates.tbillRate12m)} highlight />
                        </div>
                    </div>

                    {/* Exchange Rates */}
                    <div className="card" style={{ padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '.95rem', borderBottom: '2px solid var(--accent)', paddingBottom: 8 }}>
                            Exchange Rates (EGP)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <RateRow label="USD / EGP" value={fx(liveRates.usdEgpRate)} highlight />
                            <RateRow label="EUR / EGP" value={fx(liveRates.eurEgpRate)} />
                            <RateRow label="SAR / EGP" value={fx(liveRates.sarEgpRate)} />
                            <RateRow label="AED / EGP" value={fx(liveRates.aedEgpRate)} />
                        </div>
                    </div>

                    {/* Inflation & Meta */}
                    <div className="card" style={{ padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '.95rem', borderBottom: '2px solid var(--accent)', paddingBottom: 8 }}>
                            Inflation & Metadata
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <RateRow label="Egyptian CPI (Annual)" value={fp(liveRates.egyptianCPI)} />
                            <RateRow label="Last MPC Decision" value={liveRates.lastMPCDate} />
                            <RateRow label="Last Updated" value={new Date(liveRates.lastUpdated).toLocaleString()} />
                        </div>
                    </div>
                </div>
            )}

            {lastRatesFetch && (
                <p style={{ marginTop: 12, fontSize: '.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Rates fetched: {new Date(lastRatesFetch).toLocaleString()}
                </p>
            )}
        </div>
    );
}

function RateRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{
                fontSize: '.88rem',
                fontWeight: highlight ? 700 : 500,
                fontFamily: 'monospace',
                color: highlight ? 'var(--accent)' : 'var(--text)',
            }}>
                {value}
            </span>
        </div>
    );
}
