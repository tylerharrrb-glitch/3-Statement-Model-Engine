// ============================================================
// Egyptian Depreciation Schedules
// ============================================================
// Egyptian tax law prescribes specific depreciation rate ranges
// per asset class. This module provides those rates and a helper
// to compute a blended depreciation rate from an asset-class
// breakdown of gross PP&E.
// ============================================================

export interface EgyptianAssetClass {
    name: string;
    nameArabic: string;
    minRate: number;   // Minimum allowed by Egyptian law
    maxRate: number;   // Maximum allowed
    typical: number;   // Typical / recommended rate
}

export const EGYPTIAN_DEPRECIATION_RATES: EgyptianAssetClass[] = [
    { name: 'Buildings', nameArabic: 'مباني', minRate: 0.02, maxRate: 0.05, typical: 0.04 },
    { name: 'Machinery', nameArabic: 'آلات', minRate: 0.07, maxRate: 0.10, typical: 0.08 },
    { name: 'Vehicles', nameArabic: 'مركبات', minRate: 0.125, maxRate: 0.25, typical: 0.20 },
    { name: 'Computers', nameArabic: 'حاسبات', minRate: 0.25, maxRate: 0.33, typical: 0.33 },
    { name: 'Furniture', nameArabic: 'أثاث', minRate: 0.10, maxRate: 0.20, typical: 0.15 },
];

export interface DepreciationBreakdown {
    buildings: number;   // fraction of gross PP&E (0-1)
    machinery: number;
    vehicles: number;
    computers: number;
    furniture: number;
}

/**
 * Calculate a blended depreciation rate from an asset-class breakdown.
 * Each key represents the fraction of gross PP&E in that asset class.
 * Returns the weighted-average depreciation rate using Egyptian typical rates.
 */
export function calculateEgyptianBlendedRate(breakdown: DepreciationBreakdown): number {
    const rates = EGYPTIAN_DEPRECIATION_RATES;
    const weights = [
        breakdown.buildings,
        breakdown.machinery,
        breakdown.vehicles,
        breakdown.computers,
        breakdown.furniture,
    ];
    const typicals = rates.map(r => r.typical);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight === 0) return 0.10; // fallback
    return weights.reduce((sum, w, i) => sum + w * typicals[i], 0) / totalWeight;
}

/** Egyptian corporate tax defaults */
export const EGYPTIAN_TAX_DEFAULTS = {
    corporateTaxRate: 0.225,           // 22.5%
    vatRate: 0.14,                     // 14%
    dividendWithholdingRate: 0.10,      // 10% (conservative)
};

/** Egyptian fiscal year presets */
export const FISCAL_YEAR_PRESETS = {
    calendar: { startMonth: 1, endMonth: 12 },
    'egyptian-govt': { startMonth: 7, endMonth: 6 },   // July–June
    custom: { startMonth: 1, endMonth: 12 },
};
