================================================================================
WOLF FINANCIAL SUITE — UNIVERSAL PDF EXPORT DESIGN SYSTEM
Apply the VALOR Deal Memorandum PDF Design to Any Engine
Claude Opus 4.6 (Thinking) | Google Antigravity
================================================================================

PURPOSE:
This is a reusable master prompt. You will fill in the [ENGINE VARIABLES]
section at the top before running it in Antigravity. Everything else stays
the same across all engines in the Wolf Financial Suite.

The reference design is the VALOR M&A Engine Deal Memorandum — a 7-page
institutional-grade PDF export that has been audited and approved as the
suite standard. Every engine you build should produce PDFs that look like
they came from the same firm.

================================================================================
SECTION A — ENGINE VARIABLES (FILL THESE IN BEFORE RUNNING)
================================================================================

When using this prompt, replace every value below with the correct details
for the engine you are working on.

──────────────────────────────────────────────────────────────────────────────
ENGINE NAME (display):        [e.g. WOLF Valuation Engine]
ENGINE TAGLINE:               [e.g. Equity Valuation Platform]
ENGINE URL (live):            [e.g. https://wolf-valuation-engine.pages.dev/]
SUITE FOOTER TEXT:            [e.g. Wolf Valuation Engine | Part of the Wolf Financial Suite]
PDF FILENAME PREFIX:          [e.g. WOLF_Valuation_Report]
DISPATCH COMPONENT FILE:      [e.g. src/components/dispatch/DispatchPDF.jsx]
STATE CONTEXT FILE:           [e.g. src/context/ValuationContext.jsx]
REPORT TITLE:                 [e.g. Equity Valuation Report]
──────────────────────────────────────────────────────────────────────────────

PAGES TO INCLUDE (list every page this engine's report needs):
[List them — e.g.:]
  Page 1: Cover
  Page 2: Valuation Summary (DCF, Comps, Precedent Transactions)
  Page 3: DCF Analysis Detail
  Page 4: Comparable Company Analysis
  Page 5: Precedent Transactions
  Page 6: Football Field Chart
  Page 7: Assumptions & Disclaimer

The number and content of pages will vary per engine.
The cover page and disclaimer page are MANDATORY on every engine.
All pages between cover and disclaimer follow the section template below.

PRIMARY DATA FIELDS FOR THIS ENGINE:
[List the key financial outputs this engine produces — e.g.:]
  - Target Company Name
  - Implied Share Price (DCF)
  - Implied Share Price (Comps)
  - WACC Used
  - Terminal Growth Rate
  - EV/EBITDA Multiple Applied
  - 52-Week Trading Range
  - Analyst Price Targets

FRAMEWORK / STACK:
[e.g. React 19 + Vite 6 + Tailwind CSS + jsPDF 2.5.2 + html2canvas 1.4.1]
[e.g. JavaScript (JSX) only — no TypeScript]
  OR
[e.g. React 18 + Vite 5 + Tailwind CSS + jsPDF + html2canvas]
[e.g. JavaScript (JSX) only — no TypeScript]

================================================================================
SECTION B — THE VALOR PDF DESIGN SYSTEM (DO NOT CHANGE)
================================================================================

This is the approved suite design. Apply it exactly.
It was developed and battle-tested on the VALOR M&A Engine.

────────────────────────────────────────
B1. COLOR PALETTE
────────────────────────────────────────

Use these CSS values exactly. Do NOT substitute with Tailwind class names
inside the PDF render area — use inline styles only (see Section D).

  Suite Black:   #0B0F1A   — page background, primary dark surface
  Suite Navy:    #1A2340   — card/table row backgrounds, borders
  Suite Gold:    #C5A44E   — headings, accents, highlights, borders
  Suite Ivory:   #F4EDE4   — primary body text on dark backgrounds
  Suite Bronze:  #8B7534   — secondary accent, muted gold

  Status colors (used for financial indicators):
  Positive:      #22c55e   — green (accretive, above threshold, pass)
  Warning:       #f59e0b   — amber (borderline, review needed)
  Negative:      #ef4444   — red (dilutive, breach, fail)
  Neutral:       #6b7280   — gray (pending, not yet calculated)

────────────────────────────────────────
B2. TYPOGRAPHY
────────────────────────────────────────

These fonts are loaded via Google Fonts in index.html. Verify they exist
before building the PDF component. If missing, add these link tags to
index.html inside <head>:

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">

Font assignments:
  ENGINE NAME / REPORT TITLE:   Playfair Display, 700 weight, #C5A44E
  SECTION HEADERS:               Playfair Display, 700 weight, #C5A44E
  Body text / labels:            Inter, 400-600 weight, #F4EDE4
  ALL financial numbers/data:    IBM Plex Mono, 500-600 weight, #F4EDE4
  Metadata (dates, status):      Inter, 400 weight, #6b7280

This three-font system is mandatory. Numbers in IBM Plex Mono give the
report an institutional, Bloomberg-terminal feel that distinguishes it
from consumer-grade PDF exports.

────────────────────────────────────────
B3. PAGE STRUCTURE
────────────────────────────────────────

Every page has exactly three zones:

  ┌─────────────────────────────────────────────┐
  │  PAGE HEADER  (fixed, 48px tall)            │
  │  [Engine name left] [Page title right]      │
  ├─────────────────────────────────────────────┤
  │                                             │
  │  PAGE CONTENT  (variable height)            │
  │  [Section-specific financial content]       │
  │                                             │
  └─────────────────────────────────────────────┘
  │  PAGE FOOTER  (fixed, 32px tall)            │
  │  [Suite text left] [Page N right]           │
  └─────────────────────────────────────────────┘

Page header style:
  backgroundColor: '#1A2340'
  borderBottom: '1px solid #C5A44E'
  padding: '0 32px'
  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  height: '48px'

  Left side — Engine name:
    fontFamily: "'Playfair Display', serif"
    fontWeight: 700, fontSize: '14px', color: '#C5A44E'
    letterSpacing: '0.15em'

  Right side — Page title:
    fontFamily: 'Inter, sans-serif'
    fontSize: '11px', color: '#6b7280'
    letterSpacing: '0.1em', textTransform: 'uppercase'

Page footer style:
  backgroundColor: '#1A2340'
  borderTop: '1px solid #C5A44E'
  padding: '0 32px'
  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  height: '32px'
  fontSize: '9px', color: '#6b7280'
  letterSpacing: '0.08em'

  Left side: [SUITE FOOTER TEXT from Section A]
  Right side: "Page N" where N is the page number

Page content:
  backgroundColor: '#0B0F1A'
  padding: '24px 32px'
  flex: 1

────────────────────────────────────────
B4. COVER PAGE (Page 1 — mandatory on all engines)
────────────────────────────────────────

The cover page has NO header or footer zones.
It is a full-bleed dark page with centered content.

Layout (vertically centered, full page):

  ┌─────────────────────────────────────────────┐
  │                                             │
  │                                             │
  │       [ENGINE WORDMARK — large]             │
  │       [Engine tagline — small]              │
  │                                             │
  │       [REPORT TITLE — large]                │
  │                                             │
  │       [Campaign/Report Name]                │
  │       [Date and Time]                       │
  │       [Status badge]                        │
  │       [Currency | FX Rate]                  │
  │                                             │
  │                                             │
  │  [Footer: Suite text + "Page 1"] ──────────│
  └─────────────────────────────────────────────┘

Cover page styles:
  Full page background: '#0B0F1A'
  
  Engine wordmark:
    fontFamily: "'Playfair Display', serif"
    fontWeight: 700, fontSize: '48px', color: '#C5A44E'
    letterSpacing: '0.25em', textTransform: 'uppercase'
    marginBottom: '4px'
  
  Engine tagline (below wordmark):
    fontFamily: 'Inter, sans-serif'
    fontSize: '12px', color: '#6b7280'
    letterSpacing: '0.3em', textTransform: 'uppercase'
    marginBottom: '48px'
  
  Horizontal rule between wordmark and report title:
    width: '120px', height: '1px'
    backgroundColor: '#C5A44E'
    margin: '0 auto 48px auto'
  
  Report title:
    fontFamily: "'Playfair Display', serif"
    fontWeight: 700, fontSize: '22px', color: '#F4EDE4'
    letterSpacing: '0.05em', marginBottom: '32px'
  
  Campaign/Report name:
    fontFamily: 'Inter, sans-serif'
    fontSize: '16px', color: '#C5A44E', fontWeight: 600
    marginBottom: '8px'
  
  Date and Time:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: '12px', color: '#6b7280'
    marginBottom: '16px'
  
  Status badge:
    display: 'inline-block'
    padding: '4px 12px'
    border: '1px solid #22c55e'
    borderRadius: '4px'
    color: '#22c55e'
    fontFamily: 'Inter, sans-serif'
    fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em'
    marginBottom: '8px'
  
  Currency line:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: '11px', color: '#6b7280'

  Cover footer (at absolute bottom):
    position: 'absolute', bottom: 0, left: 0, right: 0
    Same style as page footer (B3 above)
    Shows "Page 1" on the right

────────────────────────────────────────
B5. SECTION HEADERS (within content pages)
────────────────────────────────────────

Every logical section within a content page starts with:

  <div style={{
    borderBottom: '1px solid #C5A44E',
    paddingBottom: '6px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}>
    <span style={{
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      fontSize: '13px',
      color: '#C5A44E',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    }}>Section Title</span>
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      color: '#6b7280',
    }}>Optional subtitle or metric</span>
  </div>

────────────────────────────────────────
B6. DATA TABLE STYLE
────────────────────────────────────────

For key-value pairs (label: value on same row):

  Row container:
    display: 'flex'
    justifyContent: 'space-between'
    alignItems: 'center'
    padding: '6px 0'
    borderBottom: '1px solid #1A2340'

  Label (left):
    fontFamily: 'Inter, sans-serif'
    fontSize: '11px', color: '#6b7280'
    fontWeight: 400

  Value (right):
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: '11px', color: '#F4EDE4'
    fontWeight: 600

  Highlighted row (for key metrics):
    backgroundColor: '#1A2340'
    padding: '8px 10px'
    borderRadius: '4px'
    marginBottom: '4px'

  Two-column table layout (for side-by-side sections):
    display: 'grid'
    gridTemplateColumns: '1fr 1fr'
    gap: '24px'

────────────────────────────────────────
B7. STATUS INDICATORS
────────────────────────────────────────

CRITICAL — DO NOT USE LUCIDE-REACT ICONS IN PDF RENDER AREA.
html2canvas cannot render SVG icons — they show as "&" or disappear.

Use ONLY these Unicode characters for status indicators:

  ● (U+25CF) — filled circle — completed / confirmed / positive
  ○ (U+25CB) — empty circle — pending / incomplete
  ✓ (U+2713) — checkmark — verified / pass
  ✗ (U+2717) — cross — failed / error
  ▲ (U+25B2) — up triangle — above target / increase
  ▼ (U+25BC) — down triangle — below target / decrease
  — (U+2014) — em dash — no data / not applicable
  = (ASCII)  — equals — balanced / no change

For text labels:
  "BALANCED"   instead of a ✅ emoji
  "CONFIRMED"  instead of a ✅ emoji  
  "PENDING"    instead of a ⏳ emoji
  "REVIEW"     instead of a ⚠️ emoji

Apply color by wrapping in a span:
  <span style={{ color: '#22c55e' }}>● COMPLETE</span>
  <span style={{ color: '#ef4444' }}>○ PENDING</span>
  <span style={{ color: '#f59e0b' }}>▲ REVIEW</span>

────────────────────────────────────────
B8. DISCLAIMER PAGE (Last page — mandatory on all engines)
────────────────────────────────────────

The final page always contains a disclaimer section.

Standard disclaimer block (adapt as needed for each engine):

  This report was prepared using [ENGINE NAME]. All parameters and
  calculations are provided for informational purposes only.
  [Add engine-specific regulatory references here.]

  This engine does not constitute legal, tax, or financial advisory
  services. Users must verify all outputs with qualified professionals
  before relying on them for actual transactions or investment decisions.

  [ENGINE NAME] | Part of the Wolf Financial Suite

  Style: Inter, 11px, #6b7280, line-height 1.8, centered or left-aligned.

================================================================================
SECTION C — TECHNICAL IMPLEMENTATION (DO NOT CHANGE)
================================================================================

This is the proven implementation pattern from VALOR. Follow it exactly.

────────────────────────────────────────
C1. FILE TO CREATE OR REPLACE
────────────────────────────────────────

Target file: [DISPATCH COMPONENT FILE from Section A]

If the file already exists: REPLACE the entire PDF generation logic
inside it with the new implementation below.

If the file does not exist: Create it from scratch.

Do NOT create a separate CSS file. All styles are inline (required for
html2canvas compatibility).

────────────────────────────────────────
C2. DEPENDENCY CHECK
────────────────────────────────────────

First, verify these are in package.json dependencies:
  "jspdf": "^2.5.2"
  "html2canvas": "^1.4.1"

If missing, run:
  npm install jspdf html2canvas

────────────────────────────────────────
C3. HOW THE PDF GENERATION WORKS
────────────────────────────────────────

The generation flow is:

  1. A hidden <div> is rendered off-screen (left: -9999px or visibility hidden)
     containing ALL pages of the report styled exactly as the final PDF.

  2. html2canvas takes a snapshot of this hidden <div> and converts each
     page to a canvas image.

  3. jsPDF creates a PDF document and embeds each canvas as a full-page image.

  4. The PDF is downloaded with the filename:
     [PDF FILENAME PREFIX]_[ReportName]_[YYYY-MM-DD].pdf

The hidden container must:
  - Have an explicit width: '794px' (A4 at 96dpi)
  - Each page must have an explicit height: '1123px' (A4 at 96dpi)
  - Use position: 'absolute', left: '-9999px' to hide from view
  - Be mounted in the DOM when generation fires

────────────────────────────────────────
C4. IMPLEMENTATION SKELETON
────────────────────────────────────────

Use this exact structure for the dispatch component:

─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { useContext } from 'react';
// Import your state context here
// import { YourContext } from '../../context/YourContext';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const SUITE_BLACK = '#0B0F1A';
const SUITE_NAVY  = '#1A2340';
const SUITE_GOLD  = '#C5A44E';
const SUITE_IVORY = '#F4EDE4';
const SUITE_GRAY  = '#6b7280';
const POSITIVE    = '#22c55e';
const NEGATIVE    = '#ef4444';
const WARNING     = '#f59e0b';

// ─── SHARED STYLES ────────────────────────────────────────────────────────────

const styles = {
  pageWrapper: {
    width: `${A4_WIDTH_PX}px`,
    height: `${A4_HEIGHT_PX}px`,
    backgroundColor: SUITE_BLACK,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  pageHeader: {
    height: '48px',
    backgroundColor: SUITE_NAVY,
    borderBottom: `1px solid ${SUITE_GOLD}`,
    padding: '0 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  pageFooter: {
    height: '32px',
    backgroundColor: SUITE_NAVY,
    borderTop: `1px solid ${SUITE_GOLD}`,
    padding: '0 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    fontSize: '9px',
    color: SUITE_GRAY,
    letterSpacing: '0.08em',
  },
  pageContent: {
    flex: 1,
    backgroundColor: SUITE_BLACK,
    padding: '24px 32px',
    overflow: 'hidden',
  },
  sectionHeader: {
    borderBottom: `1px solid ${SUITE_GOLD}`,
    paddingBottom: '6px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    fontSize: '13px',
    color: SUITE_GOLD,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  dataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: `1px solid ${SUITE_NAVY}`,
  },
  dataLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    color: SUITE_GRAY,
    fontWeight: 400,
  },
  dataValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '11px',
    color: SUITE_IVORY,
    fontWeight: 600,
  },
  highlightRow: {
    backgroundColor: SUITE_NAVY,
    padding: '8px 10px',
    borderRadius: '4px',
    marginBottom: '4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function PageHeader({ engineName, pageTitle }) {
  return (
    <div style={styles.pageHeader}>
      <span style={{
        fontFamily: "'Playfair Display', serif",
        fontWeight: 700, fontSize: '14px',
        color: SUITE_GOLD, letterSpacing: '0.15em',
      }}>
        {engineName}
      </span>
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px', color: SUITE_GRAY,
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {pageTitle}
      </span>
    </div>
  );
}

function PageFooter({ suiteText, pageNum }) {
  return (
    <div style={styles.pageFooter}>
      <span>{suiteText}</span>
      <span>Page {pageNum}</span>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionTitle}>{title}</span>
      {subtitle && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: SUITE_GRAY }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

function DataRow({ label, value, highlight, valueColor }) {
  if (highlight) {
    return (
      <div style={styles.highlightRow}>
        <span style={styles.dataLabel}>{label}</span>
        <span style={{ ...styles.dataValue, color: valueColor || SUITE_IVORY }}>{value}</span>
      </div>
    );
  }
  return (
    <div style={styles.dataRow}>
      <span style={styles.dataLabel}>{label}</span>
      <span style={{ ...styles.dataValue, color: valueColor || SUITE_IVORY }}>{value}</span>
    </div>
  );
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────

function CoverPage({ engineName, tagline, reportTitle, reportName, date, time, status, currency, fxRate, suiteText }) {
  return (
    <div style={{ ...styles.pageWrapper, position: 'relative' }}>
      {/* Centered content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 64px',
      }}>
        {/* Engine wordmark */}
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700, fontSize: '48px',
          color: SUITE_GOLD, letterSpacing: '0.25em',
          textTransform: 'uppercase', marginBottom: '4px',
          textAlign: 'center',
        }}>{engineName}</div>

        {/* Tagline */}
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '11px', color: SUITE_GRAY,
          letterSpacing: '0.3em', textTransform: 'uppercase',
          marginBottom: '32px', textAlign: 'center',
        }}>{tagline}</div>

        {/* Gold rule */}
        <div style={{
          width: '120px', height: '1px',
          backgroundColor: SUITE_GOLD,
          marginBottom: '32px',
        }} />

        {/* Report title */}
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700, fontSize: '22px',
          color: SUITE_IVORY, letterSpacing: '0.05em',
          marginBottom: '32px', textAlign: 'center',
        }}>{reportTitle}</div>

        {/* Report/Campaign name */}
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px', color: SUITE_GOLD,
          fontWeight: 600, marginBottom: '8px', textAlign: 'center',
        }}>{reportName}</div>

        {/* Date and time */}
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '12px', color: SUITE_GRAY,
          marginBottom: '20px',
        }}>{date} {time}</div>

        {/* Status badge */}
        <div style={{
          display: 'inline-block', padding: '4px 16px',
          border: `1px solid ${POSITIVE}`, borderRadius: '4px',
          color: POSITIVE, fontFamily: 'Inter, sans-serif',
          fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.1em', marginBottom: '8px',
        }}>Status: {status}</div>

        {/* Currency */}
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px', color: SUITE_GRAY,
        }}>Currency: {currency} | FX: USD/{currency} {fxRate}</div>
      </div>

      {/* Footer */}
      <div style={styles.pageFooter}>
        <span>{suiteText}</span>
        <span>Page 1</span>
      </div>
    </div>
  );
}

// ─── DISCLAIMER PAGE ──────────────────────────────────────────────────────────

function DisclaimerPage({ engineName, pageNum, suiteText, disclaimerText }) {
  return (
    <div style={styles.pageWrapper}>
      <PageHeader engineName={engineName} pageTitle="Disclaimer" />
      <div style={{ ...styles.pageContent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '580px', textAlign: 'center' }}>
          <SectionHeader title="Disclaimer" />
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px', color: SUITE_GRAY,
            lineHeight: '1.8', marginBottom: '24px',
          }}>
            {disclaimerText}
          </p>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700, fontSize: '16px',
            color: SUITE_GOLD, letterSpacing: '0.15em',
            marginTop: '32px',
          }}>
            {engineName}
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '10px', color: SUITE_GRAY,
            letterSpacing: '0.15em', marginTop: '4px',
          }}>
            Part of the Wolf Financial Suite
          </div>
        </div>
      </div>
      <PageFooter suiteText={suiteText} pageNum={pageNum} />
    </div>
  );
}

// ─── CONTENT PAGES ────────────────────────────────────────────────────────────
// BUILD YOUR ENGINE-SPECIFIC PAGES HERE
// Follow the patterns above: PageHeader, content in styles.pageContent, PageFooter
// Use DataRow for key-value pairs, SectionHeader for sections
// NEVER use lucide-react icons — use Unicode characters only

// Example:
// function ValuationSummaryPage({ data }) { ... }
// function DCFPage({ data }) { ... }
// function CompsPage({ data }) { ... }

// ─── PDF GENERATION FUNCTION ──────────────────────────────────────────────────

async function generatePDF(containerRef, reportName, pdfFilenamePrefix) {
  // Import dynamically to avoid SSR issues
  const jsPDF = (await import('jspdf')).default;
  const html2canvas = (await import('html2canvas')).default;

  const container = containerRef.current;
  const pages = container.querySelectorAll('.pdf-page');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const canvas = await html2canvas(pages[i], {
      scale: 2,                    // High resolution
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#0B0F1A',
      logging: false,
      width: 794,
      height: 1123,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297); // A4 in mm
  }

  const today = new Date().toISOString().split('T')[0];
  const safeName = reportName.replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${pdfFilenamePrefix}_${safeName}_${today}.pdf`);
}

// ─── MAIN DISPATCH COMPONENT ──────────────────────────────────────────────────

export default function DispatchPDF() {
  // Pull state from your context here
  // const { state } = useContext(YourContext);

  const [generating, setGenerating] = useState(false);
  const pdfContainerRef = useRef(null);

  // Format today's date and time for the cover page
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generatePDF(
        pdfContainerRef,
        'Report Name',          // Replace with your report/campaign name from state
        'ENGINE_Report'         // Replace with [PDF FILENAME PREFIX from Section A]
      );
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Check console for details.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* ── UI BUTTON (visible to user) ── */}
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '14px 40px',
            backgroundColor: generating ? SUITE_NAVY : SUITE_GOLD,
            color: generating ? SUITE_GRAY : SUITE_BLACK,
            border: 'none', borderRadius: '6px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700, fontSize: '14px',
            letterSpacing: '0.1em', cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? 'GENERATING...' : 'DISPATCH PDF'}
        </button>
        {generating && (
          <p style={{ color: SUITE_GRAY, fontSize: '12px', marginTop: '12px' }}>
            Compiling report — this may take a few seconds...
          </p>
        )}
      </div>

      {/* ── HIDDEN PDF CONTAINER (off-screen, rendered for html2canvas) ── */}
      <div
        ref={pdfContainerRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: `${A4_WIDTH_PX}px`,
        }}
      >
        {/* Add className="pdf-page" to each page — generatePDF() uses this */}

        <div className="pdf-page" style={{ ...styles.pageWrapper, marginBottom: '4px' }}>
          <CoverPage
            engineName="[ENGINE NAME]"
            tagline="[ENGINE TAGLINE]"
            reportTitle="[REPORT TITLE]"
            reportName="[Campaign/Report Name from state]"
            date={dateStr}
            time={timeStr}
            status="Active"
            currency="EGP"
            fxRate="49.50"
            suiteText="[SUITE FOOTER TEXT]"
          />
        </div>

        {/* ADD YOUR CONTENT PAGES HERE */}
        {/* <div className="pdf-page" style={{ ...styles.pageWrapper, marginBottom: '4px' }}> */}
        {/*   <ValuationSummaryPage data={state} /> */}
        {/* </div> */}

        <div className="pdf-page" style={{ ...styles.pageWrapper }}>
          <DisclaimerPage
            engineName="[ENGINE NAME]"
            pageNum={/* total pages */2}
            suiteText="[SUITE FOOTER TEXT]"
            disclaimerText="[Engine-specific disclaimer text]"
          />
        </div>
      </div>
    </div>
  );
}

─────────────────────────────────────────────────────────────────────────────

================================================================================
SECTION D — CRITICAL RULES (READ BEFORE WRITING ANY PDF CODE)
================================================================================

RULE 1 — NO LUCIDE-REACT ICONS IN PDF RENDER AREA
  Lucide SVG icons render as "&" or disappear in html2canvas.
  Any icon inside a .pdf-page div MUST be replaced with Unicode (see B7).
  Icons in the regular UI (outside the hidden container) are fine.

RULE 2 — ALL STYLES MUST BE INLINE
  Tailwind classes are NOT applied by html2canvas in the hidden container.
  Every style on every element inside .pdf-page must use the style={} prop.
  Copy from the styles object defined in C4.

RULE 3 — FIXED PAGE DIMENSIONS
  Every .pdf-page must be exactly 794×1123px.
  Content that overflows will be cut off.
  If a section has too much data, split it across two pages.
  Never use overflow: auto or overflow: scroll inside a .pdf-page.

RULE 4 — USE IBM PLEX MONO FOR ALL NUMBERS
  Every financial value, percentage, multiple, ratio, or date must render
  in IBM Plex Mono. This is the single most important typography rule.
  It immediately distinguishes a professional report from an amateur one.

RULE 5 — NO EMOJIS
  Emojis (✅ ❌ ⚠️ 🟢 🔴) do not render in jsPDF.
  Use the approved Unicode characters from B7 with colored spans.

RULE 6 — FINANCIAL VALUES MUST COME FROM STATE
  Never hardcode financial values in the PDF component.
  Every number must be pulled from the engine's state context.
  If a value is not yet calculated (null/undefined/zero), show "—"
  using the em dash character, not "N/A" or blank.

RULE 7 — FORMAT NUMBERS CONSISTENTLY
  Use a shared formatter function. Example:

    const fmt = (n, decimals = 1) => {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return `EGP ${n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}M`;
    };

    const fmtPct = (n) => n === null || isNaN(n) ? '—' : `${n.toFixed(2)}%`;
    const fmtX = (n) => n === null || isNaN(n) ? '—' : `${n.toFixed(2)}x`;

RULE 8 — html2canvas SCALE = 2
  Always use scale: 2 in the html2canvas call.
  This produces a high-resolution (Retina-quality) capture.
  Lower scale values produce blurry text in the PDF.

RULE 9 — DYNAMIC IMPORT FOR jsPDF AND html2canvas
  Always use dynamic imports inside the generatePDF function:
    const jsPDF = (await import('jspdf')).default;
    const html2canvas = (await import('html2canvas')).default;
  This avoids SSR issues and reduces initial bundle size.

================================================================================
SECTION E — ENGINE-SPECIFIC IMPLEMENTATION GUIDE
================================================================================

Once you have filled in Section A and understood Sections B-D,
build the engine-specific content pages following this process:

STEP E1 — Map the engine's outputs to PDF sections.
  List every major output the engine produces.
  Group related outputs into logical pages (max ~15 rows per page).
  Assign a page title, section headers, and data rows to each group.

STEP E2 — Build each content page as a React component.
  Follow the pattern: PageHeader → pageContent div → PageFooter.
  Use SectionHeader and DataRow components for consistency.
  For charts/visuals: render as simple text tables in the PDF
  (html2canvas struggles with animated Recharts — use static data tables).

STEP E3 — Add pages to the hidden container in order.
  Each page gets a className="pdf-page" div.
  Update the page numbers in each PageFooter.

STEP E4 — Test locally.
  Click "DISPATCH PDF" and inspect every page.
  Check: no "&" symbols, no missing text, no overflow, all numbers correct.

STEP E5 — Deploy.
  git add . && git commit -m "Implement suite PDF design standard" && git push

================================================================================
SECTION F — WOLF VALUATION ENGINE SPECIFIC GUIDE
================================================================================

When applying this to https://wolf-valuation-engine.pages.dev/

Section A values to use:
  ENGINE NAME:            WOLF
  ENGINE TAGLINE:         Equity Valuation Engine
  REPORT TITLE:           Equity Valuation Report
  SUITE FOOTER TEXT:      Wolf Valuation Engine | Part of the Wolf Financial Suite
  PDF FILENAME PREFIX:    WOLF_Valuation_Report
  DISPATCH COMPONENT:     src/components/dispatch/DispatchPDF.jsx (or equivalent)

Suggested page structure (adapt to actual engine outputs):

  Page 1:  Cover
  Page 2:  Valuation Summary
           — Implied share price from each methodology
           — Football field summary table
           — Upside/downside vs current price
  Page 3:  DCF Analysis
           — Revenue projections (5 years)
           — EBITDA margin assumptions
           — WACC components
           — Terminal value
           — Implied share price (DCF)
  Page 4:  Comparable Company Analysis (CCA)
           — Selected comps with EV/EBITDA, EV/Revenue, P/E
           — Median/mean multiples
           — Implied share price range
  Page 5:  Precedent Transactions (if applicable)
           — Selected transactions
           — Implied premium and multiples
  Page 6:  Monte Carlo Simulation (if applicable)
           — Input ranges (WACC, growth rate)
           — Simulation output (mean, percentiles)
           — Probability of upside
  Page 7:  Assumptions & Disclaimer

================================================================================
SECTION G — 3-STATEMENT MODEL ENGINE SPECIFIC GUIDE
================================================================================

When applying this to https://3-statement-model-engine.pages.dev/

Section A values to use:
  ENGINE NAME:            3-STATEMENT
  ENGINE TAGLINE:         Financial Model Engine
  REPORT TITLE:           Financial Model Report
  SUITE FOOTER TEXT:      3-Statement Engine | Part of the Wolf Financial Suite
  PDF FILENAME PREFIX:    3Statement_Financial_Model
  DISPATCH COMPONENT:     src/components/dispatch/DispatchPDF.jsx (or equivalent)

Suggested page structure (adapt to actual engine outputs):

  Page 1:  Cover
  Page 2:  Executive Summary
           — Scenario selected (Base / Optimistic / Conservative)
           — 5-year revenue and EBITDA summary table
           — Key ratios
  Page 3:  Income Statement
           — 5-year P&L: Revenue → Gross Profit → EBITDA → EBIT → Net Income
           — Year-over-year growth rates
           — Margin percentages (gross, EBITDA, net)
  Page 4:  Balance Sheet
           — 5-year balance sheet: Assets / Liabilities / Equity
           — Balance check: Assets = Liabilities + Equity (show ✓ or ✗)
           — Key ratios: Debt/Equity, Current Ratio
  Page 5:  Cash Flow Statement
           — 5-year: Operating / Investing / Financing / Net Change
           — Opening and closing cash positions
           — Free Cash Flow
  Page 6:  Scenario Comparison
           — Side-by-side: Base vs. Optimistic vs. Conservative
           — Revenue, EBITDA, Net Income for Year 5 in each scenario
           — Variance analysis
  Page 7:  Assumptions & Disclaimer
           — Revenue growth rates per year per scenario
           — Key cost assumptions
           — Circular reference solver note
           — Disclaimer

================================================================================
SECTION H — QUALITY CHECKLIST (run before every deployment)
================================================================================

Print and check every item after generating a PDF:

Page by page:
  □ Page 1  — Cover: Engine name large, gold, Playfair Display
  □ Page 1  — Cover: Report name, date, status badge all present
  □ Page 1  — Footer present at bottom of cover page
  □ All     — Page header: engine name (gold, left) and page title (gray, right)
  □ All     — Page footer: suite text (left) and "Page N" (right)
  □ All     — No text overflow or cut-off content
  □ All     — No "&" symbols (indicates lucide-react icon rendering failure)
  □ All     — No emoji (✅ ❌ ⚠️) — use Unicode + colored spans
  □ All     — All numbers in IBM Plex Mono
  □ All     — Null/missing data shows "—" not "0" or blank
  □ All     — Financial values match what the engine UI shows
  □ Last    — Disclaimer page present with engine name footer
  □ File    — PDF filename: [PREFIX]_[ReportName]_[YYYY-MM-DD].pdf

Visual consistency:
  □ Background: #0B0F1A (not white, not gray)
  □ Accents: #C5A44E gold (not yellow, not orange)
  □ Text: #F4EDE4 (not pure white #FFFFFF)
  □ Section headers: Playfair Display, gold, uppercase
  □ Spacing consistent across all pages

================================================================================
END OF MASTER PROMPT
WOLF FINANCIAL SUITE — PDF DESIGN SYSTEM v1.0
"Every report from the same firm."
================================================================================
