// ============================================================
// Formatting Utilities — multi-currency, always English numerals
// ============================================================

export type SupportedCurrency = 'USD' | 'EGP' | 'EUR' | 'GBP' | 'SAR' | 'AED';

interface CurrencyConfig {
    code: string;
    symbol: string;
    label: string;
}

export const CURRENCY_MAP: Record<SupportedCurrency, CurrencyConfig> = {
    USD: { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
    EGP: { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound (E£)' },
    EUR: { code: 'EUR', symbol: '€', label: 'Euro (€)' },
    GBP: { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
    SAR: { code: 'SAR', symbol: 'SR', label: 'Saudi Riyal (SR)' },
    AED: { code: 'AED', symbol: 'AED', label: 'UAE Dirham (AED)' },
};

/**
 * Format currency with proper symbol and ALWAYS English numerals.
 * CRITICAL: Always uses 'en-US' locale — never 'ar-EG' which produces Arabic numerals (٠-٩).
 *
 * @param value    - Number to format
 * @param currency - Currency code (USD, EGP, EUR, GBP, SAR, AED)
 * @param compact  - If true, use abbreviated form ($1.2M, $340K)
 *
 * @example
 * formatCurrency(1000000, 'USD')        → "$1,000,000"
 * formatCurrency(1000000, 'EGP')        → "E£1,000,000"  (never Arabic ١٬٠٠٠٬٠٠٠)
 * formatCurrency(1000000, 'USD', true)  → "$1.0M"
 */
export function formatCurrency(value: number, currency: string = 'USD', compact: boolean = false): string {
    const cfg = CURRENCY_MAP[currency as SupportedCurrency] || CURRENCY_MAP.USD;

    if (compact) {
        if (Math.abs(value) >= 1_000_000_000) return `${cfg.symbol}${(value / 1_000_000_000).toFixed(1)}B`;
        if (Math.abs(value) >= 1_000_000) return `${cfg.symbol}${(value / 1_000_000).toFixed(1)}M`;
        if (Math.abs(value) >= 1_000) return `${cfg.symbol}${(value / 1_000).toFixed(1)}K`;
    }

    // ⭐ ALWAYS use 'en-US' locale → ensures English numerals (0-9)
    const formatted = value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

    return `${cfg.symbol}${formatted}`;
}

export function formatPercent(value: number, decimals: number = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/**
 * Format EPS with the selected currency symbol.
 * Always English numerals.
 */
export function formatEPS(value: number, currency: string = 'USD'): string {
    const cfg = CURRENCY_MAP[currency as SupportedCurrency] || CURRENCY_MAP.USD;
    return `${cfg.symbol}${value.toFixed(2)}`;
}

export function colorForValue(value: number): string {
    if (value > 0) return 'var(--accent-emerald)';
    if (value < 0) return 'var(--accent-rose)';
    return 'var(--text-primary)';
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}
