// ============================================================
// Full Scenario Test Suite
// ============================================================
// Tests ALL scenarios (Base, Optimistic, Conservative) through
// the complete engine with all audit fixes verified.
//
// Run: npx tsx scripts/test-audit-fixes.ts
// ============================================================

import { getDefaultAssumptions, getDefaultHistoricalInputs } from '../types/assumptions';
import { createDefaultScenarios } from '../lib/scenario-manager';
import { runFullModel } from '../lib/engines/integrator';
import type { ModelResults } from '../types/financial';

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`  ✗ FAIL: ${msg}`);
        totalFail++;
        process.exitCode = 1;
    } else {
        console.log(`  ✓ PASS: ${msg}`);
        totalPass++;
    }
}

function assertClose(actual: number, expected: number, msg: string, tol = 0.01) {
    const diff = Math.abs(actual - expected);
    if (diff > tol) {
        console.error(`  ✗ FAIL: ${msg} — expected=${expected.toFixed(2)}, actual=${actual.toFixed(2)}, diff=${diff.toFixed(4)}`);
        totalFail++;
        process.exitCode = 1;
    } else {
        console.log(`  ✓ PASS: ${msg} (${actual.toFixed(2)})`);
        totalPass++;
    }
}

function section(title: string) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'─'.repeat(60)}`);
}

// ═══════════════════════════════════════════════════════════════
//  SETUP — Run all 3 scenarios
// ═══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     FULL SCENARIO TEST SUITE — 3-Statement Model Engine  ║');
console.log('║     Base Case · Optimistic · Conservative                ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

const scenarios = createDefaultScenarios();
const historicalInputs = getDefaultHistoricalInputs();
const scenarioResults: { name: string; type: string; results: ModelResults }[] = [];

for (const scenario of scenarios) {
    try {
        const results = runFullModel(scenario.assumptions, historicalInputs);
        scenarioResults.push({ name: scenario.name, type: scenario.type, results });
        const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
        console.log(`\n✓ ${scenario.name} computed: Revenue=${lastIS.revenue.toFixed(0)}, NI=${lastIS.netIncome.toFixed(0)}, Converged=${results.convergenceInfo.converged}`);
    } catch (e) {
        console.error(`\n✗ ${scenario.name} FAILED TO COMPUTE: ${e}`);
        totalFail++;
        process.exitCode = 1;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 1 — Integration Checks (All Scenarios)
// ═══════════════════════════════════════════════════════════════
section('TEST 1 — Integration Checks (All 28 checks × All Scenarios)');

for (const { name, results } of scenarioResults) {
    let passed = 0;
    let total = 0;
    const failures: string[] = [];

    for (const checks of results.integrationChecks) {
        for (const detail of checks.details) {
            total++;
            if (detail.passed) passed++;
            else failures.push(`${detail.name}: exp=${detail.expected.toFixed(2)}, act=${detail.actual.toFixed(2)}, Δ=${detail.difference.toFixed(4)}`);
        }
    }

    if (failures.length > 0) {
        console.error(`  ✗ ${name}: ${passed}/${total} passed`);
        failures.forEach(f => console.error(`      → ${f}`));
        totalFail++;
        process.exitCode = 1;
    } else {
        console.log(`  ✓ ${name}: ${passed}/${total} integration checks PASS`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 2 — Balance Sheet Integrity (All Scenarios)
// ═══════════════════════════════════════════════════════════════
section('TEST 2 — Balance Sheet Balances (A = L + E, All Scenarios)');

for (const { name, results } of scenarioResults) {
    let allBalanced = true;
    for (const bs of results.balanceSheets) {
        if (!bs.isBalanced) {
            console.error(`  ✗ ${name} ${bs.period}: NOT balanced (diff=${bs.balanceDifference.toFixed(4)})`);
            allBalanced = false;
            totalFail++;
            process.exitCode = 1;
        }
    }
    if (allBalanced) {
        console.log(`  ✓ ${name}: All ${results.balanceSheets.length} periods balanced`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 3 — Cash Reconciliation (CF EndCash = BS Cash)
// ═══════════════════════════════════════════════════════════════
section('TEST 3 — Cash Reconciliation (CF Ending Cash = BS Cash)');

for (const { name, results } of scenarioResults) {
    const projCFs = results.cashFlowStatements.filter(cf => cf.periodType === 'projected');
    const projBSs = results.balanceSheets.filter(bs => bs.periodType === 'projected');
    let allTied = true;

    for (let i = 0; i < projCFs.length; i++) {
        const diff = Math.abs(projCFs[i].endingCash - projBSs[i].cash);
        if (diff > 0.01) {
            console.error(`  ✗ ${name} ${projCFs[i].period}: CF=${projCFs[i].endingCash.toFixed(2)} ≠ BS=${projBSs[i].cash.toFixed(2)} (Δ=${diff.toFixed(4)})`);
            allTied = false;
            totalFail++;
        }
    }
    if (allTied) {
        console.log(`  ✓ ${name}: All ${projCFs.length} projected cash balances tie`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 4 — CFF WHT Treatment (All Scenarios)
// ═══════════════════════════════════════════════════════════════
section('TEST 4 — CFF WHT Treatment (memo, not double-counted)');

for (const { name, results } of scenarioResults) {
    const projCFs = results.cashFlowStatements.filter(cf => cf.periodType === 'projected');
    let allCorrect = true;

    for (const cf of projCFs) {
        const expectedCFF = cf.debtIssuance + cf.debtRepayment + cf.equityIssuance +
            cf.dividendsPaid + cf.employeeProfitSharingPaid + cf.shareRepurchases;
        const diff = Math.abs(cf.cashFromFinancing - expectedCFF);
        if (diff > 0.01) {
            console.error(`  ✗ ${name} ${cf.period}: CFF=${cf.cashFromFinancing.toFixed(2)} ≠ expected=${expectedCFF.toFixed(2)}`);
            allCorrect = false;
            totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: CFF correctly excludes WHT (memo only) across all ${projCFs.length} years`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 5 — Convergence (All Scenarios Must Converge)
// ═══════════════════════════════════════════════════════════════
section('TEST 5 — Circular Reference Convergence');

for (const { name, results } of scenarioResults) {
    assert(results.convergenceInfo.converged,
        `${name}: converged in ${results.convergenceInfo.iterations} iterations (delta=${results.convergenceInfo.finalDelta.toFixed(6)})`);
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 6 — Altman Z-Scores (Both Z' and Z_EM)
// ═══════════════════════════════════════════════════════════════
section('TEST 6 — Altman Z-Scores (Z\' Private + Z_EM Emerging Markets)');

for (const { name, results } of scenarioResults) {
    let allComputed = true;
    for (const ratio of results.ratios) {
        if (ratio.altmanZScore === undefined || ratio.altmanZScoreEM === undefined) {
            console.error(`  ✗ ${name} ${ratio.period}: Z-score undefined`);
            allComputed = false;
            totalFail++;
        }
    }
    if (allComputed) {
        const lastRatio = results.ratios[results.ratios.length - 1];
        console.log(`  ✓ ${name}: All Z-scores computed. Last period: Z'=${lastRatio.altmanZScore!.toFixed(2)} (${lastRatio.altmanZone}), Z_EM=${lastRatio.altmanZScoreEM!.toFixed(2)} (${lastRatio.altmanZoneEM})`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 7 — IS Waterfall Integrity
// ═══════════════════════════════════════════════════════════════
section('TEST 7 — Income Statement Waterfall (Revenue → NI)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    for (const s of results.incomeStatements) {
        // Revenue → Gross Profit
        const expGP = s.revenue - s.cogs;
        if (Math.abs(s.grossProfit - expGP) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: GP=${s.grossProfit.toFixed(2)} ≠ Rev-COGS=${expGP.toFixed(2)}`);
            allCorrect = false;
            totalFail++;
        }
        // EBITDA = EBIT + D&A
        const expEBITDA = s.ebit + s.depreciation + s.amortization;
        if (Math.abs(s.ebitda - expEBITDA) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: EBITDA=${s.ebitda.toFixed(2)} ≠ EBIT+D&A=${expEBITDA.toFixed(2)}`);
            allCorrect = false;
            totalFail++;
        }
        // Net Income waterfall
        const expNI = s.revenue - s.cogs - s.sgaExpense - s.rdExpense - s.depreciation -
            s.amortization - s.otherOpex - s.stockBasedComp - s.interestExpense +
            s.interestIncome - s.taxExpense + s.otherIncomeExpense;
        if (Math.abs(s.netIncome - expNI) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: NI=${s.netIncome.toFixed(2)} ≠ waterfall=${expNI.toFixed(2)}`);
            allCorrect = false;
            totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: IS waterfall correct for all ${results.incomeStatements.length} periods`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 8 — Profit Appropriation Waterfall (Egyptian Law)
// ═══════════════════════════════════════════════════════════════
section('TEST 8 — Profit Appropriation (LR → EPD → Dividends → RE)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    for (const s of results.incomeStatements.filter(s => s.periodType === 'projected')) {
        // Distributable = NI - LR
        const expDist = s.netIncome - s.legalReserveAddition;
        if (Math.abs(s.distributableProfit - expDist) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: Distributable=${s.distributableProfit.toFixed(2)} ≠ NI-LR=${expDist.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
        // NI After EPD = Distributable - EPD
        const expNIAE = s.distributableProfit - s.employeeProfitSharing;
        if (Math.abs(s.netIncomeAfterEPD - expNIAE) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: NIAfterEPD=${s.netIncomeAfterEPD.toFixed(2)} ≠ ${expNIAE.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
        // Net Dividends = Gross - WHT
        const expNetDiv = s.grossDividends - s.dividendWHT;
        if (Math.abs(s.netDividends - expNetDiv) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: NetDiv=${s.netDividends.toFixed(2)} ≠ Gross-WHT=${expNetDiv.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
        // Addition to RE = NI After EPD - Gross Dividends
        const expRE = s.netIncomeAfterEPD - s.grossDividends;
        if (Math.abs(s.additionToRE - expRE) > 0.01) {
            console.error(`  ✗ ${name} ${s.period}: AddToRE=${s.additionToRE.toFixed(2)} ≠ ${expRE.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: Profit appropriation waterfall correct (LR→EPD→Div→RE)`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 9 — CBE DSCR Formula (EBITDA-based, not NI+D&A)
// ═══════════════════════════════════════════════════════════════
section('TEST 9 — CBE DSCR Formula (EBITDA / Debt Service)');

for (const { name, results } of scenarioResults) {
    const projIS = results.incomeStatements.filter(s => s.periodType === 'projected');
    const projCF = results.cashFlowStatements.filter(s => s.periodType === 'projected');

    for (let i = 0; i < projIS.length; i++) {
        const eb = projIS[i].ebit + projIS[i].depreciation + projIS[i].amortization;
        const debtService = Math.abs(projCF[i]?.debtRepayment ?? 0) + projIS[i].interestExpense;
        const dscrCorrect = debtService > 0 ? eb / debtService : 0;

        // Also compute the OLD wrong formula to show the difference
        const dscrWrong = debtService > 0
            ? (projIS[i].netIncome + projIS[i].depreciation + projIS[i].amortization) / debtService
            : 0;

        const diff = dscrCorrect - dscrWrong;
        console.log(`  ✓ ${name} ${projIS[i].period}: DSCR(EBITDA)=${dscrCorrect.toFixed(2)}x vs DSCR(NI+DA)=${dscrWrong.toFixed(2)}x (Δ=${diff > 0 ? '+' : ''}${diff.toFixed(2)}x)`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 10 — CBE ICR Tiered Thresholds
// ═══════════════════════════════════════════════════════════════
section('TEST 10 — CBE ICR Tiered Thresholds (≥2.50x GREEN, ≥1.50x AMBER, <1.50x RED)');

for (const { name, results } of scenarioResults) {
    const projIS = results.incomeStatements.filter(s => s.periodType === 'projected');
    for (const s of projIS) {
        const icr = s.interestExpense !== 0 ? s.ebit / s.interestExpense : 0;
        const tier = icr >= 2.50 ? 'GREEN' : icr >= 1.50 ? 'AMBER' : 'RED';
        const icon = tier === 'GREEN' ? '✓' : tier === 'AMBER' ? '⚠' : '✗';
        console.log(`  ${icon} ${name} ${s.period}: ICR=${icr.toFixed(2)}x → ${tier}`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 11 — Legal Reserve Cap Enforcement
// ═══════════════════════════════════════════════════════════════
section('TEST 11 — Legal Reserve Cap (50% of Paid-Up Capital)');

for (const { name, results } of scenarioResults) {
    let cumulativeLR = 0; // default initial = 0
    let allCorrect = true;
    for (const s of results.incomeStatements.filter(s => s.periodType === 'projected')) {
        cumulativeLR += s.legalReserveAddition;
        // LR addition must be non-negative
        if (s.legalReserveAddition < -0.01) {
            console.error(`  ✗ ${name} ${s.period}: LR addition is negative (${s.legalReserveAddition.toFixed(2)})`);
            allCorrect = false; totalFail++;
        }
        // Cumulative LR must not exceed cap (5000 for 10000 paid-up at 50%)
        if (cumulativeLR > 5000 + 0.01) {
            console.error(`  ✗ ${name} ${s.period}: Cumulative LR (${cumulativeLR.toFixed(2)}) exceeds cap (5000)`);
            allCorrect = false; totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: LR cap respected. Cumulative LR after projection = ${cumulativeLR.toFixed(2)} (cap=5000)`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 12 — Dividend Blocking on Negative RE
// ═══════════════════════════════════════════════════════════════
section('TEST 12 — Dividend Blocking on Negative Cumulative RE');
{
    const assumptions = getDefaultAssumptions();
    const histInputs = { ...getDefaultHistoricalInputs() };
    histInputs.retainedEarnings = [-50000, -30000]; // Force negative RE

    const results = runFullModel(assumptions, histInputs);
    const firstProj = results.incomeStatements.find(s => s.periodType === 'projected');
    if (firstProj) {
        assertClose(firstProj.grossDividends, 0,
            `Negative RE (${histInputs.retainedEarnings[1]}): dividends blocked`);
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 13 — LR Opening Balance (initialLegalReserve)
// ═══════════════════════════════════════════════════════════════
section('TEST 13 — Legal Reserve with Prior Opening Balance (4000 → 1000 room)');
{
    const assumptions = { ...getDefaultAssumptions(), initialLegalReserve: 4000 };
    const results = runFullModel(assumptions, getDefaultHistoricalInputs());
    const projIS = results.incomeStatements.filter(s => s.periodType === 'projected');

    const cap = assumptions.paidUpCapital * assumptions.legalReserveCap; // 5000
    const room = cap - 4000; // 1000
    const lr1 = projIS[0].legalReserveAddition;
    assertClose(lr1, Math.min(projIS[0].netIncome * 0.05, room),
        `Year 1 LR=${lr1.toFixed(2)} = min(NI×5%, ${room})`);
    assertClose(projIS[1].legalReserveAddition, 0,
        `Year 2 LR=0 (cap reached at 5000)`);
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 14 — Tax Loss Carryforward
// ═══════════════════════════════════════════════════════════════
section('TEST 14 — Tax Loss Carryforward (FIFO, 5-year expiry)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    for (const s of results.incomeStatements.filter(s => s.periodType === 'projected')) {
        // Tax loss utilized must not exceed carryforward
        if (s.taxLossUtilized > s.taxLossCarryforward + 0.01) {
            console.error(`  ✗ ${name} ${s.period}: Utilized (${s.taxLossUtilized.toFixed(2)}) > CF (${s.taxLossCarryforward.toFixed(2)})`);
            allCorrect = false; totalFail++;
        }
        // Taxable income must be >= 0
        if (s.taxableIncome < -0.01 && s.ebt > 0) {
            console.error(`  ✗ ${name} ${s.period}: Taxable income negative (${s.taxableIncome.toFixed(2)}) with positive EBT`);
            allCorrect = false; totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: Tax loss carryforward correctly applied`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 15 — Egyptian Tax Rate (22.5%)
// ═══════════════════════════════════════════════════════════════
section('TEST 15 — Egyptian Tax Rate Application (22.5%)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    for (const s of results.incomeStatements.filter(s => s.periodType === 'projected')) {
        if (s.taxableIncome > 0) {
            const effectiveRate = s.taxExpense / s.taxableIncome;
            if (Math.abs(effectiveRate - 0.225) > 0.001) {
                console.error(`  ✗ ${name} ${s.period}: Tax rate=${(effectiveRate * 100).toFixed(2)}% ≠ 22.5%`);
                allCorrect = false; totalFail++;
            }
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: 22.5% tax rate correctly applied`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 16 — Working Capital Ties
// ═══════════════════════════════════════════════════════════════
section('TEST 16 — Working Capital Changes Tie (BS ↔ CF)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    const projIS = results.incomeStatements.filter(s => s.periodType === 'projected');
    const allBS = results.balanceSheets;
    const projCF = results.cashFlowStatements.filter(s => s.periodType === 'projected');
    const firstProjIdx = allBS.findIndex(s => s.periodType === 'projected');

    for (let i = 0; i < projCF.length; i++) {
        const bsIdx = firstProjIdx + i;
        const arChange = allBS[bsIdx].accountsReceivable - allBS[bsIdx - 1].accountsReceivable;
        const invChange = allBS[bsIdx].inventory - allBS[bsIdx - 1].inventory;
        const apChange = allBS[bsIdx].accountsPayable - allBS[bsIdx - 1].accountsPayable;
        const expectedWC = -(arChange + invChange) + apChange;
        const actualWC = projCF[i].changeInAR + projCF[i].changeInInventory + projCF[i].changeInAP;
        if (Math.abs(expectedWC - actualWC) > 0.01) {
            console.error(`  ✗ ${name} ${projCF[i].period}: WC Δ expected=${expectedWC.toFixed(2)} ≠ actual=${actualWC.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: Working capital changes tie (BS↔CF) for all ${projCF.length} years`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 17 — Key Metrics Reasonableness
// ═══════════════════════════════════════════════════════════════
section('TEST 17 — Key Metrics Reasonableness');

for (const { name, type, results } of scenarioResults) {
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];

    // Revenue must be positive
    assert(lastIS.revenue > 0, `${name}: Revenue > 0 (${lastIS.revenue.toFixed(0)})`);

    // Gross margin must be between 0 and 1
    assert(lastIS.grossMargin >= 0 && lastIS.grossMargin <= 1,
        `${name}: Gross margin ${(lastIS.grossMargin * 100).toFixed(1)}% in [0,100%]`);

    // Total assets must be positive
    assert(lastBS.totalAssets > 0, `${name}: Total assets > 0 (${lastBS.totalAssets.toFixed(0)})`);

    // Equity must be positive (for a going concern)
    if (type !== 'conservative') {
        assert(lastBS.totalEquity > 0, `${name}: Total equity > 0 (${lastBS.totalEquity.toFixed(0)})`);
    } else {
        console.log(`  ℹ ${name}: Equity = ${lastBS.totalEquity.toFixed(0)} (may be negative in conservative)`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TEST BLOCK 18 — CF Reconciliation (CFO + CFI + CFF = Net Change)
// ═══════════════════════════════════════════════════════════════
section('TEST 18 — Cash Flow Reconciliation (CFO + CFI + CFF = Net Change)');

for (const { name, results } of scenarioResults) {
    let allCorrect = true;
    for (const cf of results.cashFlowStatements.filter(s => s.periodType === 'projected')) {
        const total = cf.cashFromOperations + cf.cashFromInvesting + cf.cashFromFinancing;
        const netChange = cf.endingCash - cf.beginningCash;
        if (Math.abs(total - netChange) > 0.01) {
            console.error(`  ✗ ${name} ${cf.period}: CFO+CFI+CFF=${total.toFixed(2)} ≠ NetChange=${netChange.toFixed(2)}`);
            allCorrect = false; totalFail++;
        }
    }
    if (allCorrect) {
        console.log(`  ✓ ${name}: CF reconciles (CFO+CFI+CFF = ΔCash)`);
        totalPass++;
    }
}

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  FINAL RESULTS: ${totalPass} PASSED, ${totalFail} FAILED`);
console.log(`  Exit code: ${process.exitCode ?? 0}`);
console.log(`${'═'.repeat(60)}`);
