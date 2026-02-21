# Known Limitations

## Financial Model Engine

| Area | Limitation | Impact | Workaround |
|------|-----------|--------|------------|
| **Circular References** | Iterative solver may not converge with extreme assumptions (e.g., 200%+ debt ratios) | Model produces invalid results | Use realistic assumption ranges |
| **Interest Calculation** | Uses beginning-of-period debt (flat rate × beginning balance) — no mid-period debt changes | Slightly overstates/understates interest for growing companies | Acceptable for most modeling use cases |
| **Balancing Plug** | Cash is used as the plug when BS doesn't balance exactly | Cash may be slightly adjusted vs. CF ending cash | Check `balanceDifference` field for magnitude |
| **Tax Loss Carryforward** | Not implemented — negative EBT still applies tax rate | Unrealistic result when company is unprofitable | Manually set tax rate to 0% for loss scenarios |
| **Goodwill & Intangibles** | Static from assumptions — no impairment testing | Goodwill stays constant unless manually changed | Update assumptions for impairment events |
| **Stock-Based Compensation** | Fixed amount per year, not revenue-linked | SBC doesn't scale with company growth | Manually adjust `stockBasedCompAmount` assumptions |
| **Working Capital** | DSO/DIO/DPO-driven — no seasonal or cyclical variation | Working capital changes are smooth year-over-year | N/A for annual models |
| **Debt Structure** | Constant debt levels unless assumption overrides are used | No automatic debt covenants or refinancing | Use scenario manager for different debt profiles |

## UI & Export

| Area | Limitation | Workaround |
|------|-----------|------------|
| **Performance** | Monte Carlo with 10,000+ iterations can freeze the UI for 5-15 seconds | Reduce iteration count or run in smaller batches |
| **PDF Export** | Uses landscape A4 — may truncate columns with 8+ projected years | Use Excel export for full data |
| **CSV Import** | Expects camelCase column headers matching `HistoricalInputs` keys | Download the JSON template for exact field names |
| **Browser Storage** | Model state persisted in localStorage — limited to ~5MB | Export to JSON regularly for backup |
| **Undo/Redo** | Only tracks assumption changes, not scenario additions/deletions | N/A |
| **Multi-User** | No collaboration features — single-user only | Export/import JSON for sharing |

## Planned Improvements
- Web Worker for Monte Carlo (non-blocking UI)
- Tax loss carryforward logic
- Debt covenants and revolving credit facility
- Real-time API integration (Yahoo Finance, FMP)
- Multi-currency support
- Industry-specific templates
