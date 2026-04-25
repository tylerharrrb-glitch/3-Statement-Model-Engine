"""Build the Company Info sheet."""
from enhance_helpers import *
from openpyxl.styles import Alignment

def build_company_info(wb):
    ws = wb.create_sheet('Company Info', 0)
    ws.column_dimensions['A'].width = 32
    ws.column_dimensions['B'].width = 42
    ws.column_dimensions['C'].width = 20
    ws.column_dimensions['D'].width = 20
    AL = Alignment(vertical='center', wrap_text=True)
    ALR = Alignment(vertical='center', horizontal='right')
    ALC = Alignment(vertical='center', horizontal='center')

    # Row 1: Banner
    merge_and_style(ws, 1, 1, 4, 'COMPANY INFORMATION & MODEL CONFIGURATION',
                    ft=font(WHITE, 16, True), fl=fill(NAVY), align=ALC)
    ws.row_dimensions[1].height = 36

    # ── Section 1: Company Identification ─────────
    r = 3
    merge_and_style(ws, r, 1, 4, 'SECTION 1 — COMPANY IDENTIFICATION',
                    ft=font(WHITE, 11, True), fl=fill(MED_BLUE), align=AL)
    rows_s1 = [
        ('Company Name', 'Demo Company Inc.', True),
        ('Legal Entity Type', 'Société Anonyme (S.A.E.)', True),
        ('Industry / Sector', 'Technology / Software', True),
        ('Founded Year', 2010, True),
        ('Commercial Register No.', '12345-Cairo-2010', False),
        ('Tax Identification No.', '123-456-789', False),
        ('Headquarters Address', '5 El-Nile Street, Zamalek, Cairo, Egypt', False),
    ]
    for i, (label, val, editable) in enumerate(rows_s1):
        r = 4 + i
        style_cell(ws, r, 1, label, ft=font(NAVY, 10, True), fl=fill(LIGHT_GRAY), align=AL, border=thin_border)
        if editable:
            style_cell(ws, r, 2, val, ft=font(INPUT_BLUE, 10), fl=fill(WHITE), align=AL, border=thin_border)
            merge_and_style(ws, r, 3, 4, '← Edit', ft=font(AMBER, 9, italic=True), fl=fill(WHITE), align=ALC)
        else:
            style_cell(ws, r, 2, val, ft=font(DARK_GRAY, 10), fl=fill(MED_GRAY), align=AL, border=thin_border)
            merge_and_style(ws, r, 3, 4, 'Auto', ft=font('999999', 9, italic=True), fl=fill(WHITE), align=ALC)

    # ── Section 2: Financial Model Configuration ──
    r = 12
    merge_and_style(ws, r, 1, 4, 'SECTION 2 — FINANCIAL MODEL CONFIGURATION',
                    ft=font(WHITE, 11, True), fl=fill(MED_BLUE), align=AL)
    rows_s2 = [
        ('Reporting Currency', 'Egyptian Pound (EGP)', False),
        ('Currency Symbol', 'E£', False),
        ('Fiscal Year End', 'December 31', True),
        ('Historical Period', '2021 – 2023 (Actual)', False),
        ('Projection Period', '2024E – 2028E (5 Years)', False),
        ('Revenue Projection Base (E£)', 1000000, True),
        ('Model Version', 'v2.0  |  Feb 2026', False),
        ('Last Updated', 'February 20, 2026', False),
    ]
    for i, (label, val, editable) in enumerate(rows_s2):
        r = 13 + i
        style_cell(ws, r, 1, label, ft=font(NAVY, 10, True), fl=fill(LIGHT_GRAY), align=AL, border=thin_border)
        if editable:
            style_cell(ws, r, 2, val, ft=font(INPUT_BLUE, 10), fl=fill(WHITE), align=AL, border=thin_border)
            if label == 'Revenue Projection Base (E£)':
                ws.cell(r, 2).number_format = '#,##0'
            merge_and_style(ws, r, 3, 4, '← Edit', ft=font(AMBER, 9, italic=True), fl=fill(WHITE), align=ALC)
        else:
            style_cell(ws, r, 2, val, ft=font(DARK_GRAY, 10), fl=fill(MED_GRAY), align=AL, border=thin_border)
            merge_and_style(ws, r, 3, 4, 'Auto', ft=font('999999', 9, italic=True), fl=fill(WHITE), align=ALC)

    # ── Section 3: Egypt Regulatory / Tax ─────────
    r = 22
    merge_and_style(ws, r, 1, 4, 'SECTION 3 — EGYPT REGULATORY / TAX',
                    ft=font(WHITE, 11, True), fl=fill(MED_BLUE), align=AL)
    rows_s3 = [
        ('Corporate Income Tax Rate', 0.225, '0.0%'),
        ('VAT Rate (Standard)', 0.14, '0.0%'),
        ('Dividend Withholding Tax', 0.10, '0.0%'),
        ('CBE Policy Rate (Reference)', 0.2725, '0.00%'),
        ('Financial Year Note', 'July 1 – June 30 (Note: model uses Dec)', None),
    ]
    for i, (label, val, fmt) in enumerate(rows_s3):
        r = 23 + i
        style_cell(ws, r, 1, label, ft=font(NAVY, 10, True), fl=fill(LIGHT_GRAY), align=AL, border=thin_border)
        c = style_cell(ws, r, 2, val, ft=font(INPUT_BLUE, 10), fl=fill(WHITE), align=AL, border=thin_border)
        if fmt: c.number_format = fmt
        merge_and_style(ws, r, 3, 4, '← Edit', ft=font(AMBER, 9, italic=True), fl=fill(WHITE), align=ALC)

    # ── Section 4: Report & Preparer ──────────────
    r = 29
    merge_and_style(ws, r, 1, 4, 'SECTION 4 — REPORT & PREPARER INFORMATION',
                    ft=font(WHITE, 11, True), fl=fill(MED_BLUE), align=AL)
    rows_s4 = [
        ('Prepared By', 'Financial Modeling Team'),
        ('Reviewed By', 'CFO'),
        ('Preparation Date', 'February 20, 2026'),
        ('Purpose', 'Internal Planning & Analysis'),
        ('Confidentiality', 'CONFIDENTIAL — Internal Use Only'),
        ('Contact Email', 'finance@democompany.com'),
    ]
    for i, (label, val) in enumerate(rows_s4):
        r = 30 + i
        style_cell(ws, r, 1, label, ft=font(NAVY, 10, True), fl=fill(LIGHT_GRAY), align=AL, border=thin_border)
        style_cell(ws, r, 2, val, ft=font(INPUT_BLUE, 10), fl=fill(WHITE), align=AL, border=thin_border)
        merge_and_style(ws, r, 3, 4, '← Edit', ft=font(AMBER, 9, italic=True), fl=fill(WHITE), align=ALC)

    # ── Footer note ───────────────────────────────
    r = 37
    merge_and_style(ws, r, 1, 4,
        'Note: Blue-text cells are editable inputs. Company Name (B4) flows to Dashboard and all sheet headers.',
        ft=font('666666', 9, italic=True), fl=fill(LIGHT_GRAY), align=AL)

    ws.sheet_properties.tabColor = MED_BLUE
    return ws
