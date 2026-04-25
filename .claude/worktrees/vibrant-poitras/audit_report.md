__FinModel Engine — Comprehensive Audit Report__

Demo Company Inc\. | Locale: Egypt / Currency: EGP \(EE£\) | Generated: February 19, 2026

# __Executive Summary__

__Overall Model Health: NOT TRUSTED__ — 3 Critical issues identified\. Engine internal validation passes 75/75 checks but a silent APIC bug overstates projected Cash by EE£10K–50K/yr\. Do not use for financial decisions without applying patches\.

__🔴 Critical \#1__

APIC formula bug: APIC grows \+EE£10K/yr in 2024E–2028E despite zero equity issuance\. Silently inflates Cash \(the balance sheet plug\) by EE£10K→50K per period\. 2028E cash overstated by EE£50,000 \(8\.8%\)\. All 75 integration checks still pass because Cash is the derived plug\.

__🔴 Critical \#2__

Revenue base disconnect: 2024E formula uses hard\-coded EE£1,000,000 \(not linked to 2023 actual EE£950,000\)\. ROOT CAUSE of the previously reported stale\-export discrepancy \(old export: EE£1,344,061 vs engine: EE£1,414,801 for 2028E\)\. Delta = EE£70,740 over the projection chain\.

__🟡 Major \#3__

PDF export uses '$' \(USD\) symbol throughout; engine is correctly localized to EE£ \(Egyptian Pound\)\. Scenarios named Base/Bull/Bear — required 'Optimistic' and 'Conservative' are absent\. Interest Expense jumps 4\.3× in 2024E \(EE£13K→56K\) due to 20% rate on beginning debt — requires user confirmation\.

# __Issue List__

__Issue \#1: APIC Formula Bug — Cash Overstated EE£10K–50K Per Period \[Critical\]__

__Location: __XLSX / Assumptions / Row 'APIC \(Computed\)' — cols 2024E–2028E; Balance Sheet / Cash plug cells

__Problem: __APIC \(Computed\) increases \+EE£10,000/yr in projected periods even though Equity Issuance = EE£0\. Inflates Total Equity → Total L\+E → Cash plug\. All 75 checks pass silently because Cash is always derived, never independently computed\.

__Evidence \(Arithmetic\): __Assumptions 'Equity Issuance': \[0,10K,10K,0,0,0,0,0\]\. 'APIC Computed': \[200K,210K,220K,230K,240K,250K,260K,270K\]\. 2024E: 220K prior \+ 0 issuance = expected 220K; actual 230K\. Delta = \+10K\. Cascades per year\.

__Correct 2028E Cash: __EE£514,570 \(reported EE£564,570 — overstated by EE£50,000\)

__Corrected Formula \(Source Code\): __APIC\_Computed\[t\] = APIC\_Computed\[t\-1\] \+ Equity\_Issuance\_input\[t\]\. Gate must check actual equity issuance, not a fixed increment\. In Excel: =D\_APIC\_Computed \+ Assumptions\!E\_EquityIssuance \(result=220,000 for 2024E, not 230,000\)

__Test Vector: __Input: prior APIC=220K, equity issuance=0 → Expected APIC=220K, Expected Cash 2024E≈234,663 \(not 244,663\)

__Risk: __2028E cash overstated 8\.8%; liquidity ratios, current ratio, cash yield all materially wrong\. Covenant compliance analysis affected\.

__Issue \#2: Revenue Base Formula Disconnect — Hard\-coded EE£1,000,000 vs 2023 Actual EE£950,000 \[Critical\]__

__Location: __XLSX / Income Statement / Cell E2 \(2024E Revenue\): =Assumptions\!B4\*\(1\+Assumptions\!E5\)

__Problem: __2024E Revenue = 1,000,000 × 1\.10 = 1,100,000\. If linked to 2023 actual: 950,000 × 1\.10 = 1,045,000\. Delta = EE£55,000 in year 1, compounding to EE£70,740 by 2028E\.

__Root Cause of Stale Export Issue: __Prior export: formula was =D2\*\(1\+E5\) → 950K→chain→2028E=1,344,061\. Current: =Assumptions\!B4\*\(1\+E5\) → 1,000K→chain→2028E=1,414,801\. Delta=70,740\. Arithmetic proof: 950,000×1\.10×1\.08×1\.07×1\.06×1\.05=1,344,061\.03 ✓

__Decision Required \(Pending User Confirmation\): __Option A: Keep 1,000K base \(deliberate normalisation — document explicitly\)\. Option B: Change to =D2\*\(1\+E5\) to link 2024E to 2023 actual\. DO NOT change without explicit confirmation\.

__Option B Formula: __Income Statement\!E2: =D2\*\(1\+Assumptions\!E5\) → 950,000×1\.10=1,045,000

__Risk: __Revenue, EBIT, Net Income, EPS, FCF all overstated vs a properly\-linked projection by 5\.3–5\.9% depending on period\.

__Issue \#3: Exported PDF Uses '$' \(USD\) Instead of 'EE£' \(EGP\) \[Major\]__

__Location: __Demo\_Company\_Inc\_\_Financial\_Model\.pdf — all pages — currency label

__Problem: __Every monetary value in the exported PDF is labeled '$'\. Engine UI correctly shows 'EE£'\. The PDF export pipeline does not read the active locale setting\.

__Evidence: __Screenshots p\.30: 'EE£254\.7K EBITDA'\. Engine PDF p\.2: '$254\.7K EBITDA'\. Same number, different symbol\.

__Fix: __In PDF generator \(lib/export/pdf\.ts or jsPDF config\): currencySymbol = locale\.currencySymbol || 'EE£'\. Add PDF cover metadata: 'Currency: EGP \(Egyptian Pound\) | VAT: 14% | Locale: Egypt | FY: Jul–Jun'\. Regenerate PDF\.

__Risk: __External recipients read EE£1\.4M revenue as $1\.4M USD — approximately 70× larger in USD terms\. Fundamental misrepresentation of financials\.

__Issue \#4: Interest Expense Jump 2023→2024E: EE£13K → EE£56K \(\+331%\) \[Major\]__

__Location: __Income Statement / Interest Expense row | Assumptions / Interest Rate = 20%

__Problem: __Historical interest expense is directly input \(2023: EE£13K on EE£280K avg debt = 4\.6% effective\)\. Projected 2024E applies 20% × EE£280K beginning debt = EE£56K\. This 4\.3× jump is unexplained and may reflect current CBE benchmark rate but does not match existing loan terms\.

__Decision Required \(Policy\-Sensitive\): __ASSUMPTION: 20% may reflect CBE rate ~19\.25–20% \(early 2024 Egypt\)\. However historical loans carry different rates\. DO NOT apply uniformly without confirmation\. Suggest: 'Existing debt rate' \+ 'New debt rate' as separate assumptions\.

__Risk: __Interest coverage drops 10\.3x→2\.7x\. May incorrectly suggest covenant breach or debt distress\. EBT 2024E understated by EE£43K if rate should be 4\.6% \(EE£13K\), cascading to Net Income and Retained Earnings\.

__Issue \#5: Scenario Naming — 'Optimistic' and 'Conservative' Missing \[Major\]__

__Location: __Engine Scenario Manager | XLSX \(no Scenarios sheet present\)

__Found: __Base Case \(Rev EE£1\.4M, NI EE£118\.1K\), Bull Case \(Rev EE£1\.7M, NI EE£335\.2K\), Bear Case \(Rev EE£1\.1M, NI EE£\-18\.8K\)

__Missing: __'Optimistic' and 'Conservative' scenarios as required\. No structured Scenarios table in XLSX\. No Scenario Comparison sheet\.

__Fix: __Rename Bull→Optimistic, Bear→Conservative\. Add 'Scenarios' sheet with columns: ScenarioName | AssumptionKey | Value | Unit | Notes\. Wire formulas: =INDEX\(Scenarios\[Value\],MATCH\(active\_scenario&"|"&"GrowthRate",Scenarios\[Key\],0\)\)\. Add 'Scenario Comparison' sheet with delta columns\.

__Risk: __Deliverable does not meet specification\. Stakeholders cannot compare Optimistic vs Conservative outcomes in a standardized format\.

__Issue \#6: Cash Conversion Cycle Formula Error — Shows 0 days vs Correct 35 days \[Minor\]__

__Location: __Working Capital Schedule / CCC row | Engine PDF p\.10 | Executive Summary

__Problem: __CCC displayed as 0 days throughout all periods\. Correct: CCC = DSO \+ DIO − DPO = 45 \+ 30 − 40 = 35 days\.

__Corrected Formula: __=DSO\_assumption \+ DIO\_assumption − DPO\_assumption = 45 \+ 30 − 40 = 35 days

__Test: __DSO=45, DIO=30, DPO=40 → CCC = 35\. Current output = 0\. Delta = 35 days error\.

__Risk: __Minor — CCC is displayed in summaries\. Does not affect IS/BS/CF numbers\. Misleads WC efficiency analysis\.

__Issue \#7: Stale Export Cache — No Version Control in Exported Files \[Major\]__

__Problem: __No export timestamp, engine version, or assumption hash exists in XLSX/CSV/JSON/PDF\. Users cannot determine whether an export reflects the current engine state\. The reported EE£70,740 discrepancy \(1,344,061 vs 1,414,801\) was a stale\-cache issue\.

__Fix: __Add to Assumptions sheet header: ExportTimestamp | EngineVersion | ActiveScenario | LocaleCode | SHA256\(assumptions\_block\)\. Embed in PDF page footer\. Invalidate and regenerate all exports on each model recalculation\.

__Risk: __Major — decision\-makers may rely on outdated figures without knowing\. Entire investment or credit analysis could be based on a stale model state\.

# __Reconciliation Table — 2028E Terminal Year \(Base Case\)__

__Metric__

__Engine/JSON__

__XLSX__

__PDF__

__Status__

Revenue

1,414,801

1,414,801

$1\.4M

✓ Match — PDF currency wrong

Net Income

118,121

118,121

$118\.1K

✓ Match

EBITDA

254,664

254,664

$254\.7K

✓ Match

FCF

124,448

124,448

$124\.4K

✓ Match — FCF unaffected by APIC bug

Ending Cash \(reported\)

564,570

564,570

$564\.6K

⚠️ Overstated EE£50K \(APIC bug\)

Ending Cash \(CORRECTED\)

514,570

514,570

—

❌ Fix APIC formula

Total Assets \(reported\)

1,241,414

1,241,414

$1\.2M

⚠️ Overstated EE£50K

Total Equity \(reported\)

827,646

827,646

$827\.6K

⚠️ APIC overstated EE£50K

Balance Check

✓ 0

✓ 0

Balanced

✓ Always passes — Cash is plug

Stale Export Revenue 2028E

1,414,801

1,344,061 \(OLD\)

—

❌ Old export — root cause confirmed

CCC Days

0 \(wrong\)

0 \(wrong\)

0 \(wrong\)

❌ Should be 35 days \(DSO45\+DIO30−DPO40\)

# __Cross\-Check Summary__

__Check__

__Expected__

__Actual__

__Result__

Assets = L\+E \(all 8 periods\)

0

0

✓ PASS

IS Net Income = CF Net Income \(5 projected\)

0 delta

0 delta

✓ PASS

CF Ending Cash = BS Cash

match

match

✓ PASS \(both derived from same plug\)

CF Net Change = CFO\+CFI\+CFF \(2024E\)

44,663

44,663

✓ PASS \(123,528−55,000−23,865=44,663\)

EBITDA = EBIT \+ D&A \(2028E\)

254,664

254,664

✓ PASS \(183,094\+71,570=254,664\)

Retained Earnings Roll \(2024E\)

151,947

151,947

✓ PASS \(78,506\+77,306−3,865=151,947\)

PP&E Schedule ties to BS Net PP&E

match

match

✓ PASS

LT Debt Rollforward ties to BS

match

match

✓ PASS

JSON values = XLSX computed values

<0\.01 delta

<0\.01 delta

✓ PASS — exact match

APIC consistency: ΔAPIC = Equity Issuance

0 \(2024E\)

\+10,000

❌ FAIL — APIC bug \(Issue \#1\)

CCC = DSO\+DIO−DPO

35 days

0 days

❌ FAIL — formula error \(Issue \#6\)

Total OpEx = sum of components \(2028E\)

382,826

382,826

✓ PASS \(212,220\+70,740\+66,570\+5,000\+28,296\)

Gross Profit = Revenue − COGS \(2028E\)

565,920

565,920

✓ PASS \(1,414,801−848,881\)

Tax Expense = EBT × 22\.5% \(2028E\)

34,293

34,293

✓ PASS \(152,415×22\.5%=34,293\)

# __Scenario Summary__

__Scenario__

__Revenue 2028E__

__Net Income__

__EPS__

__Status__

__Base Case__

EE£1,414,801

EE£118,121

EE£1\.18

✓ Verified vs JSON/XLSX

__Bull Case__

EE£1\.7M \(est\)

EE£335\.2K

EE£3\.35

⚠️ Rename to 'Optimistic'

__Bear Case__

EE£1\.1M \(est\)

EE£\-18\.8K

EE£\-0\.19

⚠️ Rename to 'Conservative'; NI negative — verify

__Optimistic__

—

—

—

❌ MISSING — required

__Conservative__

—

—

—

❌ MISSING — required

__Required Scenarios Table structure \(add as XLSX sheet named 'Scenarios'\):__

__ScenarioName__

__AssumptionKey__

__Value__

__Unit__

__Notes__

Base Case

RevenueGrowth|2024E

10\.0

%

Moderate growth with stable margins

Optimistic

RevenueGrowth|2024E

15\.0

%

Bull case — accelerated growth

Conservative

RevenueGrowth|2024E

5\.0

%

Bear case — market slowdown

Base Case

COGSPct|2024E

60\.0

% Rev

As per historical

Optimistic

COGSPct|2024E

58\.0

% Rev

Margin improvement from scale

Conservative

COGSPct|2024E

63\.0

% Rev

Higher costs / pricing pressure

# __Egypt Localization Status__

__Setting__

__Value__

__Status__

__Assumption / Risk__

Currency

EGP / EE£

Engine only ⚠️

❌ ASSUMPTION: Exports still use '$' — fix PDF/XLSX generator to use EE£

VAT

14%

✓ Applied

ASSUMPTION: Standard EG VAT\. Confirm B2B \(ex\-VAT\) or B2C \(inc\-VAT\) treatment\.

Corporate Tax

22\.5%

✓ Applied

ASSUMPTION: Egyptian CIT rate\. Confirm no free zone exemption\.

Div\. Withholding

10%

Engine only

ASSUMPTION: EG WHT\. Not in CF statement — confirm if applicable\.

Fiscal Year

Jul–Jun \(EG Gov't\)

⚠️ Partial

ASSUMPTION: Model uses calendar year labels\. Confirm company FY convention\.

Interest Rate

20%

⚠️ Risk

POLICY\-SENSITIVE: Matches CBE benchmark ~2024 but historical loans differ\. DO NOT finalize without user confirmation\.

Dep\. Ranges

Bldg 4%, Mach 8%, Veh 20%, Comp 33%

Displayed only

ASSUMPTION: Model uses flat 10% rate regardless of asset class\. Legal dep rates from Egyptian tax law should be applied by asset\.

# __Suggested Improvements \(Priority Order\)__

1. Fix APIC rollforward formula in source code \(lib/engines/balance\-sheet\.ts\) — gate on actual equity issuance input\.
2. Decide and document Revenue Base: link 2024E to 2023 actual or document the EE£1,000K normalization explicitly\.
3. Fix CCC formula: CCC = DSO \+ DIO − DPO \(currently 0; should be 35 days for Base Case assumptions\)\.
4. Update PDF/XLSX/JSON export pipeline to use locale\-aware currency symbol \('EE£' not '$'\) and add metadata header\.
5. Add Optimistic and Conservative scenarios; build structured Scenarios table as XLSX sheet; wire all formulas via INDEX/MATCH\.
6. Add Scenario Comparison sheet with columns: Metric | Base | Optimistic | Conservative | Δ Opt vs Base | Δ% | Δ Cons vs Base | Δ%\.
7. Add export version watermark \(timestamp \+ assumption hash\) to all exports to prevent stale\-cache confusion\.
8. Add to validation matrix: APIC consistency check \(ΔAPIC = equity issuance\) and CCC formula check\.
9. Separate interest rate assumptions into 'Existing Debt Rate' and 'New Debt Rate' — confirm applicable rates with user\.
10. Apply Egyptian legal depreciation rates by asset class \(buildings 4%, machinery 8%, vehicles 20%, computers 33%\) instead of flat 10%\.

# __Final Statement__

__All calculations verified: NO__ — 2 Critical formula bugs \(APIC \+ Revenue Base\) and 1 Critical export localization failure remain unresolved\.

Verified as internally consistent: Revenue chain, Net Income, EBITDA, FCF, PP&E schedule, Debt schedule, Retained Earnings rollforward, all 3\-statement linkages match exactly across JSON, XLSX, and PDF within display rounding\.

__Action items before model can be trusted for decisions:__

1. __\[CRITICAL\] Fix APIC formula → correct 2028E Cash from EE£564,570 to EE£514,570\.__
2. __\[CRITICAL\] Confirm Revenue Base \(1,000K vs 950K\) and lock assumption with documentation\.__
3. \[MAJOR\] Fix PDF/Excel currency label to EE£ and add Egypt locale metadata\.
4. \[MAJOR\] Confirm 20% interest rate applies to existing debt \(not just new borrowings\)\.
5. \[MAJOR\] Rename scenarios to Optimistic/Conservative; add Scenarios table \+ Comparison sheet\.
6. \[MINOR\] Fix CCC formula \(0 → 35 days\); add export version watermark\.

