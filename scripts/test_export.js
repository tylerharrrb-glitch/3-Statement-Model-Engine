// Patch the WOLF Excel file to add missing Optimistic & Conservative scenario blocks
// and wire IF formulas into the Assumptions sheet.

const ExcelJS = require('exceljs');
const path = require('path');

// Register TS paths for imports
const { register } = require('tsconfig-paths');
const tsconfig = require('./tsconfig.json');
register({ baseUrl: path.resolve('.'), paths: tsconfig.compilerOptions.paths });
require('ts-node').register({
    project: './tsconfig.json',
    transpileOnly: true,
    compilerOptions: { module: 'commonjs' },
});

async function main() {
    // Import engine and scenario manager
    const { runFullModel } = require('./lib/engines/integrator');
    const { getDefaultHistoricalInputs } = require('./types/assumptions');
    const { createDefaultScenarios } = require('./lib/scenario-manager');

    // Create scenarios and compute them
    const scenarios = createDefaultScenarios();
    const historicalInputs = getDefaultHistoricalInputs();

    for (let i = 0; i < scenarios.length; i++) {
        const results = runFullModel(scenarios[i].assumptions, historicalInputs);
        scenarios[i] = { ...scenarios[i], results };
        console.log(`Computed scenario: ${scenarios[i].name} (${scenarios[i].type}) → Revenue=${results.incomeStatements[results.incomeStatements.length - 1].revenue}`);
    }

    // Now call exportToExcel directly
    const { exportToExcel } = require('./lib/export/excel');

    // Override browser APIs
    let blobData = null;
    globalThis.Blob = class MockBlob {
        constructor(parts, opts) {
            this.parts = parts;
            this.opts = opts;
        }
    };
    globalThis.URL = {
        createObjectURL: (blob) => { blobData = blob; return 'blob:test'; },
        revokeObjectURL: () => { },
    };
    const createdLink = {};
    globalThis.document = {
        createElement: (tag) => {
            const el = {
                _href: null,
                _download: null,
                set href(v) { el._href = v; },
                get href() { return el._href; },
                set download(v) { el._download = v; },
                get download() { return el._download; },
                click: () => { console.log(`Download triggered: ${el._download}`); },
            };
            Object.assign(createdLink, el);
            return el;
        },
        body: { appendChild: () => { }, removeChild: () => { } },
    };

    const baseResults = scenarios[0].results;
    const baseAssumptions = scenarios[0].assumptions;

    try {
        await exportToExcel(baseResults, baseAssumptions, 'WOLF', scenarios, historicalInputs);
    } catch (e) {
        // Expected - the blob save won't work in Node
        console.log('Export error (may be expected):', e.message?.substring(0, 100));
    }

    // Save the workbook directly by re-building
    console.log('\n--- Building workbook manually for file save ---');

    const ExcelJSMod = require('exceljs');
    const { buildScenariosSheet, ROW_SPECS } = require('./lib/export/build-scenarios');
    const { buildCompanyInfoSheet } = require('./lib/export/build-company-info');

    const wb = new ExcelJSMod.Workbook();
    wb.creator = 'FinModel Engine';
    wb.calcProperties = { fullCalcOnLoad: true };

    const nYears = baseResults.incomeStatements.length;
    const periods = baseResults.incomeStatements.map(s => s.period);
    const numHistorical = baseResults.incomeStatements.filter(s => s.periodType === 'historical').length;

    // Build the Scenarios sheet
    const { scenarioRows } = buildScenariosSheet(wb, periods, scenarios, numHistorical, nYears);

    console.log('\nScenario rows map:');
    const keys = Object.keys(scenarioRows);
    console.log(`  Total keys: ${keys.length}`);
    const baseKeys = keys.filter(k => k.startsWith('Base Case'));
    const optKeys = keys.filter(k => k.startsWith('Optimistic'));
    const consKeys = keys.filter(k => k.startsWith('Conservative'));
    console.log(`  Base Case keys: ${baseKeys.length}`);
    console.log(`  Optimistic keys: ${optKeys.length}`);
    console.log(`  Conservative keys: ${consKeys.length}`);

    // Show some sample keys
    if (baseKeys.length > 0) console.log(`  Sample: ${baseKeys[0]} → row ${scenarioRows[baseKeys[0]]}`);
    if (optKeys.length > 0) console.log(`  Sample: ${optKeys[0]} → row ${scenarioRows[optKeys[0]]}`);
    if (consKeys.length > 0) console.log(`  Sample: ${consKeys[0]} → row ${scenarioRows[consKeys[0]]}`);

    // Save minimal test workbook
    const outPath = path.join(process.env.USERPROFILE || '', 'Downloads', 'WOLF_Test_Scenarios.xlsx');
    await wb.xlsx.writeFile(outPath);
    console.log(`\nSaved test workbook: ${outPath}`);

    // Re-read and verify
    const wb2 = new ExcelJSMod.Workbook();
    await wb2.xlsx.readFile(outPath);
    const scenSheet = wb2.getWorksheet('Scenarios');
    console.log('\nVerification of saved file:');
    console.log(`  Scenarios sheet total rows: ${scenSheet.rowCount}`);
    let blockCount = 0;
    for (let r = 1; r <= scenSheet.rowCount; r++) {
        const v = String(scenSheet.getCell(r, 1).value || '');
        if (v.includes('▎')) {
            blockCount++;
            console.log(`  Block: ${v}`);
        }
    }
    console.log(`  Total blocks: ${blockCount}`);

    console.log('\n=== DONE ===');
}

main().catch(e => { console.error('Fatal:', e); });
