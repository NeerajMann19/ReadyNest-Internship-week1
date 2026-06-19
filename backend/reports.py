"""
DataLens Report Generation Engine
File: backend/reports.py
Description: Generates professional PDF reports from dataset analysis data
             using ReportLab. Supports Executive Summary and Full Analysis reports.
"""

import os
import datetime
import logging
import pandas as pd
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Configure reports logger
logger = logging.getLogger("datalens.reports")

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and render total page counts,
    along with professional header and footer lines on all pages except the cover.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Suppress headers/footers on the cover page
            return
            
        self.saveState()
        
        # Colors
        primary_color = colors.HexColor("#4F46E5")
        border_color = colors.HexColor("#E2E8F0")
        text_color = colors.HexColor("#64748B")
        
        # Draw Header
        self.setStrokeColor(border_color)
        self.setLineWidth(0.5)
        self.line(54, 738, 558, 738) # Draw line below header text
        
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(primary_color)
        self.drawString(54, 746, "DATALENS")
        
        self.setFont("Helvetica", 8)
        self.setFillColor(text_color)
        self.drawRightString(558, 746, "DATASET INTELLIGENCE PLATFORM REPORT")
        
        # Draw Footer
        self.line(54, 54, 558, 54) # Draw line above footer text
        self.drawString(54, 40, "Confidential — Internal Analysis Use Only")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 40, page_text)
        
        self.restoreState()


def get_styled_paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    """Helper to safely escape text for ReportLab XML parser."""
    clean_text = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(clean_text, style)


def build_cover_page(story: List[Any], title: str, dataset_name: str, dataset_version: int, timestamp_str: str, row_count: int, column_count: int, styles: Dict[str, ParagraphStyle]):
    """Appends flowables representing a premium report cover page."""
    # Top margin spacer
    story.append(Spacer(1, 40))
    
    # Decorative Left Accent Bar + Title
    title_data = [
        [
            "",  # Color bar block
            Paragraph(f"<font color='#4F46E5'><b>DATALENS PLATFORM</b></font><br/><br/><font size='26'><b>{title}</b></font>", styles["CoverTitle"])
        ]
    ]
    title_table = Table(title_data, colWidths=[12, 492])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#4F46E5")),
        ('LEFTPADDING', (1, 0), (1, 0), 20),
        ('BOTTOMPADDING', (1, 0), (1, 0), 10),
        ('TOPPADDING', (1, 0), (1, 0), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(title_table)
    
    story.append(Spacer(1, 140))
    
    # Metadata panel header
    story.append(get_styled_paragraph("<b>REPORT DOCUMENT SPECIFICATIONS</b>", styles["SectionSubtitle"]))
    story.append(Spacer(1, 10))
    
    # Metadata Grid
    metadata_rows = [
        [
            get_styled_paragraph("<b>Dataset Target File:</b>", styles["BodyDark"]),
            get_styled_paragraph(dataset_name, styles["BodyText"])
        ],
        [
            get_styled_paragraph("<b>Dataset Version Ref:</b>", styles["BodyDark"]),
            get_styled_paragraph(f"v{dataset_version} (Registry Lock)", styles["BodyText"])
        ],
        [
            get_styled_paragraph("<b>Generation Date:</b>", styles["BodyDark"]),
            get_styled_paragraph(timestamp_str, styles["BodyText"])
        ],
        [
            get_styled_paragraph("<b>Total Records Scanned:</b>", styles["BodyDark"]),
            get_styled_paragraph(f"{row_count:,} rows", styles["BodyText"])
        ],
        [
            get_styled_paragraph("<b>Total Schema Fields:</b>", styles["BodyDark"]),
            get_styled_paragraph(f"{column_count} columns", styles["BodyText"])
        ],
        [
            get_styled_paragraph("<b>Security Level:</b>", styles["BodyDark"]),
            get_styled_paragraph("Internal Analyst Restricted", styles["BodyText"])
        ]
    ]
    
    meta_table = Table(metadata_rows, colWidths=[160, 344])
    meta_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(meta_table)
    
    story.append(Spacer(1, 100))
    
    # Footer disclaimer on cover page
    story.append(get_styled_paragraph("<i>This document is generated automatically by the DataLens Intelligence platform. All calculations and metric classifications are derived from cached dataset structures.</i>", styles["DisclaimerText"]))
    
    # Push to next page
    story.append(PageBreak())


def build_executive_conclusion(story: List[Any], analysis_data: Dict[str, Any], styles: Dict[str, ParagraphStyle]):
    """Appends the custom Executive Conclusion section compiling summary metrics and action items."""
    story.append(get_styled_paragraph("Executive Conclusion & Focus Areas", styles["Heading1"]))
    story.append(Spacer(1, 10))
    
    # Gather analysis highlights safely
    health_score = analysis_data.get("quality_score", analysis_data.get("health_score", 100))
    total_missing = analysis_data.get("total_missing", 0)
    duplicate_rows = analysis_data.get("duplicate_row_count", 0)
    
    # Health Assessment
    if health_score >= 95:
        health_eval = f"excellent health ({health_score}%) with near-zero data gaps"
        imputation_need = "Data imputation is not required."
    elif health_score >= 80:
        health_eval = f"good health ({health_score}%), but contains minor omissions ({total_missing:,} missing cells)"
        imputation_need = "Targeted data cleaning of categorical mode placeholders is recommended."
    else:
        health_eval = f"concerning health ({health_score}%) with significant data omissions ({total_missing:,} missing cells)"
        imputation_need = "Immediate missing-value imputation is strongly advised to prevent statistical bias."
        
    duplicate_eval = ""
    if duplicate_rows > 0:
        duplicate_eval = f" There are {duplicate_rows:,} redundant duplicate records that require dropping to preserve statistical independence."
        
    quality_summary_text = (
        f"Based on our automated intelligence scan, this dataset is in {health_eval}.{duplicate_eval} "
        f"Overall, {imputation_need}"
    )
    
    # Insights Summary
    top_insight = analysis_data.get("top_business_insight")
    if top_insight:
        insight_text = (
            f"The primary insights engine highlighted a <b>{top_insight.get('priority', 'medium').upper()} priority findings</b>: "
            f"\"{top_insight.get('finding', top_insight.get('description', 'N/A'))}\". "
            f"This relationship maps directly to the target variables: {', '.join(top_insight.get('columns', []))}."
        )
    else:
        insight_text = "No high-priority anomaly patterns or outliers were extracted from the dataset values."
        
    # Correlations
    pos_corr = analysis_data.get("strongest_positive")
    neg_corr = analysis_data.get("strongest_negative")
    corr_findings = []
    if pos_corr:
        corr_findings.append(f"a positive correlation between '{pos_corr.get('x')}' and '{pos_corr.get('y')}' (r = {pos_corr.get('r')})")
    if neg_corr:
        corr_findings.append(f"a negative correlation between '{neg_corr.get('x')}' and '{neg_corr.get('y')}' (r = {neg_corr.get('r')})")
        
    if corr_findings:
        corr_text = f"Linear relationship scans identified: {', and '.join(corr_findings)}."
    else:
        corr_text = "No strong linear correlation patterns were detected between numeric coordinates."
        
    # Categories (Highest/Lowest)
    highest_cat = analysis_data.get("highest_category_by_metric", analysis_data.get("top_category_by_metric"))
    lowest_cat = analysis_data.get("lowest_category_by_metric")
    
    cat_text_parts = []
    if highest_cat:
        diff_str = "higher" if highest_cat.get("percentage_difference", 0) >= 0 else "lower"
        cat_text_parts.append(
            f"group <b>'{highest_cat.get('category_value')}'</b> within '{highest_cat.get('category_column')}' "
            f"recorded the highest average of {highest_cat.get('average_value')} ({abs(highest_cat.get('percentage_difference', 0)):.1f}% {diff_str} than average)"
        )
    if lowest_cat:
        diff_str = "higher" if lowest_cat.get("percentage_difference", 0) >= 0 else "lower"
        cat_text_parts.append(
            f"group <b>'{lowest_cat.get('category_value')}'</b> within '{lowest_cat.get('category_column')}' "
            f"recorded the lowest average of {lowest_cat.get('average_value')} ({abs(lowest_cat.get('percentage_difference', 0)):.1f}% {diff_str} than average)"
        )
        
    if cat_text_parts:
        cat_text = f"Categorical rankings show that: {', while '.join(cat_text_parts)} across metric '{analysis_data.get('chart_column', 'N/A')}'."
    else:
        cat_text = "Categorical grouping checks revealed uniform distribution with no significant outliers."
        
    # Outliers
    largest_outlier = analysis_data.get("largest_outlier")
    outlier_text = ""
    if largest_outlier:
        outlier_text = (
            f"Attention should be paid to column <b>'{largest_outlier.get('column')}'</b>. An anomaly of "
            f"{largest_outlier.get('value')} was identified, deviating by {largest_outlier.get('z_score')} standard deviations "
            f"from the mean. This could represent data-entry error or a critical operational outlier."
        )
        
    # Compile Recommended Action Items
    action_items = [
        "Perform soft column cleanup using mean/mode aggregation on columns with null percentages above 10%.",
        "Perform a duplicate removal run to clean row redundancy and prevent duplicate weight biases.",
    ]
    if largest_outlier:
        action_items.append(f"Verify and sanitize the extreme outlier in '{largest_outlier.get('column')}' to ensure calculations aren't skewed.")
    if pos_corr or neg_corr:
        action_items.append("Track the key correlation variables closely in downstream dashboards to monitor trend trajectories.")
    action_items.append("Validate low cardinality integer code metrics to verify categorical mappings are correct.")

    conclusion_body = (
        f"<font color='#1E293B'><b>Data Quality & Integrity</b></font><br/>{quality_summary_text}<br/><br/>"
        f"<font color='#1E293B'><b>Primary Insights</b></font><br/>{insight_text}<br/><br/>"
        f"<font color='#1E293B'><b>Relational Patterns & Trends</b></font><br/>{corr_text} {cat_text}<br/>"
    )
    if outlier_text:
        conclusion_body += f"<br/><font color='#1E293B'><b>Anomalies & Risks</b></font><br/>{outlier_text}<br/>"
        
    conclusion_panel = [
        [Paragraph(conclusion_body, styles["BodyText"])]
    ]
    conclusion_table = Table(conclusion_panel, colWidths=[504])
    conclusion_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(conclusion_table)
    
    story.append(Spacer(1, 20))
    story.append(get_styled_paragraph("Recommended Next Steps:", styles["Heading2"]))
    story.append(Spacer(1, 8))
    
    # Bulleted lists of recommendations
    for item in action_items:
        bullet_p = get_styled_paragraph(f"• &nbsp; {item}", styles["BulletText"])
        story.append(bullet_p)
        story.append(Spacer(1, 4))


def compute_highest_lowest_categories(df, chart_column: str, categorical_columns: List[str]):
    """
    Computes highest and lowest category ranking averages relative to the overall mean.
    """
    
    highest_average_cat = None
    lowest_average_cat = None
    max_pct_diff = -999.0
    min_pct_diff = 999.0
    
    if not chart_column or not categorical_columns or len(df) <= 10:
        return None, None
        
    try:
        overall_mean = df[chart_column].mean()
        if pd.isna(overall_mean) or overall_mean == 0:
            return None, None
            
        for cat_col in categorical_columns:
            if any(kw in cat_col.lower() for kw in ["id", "vin", "code"]):
                continue
            df_sub = df[[cat_col, chart_column]].dropna()
            if len(df_sub) > 10:
                grp = df_sub.groupby(cat_col)[chart_column].agg(['mean', 'count'])
                grp_filtered = grp[grp['count'] >= 5]
                if not grp_filtered.empty:
                    # Find highest average
                    highest_row = grp_filtered.sort_values(by='mean', ascending=False).iloc[0]
                    highest_mean = float(highest_row['mean'])
                    highest_pct_diff = ((highest_mean - overall_mean) / overall_mean * 100)
                    
                    if highest_pct_diff > max_pct_diff:
                        max_pct_diff = highest_pct_diff
                        highest_average_cat = {
                            "category_column": cat_col,
                            "category_value": str(highest_row.name),
                            "average_value": round(highest_mean, 2),
                            "overall_average": round(float(overall_mean), 2),
                            "percentage_difference": round(highest_pct_diff, 2),
                            "record_count": int(highest_row['count'])
                        }
                        
                    # Find lowest average
                    lowest_row = grp_filtered.sort_values(by='mean', ascending=True).iloc[0]
                    lowest_mean = float(lowest_row['mean'])
                    lowest_pct_diff = ((lowest_mean - overall_mean) / overall_mean * 100)
                    
                    if lowest_pct_diff < min_pct_diff:
                        min_pct_diff = lowest_pct_diff
                        lowest_average_cat = {
                            "category_column": cat_col,
                            "category_value": str(lowest_row.name),
                            "average_value": round(lowest_mean, 2),
                            "overall_average": round(float(overall_mean), 2),
                            "percentage_difference": round(lowest_pct_diff, 2),
                            "record_count": int(lowest_row['count'])
                        }
    except Exception as e:
        logger.error(f"Error computing highest/lowest categories: {e}")
        
    return highest_average_cat, lowest_average_cat


def is_identifier_column_local(column_name: str, series) -> bool:
    col_lower = column_name.lower()
    id_keywords = ["id", "vin", "code", "index", "key", "pk", "uuid", "serial", "sku", "order"]
    is_id_name = any(kw == col_lower or col_lower.endswith(f"_{kw}") or col_lower.startswith(f"{kw}_") or f"_{kw}_" in col_lower for kw in id_keywords)
    if is_id_name:
        return True
    try:
        clean_series = series.dropna()
        if len(clean_series) > 0 and len(series) > 10:
            num_unique = clean_series.nunique()
            unique_ratio = num_unique / len(series)
            if unique_ratio > 0.95:
                return True
    except Exception:
        pass
    return False


def generate_pdf_report(dataset_metadata: Dict[str, Any], analysis_data: Dict[str, Any], report_type: str, output_path: str):
    """
    Main entry point. Assembles styles, cover pages, and content grids,
    writing out the PDF file at the specified output path.
    """
    # Setup styles
    sample_styles = getSampleStyleSheet()
    
    # DataLens Color Palette
    primary_indigo = colors.HexColor("#4F46E5")
    dark_slate = colors.HexColor("#1E293B")
    grey_slate = colors.HexColor("#64748B")
    
    # Register Custom Styles (ensuring unique names to avoid registry clashes)
    styles = {
        "CoverTitle": ParagraphStyle("DocCoverTitle", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=26, leading=32, textColor=dark_slate),
        "SectionSubtitle": ParagraphStyle("DocSectionSubtitle", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=grey_slate, spaceAfter=4),
        "Heading1": ParagraphStyle("DocHeading1", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=15, leading=20, textColor=primary_indigo, spaceBefore=18, spaceAfter=8, keepWithNext=True),
        "Heading2": ParagraphStyle("DocHeading2", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=dark_slate, spaceBefore=12, spaceAfter=6, keepWithNext=True),
        "BodyDark": ParagraphStyle("DocBodyDark", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=dark_slate),
        "BodyText": ParagraphStyle("DocBodyText", parent=sample_styles["Normal"], fontName="Helvetica", fontSize=9, leading=13, textColor=dark_slate),
        "BulletText": ParagraphStyle("DocBulletText", parent=sample_styles["Normal"], fontName="Helvetica", fontSize=9, leading=13, textColor=dark_slate, leftIndent=12),
        "DisclaimerText": ParagraphStyle("DocDisclaimerText", parent=sample_styles["Normal"], fontName="Helvetica-Oblique", fontSize=8, leading=11, textColor=grey_slate),
        "TableHeadText": ParagraphStyle("DocTableHead", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white),
        "TableBodyText": ParagraphStyle("DocTableBody", parent=sample_styles["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=dark_slate),
        "TableBodyBoldText": ParagraphStyle("DocTableBodyBold", parent=sample_styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=dark_slate),
    }
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=72,
        bottomMargin=72
    )
    
    story = []
    
    # Load dataset to compute category statistics on the fly
    filepath = os.path.join(os.path.dirname(os.path.dirname(output_path)), dataset_metadata["dataset_id"])
    if os.path.exists(filepath):
        try:
            if filepath.lower().endswith(".csv"):
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
            
            chart_column = analysis_data.get("chart_column", "")
            categorical_columns = [c["name"] for c in analysis_data.get("columns", []) if c.get("type") == "categorical"]
            
            highest_cat, lowest_cat = compute_highest_lowest_categories(df, chart_column, categorical_columns)
            if highest_cat:
                analysis_data["highest_category_by_metric"] = highest_cat
            if lowest_cat:
                analysis_data["lowest_category_by_metric"] = lowest_cat
        except Exception as e:
            logger.error(f"Failed to calculate highest/lowest category rankings on-the-fly: {e}")

    # Cover Page variables
    title_label = "EXECUTIVE SUMMARY REPORT" if report_type == "executive" else "FULL DATASET ANALYSIS REPORT"
    dataset_name = dataset_metadata.get("filename", "unknown_dataset.csv")
    dataset_version = dataset_metadata.get("version", 1)
    timestamp = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")
    row_count = analysis_data.get("row_count", 0)
    col_count = analysis_data.get("column_count", 0)
    
    # 1. Add Cover Page
    build_cover_page(story, title_label, dataset_name, dataset_version, timestamp, row_count, col_count, styles)
    
    # 2. Add Dataset Overview section
    story.append(get_styled_paragraph("Dataset Overview & Structure", styles["Heading1"]))
    overview_text = (
        f"This platform scan reports on <b>{dataset_name}</b> (version {dataset_version}). "
        f"The dataset is structured with {row_count:,} rows and {col_count} columns (features). "
        f"A total of {analysis_data.get('duplicate_row_count', 0)} fully duplicate rows were detected during the quality scan. "
        f"Our visual analyzer has identified <b>'{analysis_data.get('chart_column', 'N/A')}'</b> as the most statistically meaningful numeric metric to chart."
    )
    story.append(get_styled_paragraph(overview_text, styles["BodyText"]))
    story.append(Spacer(1, 14))
    
    # Overview Key Stats Grid
    overview_grid = [
        [
            get_styled_paragraph("<b>Metric Name</b>", styles["TableHeadText"]),
            get_styled_paragraph("<b>Value</b>", styles["TableHeadText"]),
            get_styled_paragraph("<b>Metric Name</b>", styles["TableHeadText"]),
            get_styled_paragraph("<b>Value</b>", styles["TableHeadText"])
        ],
        [
            get_styled_paragraph("Health Score", styles["TableBodyBoldText"]),
            get_styled_paragraph(f"{analysis_data.get('quality_score', 100)}%", styles["TableBodyText"]),
            get_styled_paragraph("Numeric Columns", styles["TableBodyBoldText"]),
            get_styled_paragraph(str(len([c for c in analysis_data.get('columns', []) if c.get('type') == 'numeric'])), styles["TableBodyText"])
        ],
        [
            get_styled_paragraph("Missing Cells", styles["TableBodyBoldText"]),
            get_styled_paragraph(f"{analysis_data.get('total_missing', 0):,}", styles["TableBodyText"]),
            get_styled_paragraph("Categorical Columns", styles["TableBodyBoldText"]),
            get_styled_paragraph(str(len([c for c in analysis_data.get('columns', []) if c.get('type') == 'categorical'])), styles["TableBodyText"])
        ],
        [
            get_styled_paragraph("Duplicate Records", styles["TableBodyBoldText"]),
            get_styled_paragraph(f"{analysis_data.get('duplicate_row_count', 0):,}", styles["TableBodyText"]),
            get_styled_paragraph("Chart Target Column", styles["TableBodyBoldText"]),
            get_styled_paragraph(analysis_data.get('chart_column', 'None'), styles["TableBodyText"])
        ]
    ]
    overview_table = Table(overview_grid, colWidths=[126, 126, 126, 126])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 18))
    
    # 3. Add Data Quality & Health report
    story.append(get_styled_paragraph("Missing Data Scan Details", styles["Heading1"]))
    missing_report = analysis_data.get("missing_value_report", [])
    if missing_report:
        quality_text = f"Our scan identified missing entries in {len(missing_report)} columns. Imputation is recommended below:"
        story.append(get_styled_paragraph(quality_text, styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        missing_grid = [
            [
                get_styled_paragraph("<b>Column Name</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Type</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Missing Count</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Percentage</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Recommended Action</b>", styles["TableHeadText"])
            ]
        ]
        for col_rep in missing_report:
            missing_grid.append([
                get_styled_paragraph(col_rep.get("column_name"), styles["TableBodyBoldText"]),
                get_styled_paragraph(col_rep.get("column_type"), styles["TableBodyText"]),
                get_styled_paragraph(f"{col_rep.get('missing_count'):,}", styles["TableBodyText"]),
                get_styled_paragraph(f"{col_rep.get('missing_percentage')}%", styles["TableBodyText"]),
                get_styled_paragraph(f"Fill with {col_rep.get('suggested_strategy')}", styles["TableBodyText"])
            ])
            
        missing_table = Table(missing_grid, colWidths=[130, 74, 90, 80, 130])
        missing_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(missing_table)
    else:
        story.append(get_styled_paragraph("<b>No missing values detected.</b> This dataset contains 100% complete records across all columns.", styles["BodyText"]))
    
    story.append(Spacer(1, 18))
    
    # 4. Add Insights Engine Output (Correlations & Outliers)
    story.append(get_styled_paragraph("Correlation & Relationship Scan", styles["Heading1"]))
    pos_corr = analysis_data.get("strongest_positive")
    neg_corr = analysis_data.get("strongest_negative")
    highest_cat = analysis_data.get("highest_category_by_metric", analysis_data.get("top_category_by_metric"))
    lowest_cat = analysis_data.get("lowest_category_by_metric")
    
    rel_rows = []
    if pos_corr:
        rel_rows.append([
            get_styled_paragraph("<b>Strongest Positive Correlation</b>", styles["BodyDark"]),
            get_styled_paragraph(f"Between '{pos_corr.get('x')}' and '{pos_corr.get('y')}' with correlation coefficient r = <b>{pos_corr.get('r')}</b> ({pos_corr.get('classification')}).", styles["BodyText"])
        ])
    if neg_corr:
        rel_rows.append([
            get_styled_paragraph("<b>Strongest Negative Correlation</b>", styles["BodyDark"]),
            get_styled_paragraph(f"Between '{neg_corr.get('x')}' and '{neg_corr.get('y')}' with correlation coefficient r = <b>{neg_corr.get('r')}</b> ({neg_corr.get('classification')}).", styles["BodyText"])
        ])
    if highest_cat:
        diff_str = "higher" if highest_cat.get("percentage_difference", 0) >= 0 else "lower"
        rel_rows.append([
            get_styled_paragraph("<b>Highest Category Ranking</b>", styles["BodyDark"]),
            get_styled_paragraph(f"Values in categorical column '{highest_cat.get('category_column')}' show that grouping <b>'{highest_cat.get('category_value')}'</b> averages {highest_cat.get('average_value')} ({abs(highest_cat.get('percentage_difference', 0)):.1f}% {diff_str} than dataset average of {highest_cat.get('overall_average')}).", styles["BodyText"])
        ])
    if lowest_cat:
        diff_str = "higher" if lowest_cat.get("percentage_difference", 0) >= 0 else "lower"
        rel_rows.append([
            get_styled_paragraph("<b>Lowest Category Ranking</b>", styles["BodyDark"]),
            get_styled_paragraph(f"Values in categorical column '{lowest_cat.get('category_column')}' show that grouping <b>'{lowest_cat.get('category_value')}'</b> averages {lowest_cat.get('average_value')} ({abs(lowest_cat.get('percentage_difference', 0)):.1f}% {diff_str} than dataset average of {lowest_cat.get('overall_average')}).", styles["BodyText"])
        ])
        
    if rel_rows:
        rel_table = Table(rel_rows, colWidths=[150, 354])
        rel_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(rel_table)
    else:
        story.append(get_styled_paragraph("No significant linear correlations or categorical groups were identified.", styles["BodyText"]))

    story.append(Spacer(1, 18))
    
    # 5. Add Descriptive Stats & Bivariate (Full Report Only)
    if report_type == "full":
        story.append(PageBreak())
        story.append(get_styled_paragraph("Detailed Descriptive Statistics", styles["Heading1"]))
        story.append(get_styled_paragraph("Summarized calculations for all numerical features in the dataset:", styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        filepath = os.path.join(os.path.dirname(os.path.dirname(output_path)), dataset_metadata["dataset_id"])
        
        if os.path.exists(filepath):
            try:
                if filepath.lower().endswith(".csv"):
                    df = pd.read_csv(filepath)
                else:
                    df = pd.read_excel(filepath)
                    
                stats_rows = [
                    [
                        get_styled_paragraph("<b>Feature</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Mean</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Median</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Mode</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Std Dev</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Min</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Max</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Missing</b>", styles["TableHeadText"])
                    ]
                ]
                
                for col in df.columns:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        series = df[col].dropna()
                        if len(series) == 0:
                            continue
                        mean_val = series.mean()
                        median_val = series.median()
                        mode_series = series.mode()
                        mode_val = mode_series[0] if not mode_series.empty else "N/A"
                        std_val = series.std()
                        min_val = series.min()
                        max_val = series.max()
                        miss_pct = (df[col].isna().sum() / len(df)) * 100
                        
                        def fmt(v):
                            if isinstance(v, (int, float)):
                                return f"{v:,.2f}"
                            return str(v)
                            
                        stats_rows.append([
                            get_styled_paragraph(col, styles["TableBodyBoldText"]),
                            get_styled_paragraph(fmt(mean_val), styles["TableBodyText"]),
                            get_styled_paragraph(fmt(median_val), styles["TableBodyText"]),
                            get_styled_paragraph(fmt(mode_val), styles["TableBodyText"]),
                            get_styled_paragraph(fmt(std_val), styles["TableBodyText"]),
                            get_styled_paragraph(fmt(min_val), styles["TableBodyText"]),
                            get_styled_paragraph(fmt(max_val), styles["TableBodyText"]),
                            get_styled_paragraph(f"{miss_pct:.1f}%", styles["TableBodyText"])
                        ])
                        
                stats_table = Table(stats_rows, colWidths=[104, 57, 57, 57, 57, 57, 57, 62])
                stats_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ]))
                story.append(stats_table)
            except Exception as e:
                logger.error(f"Failed to generate stats table inside PDF: {e}")
                story.append(get_styled_paragraph(f"Failed to load descriptive stats table: {e}", styles["BodyText"]))
        else:
            story.append(get_styled_paragraph("Raw dataset file not found on disk. Skipping detailed statistics.", styles["BodyText"]))

        story.append(Spacer(1, 18))

        # 1. KPI Summary Table
        story.append(get_styled_paragraph("Key Performance Indicators (KPI) Summary", styles["Heading1"]))
        story.append(get_styled_paragraph("Core volume, completeness, and health metrics compiled for this dataset version:", styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        kpi_grid = [
            [
                get_styled_paragraph("<b>KPI Metric</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Value</b>", styles["TableHeadText"]),
                get_styled_paragraph("<b>Target Threshold / Status</b>", styles["TableHeadText"])
            ],
            [
                get_styled_paragraph("Total Row Volume", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{row_count:,} records", styles["TableBodyText"]),
                get_styled_paragraph("Optimal Scan Depth" if row_count > 1000 else "Small Sample size", styles["TableBodyText"])
            ],
            [
                get_styled_paragraph("Schema Columns count", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{col_count} columns", styles["TableBodyText"]),
                get_styled_paragraph("Optimal Feature count" if col_count < 100 else "High-Dimensionality", styles["TableBodyText"])
            ],
            [
                get_styled_paragraph("Completeness Rate", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{analysis_data.get('quality_score', 100)}%", styles["TableBodyText"]),
                get_styled_paragraph("Excellent (>95%)" if analysis_data.get('quality_score', 100) >= 95 else ("Fair (>80%)" if analysis_data.get('quality_score', 100) >= 80 else "Requires Imputation"), styles["TableBodyText"])
            ],
            [
                get_styled_paragraph("Missing Value Penalty", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{analysis_data.get('quality_score_breakdown', {}).get('missing_penalty', 0)} pts", styles["TableBodyText"]),
                get_styled_paragraph("Minor Penalty" if analysis_data.get('quality_score_breakdown', {}).get('missing_penalty', 0) > -10 else "High Penalty", styles["TableBodyText"])
            ],
            [
                get_styled_paragraph("Redundant Rows rate", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{analysis_data.get('duplicate_row_count', 0):,} rows", styles["TableBodyText"]),
                get_styled_paragraph("Clean" if analysis_data.get('duplicate_row_count', 0) == 0 else "De-duplication Recommended", styles["TableBodyText"])
            ],
            [
                get_styled_paragraph("Outlier Points detected", styles["TableBodyBoldText"]),
                get_styled_paragraph(f"{analysis_data.get('total_outliers', 0):,} points", styles["TableBodyText"]),
                get_styled_paragraph("Normal" if analysis_data.get('total_outliers', 0) < row_count * 0.05 else "High Outlier density", styles["TableBodyText"])
            ]
        ]
        kpi_table = Table(kpi_grid, colWidths=[180, 140, 184])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 18))

        # 2. Univariate Analysis Summary
        story.append(get_styled_paragraph("Univariate Analysis Summary", styles["Heading1"]))
        story.append(get_styled_paragraph("Detailed frequency distributions and cardinality characteristics of dataset variables:", styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        if os.path.exists(filepath):
            univariate_grid = [
                [
                    get_styled_paragraph("<b>Feature Name</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Type</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Distinct Categories / Spread</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Dominant Value / Median</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Share % / Range</b>", styles["TableHeadText"])
                ]
            ]
            
            for col in df.columns:
                if is_identifier_column_local(col, df[col]):
                    continue
                col_type = "numeric" if pd.api.types.is_numeric_dtype(df[col]) else "categorical"
                series = df[col].dropna()
                if len(series) == 0:
                    continue
                    
                if col_type == "numeric":
                    median_val = series.median()
                    min_val = series.min()
                    max_val = series.max()
                    spread_text = f"Range: {min_val:,.1f} to {max_val:,.1f}"
                    dominant_text = f"Median: {median_val:,.2f}"
                    share_text = f"IQR: {series.quantile(0.75) - series.quantile(0.25):,.2f}"
                else:
                    n_uniques = series.nunique()
                    val_counts = series.value_counts()
                    top_val = val_counts.index[0] if not val_counts.empty else "N/A"
                    top_pct = (val_counts.iloc[0] / len(series) * 100) if not val_counts.empty else 0.0
                    spread_text = f"{n_uniques} unique classes"
                    dominant_text = str(top_val)[:18]
                    share_text = f"{top_pct:.1f}% share"
                    
                univariate_grid.append([
                    get_styled_paragraph(col, styles["TableBodyBoldText"]),
                    get_styled_paragraph(col_type, styles["TableBodyText"]),
                    get_styled_paragraph(spread_text, styles["TableBodyText"]),
                    get_styled_paragraph(dominant_text, styles["TableBodyText"]),
                    get_styled_paragraph(share_text, styles["TableBodyText"])
                ])
                
            univariate_table = Table(univariate_grid, colWidths=[114, 70, 140, 100, 80])
            univariate_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(univariate_table)
        else:
            story.append(get_styled_paragraph("Dataset not found. Skipping Univariate table.", styles["BodyText"]))
        story.append(Spacer(1, 18))

        # 3. Bivariate Analysis Summary
        story.append(get_styled_paragraph("Bivariate Analysis Summary", styles["Heading1"]))
        chart_column = analysis_data.get("chart_column", "")
        if chart_column and len(df.columns) > 1 and os.path.exists(filepath):
            story.append(get_styled_paragraph(f"Exploring relationships between target metric '{chart_column}' and key categorical fields:", styles["BodyText"]))
            story.append(Spacer(1, 8))
            
            bivariate_grid = [
                [
                    get_styled_paragraph("<b>Categorical Field</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Highest Avg Group</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Highest Mean</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Lowest Avg Group</b>", styles["TableHeadText"]),
                    get_styled_paragraph("<b>Lowest Mean</b>", styles["TableHeadText"])
                ]
            ]
            
            biv_found = False
            categorical_columns = [c["name"] for c in analysis_data.get("columns", []) if c.get("type") == "categorical"]
            for cat_col in categorical_columns:
                if any(kw in cat_col.lower() for kw in ["id", "vin", "code"]):
                    continue
                df_sub = df[[cat_col, chart_column]].dropna()
                if len(df_sub) > 10:
                    grp = df_sub.groupby(cat_col)[chart_column].agg(['mean', 'count'])
                    grp_filtered = grp[grp['count'] >= 3]
                    if not grp_filtered.empty:
                        biv_found = True
                        high_row = grp_filtered.sort_values(by='mean', ascending=False).iloc[0]
                        low_row = grp_filtered.sort_values(by='mean', ascending=True).iloc[0]
                        bivariate_grid.append([
                            get_styled_paragraph(cat_col, styles["TableBodyBoldText"]),
                            get_styled_paragraph(str(high_row.name)[:15], styles["TableBodyText"]),
                            get_styled_paragraph(f"{float(high_row['mean']):,.2f}", styles["TableBodyText"]),
                            get_styled_paragraph(str(low_row.name)[:15], styles["TableBodyText"]),
                            get_styled_paragraph(f"{float(low_row['mean']):,.2f}", styles["TableBodyText"])
                        ])
            if biv_found:
                bivariate_table = Table(bivariate_grid, colWidths=[120, 114, 76, 114, 80])
                bivariate_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(bivariate_table)
            else:
                story.append(get_styled_paragraph("No category aggregates found for bivariate scan.", styles["BodyText"]))
        else:
            story.append(get_styled_paragraph("No active bivariate categorizations available.", styles["BodyText"]))
        story.append(Spacer(1, 18))

        # 4. Correlation Summary Table
        story.append(get_styled_paragraph("Correlation & Relationship Strength Matrix", styles["Heading1"]))
        story.append(get_styled_paragraph("Pairwise Pearson correlation coefficients calculated among numeric features:", styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        numeric_columns = [c["name"] for c in analysis_data.get("columns", []) if c.get("type") == "numeric"]
        numeric_cols_for_matrix = [c for c in numeric_columns if not any(kw in c.lower() for kw in ["id", "vin", "code"])]
        if len(numeric_cols_for_matrix) >= 2 and os.path.exists(filepath):
            try:
                corr_mat = df[numeric_cols_for_matrix].corr(method="pearson")
                corr_headers = [get_styled_paragraph("<b>Feature Pair</b>", styles["TableHeadText"])]
                for c in numeric_cols_for_matrix:
                    corr_headers.append(get_styled_paragraph(f"<b>{c[:10]}</b>", styles["TableHeadText"]))
                
                corr_grid = [corr_headers]
                for r_col in numeric_cols_for_matrix:
                    row_cells = [get_styled_paragraph(r_col, styles["TableBodyBoldText"])]
                    for c_col in numeric_cols_for_matrix:
                        r_val = corr_mat.loc[r_col, c_col]
                        if r_col == c_col:
                            val_text = "1.00"
                        else:
                            val_text = f"{r_val:+.2f}" if not pd.isna(r_val) else "0.00"
                        row_cells.append(get_styled_paragraph(val_text, styles["TableBodyText"]))
                    corr_grid.append(row_cells)
                    
                n_cols = len(numeric_cols_for_matrix) + 1
                col_width = min(80, 384 // (n_cols - 1)) if n_cols > 2 else 120
                c_widths = [120] + [col_width] * (n_cols - 1)
                
                corr_table = Table(corr_grid, colWidths=c_widths)
                corr_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 5),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ]))
                story.append(corr_table)
            except Exception as e:
                story.append(get_styled_paragraph(f"Failed to compile correlation matrix: {e}", styles["BodyText"]))
        else:
            story.append(get_styled_paragraph("Dataset contains fewer than 2 numeric features. Matrix skipped.", styles["BodyText"]))
        story.append(Spacer(1, 18))

        # 5. Outlier Summary Table
        story.append(get_styled_paragraph("Outlier & Statistical Anomalies Scan", styles["Heading1"]))
        story.append(get_styled_paragraph("Top anomalies flagged inside numeric distributions:", styles["BodyText"]))
        story.append(Spacer(1, 8))
        
        if os.path.exists(filepath):
            outliers_list = []
            for col in numeric_columns:
                if "year" in col.lower() or "yr" in col.lower():
                    continue
                series = df[col].dropna()
                if len(series) > 2:
                    mean_val = series.mean()
                    std_val = series.std()
                    if std_val > 1e-9:
                        z_scores = (series - mean_val).abs() / std_val
                        outlier_indices = z_scores[z_scores > 2.0].sort_values(ascending=False).head(3).index
                        for idx in outlier_indices:
                            outliers_list.append({
                                "column": col,
                                "index": int(idx),
                                "value": float(series.loc[idx]),
                                "z_score": float(z_scores.loc[idx]),
                                "mean": float(mean_val),
                                "std": float(std_val)
                            })
                            
            outliers_list.sort(key=lambda x: x["z_score"], reverse=True)
            top_outliers = outliers_list[:5]
            
            if top_outliers:
                outlier_grid = [
                    [
                        get_styled_paragraph("<b>Feature Name</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Row Index</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Anomaly Value</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Mean</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Std Dev</b>", styles["TableHeadText"]),
                        get_styled_paragraph("<b>Z-Score</b>", styles["TableHeadText"])
                    ]
                ]
                for o in top_outliers:
                    outlier_grid.append([
                        get_styled_paragraph(o["column"], styles["TableBodyBoldText"]),
                        get_styled_paragraph(str(o["index"]), styles["TableBodyText"]),
                        get_styled_paragraph(f"{o['value']:,.2f}", styles["TableBodyText"]),
                        get_styled_paragraph(f"{o['mean']:,.2f}", styles["TableBodyText"]),
                        get_styled_paragraph(f"{o['std']:,.2f}", styles["TableBodyText"]),
                        get_styled_paragraph(f"{o['z_score']:.2f} σ", styles["TableBodyText"])
                    ])
                outlier_table = Table(outlier_grid, colWidths=[130, 60, 80, 80, 80, 74])
                outlier_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), primary_indigo),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(outlier_table)
            else:
                story.append(get_styled_paragraph("No significant outliers (Z-score &gt; 2.0) were flagged inside numeric distributions.", styles["BodyText"]))
        else:
            story.append(get_styled_paragraph("Dataset not found on disk. Skipping outlier list.", styles["BodyText"]))
            
        story.append(Spacer(1, 18))

    # 6. Add Executive Conclusion (on a new page or kept together)
    conclusion_story = []
    if report_type == "executive":
        conclusion_story.append(PageBreak())
    else:
        conclusion_story.append(Spacer(1, 10))
    build_executive_conclusion(conclusion_story, analysis_data, styles)
    story.append(KeepTogether(conclusion_story))
    
    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
