# DataLens — Dataset Intelligence Platform

DataLens is a lightweight dataset intelligence platform designed to help knowledge workers and analysts rapidly validate, understand, and explore unfamiliar CSV or Excel datasets. The core product principle is **"Explain Before Visualizing"** — allowing users to verify data quality and uncover insights before presenting metrics.

## Features
- **Dataset Registry (Dataset History)**: A persistent side-panel dataset manager tracking metadata (dataset ID, filenames, upload timestamps, file sizes, row/column counts, parent-child relationships, and report lists). Supports full-text search, filters (All, Original, Cleaned, Favorites), and sorting (Recent, Uploaded, Size). Supports favoriting and soft-deletes.
- **Executive Dashboard**: A unified control center with 6 KPI Cards (Dataset Name, Rows, Columns, Quality Score, Missing Cells, and Duplicate Rows) and 5 Business Summary Cards (Strongest Positive Correlation, Strongest Negative Correlation, Top Insight, Highest Ranked Category, and Lowest Ranked Category).
- **Data Quality Score Transparency**: Interactive quality rating out of 100 with an info popover showing precise penalty deductions: Missing Data Penalty (up to -50), Duplicate Penalty (up to -30), and Outlier Penalty (up to -20).
- **Report Center**: Generates high-fidelity PDF reports (Executive Summary and Full Analysis) containing cover pages, metadata, missing data tables, outliers, and recommendations. Maintains automatic synchronization of metadata (`report_count`, `last_report_timestamp`, and `report_types_generated`) across both the registry and the dashboard.
- **Data Cleaning Pipeline**: Interactive strategies (mean, median, mode, placeholder, drop rows) and duplicate removal. Re-evaluates dataset statistics and quality scores instantly.
- **Exploratory Data Analysis (EDA)**: Interactive tabs for Descriptive Statistics, Univariate Analysis (frequencies, ranges, spreads, boxplots, histograms), and Bivariate Analysis (Pearson correlation heatmap, regression scatter plots with R² and equation, and category comparisons).

## Architecture
- **Single Source of Truth**: The dashboard, registry, Report Center, and PDF generator all load KPI and statistical values from the same cached JSON analysis file (`{dataset_id}_analysis.json`) to guarantee 100% consistency.
- **Performance Protection**: Sampler reads up to 150 rows for frontend chart performance, and report generation reuses the cached analysis outputs to bypass expensive computations.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + Lucide Icons + Recharts
- **Backend**: Python + FastAPI + Uvicorn + Pandas + NumPy + OpenPyXL + ReportLab (PDF)

## Installation & Startup

### Prerequisites
- Python 3.8+
- Node.js 16+

### 1. Run Backend (FastAPI)
1. Move to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI uvicorn dev server:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

### 2. Run Frontend (React + Vite)
1. Move to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```
4. Access the web app in your browser at: `http://localhost:5173`.

## Deployment Notes
- Uses relative endpoints proxied via Vite config to allow seamless production builds.
- Automatically initializes and creates `backend/uploads` and `backend/uploads/reports` directories at startup.
