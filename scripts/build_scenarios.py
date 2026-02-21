"""Build the Scenarios sheet."""
from enhance_helpers import *
from openpyxl.styles import Alignment

# Scenario data: 9 assumptions × 5 projection years
BASE_DATA = [
    [0.10, 0.08, 0.07, 0.06, 0.05],  # Rev Growth
    [0.60, 0.60, 0.60, 0.60, 0.60],  # COGS%
    [0.15, 0.15, 0.15, 0.15, 0.15],  # SG&A%
    [0.05, 0.05, 0.05, 0.05, 0.05],  # R&D%
    [0.02, 0.02, 0.02, 0.02, 0.02],  # Other OpEx%
    [0.225, 0.225, 0.225, 0.225, 0.225],  # Tax
    [0.05, 0.05, 0.05, 0.05, 0.05],  # CapEx%
    [0.20, 0.20, 0.20, 0.20, 0.20],  # Int Rate
    [0.05, 0.05, 0.05, 0.05, 0.05],  # Div Payout
]
OPT_DATA = [
    [0.15, 0.12, 0.10, 0.09, 0.08],
    [0.57, 0.56, 0.56, 0.55, 0.55],
    [0.13, 0.13, 0.13, 0.13, 0.13],
    [0.04, 0.04, 0.04, 0.04, 0.04],
    [0.015, 0.015, 0.015, 0.015, 0.015],
    [0.225, 0.225, 0.225, 0.225, 0.225],
    [0.06, 0.05, 0.05, 0.04, 0.04],
    [0.18, 0.17, 0.16, 0.15, 0.15],
    [0.05, 0.08, 0.10, 0.10, 0.12],
]
CONS_DATA = [
    [0.05, 0.04, 0.03, 0.03, 0.02],
    [0.63, 0.63, 0.63, 0.63, 0.62],
    [0.17, 0.17, 0.16, 0.16, 0.16],
    [0.06, 0.06, 0.06, 0.05, 0.05],
    [0.025, 0.025, 0.025, 0.025, 0.025],
    [0.225, 0.225, 0.225, 0.225, 0.225],
    [0.06, 0.06, 0.06, 0.06, 0.06],
    [0.22, 0.22, 0.21, 0.21, 0.20],
    [0.03, 0.03, 0.03, 0.03, 0.03],
]

NARRATIVES = {
    'Base Case': {
        'color': MED_BLUE,
        'desc': 'Central planning scenario — stable market conditions',
        'bullets': [
            '• Revenue growth decelerates from 10% to 5% over 5 years',
            '• COGS maintained at 60% — stable supply chain',
            '• SG&A at 15% — steady marketing investment',
            '• Interest rate fixed at 20% — current CBE environment',
            '• Conservative 5% dividend payout ratio',
        ],
    },
    'Optimistic': {
        'color': GREEN,
        'desc': 'Bull case — strong execution & market tailwinds',
        'bullets': [
            '• Aggressive revenue growth from 15% tapering to 8%',
            '• COGS improves from 57% to 55% — scale economies',
            '• Lower SG&A at 13% — efficient customer acquisition',
            '• Interest rates decline from 18% to 15% — CBE easing',
            '• Dividend payout increases from 5% to 12%',
        ],
    },
    'Conservative': {
        'color': AMBER,
        'desc': 'Bear case — macro headwinds & competitive pressure',
        'bullets': [
            '• Slow revenue growth from 5% declining to 2%',
            '• COGS elevated at 63% — input cost pressure',
            '• Higher SG&A at 17% — customer retention costs',
            '• High interest rates at 22% — tight monetary policy',
            '• Minimal 3% dividend payout — cash preservation',
        ],
    },
}

def _write_block(ws, start_row, name, data, title_color):
    AL = Alignment(vertical='center', wrap_text=True)
    ALC = Alignment(vertical='center', horizontal='center')
    periods = ['2024E', '2025E', '2026E', '2027E', '2028E']
    r = start_row

    # Title row
    merge_and_style(ws, r, 1, 6, f'▎ {name.upper()}',
                    ft=font(WHITE, 12, True), fl=fill(title_color), align=AL)
    # Narrative title in G-H
    merge_and_style(ws, r, 7, 8, name,
                    ft=font(title_color, 11, True), fl=fill(WHITE), align=AL)
    r += 1

    # Header row
    style_cell(ws, r, 1, 'Assumption', ft=font(WHITE, 10, True), fl=fill('444444'), align=AL, border=thin_border)
    for i, p in enumerate(periods):
        style_cell(ws, r, 2+i, p, ft=font(WHITE, 10, True), fl=fill('444444'), align=ALC, border=thin_border)
    narr = NARRATIVES[name]
    merge_and_style(ws, r, 7, 8, narr['desc'],
                    ft=font(DARK_GRAY, 9, italic=True), fl=fill(WHITE), align=AL)
    r += 1

    # Data rows (these are the actual scenario values)
    for idx, label in enumerate(ASSUMP_LABELS):
        bg = LIGHT_GRAY if idx % 2 == 0 else WHITE
        style_cell(ws, r, 1, label, ft=font(NAVY, 10), fl=fill(bg), align=AL, border=thin_border)
        for ci in range(5):
            c = style_cell(ws, r, 2+ci, data[idx][ci],
                          ft=font(SCENARIO_BLUE, 10), fl=fill(bg), align=ALC, border=thin_border)
            c.number_format = '0.0%'
        # Narrative bullets in G-H
        if idx < len(narr['bullets']):
            merge_and_style(ws, r, 7, 8, narr['bullets'][idx],
                           ft=font(DARK_GRAY, 9), fl=fill(WHITE), align=AL)
        r += 1
    return r

def build_scenarios(wb):
    ws = wb.create_sheet('Scenarios', 2)
    ws.column_dimensions['A'].width = 30
    for c in 'BCDEF':
        ws.column_dimensions[c].width = 14
    ws.column_dimensions['G'].width = 20
    ws.column_dimensions['H'].width = 20
    AL = Alignment(vertical='center', wrap_text=True)
    ALC = Alignment(vertical='center', horizontal='center')

    # Banner
    merge_and_style(ws, 1, 1, 8, 'SCENARIO ASSUMPTIONS',
                    ft=font(WHITE, 16, True), fl=fill(NAVY), align=ALC)
    ws.row_dimensions[1].height = 36
    merge_and_style(ws, 2, 1, 8,
        'This sheet is the single source of truth for all scenario assumption values. '
        'It feeds the Assumptions sheet when a scenario is selected in the Dashboard.',
        ft=font(DARK_GRAY, 9, italic=True), fl=fill(LIGHT_GRAY), align=AL)

    # Block 1: Base Case (rows 4-14)
    r = 4
    r = _write_block(ws, r, 'Base Case', BASE_DATA, MED_BLUE)
    r += 1  # spacer

    # Block 2: Optimistic (rows 17-27)  
    r = _write_block(ws, r, 'Optimistic', OPT_DATA, GREEN)
    r += 1

    # Block 3: Conservative (rows 30-40)
    r = _write_block(ws, r, 'Conservative', CONS_DATA, AMBER)

    ws.sheet_properties.tabColor = GREEN
    return ws
