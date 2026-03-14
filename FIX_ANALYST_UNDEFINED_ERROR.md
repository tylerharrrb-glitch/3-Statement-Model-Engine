# FIX: "Cannot read properties of undefined (reading 'filter')"

## The Problem

The Zustand store returns results with `results.cashFlows` (not `results.cashFlowStatements`).
The `buildCompactSummary` function tries to destructure `cashFlowStatements` which is `undefined`,
then calls `.filter()` on it → crash.

**API key:** Keep using the same Groq key from your other engine. No need to create a new one.

---

## FULL REPLACEMENT for `lib/services/analyst.ts`

Replace the entire file with this:

```typescript
// lib/services/analyst.ts

const SYSTEM_PROMPT = `You are a CFA-grade financial analyst embedded in a 
3-Statement Financial Model Engine for the Egyptian market.

Your role:
1. Verify Balance Sheet balances: Total Assets = Total Liabilities + Equity
2. Verify Cash Flow reconciliation: CF Ending Cash = BS Cash
3. Check IS flow: Revenue - COGS = Gross Profit → GP - OpEx = EBIT → EBIT ± Interest - Tax = NI
4. Verify Egyptian profit waterfall: NI → EPD (10%) → Legal Reserve (5%, 50% cap) →
   Distributable → Gross Dividends → Addition to Retained Earnings
5. Verify RE roll-forward: RE(end) = RE(begin) + Addition to RE
6. Flag any broken inter-statement links

Key Egyptian formulas:
- EPD = max(0, NI × 10%) [Companies Law 159/1981, Art. 40]
- Legal Reserve = min(NI × 5%, max(0, PaidUpCapital × 50% - cumulativeLR)) [Art. 41]
- Distributable = NI - EPD - Legal Reserve
- Gross Dividends = Distributable × payout ratio
- Addition to RE = Distributable - Gross Dividends
- FCFF = NOPAT + D&A - CapEx - Δ Trade Working Capital

Response format:
✅ / ⚠️ / ❌ [Check] — [Status]
Expected: [formula + numbers]
Actual: [model value]
Match: ✅ / ❌`;

const GROQ_KEY =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GROQ_API_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_API_KEY) ||
  '';

export interface AnalystMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModelSnapshot {
  companyName?: string;
  currency?: string;
  incomeStatements?: any[];
  balanceSheets?: any[];
  cashFlowStatements?: any[];  // from JSON export
  cashFlows?: any[];           // from Zustand store (results.cashFlows)
  ratios?: any[];
  integrationChecks?: any[];
  convergenceInfo?: any;
}

function fmt(n: any): string {
  if (n === undefined || n === null || isNaN(n)) return '—'.padStart(10);
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(10);
}

function buildCompactSummary(model: ModelSnapshot): string {
  // Handle both field name variants from different data sources
  const IS  = model.incomeStatements   ?? [];
  const BS  = model.balanceSheets      ?? [];
  const CF  = model.cashFlowStatements ?? model.cashFlows ?? [];

  if (!IS.length && !BS.length && !CF.length) {
    return 'No model data available yet. Please run Calculate All Scenarios first.';
  }

  const lines: string[] = [
    `Company: ${model.companyName ?? 'Demo Company'} (${model.currency ?? 'EGP'})`,
    '',
  ];

  // Income Statement key metrics
  if (IS.length) {
    lines.push('=== INCOME STATEMENT ===');
    lines.push('Period       | Revenue    | EBIT       | Net Income | FCFF       | EPS');
    IS.forEach((s: any) => {
      lines.push(
        `${String(s.period ?? '').padEnd(12)} | ${fmt(s.revenue)} | ${fmt(s.ebit)} | ${fmt(s.netIncome)} | ${fmt(s.fcff ?? 0)} | ${s.eps?.toFixed(4) ?? '—'}`
      );
    });

    // Egyptian profit waterfall — projected only
    const proj = IS.filter((s: any) => s.periodType === 'projected');
    if (proj.length) {
      lines.push('');
      lines.push('=== EGYPTIAN PROFIT WATERFALL ===');
      lines.push('Period       | NI         | EPD        | Leg.Res.   | Distribut. | Gr.Divs    | AddToRE');
      proj.forEach((s: any) => {
        lines.push(
          `${String(s.period).padEnd(12)} | ${fmt(s.netIncome)} | ${fmt(s.employeeProfitSharing)} | ${fmt(s.legalReserveAddition)} | ${fmt(s.distributableProfit)} | ${fmt(s.grossDividends)} | ${fmt(s.additionToRE)}`
        );
      });
    }
  }

  // Balance Sheet
  if (BS.length) {
    lines.push('');
    lines.push('=== BALANCE SHEET ===');
    lines.push('Period       | Cash       | Tot.Assets | Tot.Liab   | Tot.Equity | Balanced?');
    BS.forEach((b: any) => {
      const tl  = b.totalLiabilities ?? (b.totalLiabilitiesEquity - b.totalEquity) ?? 0;
      const tle = b.totalLiabilitiesEquity ?? (tl + (b.totalEquity ?? 0));
      const ta  = b.totalAssets ?? 0;
      const diff = Math.abs(ta - tle);
      lines.push(
        `${String(b.period ?? '').padEnd(12)} | ${fmt(b.cash)} | ${fmt(ta)} | ${fmt(tl)} | ${fmt(b.totalEquity)} | ${diff < 0.1 ? '✅' : `❌ diff=${diff.toFixed(2)}`}`
      );
    });

    // RE roll-forward
    if (BS.length > 1 && IS.length > 1) {
      lines.push('');
      lines.push('=== RE ROLL-FORWARD ===');
      lines.push('Period       | RE(open)   | AddToRE    | RE(calc)   | RE(BS)     | Match?');
      for (let i = 1; i < BS.length && i < IS.length; i++) {
        const reOpen  = BS[i - 1]?.retainedEarnings ?? 0;
        const addToRE = IS[i]?.additionToRE ?? 0;
        const reCalc  = reOpen + addToRE;
        const bsRE    = BS[i]?.retainedEarnings ?? 0;
        const match   = Math.abs(reCalc - bsRE) < 1;
        lines.push(
          `${String(BS[i].period ?? '').padEnd(12)} | ${fmt(reOpen)} | ${fmt(addToRE)} | ${fmt(reCalc)} | ${fmt(bsRE)} | ${match ? '✅' : `❌ diff=${(reCalc - bsRE).toFixed(2)}`}`
        );
      }
    }
  }

  // Cash Flow reconciliation
  if (CF.length && BS.length) {
    lines.push('');
    lines.push('=== CASH FLOW RECONCILIATION ===');
    lines.push('Period       | CFO        | CFI        | CFF        | EndCash(CF)| Cash(BS)   | Match?');
    CF.forEach((cf: any) => {
      const bsPeriod = BS.find((b: any) => b.period === cf.period);
      const bsCash   = bsPeriod?.cash ?? 0;
      const endCash  = cf.endingCash ?? 0;
      const match    = Math.abs(endCash - bsCash) < 0.1;
      lines.push(
        `${String(cf.period ?? '').padEnd(12)} | ${fmt(cf.cashFromOperations)} | ${fmt(cf.cashFromInvesting)} | ${fmt(cf.cashFromFinancing)} | ${fmt(endCash)} | ${fmt(bsCash)} | ${match ? '✅' : '❌'}`
      );
    });
  }

  // Integration checks
  const checks = model.integrationChecks;
  if (checks?.length) {
    const allPass = checks.every((c: any) => c.allPassed !== false);
    lines.push('');
    lines.push(`=== INTEGRATION CHECKS: ${allPass ? '✅ ALL PASS' : '❌ SOME FAILED'} ===`);
  }

  // Convergence
  if (model.convergenceInfo) {
    const ci = model.convergenceInfo as any;
    lines.push(`Circular resolver: ${ci.converged ? '✅ Converged' : '❌ Not converged'} in ${ci.iterations ?? '?'} iterations`);
  }

  return lines.join('\n');
}

export async function callAnalyst(
  userMessage: string,
  modelData: ModelSnapshot | null,
  history: AnalystMessage[] = []
): Promise<string> {
  if (!GROQ_KEY) {
    throw new Error(
      'Groq API key not configured. Add NEXT_PUBLIC_GROQ_API_KEY to your .env.local file.'
    );
  }

  const contextMessage = modelData
    ? `${buildCompactSummary(modelData)}\n\nQuestion: ${userMessage}`
    : userMessage;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1500,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-4),
        { role: 'user', content: contextMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Groq API error ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}
```

---

## Two things fixed

**1. Field name mismatch** — The Zustand store puts cash flows in `results.cashFlows`
but the previous code looked for `cashFlowStatements`. Now handles both:
```typescript
const CF = model.cashFlowStatements ?? model.cashFlows ?? [];
```

**2. Null safety everywhere** — Every array access now has `?? []` fallback, every
field access uses optional chaining `?.` so a missing field returns `undefined`
instead of crashing.

## Also update the modelData prop where you pass it

Make sure you pass `cashFlows` (the Zustand field name) when building the prop:

```typescript
// In your page.tsx or wherever AnalystPanel is rendered:
const modelData = activeScenario?.results ? {
  companyName:         store.companyName,
  currency:            store.currency ?? 'EGP',
  incomeStatements:    activeScenario.results.incomeStatements,
  balanceSheets:       activeScenario.results.balanceSheets,
  cashFlows:           activeScenario.results.cashFlows,      // ← Zustand field name
  ratios:              activeScenario.results.ratios,
  integrationChecks:   activeScenario.results.integrationChecks,
  convergenceInfo:     activeScenario.results.convergenceInfo,
} : null;
```
