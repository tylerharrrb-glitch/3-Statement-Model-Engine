# PROMPT 2 — 3-STATEMENT FINANCIAL MODEL ENGINE
# COPY EVERYTHING BELOW THIS LINE
# ═══════════════════════════════════════════════════

You are redesigning the 3-Statement Financial Model Engine — a full-stack financial modeling platform featuring a fully-linked Income Statement, Balance Sheet, and Cash Flow Statement with 5-year projections across 3 scenarios (Base, Optimistic, Conservative) and a circular-reference iterative solver. The platform already exists and works. Your job is to completely redesign its visual interface to match an exact design system — without breaking any existing functionality. Every calculation, every formula, every scenario, every link between statements must be preserved. Only the visual layer changes.

---

## MISSION

The designer of this platform also built a personal portfolio website at ahmedwael.pages.dev. The portfolio has a world-class dark financial terminal aesthetic. This platform must look like it belongs to the same brand universe — as if it was built by the same person, on the same day, to the same standard. When someone visits both sites, they should feel a seamless visual continuity.

---

## DESIGN SYSTEM — COPY THESE EXACTLY

### CSS Variables (paste into :root)
```css
:root {
  --bg-primary:    #0A0E17;
  --bg-secondary:  #0F1623;
  --bg-card:       #141B2D;
  --accent-gold:   #C9A84C;
  --accent-blue:   #3B82F6;
  --accent-glow:   #3B82F620;
  --text-primary:  #F0F4FF;
  --text-secondary:#8892A4;
  --text-muted:    #4A5568;
  --border:        #1E2D45;
  --gold-glow:     #C9A84C15;
  --ease: cubic-bezier(.4, 0, .2, 1);
  --ff-display: 'Playfair Display', serif;
  --ff-mono:    'IBM Plex Mono', monospace;
  --ff-body:    'Sora', sans-serif;
}
```

### Google Fonts (paste in <head>)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Playfair+Display:wght@700;900&family=Sora:wght@300;400;600&display=swap" rel="stylesheet">
```

### Body background + grain noise overlay
```css
body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--ff-body);
  line-height: 1.7;
  overflow-x: hidden;
}
body::before {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none; z-index: 9999; opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")
}
```

---

## COMPONENT SPECIFICATIONS

### Navbar
Fixed top, height 64px, glass morphism:
```css
.navbar {
  position: fixed; top: 0; left: 0; width: 100%;
  z-index: 1000;
  background: rgba(10,14,23,.72);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(30,45,69,.5);
}
```
- Logo: "3SM" in Playfair Display font-weight 700, color var(--accent-gold)
- Subtitle: "Financial Model Engine" in IBM Plex Mono, small, var(--text-muted)
- Nav links: IBM Plex Mono, .78rem, var(--text-secondary), gold underline draw animation on hover
- Right side: "← Back to Portfolio" link in mono pointing to https://ahmedwael.pages.dev/

### Page Header / Hero Area
Below navbar, dark hero strip:
```
background: var(--bg-secondary);
border-bottom: 1px solid var(--border);
padding: 48px 0 40px;
```
Content:
- Mono label: "FINANCIAL MODELING · 5-YEAR PROJECTION" — .75rem, letter-spacing 3px, uppercase, var(--accent-gold)
- Main title: "3-Statement Model Engine" in Playfair Display 900, clamp(2rem,5vw,3rem)
- Subtitle: "Income Statement · Balance Sheet · Cash Flow · Circular Reference Solver" in IBM Plex Mono, var(--text-secondary)
- Four stat badges in a row: "5-Year Projection", "3 Scenarios", "Iterative Solver", "Full Balance Sheet Reconciliation"
- Subtle radial glow top-right: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)

### Scenario Selector (CRITICAL component)
This is the most important UI element. The 3 scenarios (Base / Optimistic / Conservative) must be visually distinct and prominent:

Scenario tab bar — full-width, sticky below navbar when scrolling:
```css
.scenario-bar {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 64px; z-index: 900;
  padding: 0;
}
.scenario-tab {
  font-family: var(--ff-mono);
  font-size: .78rem; letter-spacing: 1px;
  text-transform: uppercase;
  padding: 14px 32px;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .3s var(--ease);
}
.scenario-tab:hover { color: var(--text-secondary); }
.scenario-tab.active { color: var(--accent-gold); border-bottom-color: var(--accent-gold); }
.scenario-tab.optimistic.active { color: #4ade80; border-bottom-color: #4ade80; }
.scenario-tab.conservative.active { color: #f87171; border-bottom-color: #f87171; }
```
Base = gold, Optimistic = green (#4ade80), Conservative = red (#f87171)

### Section Labels & Titles
Same as WOLF engine — mono label, Playfair Display title.

Label prefix for each statement:
- "01 — INCOME STATEMENT"
- "02 — BALANCE SHEET"
- "03 — CASH FLOW STATEMENT"
- "04 — ASSUMPTIONS"
- "05 — SUMMARY DASHBOARD"

### Financial Table Design (the core component)
All statement tables (Income Statement, Balance Sheet, Cash Flow):

```css
.fin-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--ff-mono);
  font-size: .82rem;
}
.fin-table th {
  background: var(--bg-secondary);
  color: var(--accent-gold);
  font-size: .72rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}
.fin-table th:first-child { text-align: left; }
.fin-table td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(30,45,69,.5);
  color: var(--text-secondary);
  text-align: right;
}
.fin-table td:first-child {
  text-align: left;
  color: var(--text-primary);
  font-family: var(--ff-body);
  font-size: .85rem;
}
.fin-table tr:hover td { background: rgba(30,45,69,.3); }
.fin-table .subtotal td {
  color: var(--text-primary);
  font-weight: 600;
  border-top: 1px solid var(--border);
}
.fin-table .total td {
  color: var(--accent-gold);
  font-family: var(--ff-mono);
  font-weight: 500;
  border-top: 2px solid var(--accent-gold);
  font-size: .88rem;
}
.fin-table .section-header td {
  background: rgba(201,168,76,.06);
  color: var(--accent-gold);
  font-family: var(--ff-mono);
  font-size: .72rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 8px 16px;
}
```

Year headers (Year 1 through Year 5): each in a column, right-aligned, styled as gold mono text.

Positive numbers: var(--text-primary)
Negative numbers: #f87171 (soft red)
Zero: var(--text-muted)

Wrap each table in a card:
```css
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  overflow-x: auto;
}
```

### Input / Assumptions Panel
All input fields: same spec as WOLF engine (mono font, gold focus, bg-secondary background).

Group inputs by category with gold mono uppercase labels above each group:
"REVENUE ASSUMPTIONS" / "COST ASSUMPTIONS" / "BALANCE SHEET DRIVERS" / "WORKING CAPITAL" etc.

Input grid: display grid, grid-template-columns: repeat(auto-fill, minmax(220px,1fr)), gap 20px

### Cards
Same as WOLF engine — bg-card, 1px border, 8px radius, hover gold border, featured with 3px gold left border.

### Buttons
Same as WOLF engine — btn-gold for primary, btn-outline for secondary.
Add a third style for scenario-specific actions:
```css
.btn-scenario {
  background: rgba(201,168,76,.1);
  color: var(--accent-gold);
  border: 1px solid rgba(201,168,76,.3);
  font-family: var(--ff-mono);
  font-size: .78rem;
  padding: 10px 22px;
  border-radius: 4px;
  cursor: pointer;
  transition: all .3s var(--ease);
}
.btn-scenario:hover { background: rgba(201,168,76,.2); }
```

### Charts
All charts follow same spec as WOLF — gold/blue palette, mono labels, dark background. Specific charts needed:
- Revenue trend line chart (5 years, 3 scenario lines — gold / green / red)
- EBITDA bar chart by year
- Net income comparison across scenarios
- Cash position waterfall
Use Chart.js. Line chart datasets: Base = #C9A84C, Optimistic = #4ade80, Conservative = #f87171

### Summary Dashboard Section
At the top or bottom — a grid of key metrics stat cards:
Revenue CAGR, EBITDA Margin, Net Income (Year 5), Free Cash Flow, Debt/Equity, Current Ratio
Each as a stat card: Playfair Display number in gold, mono label below.

### Circular Reference Solver Status Badge
A special status indicator showing the iterative solver status:
```html
<div class="solver-badge">
  <span class="dot"></span>
  <span>Iterative Solver Active — Balance Sheet Reconciled</span>
</div>
```
```css
.solver-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--ff-mono); font-size: .7rem;
  color: #4ade80;
  background: rgba(74,222,128,.08);
  padding: 6px 16px; border-radius: 20px;
  border: 1px solid rgba(74,222,128,.2);
}
.solver-badge .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #4ade80;
  animation: pulse 2s infinite;
}
```

### Scroll Reveal + Section Dividers
Same as WOLF engine — all sections wrapped in .reveal, section dividers between each.

### Footer
```html
<footer style="padding:40px 0; text-align:center; border-top:1px solid var(--border);">
  <p style="font-family:var(--ff-mono);font-size:.78rem;color:var(--text-secondary);">
    3-Statement Financial Model Engine · Built by <a href="https://ahmedwael.pages.dev" style="color:var(--accent-gold);">Ahmed Wael Metwally</a> · Cairo, Egypt
  </p>
  <p style="font-family:var(--ff-mono);font-size:.68rem;color:var(--text-muted);margin-top:8px;">
    Full balance sheet reconciliation · Circular reference iterative solver · FMVA® Certified
  </p>
</footer>
```

---

## LAYOUT STRUCTURE TO IMPLEMENT

1. **Navbar** (fixed, glass)
2. **Hero Strip** (title, subtitle, 4 stat badges)
3. **Scenario Selector Bar** (sticky, Base / Optimistic / Conservative tabs)
4. **Section Divider**
5. **Assumptions / Inputs Section** — class="card featured reveal", label: "01 — ASSUMPTIONS", organized input groups
6. **Section Divider**
7. **Income Statement** — class="reveal", label: "02 — INCOME STATEMENT", table-card + revenue chart
8. **Section Divider**
9. **Balance Sheet** — class="reveal", label: "03 — BALANCE SHEET", table-card + solver badge
10. **Section Divider**
11. **Cash Flow Statement** — class="reveal", label: "04 — CASH FLOW", table-card + cash chart
12. **Section Divider**
13. **Summary Dashboard** — class="card featured reveal", label: "05 — SUMMARY", key metrics grid + scenario comparison chart + export buttons
14. **Footer**

Max-width: 1100px, margin auto, padding 0 24px. Section padding 80px 0.

---

## WHAT NOT TO CHANGE
- All calculation logic and formulas
- The circular-reference iterative solver
- All three scenario data sets and switching logic
- All links between Income Statement, Balance Sheet, and Cash Flow
- Export functionality
- All existing data structures

---

## FINAL CHECKLIST BEFORE DELIVERING
- [ ] All fonts loading from Google Fonts CDN
- [ ] Grain noise overlay on body::before
- [ ] Navbar fixed with glass morphism and back-to-portfolio link
- [ ] Scenario bar sticky with Base/Optimistic/Conservative in gold/green/red
- [ ] Financial tables styled with mono font, gold totals, red negatives
- [ ] All inputs have gold focus state with box-shadow glow
- [ ] Output numbers in Playfair Display gold
- [ ] Iterative solver status badge visible
- [ ] Chart colors: gold=base, green=optimistic, red=conservative
- [ ] Reveal scroll animations on all sections
- [ ] Footer with portfolio link
- [ ] Fully responsive on mobile (375px), tablet (768px), desktop (1440px)

# ═══════════════════════════════════════════════════
# END OF PROMPT 2 — 3-STATEMENT MODEL ENGINE
