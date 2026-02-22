// ============================================================
// Valuation Multiples Engine
// ============================================================
// Calculates trading multiples and provides EGX 30 benchmarks.

import { AssumptionSet } from '@/types/assumptions';
import { ModelResults, ValuationMultiples, EGXBenchmarks } from '@/types/financial';

/**
 * EGX 30 benchmark multiples (Q1 2026 reference).
 * Source: EGX Market Report, Damodaran Online.
 */
export function getEGXBenchmarks(): EGXBenchmarks {
    return {
        pe: { low: 8, high: 12, avg: 10 },
        evEbitda: { low: 6, high: 9, avg: 7.5 },
        priceBook: { low: 1.0, high: 2.5, avg: 1.6 },
    };
}

/**
 * Calculate trading multiples from engine results + share price.
 */
export function calculateMultiples(
    results: ModelResults,
    assumptions: AssumptionSet,
): ValuationMultiples {
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];

    const sharePrice = assumptions.sharePrice ?? 0;
    const shares = lastIS.sharesOutstanding || 1;

    if (sharePrice <= 0) {
        return { pe: null, evEbitda: null, priceBook: null, fcfYield: null, dividendYield: null, marketCap: null, enterpriseValueMarket: null };
    }

    const marketCap = sharePrice * shares;
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;
    const netDebt = totalDebt - lastBS.cash;
    const enterpriseValueMarket = marketCap + netDebt;

    // P/E
    const pe = lastIS.eps !== 0 ? sharePrice / lastIS.eps : null;

    // EV/EBITDA
    const evEbitda = lastIS.ebitda !== 0 ? enterpriseValueMarket / lastIS.ebitda : null;

    // Price / Book
    const bookValuePerShare = lastBS.totalEquity / shares;
    const priceBook = bookValuePerShare !== 0 ? sharePrice / bookValuePerShare : null;

    // FCF Yield = FCF / Market Cap
    const fcfYield = marketCap !== 0 ? lastCF.freeCashFlow / marketCap : null;

    // Dividend Yield
    const dividendsPaid = Math.abs(lastCF.dividendsPaid);
    const dps = dividendsPaid / shares;
    const dividendYield = sharePrice !== 0 ? dps / sharePrice : null;

    return {
        pe,
        evEbitda,
        priceBook,
        fcfYield,
        dividendYield,
        marketCap,
        enterpriseValueMarket,
    };
}

/**
 * Calculate implied share prices from EGX benchmark multiples.
 */
export function calculateImpliedPrices(
    results: ModelResults,
    benchmarks: EGXBenchmarks,
): { fromPE: number; fromEVEBITDA: number; fromPB: number } {
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const shares = lastIS.sharesOutstanding || 1;

    // Implied from P/E × EPS
    const fromPE = benchmarks.pe.avg * lastIS.eps;

    // Implied from EV/EBITDA
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;
    const netDebt = totalDebt - lastBS.cash;
    const impliedEV = benchmarks.evEbitda.avg * lastIS.ebitda;
    const impliedEquity = impliedEV - netDebt;
    const fromEVEBITDA = impliedEquity / shares;

    // Implied from P/B × BVPS
    const bvps = lastBS.totalEquity / shares;
    const fromPB = benchmarks.priceBook.avg * bvps;

    return { fromPE, fromEVEBITDA, fromPB };
}

/**
 * Sector-specific Working Capital presets for Egyptian market.
 */
export const SECTOR_WC_PRESETS: Record<string, { dso: number; dio: number; dpo: number; label: string }> = {
    'technology': { dso: 45, dio: 0, dpo: 30, label: 'Technology / Software' },
    'manufacturing': { dso: 60, dio: 45, dpo: 60, label: 'Manufacturing' },
    'retail': { dso: 15, dio: 60, dpo: 45, label: 'Retail' },
    'government-contractor': { dso: 90, dio: 45, dpo: 60, label: 'Government Contractor' },
    'export-oriented': { dso: 45, dio: 30, dpo: 30, label: 'Export-Oriented' },
    'real-estate': { dso: 180, dio: 0, dpo: 90, label: 'Real Estate' },
};
