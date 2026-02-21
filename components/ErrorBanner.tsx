'use client';

import { useEffect, useState } from 'react';
import { useModelStore } from '@/lib/store';

export default function ErrorBanner() {
    const { calculationError, clearError, calculateModel } = useModelStore();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (calculationError) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                clearError();
            }, 10000);
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [calculationError, clearError]);

    if (!visible || !calculationError) return null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            id="error-banner"
            style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid var(--accent-rose)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                animation: 'fadeIn 0.3s ease-out',
            }}
        >
            <span style={{ fontSize: 20 }} aria-hidden="true">⚠️</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent-rose)' }}>
                    Calculation Error
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {calculationError}
                </div>
            </div>
            <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => {
                    clearError();
                    calculateModel();
                }}
                aria-label="Retry calculation"
            >
                🔄 Retry
            </button>
            <button
                onClick={() => { setVisible(false); clearError(); }}
                aria-label="Dismiss error"
                style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1,
                }}
            >
                ×
            </button>
        </div>
    );
}
