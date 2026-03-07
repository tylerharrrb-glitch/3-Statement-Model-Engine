// ============================================================
// Egyptian Depreciation Schedules
// ============================================================
// Egyptian Tax Law No. 91/2005, Articles 25-26 prescribes
// EXACT depreciation rates per asset class using the
// declining-balance method on Net Book Value.
// ============================================================

export interface EgyptianAssetClass {
    name: string;
    nameArabic: string;
    rate: number;        // Fixed by law — NOT a range
    method: 'declining-balance';
}

/**
 * CORRECT Egyptian Tax Depreciation Rates (fixed by law).
 * Previous rates (ranges like 2-5% for Buildings) were WRONG.
 */
export const EGYPTIAN_TAX_DEPRECIATION_RATES: Record<string, EgyptianAssetClass> = {
    buildings: { name: 'Buildings & Structures', nameArabic: 'مباني', rate: 0.05, method: 'declining-balance' },
    machinery: { name: 'Machinery & Equipment', nameArabic: 'آلات ومعدات', rate: 0.25, method: 'declining-balance' },
    vehicles: { name: 'Vehicles & Transport', nameArabic: 'سيارات ووسائل نقل', rate: 0.25, method: 'declining-balance' },
    computers: { name: 'Computers & IT', nameArabic: 'أجهزة حاسب آلي', rate: 0.50, method: 'declining-balance' },
    furniture: { name: 'Furniture & Fixtures', nameArabic: 'أثاث وتجهيزات', rate: 0.20, method: 'declining-balance' },
};

export interface DepreciationBreakdown {
    buildings: number;   // fraction of total (0-1), must sum to 1.0
    machinery: number;
    vehicles: number;
    computers: number;
    furniture: number;
}

/**
 * Calculate Egyptian Tax Depreciation using declining balance on Net Book Value.
 * This is the legally mandated method under Tax Law 91/2005, Articles 25-26.
 *
 * @param previousNetPPE - Net Book Value at start of period (NOT Gross PP&E!)
 * @param capex - Capital expenditures added during the period
 * @param assetMix - Breakdown of assets by class (fractions summing to 1.0)
 * @returns Total depreciation and per-class breakdown
 */
export function calculateEgyptianTaxDepreciation(
    previousNetPPE: number,
    capex: number,
    assetMix: DepreciationBreakdown,
): { totalDepreciation: number; byClass: Record<string, number> } {
    const depreciableBase = previousNetPPE + capex;
    const byClass: Record<string, number> = {};
    let totalDepreciation = 0;

    for (const [cls, fraction] of Object.entries(assetMix)) {
        const classBase = depreciableBase * fraction;
        const rateObj = EGYPTIAN_TAX_DEPRECIATION_RATES[cls];
        if (!rateObj) continue;
        byClass[cls] = classBase * rateObj.rate;
        totalDepreciation += byClass[cls];
    }

    return { totalDepreciation, byClass };
}

/**
 * Calculate blended depreciation rate from asset mix and Egyptian tax rates.
 * Useful for quick estimates without full per-class breakdown.
 */
export function calculateEgyptianBlendedRate(breakdown: DepreciationBreakdown): number {
    const weights = [
        breakdown.buildings,
        breakdown.machinery,
        breakdown.vehicles,
        breakdown.computers,
        breakdown.furniture,
    ];
    const rates = [0.05, 0.25, 0.25, 0.50, 0.20];
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight === 0) return 0.10; // fallback
    return weights.reduce((sum, w, i) => sum + w * rates[i], 0) / totalWeight;
}

/**
 * Straight-line depreciation (for financial reporting comparison only).
 * Depreciates on average Gross PP&E during the period.
 */
export function calculateStraightLineDepreciation(
    previousGrossPPE: number,
    capex: number,
    rate: number,
): number {
    const avgGrossPPE = previousGrossPPE + capex / 2;
    return avgGrossPPE * rate;
}

/** Egyptian corporate tax defaults */
export const EGYPTIAN_TAX_DEFAULTS = {
    corporateTaxRate: 0.225,           // 22.5%
    vatRate: 0.14,                     // 14%
    dividendWithholdingRate: 0.10,      // 10% (Tax Law Art. 56 bis)
};

/** Egyptian fiscal year presets */
export const FISCAL_YEAR_PRESETS = {
    calendar: { startMonth: 1, endMonth: 12 },
    'egyptian-govt': { startMonth: 7, endMonth: 6 },   // July–June
    custom: { startMonth: 1, endMonth: 12 },
};
