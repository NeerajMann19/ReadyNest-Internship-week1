# DataLens — Dataset Intelligence Platform Context

This file serves as the single source of truth for the DataLens 3-day MVP project context, architecture, tech stack, implemented capabilities, active debugging/bug fixes, and upcoming development roadmap.

---

## 1. Project Overview & Vision
DataLens is a dataset intelligence platform designed to help knowledge workers and analysts rapidly validate, understand, and explore unfamiliar datasets. The core product principle is **"Explain Before Visualizing"** — helping users trust their data quality and uncover insights before presenting metrics.

For this MVP, the scope is scaled down to a lightweight 3-day build focusing on local operation and ease of packaging/zipping, entirely skipping authentication, databases (PostgreSQL/Supabase), PDF report engines, and advanced modeling.

---

## 2. Technical Stack
- **Frontend**: React (v18) + Vite + Tailwind CSS + Lucide React (for premium dark-themed icons)
- **Backend**: Python (v3.13) + FastAPI + Uvicorn (dev server)
- **Data Processing**: Pandas + NumPy + OpenPyXL (for Excel parsing)
- **Data Visualization**: Recharts (React charting library)
- **Database / Storage**: Simple local file storage (no SQLite or SQL database). Uploaded datasets are stored in `backend/uploads/` using unique UUID file references.

---

## 3. Directory Structure
```
C:\Users\Neeraj\Desktop\datalens\
├── .gitignore              # Ignores venv, node_modules, cache files, and uploads
├── context.md              # [THIS FILE] Project context and architecture index
├── backend/
│   ├── main.py             # FastAPI backend app (routes, quality reports, cleaning)
│   ├── requirements.txt    # Python dependencies (fastapi, pandas, openpyxl, etc.)
│   └── uploads/            # Local directory where uploaded CSVs/Excel files are saved
└── frontend/
    ├── index.html          # HTML entry point (uses Plus Jakarta Sans & Outfit fonts)
    ├── package.json        # Frontend dependencies (react, recharts, tailwind, etc.)
    ├── postcss.config.js   # PostCSS configuration for Tailwind
    ├── tailwind.config.js  # Custom theme colors (dark theme, animations, glassmorphism)
    ├── vite.config.js      # Vite configuration (sets up proxy for /api requests to port 8000)
    └── src/
        ├── main.jsx        # React DOM entry point
        ├── index.css       # Tailwind base + custom card and button effects
        └── App.jsx         # React UI (dropzone, stepper, quality check, Recharts toggle)
```

---

## 4. Implemented Features (MVP Phase 1 & 2)

### A. Data Loading (CSV/Excel Upload)
- **Local File Isolation**: Accepts `.csv`, `.xlsx`, and `.xls` uploads. Saves files inside `backend/uploads/` as `{UUID}.{ext}` representing a unique `dataset_id`.
- **Response Format**: Returns the `dataset_id`, filename, row/column counts, detected schema (column names + types), and default chart data.
- **Performance Optimization**: Randomly samples up to `150` rows on upload and sorts the sample chronologically/sequentially. This ensures rendering stays fast and responsive even for large datasets (500k+ rows) while remaining statistically representative of the overall data.
- **Intelligent Numeric Column Selection**: Scores numeric columns to find the most meaningful metric to chart, filtering out index/ID columns (high cardinality) and categorical codes (very low cardinality), falling back to the column with the highest variance.
- **Intelligent Label (X-Axis) Selection**: Automatically searches categorical columns for dates/times first, name/label strings second, or low cardinality columns under 50 values to ensure the x-axis is highly readable.

### B. Interactive Visualization (V1)
- **Toggle Mode**: Features a fully functioning Area / Line chart toggle.
- **Area Mode**: Renders a glowing indigo area chart with a gradient fade.
- **Line Mode**: Renders a clean indigo path (with dots disabled for high density clarity).
- Both charts share matching grid configurations, font sizes, and custom-styled glassmorphism tooltips showing formatted value tags.

### C. Data Quality & Cleaning
- **Missing Value Report**: Computes missing counts and percentages per column on upload. Recommends a cleaning strategy:
  - *Numeric columns*: Suggests `mean` if missing percentage < 30%, else `median`.
  - *Categorical columns*: Suggests `mode` if missing percentage < 30%, else `unknown_placeholder`.
- **Row Redundancy (Duplicates)**: Automatically identifies fully duplicate rows in the dataframe.
- **Cleaning Endpoint (`POST /api/clean`)**: Applies strategy resolutions to the original file and saves a new version as `{dataset_id}_cleaned.csv`.
  - *Mean/Median/Mode*: Imputes nulls using matching Pandas aggregation functions.
  - *Unknown Placeholder*: Fills NaN in text/categorical fields with "Unknown".
  - *Drop Rows*: Removes rows containing null values in specified columns.
  - *Remove Duplicates*: Cleans redundant rows using `df.drop_duplicates()`.
  - Returns updated rows removed, columns cleaned, and recalculates a clean data quality report.

---

## 5. Active Debugging, Bug Fixes & Progress Tracker

This section details the bugs identified by the user, the fixes applied, the active workspace sessions, and test results.

### A. Bug 1: Visual Analyzer ID Fallback for Single-Column Datasets
- **Symptom**: For the `annex1.csv` dataset, the Visual Analyzer incorrectly charted `"Item Code"`, even though it is an ID-like code column.
- **Root Cause**: A bypass conditional in `backend/main.py` read: `if len(numeric_columns) == 1: chart_column = numeric_columns[0]`. This forced selection of the only numeric column, bypassing all high-cardinality/ID name-matching filters.
- **Fix Implemented**:
  1. Removed the single-column bypass in `main.py` so all candidate numeric columns pass through the scoring and filtering logic.
  2. Expanded the `is_meaningful_metric` check to include common terms: `price`, `amount`, `cost`, `revenue`, `sales`, `qty`, `quantity`, `count`, `total`.
  3. Prevented small test files from having metrics excluded by checking `row_count > 10` inside the low cardinality filter (`is_low_cardinality_code`).
  4. Implemented the frontend `EyeOff` empty state card in `App.jsx` to show: *"No Chartable Data - All numeric columns in this dataset appear to be IDs or categorical codes."* when `dataset.chart_column` is empty.
- **Verification Results**:
  * **Test `annex1.csv`**: Backend now returns `chart_column: ""` and frontend correctly renders the `EyeOff` empty state card instead of charting `"Item Code"`.
  * **Test `test_single_metric.csv` (1 genuine metric column `Price`)**: Correctly selects `"Price"` (length 4) and charts it.
  * **Test `car_prices.csv` (multiple columns)**: Correctly selects `"sellingprice"` and charts it.

### B. Bug 2: Y-Axis Tick Formatter renders '00000' (Active Work)
- **Symptom**: For some datasets, the Y-axis renders tick labels as `"00000"` or unscaled digits.
- **Fix Scope**: 
  * Add a `formatYAxisTick(value)` function to format ticks gracefully:
    * Standard suffixes: `K` (Thousands), `M` (Millions), `B` (Billions).
    * Threshold: For numbers under `1000` (e.g. 500), display plain numbers (`500`), never `"0.5K"`.
    * Handle `0` and decimals cleanly.
  * Inject `tickFormatter={formatYAxisTick}` into both `<AreaChart>` and `<LineChart>` Y-Axis components.

### C. Data Cleaning Completion Copy & Mixed strategy tests (Active Work)
- **Task**: Update the clean success copy from:
  * *"Successfully removed {rows_removed} duplicate/null rows and resolved missing entries in {columns} columns."*
- **New Copy**:
  * *"Successfully resolved missing entries in {X} columns (dropped {Y} rows) and removed {Z} duplicate rows."*
- **Verify**: Confirm columns, null dropped rows, and duplicate rows removed are computed and output correctly, and that the original uploaded file remains completely untouched.

### D. Server Restarts & Recovery
During this debugging session, the sandbox environment encountered server restarts. The development workspace was successfully recovered by:
1. Compiling syntax verification: `python -m py_compile backend/main.py`.
2. Starting backend server: `python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload` (Task: `3a5e031b-fd03-4cf5-ab24-862ef35968f1/task-340`).
3. Starting frontend server: `& "C:\Program Files\nodejs\npm.cmd" run dev` (Task: `3a5e031b-fd03-4cf5-ab24-862ef35968f1/task-342`).

---

## 6. Upcoming Feature Roadmap (MVP Phase 3)
To complete the 3-day MVP requirements, the following features remain to be implemented:

1. **Descriptive Statistics**: Calculators to output mean, median, mode, standard deviation, variance, min, max, and quartiles (25%, 50%, 75%) for numeric columns.
2. **Univariate Analysis**: Renders frequency distributions for categorical columns, and automated histograms/box plots for numerical columns.
3. **Bivariate Analysis**: Renders numerical vs. numerical scatter plots, correlation coefficient matrix calculations, numerical vs. categorical group comparisons, and categorical cross-tabulations.
4. **Data Visualization (Extended)**: Custom render templates for Bar, Line, Pie, Heatmap (for correlation), and Scatter charts using Recharts.
5. **Insight Extraction**: Algorithmic rules to auto-detect top correlations, significant outliers, and missing data risks, ranked by high/medium/low priority.
6. **Interactive Dashboard**: A unified overview page compiling all widgets with global filters (allowing users to query data subsets).

---

## 7. Execution Instructions

### A. Run Backend (FastAPI)
1. Open terminal in `backend/` directory.
2. Activate your virtual environment if applicable.
3. Start uvicorn with:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

### B. Run Frontend (React + Vite)
1. Open terminal in `frontend/` directory.
2. Start the Vite server with:
   ```bash
   npm run dev
   ```
   *(If `npm` is not in the system path of your terminal, use: `"C:\Program Files\nodejs\npm.cmd" run dev`)*
3. Access the application in your browser at `http://localhost:5173`.
