// ============================================================
// Bilingual Financial Labels (English / Arabic)
// ============================================================

export type Language = 'en' | 'ar';

interface LabelPair {
    en: string;
    ar: string;
}

export const FINANCIAL_LABELS: Record<string, LabelPair> = {
    // ── Income Statement ──
    revenue: { en: 'Revenue', ar: 'الإيرادات' },
    revenueGrowthRate: { en: 'Revenue Growth Rate', ar: 'معدل نمو الإيرادات' },
    cogs: { en: 'Cost of Goods Sold', ar: 'تكلفة البضاعة المباعة' },
    grossProfit: { en: 'Gross Profit', ar: 'مجمل الربح' },
    grossMargin: { en: 'Gross Margin', ar: 'هامش الربح الإجمالي' },
    sgaExpense: { en: 'SG&A Expense', ar: 'مصاريف البيع والإدارية' },
    rdExpense: { en: 'R&D Expense', ar: 'مصاريف البحث والتطوير' },
    depreciation: { en: 'Depreciation', ar: 'الإهلاك' },
    amortization: { en: 'Amortization', ar: 'الاستهلاك' },
    otherOpex: { en: 'Other OpEx', ar: 'مصاريف تشغيلية أخرى' },
    totalOpex: { en: 'Total Operating Expenses', ar: 'إجمالي المصاريف التشغيلية' },
    ebit: { en: 'EBIT', ar: 'الربح التشغيلي' },
    ebitda: { en: 'EBITDA', ar: 'الربح قبل الفوائد والضرائب والإهلاك' },
    ebitMargin: { en: 'EBIT Margin', ar: 'هامش الربح التشغيلي' },
    interestIncome: { en: 'Interest Income', ar: 'إيرادات الفوائد' },
    interestExpense: { en: 'Interest Expense', ar: 'مصروف الفوائد' },
    otherIncomeExpense: { en: 'Other Income/Expense', ar: 'إيرادات ومصروفات أخرى' },
    ebt: { en: 'Earnings Before Tax', ar: 'الربح قبل الضريبة' },
    taxRate: { en: 'Tax Rate', ar: 'معدل الضريبة' },
    taxExpense: { en: 'Tax Expense', ar: 'مصروف الضريبة' },
    netIncome: { en: 'Net Income', ar: 'صافي الربح' },
    netMargin: { en: 'Net Margin', ar: 'هامش صافي الربح' },
    sharesOutstanding: { en: 'Shares Outstanding', ar: 'الأسهم القائمة' },
    eps: { en: 'Earnings Per Share', ar: 'ربحية السهم' },
    vatCollected: { en: 'VAT Collected', ar: 'ضريبة القيمة المضافة المحصلة' },

    // ── Balance Sheet ──
    cash: { en: 'Cash & Equivalents', ar: 'النقد وما يعادله' },
    accountsReceivable: { en: 'Accounts Receivable', ar: 'المدينون' },
    inventory: { en: 'Inventory', ar: 'المخزون' },
    prepaidExpenses: { en: 'Prepaid Expenses', ar: 'مصروفات مدفوعة مقدماً' },
    otherCurrentAssets: { en: 'Other Current Assets', ar: 'أصول متداولة أخرى' },
    totalCurrentAssets: { en: 'Total Current Assets', ar: 'إجمالي الأصول المتداولة' },
    netPPE: { en: 'Net PP&E', ar: 'صافي الأصول الثابتة' },
    intangibles: { en: 'Intangible Assets', ar: 'أصول غير ملموسة' },
    goodwill: { en: 'Goodwill', ar: 'شهرة المحل' },
    otherLongTermAssets: { en: 'Other Long-Term Assets', ar: 'أصول طويلة الأجل أخرى' },
    totalNonCurrentAssets: { en: 'Total Non-Current Assets', ar: 'إجمالي الأصول غير المتداولة' },
    totalAssets: { en: 'Total Assets', ar: 'إجمالي الأصول' },
    accountsPayable: { en: 'Accounts Payable', ar: 'الدائنون' },
    accruedExpenses: { en: 'Accrued Expenses', ar: 'مصروفات مستحقة' },
    shortTermDebt: { en: 'Short-Term Debt', ar: 'ديون قصيرة الأجل' },
    currentPortionLTD: { en: 'Current Portion LTD', ar: 'الجزء الجاري من الديون الطويلة' },
    deferredRevenue: { en: 'Deferred Revenue', ar: 'إيرادات مؤجلة' },
    otherCurrentLiabilities: { en: 'Other Current Liabilities', ar: 'التزامات متداولة أخرى' },
    totalCurrentLiabilities: { en: 'Total Current Liabilities', ar: 'إجمالي الالتزامات المتداولة' },
    longTermDebt: { en: 'Long-Term Debt', ar: 'ديون طويلة الأجل' },
    deferredTaxLiabilities: { en: 'Deferred Tax Liabilities', ar: 'التزامات ضريبية مؤجلة' },
    otherLongTermLiabilities: { en: 'Other LT Liabilities', ar: 'التزامات طويلة الأجل أخرى' },
    totalNonCurrentLiabilities: { en: 'Total Non-Current Liabilities', ar: 'إجمالي الالتزامات غير المتداولة' },
    totalLiabilities: { en: 'Total Liabilities', ar: 'إجمالي الالتزامات' },
    commonStock: { en: 'Common Stock', ar: 'رأس المال' },
    additionalPaidInCapital: { en: 'Additional Paid-in Capital', ar: 'علاوة إصدار' },
    retainedEarnings: { en: 'Retained Earnings', ar: 'أرباح محتجزة' },
    treasuryStock: { en: 'Treasury Stock', ar: 'أسهم خزينة' },
    otherComprehensiveIncome: { en: 'Other Comprehensive Income', ar: 'دخل شامل آخر' },
    totalEquity: { en: 'Total Equity', ar: 'إجمالي حقوق الملكية' },

    // ── Cash Flow ──
    cashFromOperations: { en: 'Cash from Operations', ar: 'التدفقات النقدية من الأنشطة التشغيلية' },
    cashFromInvesting: { en: 'Cash from Investing', ar: 'التدفقات النقدية من الأنشطة الاستثمارية' },
    cashFromFinancing: { en: 'Cash from Financing', ar: 'التدفقات النقدية من الأنشطة التمويلية' },
    netChangeInCash: { en: 'Net Change in Cash', ar: 'صافي التغير في النقد' },
    freeCashFlow: { en: 'Free Cash Flow', ar: 'التدفق النقدي الحر' },
    capex: { en: 'Capital Expenditures', ar: 'النفقات الرأسمالية' },
    dividendsPaid: { en: 'Dividends Paid', ar: 'توزيعات الأرباح المدفوعة' },

    // ── Ratios ──
    currentRatio: { en: 'Current Ratio', ar: 'نسبة التداول' },
    debtToEquity: { en: 'Debt-to-Equity', ar: 'نسبة الدين إلى حقوق الملكية' },
    interestCoverage: { en: 'Interest Coverage', ar: 'نسبة تغطية الفائدة' },
    roe: { en: 'Return on Equity', ar: 'العائد على حقوق الملكية' },
    roa: { en: 'Return on Assets', ar: 'العائد على الأصول' },

    // ── Egyptian-specific ──
    vatRate: { en: 'VAT Rate', ar: 'معدل ضريبة القيمة المضافة' },
    corporateTaxRate: { en: 'Corporate Tax Rate', ar: 'معدل الضريبة على الشركات' },
    dividendWithholding: { en: 'Dividend Withholding Rate', ar: 'معدل الاستقطاع على التوزيعات' },

    // ── Profit Appropriation ──
    employeeProfitSharing: { en: 'Employee Profit Share (10%)', ar: 'نصيب العاملين في الأرباح (10%)' },
    netIncomeAfterEPD: { en: 'Net Income After EPD', ar: 'صافي الربح بعد نصيب العاملين' },
    legalReserveAddition: { en: 'Legal Reserve (5%)', ar: 'الاحتياطي القانوني (5%)' },
    distributableProfit: { en: 'Distributable Profit', ar: 'الأرباح القابلة للتوزيع' },
    grossDividends: { en: 'Gross Dividends', ar: 'إجمالي التوزيعات' },
    dividendWHT: { en: 'Dividend WHT (10%)', ar: 'ضريبة الاستقطاع على التوزيعات (10%)' },
    netDividends: { en: 'Net Dividends', ar: 'صافي التوزيعات' },
    additionToRE: { en: 'Addition to Retained Earnings', ar: 'إضافة للأرباح المحتجزة' },

    // ── Tax Loss Carryforward ──
    taxLossCarryforward: { en: 'Tax Loss Carryforward', ar: 'خسائر مرحلة' },
    taxLossUtilized: { en: 'Tax Loss Utilized', ar: 'خسائر مستخدمة' },
    taxLossRemaining: { en: 'Tax Loss Remaining', ar: 'خسائر متبقية' },
    taxableIncome: { en: 'Taxable Income', ar: 'الدخل الخاضع للضريبة' },

    // ── Memo Items ──
    nopat: { en: 'NOPAT', ar: 'صافي الربح التشغيلي بعد الضريبة' },
    fcff: { en: 'FCFF', ar: 'التدفق النقدي الحر للمنشأة' },

    // ── Balance Sheet New Items ──
    legalReserve: { en: 'Legal Reserve', ar: 'الاحتياطي القانوني' },
    endOfServiceProvision: { en: 'End of Service Provision', ar: 'مخصص نهاية الخدمة' },

    // ── DuPont Analysis ──
    dupontROE_3F: { en: 'DuPont ROE (3-Factor)', ar: 'العائد على حقوق الملكية - تحليل دو بونت (3 عوامل)' },
    dupontROE_5F: { en: 'DuPont ROE (5-Factor)', ar: 'العائد على حقوق الملكية - تحليل دو بونت (5 عوامل)' },
    dupontTaxBurden: { en: 'Tax Burden', ar: 'العبء الضريبي' },
    dupontInterestBurden: { en: 'Interest Burden', ar: 'عبء الفوائد' },

    // ── Altman Z'-Score ──
    altmanZScore: { en: "Altman Z'-Score", ar: "مؤشر ألتمان Z'" },

    // ── Break-Even ──
    breakEvenRevenue: { en: 'Break-Even Revenue', ar: 'إيرادات نقطة التعادل' },
    marginOfSafety: { en: 'Margin of Safety', ar: 'هامش الأمان' },
    operatingLeverage: { en: 'Operating Leverage', ar: 'الرافعة التشغيلية' },
};

/**
 * Get the label for a financial line item in the specified language.
 */
export function getLabel(key: string, language: Language = 'en'): string {
    const pair = FINANCIAL_LABELS[key];
    if (!pair) return key;
    return pair[language] ?? pair.en;
}
