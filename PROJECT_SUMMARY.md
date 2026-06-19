# Project Summary — DataLens Platform

## 1. Problem Statement
Understanding unfamiliar datasets usually requires analysts to write repetitive boilerplate code, run manual summaries, and guess quality issues before they can trust visual metrics. DataLens solves this by scanning, validating, and cleaning datasets instantly, providing automated dashboards, clean-room configurations, and high-fidelity PDF reports.

## 2. Features Implemented
- **Dataset Registry**: Persistent sidebar manager tracking upload metadata, parent-cleaned file dependencies, search query filters, stars, and soft deletes.
- **7-Step Stepper Workspace**: Streamlined process from upload and preview through cleaning, statistics tables, univariate spreads, bivariate scannings, anomaly insights, and unified control panels.
- **Data Quality Penalty Breakdown**: Detailed integrity calculations (Missing Data up to -50, Duplicate up to -30, Outlier up to -20) displayed transparently inside the dashboard.
- **Bivariate Heatmap, Scatter, and Category Comparisons**: Pearson correlation grids, scatter plots with regression parameters (slope, intercept, Pearson r, R²), and category averages.
- **Report Center**: PDF document generator utilizing ReportLab. Supports cover page parameters, specifications lists, missing data tables, outliers, and recommendations.

## 3. Tech Stack
- **Frontend**: React (v18), Vite, Tailwind CSS, Recharts, Lucide React
- **Backend**: Python (v3.13), FastAPI, Uvicorn, Pandas, NumPy, OpenPyXL, ReportLab

## 4. Architecture & Design Decisions
- **Single Source of Truth**: All UI tabs, registry counters, and PDF documents read directly from cached dataset analysis files (`{dataset_id}_analysis.json`).
- **Registry Synchronization**: Metadata fields like `report_count`, `last_report_timestamp`, and `report_types_generated` are automatically synchronized in `registry.json` on report generation and deletion.
- **Performance Protection**: Bypasses duplicate recalculations and limits Recharts render nodes to a maximum of 150 sampled items.

## 5. Key Challenges Solved
- **ReportLab Grid Layouts**: Standardizing column widths dynamically to prevent text overflows and ensuring NumberedCanvas handles page numbering in two-passes.
- **High-volume Rendering**: Sampling data to ensure smooth Recharts rendering.
