# Fixtures

Each `<company>.json` file is a self-contained snapshot of the engine's
input state. Drop one in here and run:

    npm run export:audit -- --input fixtures/<company>.json

…to compute results for all 3 scenarios and write `out-<scenario>.xlsx`
to the project root.

## Shape

```jsonc
{
  "_meta": {
    "company": "Display name (informational)",
    "currency": "EGP",
    "unit": "1 EGP (not thousands)",
    "periods": ["2024", "2025"],
    "notes": "..."
  },
  "historicalInputs": {
    // Every field of HistoricalInputs (types/assumptions.ts).
    // Arrays match `periods.length`. retainedEarnings can be the BS plug.
    "periods": ["2024", "2025"],
    "revenue":               [/* one number per period */],
    "cogs":                  [...],
    // ... see types/assumptions.ts for the full list
  },
  "assumptions": {
    // Per-scenario overrides applied on top of getDefaultAssumptions().
    // Only include the keys you want to override; all other keys fall
    // back to the engine defaults.
    "base":         { "revenueGrowthRate": [...], "cogsPercent": [...], ... },
    "optimistic":   { ... },
    "conservative": { ... }
  }
}
```

## Validation

The script fails loudly if `historicalInputs` is missing required fields.
The required field list lives at the top of `scripts/run-export.ts`.
If you add new fields to `HistoricalInputs`, update the validator there
too — silent defaults are forbidden.

## Adding a new fixture

1. Copy `telecom-egypt.json` as a template.
2. Fill in `historicalInputs` from the company's filed accounts.
   (Tip: `retainedEarnings` should make the BS balance — Total Assets
   = Total Liabilities + Total Equity.)
3. Tune the three `assumptions` blocks to your scenario house view.
4. Add an npm shortcut in `package.json` if you'll re-run this fixture
   often: `"export:audit:<name>": "tsx scripts/run-export.ts --input
   fixtures/<name>.json"`.
