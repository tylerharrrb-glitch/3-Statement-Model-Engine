// ============================================================
// Egyptian Industry Templates
// ============================================================
// Pre-configured assumption sets for common Egyptian sectors.
// Each template provides typical margins, WC cycles, CapEx,
// and depreciation profiles.

import { DepreciationBreakdown } from '@/lib/schedules/egyptian-depreciation';

export interface IndustryTemplate {
    id: string;
    name: string;
    nameArabic: string;
    description: string;
    // Typical assumptions
    revenueGrowth: number;
    grossMargin: number;
    sgaPercent: number;
    dso: number;
    dio: number;
    dpo: number;
    capexPercent: number;
    assetMix: DepreciationBreakdown;
}

export const EGYPTIAN_INDUSTRY_TEMPLATES: IndustryTemplate[] = [
    {
        id: 'real-estate',
        name: 'Real Estate & Construction',
        nameArabic: 'العقارات والبناء',
        description: 'Developers, contractors, property management',
        revenueGrowth: 0.15,
        grossMargin: 0.35,
        sgaPercent: 0.08,
        dso: 90,
        dio: 60,
        dpo: 75,
        capexPercent: 0.03,
        assetMix: { buildings: 0.60, machinery: 0.20, vehicles: 0.10, computers: 0.05, furniture: 0.05 },
    },
    {
        id: 'fmcg',
        name: 'FMCG / Consumer Goods',
        nameArabic: 'سلع استهلاكية',
        description: 'Food, beverages, household products',
        revenueGrowth: 0.12,
        grossMargin: 0.30,
        sgaPercent: 0.12,
        dso: 30,
        dio: 45,
        dpo: 40,
        capexPercent: 0.05,
        assetMix: { buildings: 0.25, machinery: 0.45, vehicles: 0.15, computers: 0.05, furniture: 0.10 },
    },
    {
        id: 'telecom',
        name: 'Telecom & Technology',
        nameArabic: 'اتصالات وتكنولوجيا',
        description: 'Telecom operators, ISPs, tech companies',
        revenueGrowth: 0.10,
        grossMargin: 0.55,
        sgaPercent: 0.15,
        dso: 35,
        dio: 5,
        dpo: 50,
        capexPercent: 0.15,
        assetMix: { buildings: 0.15, machinery: 0.40, vehicles: 0.05, computers: 0.30, furniture: 0.10 },
    },
    {
        id: 'petrochemicals',
        name: 'Petrochemicals & Energy',
        nameArabic: 'بتروكيماويات وطاقة',
        description: 'Oil & gas, chemicals, fertilizers',
        revenueGrowth: 0.08,
        grossMargin: 0.25,
        sgaPercent: 0.06,
        dso: 45,
        dio: 30,
        dpo: 45,
        capexPercent: 0.08,
        assetMix: { buildings: 0.20, machinery: 0.55, vehicles: 0.10, computers: 0.05, furniture: 0.10 },
    },
    {
        id: 'tourism-hospitality',
        name: 'Tourism & Hospitality',
        nameArabic: 'سياحة وضيافة',
        description: 'Hotels, restaurants, travel agencies',
        revenueGrowth: 0.18,
        grossMargin: 0.45,
        sgaPercent: 0.20,
        dso: 15,
        dio: 10,
        dpo: 25,
        capexPercent: 0.06,
        assetMix: { buildings: 0.55, machinery: 0.10, vehicles: 0.10, computers: 0.10, furniture: 0.15 },
    },
];

export function getTemplate(id: string): IndustryTemplate | undefined {
    return EGYPTIAN_INDUSTRY_TEMPLATES.find(t => t.id === id);
}
