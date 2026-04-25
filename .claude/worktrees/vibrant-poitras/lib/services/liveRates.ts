// ============================================================
// Live Rates Service — CBE Policy Rates + FX + T-Bill Yields
// ============================================================
// The engine (not Excel) is responsible for "live" data.
// Excel receives correct data via the export's cached values.
// ============================================================

import type { AssumptionSet } from '@/types/assumptions';

export interface LiveRates {
    // CBE Policy Rates (from CBE MPC decisions)
    cbeDepositRate: number;       // overnight deposit
    cbeLendingRate: number;       // overnight lending
    cbeDiscountRate: number;      // discount/main operation rate

    // T-bill & Risk-Free
    tbillRate12m: number;         // 12M T-bill yield (risk-free proxy)

    // Exchange Rates (base currency per 1 EGP-relevant unit)
    usdEgpRate: number;           // USD/EGP
    eurEgpRate: number;           // EUR/EGP
    sarEgpRate: number;           // SAR/EGP
    aedEgpRate: number;           // AED/EGP

    // Inflation
    egyptianCPI: number;          // latest annual CPI %

    // Metadata
    lastUpdated: string;          // ISO timestamp
    lastMPCDate: string;          // e.g. "April 2, 2026"
    source: string;               // attribution string
}

// Fallback values — always valid, updated as of April 2026 MPC
const FALLBACK_RATES: LiveRates = {
    cbeDepositRate: 0.190,
    cbeLendingRate: 0.200,
    cbeDiscountRate: 0.195,
    tbillRate12m: 0.235,
    usdEgpRate: 50.80,
    eurEgpRate: 55.20,
    sarEgpRate: 13.55,
    aedEgpRate: 13.83,
    egyptianCPI: 0.134,
    lastUpdated: new Date().toISOString(),
    lastMPCDate: 'April 2, 2026',
    source: 'Fallback (CBE April 2, 2026 MPC)',
};

let cachedRates: LiveRates = { ...FALLBACK_RATES, lastUpdated: new Date().toISOString() };

/**
 * Fetch live exchange rates from ExchangeRate-API (free, no auth).
 * CBE policy rates are hardcoded from the latest MPC decision since
 * there is no public real-time API for CBE rates.
 */
export async function fetchLiveRates(): Promise<LiveRates> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const fxRes = await fetch(
            'https://api.exchangerate-api.com/v4/latest/USD',
            { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (fxRes.ok) {
            const fxData = await fxRes.json();
            const egp = fxData.rates?.EGP ?? FALLBACK_RATES.usdEgpRate;

            cachedRates = {
                ...FALLBACK_RATES,
                usdEgpRate: egp,
                eurEgpRate: egp / (fxData.rates?.EUR ?? 0.92),
                sarEgpRate: egp / (fxData.rates?.SAR ?? 3.75),
                aedEgpRate: egp / (fxData.rates?.AED ?? 3.67),
                lastUpdated: new Date().toISOString(),
                source: 'ExchangeRate-API (FX) + CBE fallback (policy rates)',
            };
        }
        return cachedRates;
    } catch {
        return { ...FALLBACK_RATES, lastUpdated: new Date().toISOString() };
    }
}

/** Returns the most recently fetched rates (or fallback if never fetched). */
export function getLastKnownRates(): LiveRates {
    return cachedRates;
}

/** Returns the fallback rates (for use in exports when no fetch has occurred). */
export function getFallbackRates(): LiveRates {
    return FALLBACK_RATES;
}

/**
 * Apply live rates to an assumption set. Returns a partial update object
 * that can be spread into the assumptions.
 */
export function applyLiveRatesToAssumptions(
    assumptions: AssumptionSet,
    rates: LiveRates,
): Partial<AssumptionSet> {
    return {
        cbeRate: rates.cbeDiscountRate,
        riskFreeRate: rates.tbillRate12m,
        // Interest rates are kept as-is unless formula-driven rates are enabled
        ...(assumptions.useFormulaRates ? {
            interestRateOnDebt: assumptions.interestRateOnDebt.map((_, i) =>
                Math.max(rates.cbeLendingRate + 0.02 - (i * 0.01), rates.cbeDiscountRate)
            ),
            interestRateOnCash: assumptions.interestRateOnCash.map((_, i) =>
                Math.max(rates.cbeDepositRate - (i * 0.01), 0.08)
            ),
        } : {}),
    };
}
