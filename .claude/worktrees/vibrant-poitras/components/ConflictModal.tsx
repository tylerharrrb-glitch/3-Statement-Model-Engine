'use client';

import { useModelStore } from '@/lib/store';

export default function ConflictModal() {
    const { conflictDetected, dismissConflict } = useModelStore();

    if (!conflictDetected) return null;

    const handleKeepMine = () => {
        // Overwrite localStorage with current state — just dismiss, persist middleware handles it
        dismissConflict();
    };

    const handleLoadLatest = () => {
        // Reload from localStorage
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Edit conflict detected"
        >
            <div
                className="glass"
                style={{
                    padding: 24, maxWidth: 420, width: '90%',
                    animation: 'fadeIn 0.2s ease-out',
                }}
            >
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--accent-amber)' }}>
                    ⚠️ Conflict Detected
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                    The financial model was modified in another browser tab. Choose how to resolve:
                </p>
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <button
                        className="btn-primary"
                        onClick={handleKeepMine}
                        aria-label="Keep my changes and overwrite"
                        style={{ width: '100%' }}
                    >
                        Keep My Changes
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={handleLoadLatest}
                        aria-label="Load latest version from other tab"
                        style={{ width: '100%' }}
                    >
                        Load Latest Version
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={dismissConflict}
                        aria-label="Dismiss conflict notification"
                        style={{ width: '100%', opacity: 0.7 }}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
}
