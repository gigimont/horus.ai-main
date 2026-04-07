from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, Response
from dependencies import get_db, get_tenant_id
from services.claude_service import client as claude_client
from supabase import Client
import csv, io
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER

router = APIRouter()


@router.get("/targets.csv")
async def export_targets_csv(
    country: str = Query(None),
    industry_code: str = Query(None),
    score_min: float = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    query = db.table("targets").select(
        "*, target_scores(overall_score, transition_score, value_score, market_score, financial_score, rationale)"
    ).eq("tenant_id", tenant_id).is_("deleted_at", "null")

    if country:
        query = query.eq("country", country)
    if industry_code:
        query = query.eq("industry_code", industry_code)

    result = query.order("created_at", desc=True).execute()
    targets = result.data or []

    if score_min is not None:
        targets = [
            t for t in targets
            if (t.get("target_scores") or [{}])[0].get("overall_score", 0) >= score_min
        ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Name", "Country", "Region", "City",
        "Industry", "Industry Code",
        "Employees", "Revenue (EUR)", "Founded", "Owner Age",
        "Overall Score", "Transition Score", "Value Score",
        "Market Score", "Financial Score", "Rationale",
        "Website"
    ])

    for t in targets:
        scores = (t.get("target_scores") or [{}])[0]
        writer.writerow([
            t.get("name", ""),
            t.get("country", ""),
            t.get("region", ""),
            t.get("city", ""),
            t.get("industry_label", ""),
            t.get("industry_code", ""),
            t.get("employee_count", ""),
            t.get("revenue_eur", ""),
            t.get("founded_year", ""),
            t.get("owner_age_estimate", ""),
            scores.get("overall_score", ""),
            scores.get("transition_score", ""),
            scores.get("value_score", ""),
            scores.get("market_score", ""),
            scores.get("financial_score", ""),
            scores.get("rationale", ""),
            t.get("website", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=searchfund-targets.csv"}
    )


@router.get("/report/{target_id}")
async def export_target_report(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    t_res = db.table("targets").select("*, target_scores(*)").eq(
        "id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not t_res.data:
        raise HTTPException(404, "Target not found")

    t = t_res.data
    scores = (t.get("target_scores") or [{}])[0]

    prompt = f"""Write a professional one-page acquisition target report for a Search Fund operator.

Target: {t.get('name')}
Location: {', '.join(filter(None, [t.get('city'), t.get('region'), t.get('country')]))}
Industry: {t.get('industry_label')} ({t.get('industry_code')})
Employees: {t.get('employee_count') or 'unknown'}
Revenue: {'€{:,}'.format(t['revenue_eur']) if t.get('revenue_eur') else 'unknown'}
Founded: {t.get('founded_year') or 'unknown'}
Owner age estimate: {t.get('owner_age_estimate') or 'unknown'}
Overall score: {scores.get('overall_score', 'N/A')} / 10
Transition score: {scores.get('transition_score', 'N/A')}
Value score: {scores.get('value_score', 'N/A')}
Market score: {scores.get('market_score', 'N/A')}
Financial score: {scores.get('financial_score', 'N/A')}
AI rationale: {scores.get('rationale', 'Not scored')}

Write 3 sections:
1. Executive summary (2-3 sentences)
2. Investment thesis (3-4 sentences on why this is an attractive acquisition)
3. Key risks and mitigants (2-3 bullet points)

Be analytical, concise, and professional. Write for a sophisticated M&A audience."""

    msg = claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    narrative = msg.content[0].text

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm)

    title_style = ParagraphStyle('title', fontSize=18, fontName='Helvetica-Bold',
        spaceAfter=4, textColor=colors.HexColor('#1e293b'))
    subtitle_style = ParagraphStyle('subtitle', fontSize=11, fontName='Helvetica',
        textColor=colors.HexColor('#64748b'), spaceAfter=16)
    section_style = ParagraphStyle('section', fontSize=11, fontName='Helvetica-Bold',
        spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#1e293b'))
    body_style = ParagraphStyle('body', fontSize=10, fontName='Helvetica',
        leading=15, textColor=colors.HexColor('#334155'))
    score_label_style = ParagraphStyle('sl', fontSize=9, fontName='Helvetica',
        textColor=colors.HexColor('#64748b'))
    score_val_style = ParagraphStyle('sv', fontSize=14, fontName='Helvetica-Bold',
        textColor=colors.HexColor('#1e293b'))

    story = []

    story.append(Paragraph(t.get('name', ''), title_style))
    location = ', '.join(filter(None, [t.get('city'), t.get('country')]))
    story.append(Paragraph(f"{t.get('industry_label', '')} · {location}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 12))

    score_data = [
        [Paragraph('Overall', score_label_style),
         Paragraph('Transition', score_label_style),
         Paragraph('Value', score_label_style),
         Paragraph('Market', score_label_style),
         Paragraph('Financial', score_label_style)],
        [Paragraph(str(scores.get('overall_score', '—')), score_val_style),
         Paragraph(str(scores.get('transition_score', '—')), score_val_style),
         Paragraph(str(scores.get('value_score', '—')), score_val_style),
         Paragraph(str(scores.get('market_score', '—')), score_val_style),
         Paragraph(str(scores.get('financial_score', '—')), score_val_style)],
    ]
    score_table = Table(score_data, colWidths=[3.4*cm]*5)
    score_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 16))

    facts = [
        ['Revenue',    f"€{t['revenue_eur']:,}" if t.get('revenue_eur') else '—'],
        ['Employees',  str(t.get('employee_count') or '—')],
        ['Founded',    str(t.get('founded_year') or '—')],
        ['Owner age',  f"~{t['owner_age_estimate']}" if t.get('owner_age_estimate') else '—'],
    ]
    facts_table = Table(facts, colWidths=[4*cm, 13*cm])
    facts_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (0,-1), colors.HexColor('#64748b')),
        ('TEXTCOLOR', (1,0), (1,-1), colors.HexColor('#1e293b')),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(facts_table)
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))

    for line in narrative.split('\n'):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 4))
        elif line.startswith(('1.', '2.', '3.', 'Executive', 'Investment', 'Key risk')):
            story.append(Paragraph(line, section_style))
        elif line.startswith('•') or line.startswith('-'):
            story.append(Paragraph(f"• {line.lstrip('•- ')}", body_style))
        else:
            story.append(Paragraph(line, body_style))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Generated by SearchFund AI · Confidential · For internal use only",
        ParagraphStyle('footer', fontSize=8, textColor=colors.HexColor('#94a3b8'), alignment=TA_CENTER)
    ))

    doc.build(story)
    buffer.seek(0)

    filename = f"report-{t.get('name', 'target').lower().replace(' ', '-')}.pdf"
    return Response(
        content=buffer.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
