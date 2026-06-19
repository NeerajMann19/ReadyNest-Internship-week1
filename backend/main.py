"""
DataLens Backend Service
File: backend/main.py
Description: Main entry point for the FastAPI backend. Handles file upload,
             parsing, and analysis of CSV/Excel datasets.
"""

import os
import uuid
import shutil
import pandas as pd
import json
import datetime
import numpy as np
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
from reports import generate_pdf_report

# Configure standard logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("datalens")

app = FastAPI(title="DataLens API", description="DataLens Dataset Intelligence API", version="1.0")

# Setup CORS to allow React + Vite frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

REGISTRY_FILE = os.path.join(UPLOAD_DIR, "registry.json")

def load_registry() -> List[Dict[str, Any]]:
    if not os.path.exists(REGISTRY_FILE):
        logger.info("load_registry: Registry file does not exist, returning empty list.")
        return []
    try:
        with open(REGISTRY_FILE, "r") as f:
            data = json.load(f)
            logger.info(f"load_registry: Loaded {len(data)} items from registry.")
            return data
    except Exception as e:
        logger.error(f"load_registry: Error reading registry: {e}")
        return []

def save_registry(registry_data: List[Dict[str, Any]]):
    try:
        with open(REGISTRY_FILE, "w") as f:
            json.dump(registry_data, f, indent=4)
        logger.info(f"save_registry: Saved {len(registry_data)} items to registry.")
    except Exception as e:
        logger.error(f"save_registry: Failed to save registry: {e}")

def register_dataset(
    dataset_id: str,
    filename: str,
    row_count: int,
    column_count: int,
    file_size: int,
    dataset_type: str = "original",
    parent_dataset_id: Optional[str] = None,
    analysis_status: str = "completed",
    reports_generated: Optional[List[str]] = None,
    is_favorite: bool = False,
    is_deleted: bool = False,
    open_count: int = 0,
    version: int = 1
):
    logger.info(f"register_dataset: Registering dataset {dataset_id} ({filename}), type: {dataset_type}, parent: {parent_dataset_id}")
    registry = load_registry()
    now_str = datetime.datetime.now().isoformat()
    
    existing_item = None
    for item in registry:
        if item["dataset_id"] == dataset_id:
            existing_item = item
            break
            
    if existing_item:
        existing_item["filename"] = filename
        existing_item["row_count"] = row_count
        existing_item["column_count"] = column_count
        existing_item["file_size"] = file_size
        existing_item["dataset_type"] = dataset_type
        existing_item["parent_dataset_id"] = parent_dataset_id
        existing_item["analysis_status"] = analysis_status
        if reports_generated is not None:
            existing_item["reports_generated"] = reports_generated
        
        # Preserve or initialize new schema fields
        existing_item["is_favorite"] = existing_item.get("is_favorite", is_favorite)
        existing_item["is_deleted"] = existing_item.get("is_deleted", is_deleted)
        existing_item["open_count"] = existing_item.get("open_count", open_count)
        existing_item["version"] = existing_item.get("version", version)
    else:
        registry.append({
            "dataset_id": dataset_id,
            "filename": filename,
            "upload_timestamp": now_str,
            "last_opened": now_str,
            "row_count": row_count,
            "column_count": column_count,
            "file_size": file_size,
            "dataset_type": dataset_type,
            "parent_dataset_id": parent_dataset_id,
            "analysis_status": analysis_status,
            "reports_generated": reports_generated or [],
            "is_favorite": is_favorite,
            "is_deleted": is_deleted,
            "open_count": open_count,
            "version": version
        })
        
    save_registry(registry)

def get_dataset_metadata(dataset_id: str) -> Dict[str, Any]:
    registry = load_registry()
    for item in registry:
        if item["dataset_id"] == dataset_id:
            # Upgrade item structure gracefully if older version
            item_updated = False
            for field, default_val in [
                ("is_favorite", False),
                ("is_deleted", False),
                ("open_count", 0),
                ("version", 1),
                ("reports_generated", []),
                ("report_count", 0),
                ("last_report_timestamp", None),
                ("report_types_generated", [])
            ]:
                if field not in item:
                    item[field] = default_val
                    item_updated = True
            if item_updated:
                save_registry(registry)
            return item
            
    # Fallback default if not in registry
    return {
        "dataset_id": dataset_id,
        "filename": dataset_id,
        "upload_timestamp": datetime.datetime.now().isoformat(),
        "last_opened": datetime.datetime.now().isoformat(),
        "row_count": 0,
        "column_count": 0,
        "file_size": 0,
        "dataset_type": "original",
        "parent_dataset_id": None,
        "analysis_status": "completed",
        "reports_generated": [],
        "report_count": 0,
        "last_report_timestamp": None,
        "report_types_generated": [],
        "is_favorite": False,
        "is_deleted": False,
        "open_count": 0,
        "version": 1
    }

def reopen_dataset_registry_update(dataset_id: str):
    registry = load_registry()
    updated = False
    for item in registry:
        if item["dataset_id"] == dataset_id:
            item["last_opened"] = datetime.datetime.now().isoformat()
            item["open_count"] = item.get("open_count", 0) + 1
            updated = True
            break
    if updated:
        save_registry(registry)

@app.get("/api/datasets")
async def list_datasets(response: Response):
    """
    Returns list of registered datasets that are not soft-deleted.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    registry = load_registry()
    logger.info(f"list_datasets hit. Registry count: {len(registry)}")
    valid_items = []
    
    filename_lookup = {item["dataset_id"]: item["filename"] for item in registry}
    
    for item in registry:
        if item.get("is_deleted", False):
            continue
            
        filepath = os.path.join(UPLOAD_DIR, item["dataset_id"])
        if os.path.exists(filepath):
            # Ensure safe fields
            item["is_favorite"] = item.get("is_favorite", False)
            item["is_deleted"] = item.get("is_deleted", False)
            item["open_count"] = item.get("open_count", 0)
            item["version"] = item.get("version", 1)
            item["reports_generated"] = item.get("reports_generated", [])
            
            parent_id = item.get("parent_dataset_id")
            if parent_id and parent_id in filename_lookup:
                item["parent_filename"] = filename_lookup[parent_id]
            else:
                item["parent_filename"] = None
            valid_items.append(item)
            
    valid_items.sort(key=lambda x: x.get("upload_timestamp", ""), reverse=True)
    return valid_items

@app.get("/api/datasets/stats")
async def get_datasets_stats(response: Response):
    """
    Returns total, original, cleaned, and favorite counts of datasets and total reports.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    registry = load_registry()
    logger.info(f"get_datasets_stats hit. Registry count: {len(registry)}")
    
    total_datasets = 0
    original_datasets = 0
    cleaned_datasets = 0
    favorite_datasets = 0
    total_reports = 0
    
    for item in registry:
        if item.get("is_deleted", False):
            continue
            
        filepath = os.path.join(UPLOAD_DIR, item["dataset_id"])
        if os.path.exists(filepath):
            total_datasets += 1
            dtype = item.get("dataset_type", "original")
            if dtype == "original":
                original_datasets += 1
            elif dtype == "cleaned":
                cleaned_datasets += 1
                
            if item.get("is_favorite", False):
                favorite_datasets += 1
                
            reports = item.get("reports_generated", [])
            total_reports += len(reports)
            
    return {
        "total_datasets": total_datasets,
        "original_datasets": original_datasets,
        "cleaned_datasets": cleaned_datasets,
        "favorite_datasets": favorite_datasets,
        "total_reports": total_reports
    }

@app.get("/api/datasets/{dataset_id}")
async def get_dataset_details(dataset_id: str):
    """
    Retrieves, updates last_opened & open_count, checks caching, re-analyzes dataset only if stale/missing,
    and returns full metadata & stats details.
    """
    filepath = os.path.join(UPLOAD_DIR, dataset_id)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")
        
    reopen_dataset_registry_update(dataset_id)
    
    analysis_cache_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_analysis.json")
    use_cache = False
    
    if os.path.exists(analysis_cache_path):
        try:
            cache_mtime = os.path.getmtime(analysis_cache_path)
            file_mtime = os.path.getmtime(filepath)
            if cache_mtime >= file_mtime:
                use_cache = True
        except Exception:
            pass
            
    if use_cache:
        try:
            with open(analysis_cache_path, "r") as f:
                analysis = json.load(f)
        except Exception:
            use_cache = False
            
    if not use_cache:
        file_ext = os.path.splitext(dataset_id)[1].lower()
        try:
            if file_ext == ".csv":
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")
            
        registry = load_registry()
        filename = dataset_id
        for item in registry:
            if item["dataset_id"] == dataset_id:
                filename = item["filename"]
                break
                
        analysis = process_and_analyze_df(df, dataset_id, filename)
        try:
            with open(analysis_cache_path, "w") as f:
                json.dump(analysis, f)
        except Exception as e:
            logger.error(f"Failed to save analysis cache: {e}")
            
    # Merge current metadata
    metadata = get_dataset_metadata(dataset_id)
    analysis.update({
        "upload_timestamp": metadata.get("upload_timestamp"),
        "last_opened": metadata.get("last_opened"),
        "file_size": metadata.get("file_size"),
        "dataset_type": metadata.get("dataset_type"),
        "parent_dataset_id": metadata.get("parent_dataset_id"),
        "analysis_status": metadata.get("analysis_status"),
        "reports_generated": metadata.get("reports_generated", []),
        "report_count": metadata.get("report_count", 0),
        "last_report_timestamp": metadata.get("last_report_timestamp"),
        "report_types_generated": metadata.get("report_types_generated", []),
        "is_favorite": metadata.get("is_favorite", False),
        "is_deleted": metadata.get("is_deleted", False),
        "open_count": metadata.get("open_count", 0),
        "version": metadata.get("version", 1)
    })
    return analysis

@app.delete("/api/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    """
    Soft deletes a dataset by setting is_deleted = True in registry.
    """
    logger.info(f"delete_dataset: Soft-deleting dataset {dataset_id}")
    registry = load_registry()
    updated = False
    for item in registry:
        if item["dataset_id"] == dataset_id:
            item["is_deleted"] = True
            updated = True
            break
            
    if not updated:
        raise HTTPException(status_code=404, detail="Dataset not found in registry.")
        
    save_registry(registry)
    return {"status": "success", "message": "Dataset deleted successfully"}

class FavoriteRequest(BaseModel):
    is_favorite: bool

@app.post("/api/datasets/{dataset_id}/favorite")
async def toggle_favorite(dataset_id: str, req: FavoriteRequest):
    """
    Toggles is_favorite field of a dataset.
    """
    logger.info(f"toggle_favorite: Toggling favorite status for {dataset_id} to {req.is_favorite}")
    registry = load_registry()
    updated = False
    for item in registry:
        if item["dataset_id"] == dataset_id:
            item["is_favorite"] = req.is_favorite
            updated = True
            break
            
    if not updated:
        raise HTTPException(status_code=404, detail="Dataset not found in registry.")
        
    save_registry(registry)
    return {"status": "success", "is_favorite": req.is_favorite}


class CleanRequest(BaseModel):
    dataset_id: str
    column_strategies: Dict[str, str]
    remove_duplicates: bool

def get_data_quality_report(df: pd.DataFrame, columns_info: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes missing value report and duplicate row count on a dataframe.
    """
    row_count = len(df)
    missing_value_report = []
    
    for col_info in columns_info:
        col = col_info["name"]
        col_type = col_info["type"]
        missing_count = int(df[col].isna().sum())
        
        if missing_count > 0:
            missing_percentage = round((missing_count / row_count) * 100, 1) if row_count > 0 else 0.0
            
            if col_type == "numeric":
                suggested_strategy = "mean" if missing_percentage < 30.0 else "median"
            else:
                suggested_strategy = "mode" if missing_percentage < 30.0 else "unknown_placeholder"
                
            missing_value_report.append({
                "column_name": col,
                "missing_count": missing_count,
                "missing_percentage": missing_percentage,
                "column_type": col_type,
                "suggested_strategy": suggested_strategy
            })
            
    duplicate_row_count = int(df.duplicated().sum())
    
    return {
        "missing_value_report": missing_value_report,
        "duplicate_row_count": duplicate_row_count
    }

@app.get("/api/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "ok", "message": "DataLens API is running"}

def is_identifier_column(column_name: str, series: pd.Series) -> bool:
    """
    Checks if a column is an identifier column.
    Examples: id, order_id, transaction_id, vin, serial_number, sku, code, key, pk, uuid.
    Also covers high unique ratios if numeric/categorical.
    """
    col_lower = column_name.lower()
    
    # 1. Direct keyword match in name
    id_keywords = ["id", "vin", "code", "index", "key", "pk", "uuid", "serial", "sku", "order"]
    is_id_name = any(kw == col_lower or col_lower.endswith(f"_{kw}") or col_lower.startswith(f"{kw}_") or f"_{kw}_" in col_lower for kw in id_keywords)
    if is_id_name:
        return True
        
    # 2. Cardinailty check on non-null series
    clean_series = series.dropna()
    row_count = len(series)
    if len(clean_series) > 0 and row_count > 10:
        num_unique = clean_series.nunique()
        unique_ratio = num_unique / row_count
        
        # Numeric ID check
        if pd.api.types.is_numeric_dtype(series):
            if unique_ratio > 0.99 and not any(kw in col_lower for kw in ["amount", "price", "cost", "value", "sales", "revenue"]):
                return True
        # Categorical ID check
        else:
            if unique_ratio > 0.95:
                return True
                
    return False

def classify_correlation(r: float) -> str:
    """
    Classifies a correlation coefficient r into strength and direction.
    """
    abs_r = abs(r)
    if abs_r >= 0.80:
        strength = "Very Strong"
    elif abs_r >= 0.60:
        strength = "Strong"
    elif abs_r >= 0.40:
        strength = "Moderate"
    elif abs_r >= 0.20:
        strength = "Weak"
    else:
        strength = "Very Weak"
        
    direction = "Positive" if r >= 0 else "Negative"
    return f"{strength} {direction} Correlation"

def get_semantic_type(col_name: str, series: pd.Series) -> str:
    """
    Classifies a column into a semantic type: year, metric, identifier, numeric, or categorical.
    """
    if is_identifier_column(col_name, series):
        return "identifier"

    col_lower = col_name.lower()
    is_numeric = pd.api.types.is_numeric_dtype(series)

    if is_numeric:
        clean_series = series.dropna()
        if len(clean_series) > 0:
            # Strong Year Detection
            try:
                is_int_like = bool((clean_series % 1 == 0).all())
            except Exception:
                is_int_like = False

            if is_int_like:
                min_val = float(clean_series.min())
                max_val = float(clean_series.max())
                has_year_kw = any(kw in col_lower for kw in ["year", "yr", "decade"])
                
                if has_year_kw and 1700 <= min_val and max_val <= 2100:
                    return "year"
                elif 1700 <= min_val and max_val <= 2100 and (max_val - min_val) <= 100:
                    return "year"

            # Check if high cardinality/unique index (identifier fallback)
            row_count = len(series)
            num_unique = clean_series.nunique()
            unique_ratio = num_unique / row_count if row_count > 0 else 0
            if unique_ratio > 0.99 and row_count > 10 and not any(kw in col_lower for kw in ["amount", "price", "cost", "value", "sales", "revenue"]):
                return "identifier"

            # Metric vs standard numeric:
            max_val = float(clean_series.max())
            if max_val >= 10000:
                return "metric"
            
        return "numeric"
    else:
        return "categorical"

def process_and_analyze_df(df: pd.DataFrame, dataset_id: str, filename: str) -> Dict[str, Any]:
    """
    Classifies columns, scores chart candidates, samples data, and runs quality reports.
    Used consistently by both upload and clean endpoints.
    """
    row_count = len(df)
    col_names = df.columns.tolist()
    column_count = len(col_names)

    # 1. Detect column types & semantic types
    columns_info = []
    numeric_columns = []
    categorical_columns = []

    for col in col_names:
        sem_type = get_semantic_type(col, df[col])
        if pd.api.types.is_numeric_dtype(df[col]):
            columns_info.append({"name": col, "type": "numeric", "semantic_type": sem_type})
            numeric_columns.append(col)
        else:
            columns_info.append({"name": col, "type": "categorical", "semantic_type": sem_type})
            categorical_columns.append(col)

    # Calculate data quality metrics (missing values, duplicates)
    quality = get_data_quality_report(df, columns_info)
    missing_value_report = quality["missing_value_report"]
    duplicate_row_count = quality["duplicate_row_count"]

    # 2. Select the best numeric column for charting
    chart_data = []
    chart_column = ""
    chart_column_reason = ""
    label_column = ""

    if numeric_columns:
        # Score candidates to find the most meaningful metric
        scored_candidates = []
        for col in numeric_columns:
            num_unique = df[col].nunique()
            unique_ratio = num_unique / row_count if row_count > 0 else 0
            
            # Exclude ID-like columns or high cardinality indexes
            is_id_name = any(kw in col.lower() for kw in ["id", "vin", "code", "index"])
            is_high_cardinality = unique_ratio > 0.90 and row_count > 10
            
            if is_id_name or is_high_cardinality:
                continue

            # Exclude low-cardinality codes disguised as numbers
            is_meaningful_metric = any(kw in col.lower() for kw in ["rating", "score", "grade", "level", "stars", "value", "val", "price", "amount", "cost", "revenue", "sales", "qty", "quantity", "count", "total"])
            is_low_cardinality_code = num_unique < 10 and row_count > 10 and not is_meaningful_metric
            
            if is_low_cardinality_code:
                continue

            # Score by common numeric value keywords
            score = 0
            value_keywords = ["price", "amount", "value", "total", "cost", "revenue", "sales", "score", "rating", "count", "quantity"]
            matched_kws = [kw for kw in value_keywords if kw in col.lower()]
            if matched_kws:
                score += 100
                reason = f"Selected based on relevance keyword match ('{matched_kws[0]}')"
            else:
                reason = "Selected based on highest variance"

            # Compute variance for fallback comparison
            try:
                variance_val = float(df[col].var(skipna=True))
                if pd.isna(variance_val):
                    variance_val = 0.0
            except Exception:
                variance_val = 0.0

            scored_candidates.append({
                "name": col,
                "score": score,
                "variance": variance_val,
                "reason": reason
            })

        # Selection logic
        if len(scored_candidates) == 0:
            chart_column = ""
            chart_column_reason = "No meaningful numeric columns available (all columns look like IDs or codes)"
        else:
            scored_candidates.sort(key=lambda x: (x["score"], x["variance"]), reverse=True)
            best = scored_candidates[0]
            chart_column = best["name"]
            chart_column_reason = best["reason"]

        # 3. Select label column
        if categorical_columns:
            filtered_categorical = [c for c in categorical_columns if not any(kw in c.lower() for kw in ["id", "vin", "code"])]
            
            if filtered_categorical:
                date_time_cols = [c for c in filtered_categorical if any(kw in c.lower() for kw in ["date", "time"])]
                if date_time_cols:
                    label_column = date_time_cols[0]
                else:
                    name_label_cols = [c for c in filtered_categorical if any(kw in c.lower() for kw in ["name", "label"])]
                    if name_label_cols:
                        label_column = name_label_cols[0]
                    else:
                        low_card_cols = [c for c in filtered_categorical if df[c].nunique() < 50]
                        if low_card_cols:
                            label_column = low_card_cols[0]
                        else:
                            label_column = filtered_categorical[0]

        # 4. Generate representation data with performance safety
        sample_size = min(150, row_count)
        df_sample = df.sample(n=sample_size, random_state=42)

        # Sort sample index/chronology for left-to-right reading order
        if label_column and any(kw in label_column.lower() for kw in ["date", "time"]):
            try:
                df_sample = df_sample.assign(temp_dt=pd.to_datetime(df_sample[label_column], errors='coerce'))
                df_sample = df_sample.sort_values(by="temp_dt", na_position='last').drop(columns=["temp_dt"])
            except Exception:
                df_sample = df_sample.sort_values(by=label_column)
        else:
            df_sample = df_sample.sort_index()

        # Build chart data
        if chart_column:
            for idx, row in df_sample.iterrows():
                label_val = str(row[label_column]) if label_column else f"Row {idx}"
                raw_val = row[chart_column]
                if pd.isna(raw_val) or np.isinf(raw_val):
                    val = None
                else:
                    val = float(raw_val)

                chart_data.append({
                    "label": label_val,
                    "value": val
                })

    # Calculate advanced dashboard/report metadata for caching
    total_missing = sum(r["missing_count"] for r in missing_value_report)
    total_cells = row_count * column_count
    
    # Calculate outliers count across numeric columns using IQR
    total_outliers = 0
    for col in numeric_columns:
        if "year" in col.lower() or "yr" in col.lower():
            continue
        series = df[col].dropna()
        if len(series) > 2:
            try:
                q1 = float(series.quantile(0.25))
                q3 = float(series.quantile(0.75))
                iqr = q3 - q1
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                outliers = series[(series < lower) | (series > upper)]
                total_outliers += len(outliers)
            except Exception:
                pass

    # Quality Score Breakdown and Penalties
    missing_ratio = total_missing / total_cells if total_cells > 0 else 0.0
    missing_penalty = int(round(min(50.0, missing_ratio * 100.0 * 2.0)))
    
    duplicate_ratio = duplicate_row_count / row_count if row_count > 0 else 0.0
    duplicate_penalty = int(round(min(30.0, duplicate_ratio * 100.0 * 1.5)))
    
    outlier_ratio = total_outliers / row_count if row_count > 0 else 0.0
    outlier_penalty = int(round(min(20.0, outlier_ratio * 100.0 * 0.5)))
    
    quality_score = max(0, 100 - missing_penalty - duplicate_penalty - outlier_penalty)
    
    quality_score_breakdown = {
        "missing_penalty": -missing_penalty,
        "duplicate_penalty": -duplicate_penalty,
        "outlier_penalty": -outlier_penalty,
        "final_score": quality_score
    }

    # 1. Strongest Positive/Negative Correlations
    strongest_positive = None
    strongest_negative = None
    if len(numeric_columns) > 1:
        try:
            corr_df = df[numeric_columns].corr(method="pearson")
            max_pos_r = -1.0
            min_neg_r = 1.0
            for col1 in numeric_columns:
                for col2 in numeric_columns:
                    if col1 != col2:
                        val = corr_df.loc[col1, col2]
                        if not pd.isna(val):
                            r_val = float(val)
                            if r_val > 0.05 and r_val > max_pos_r:
                                max_pos_r = r_val
                                strongest_positive = {
                                    "x": col1,
                                    "y": col2,
                                    "r": round(r_val, 4),
                                    "classification": classify_correlation(r_val)
                                }
                            if r_val < -0.05 and r_val < min_neg_r:
                                min_neg_r = r_val
                                strongest_negative = {
                                    "x": col1,
                                    "y": col2,
                                    "r": round(r_val, 4),
                                    "classification": classify_correlation(r_val)
                                }
        except Exception:
            pass

    # 2. Top Business Insight
    insights = generate_insights_list(df, dataset_id)
    top_business_insight = insights[0] if insights else None

    # 3. Largest Outlier/Anomaly (Furthest standard deviation from mean, must be outside IQR)
    largest_outlier = None
    if row_count > 2:
        largest_z = -1.0
        for col in numeric_columns:
            if "year" in col.lower() or "yr" in col.lower():
                continue
            series = df[col].dropna()
            if len(series) > 2:
                mean_val = float(series.mean())
                std_val = float(series.std())
                if std_val > 1e-9:
                    z_scores = (series - mean_val).abs() / std_val
                    max_idx = z_scores.idxmax()
                    max_z = z_scores.loc[max_idx]
                    
                    q1 = series.quantile(0.25)
                    q3 = series.quantile(0.75)
                    iqr = q3 - q1
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    val = series.loc[max_idx]
                    
                    if (val < lower or val > upper) and max_z > largest_z:
                        largest_z = max_z
                        largest_outlier = {
                            "column": col,
                            "value": float(val),
                            "z_score": round(float(max_z), 2),
                            "mean": round(float(mean_val), 2),
                            "std": round(float(std_val), 2),
                            "row_index": int(max_idx)
                        }

    # 4. Highest and Lowest Category Rankings
    highest_category_by_metric = None
    lowest_category_by_metric = None
    max_pct_diff = -999.0
    min_pct_diff = 999.0

    if chart_column and categorical_columns and row_count > 10:
        try:
            overall_mean = df[chart_column].mean()
            if not pd.isna(overall_mean) and overall_mean != 0:
                for cat_col in categorical_columns:
                    if any(kw in cat_col.lower() for kw in ["id", "vin", "code"]):
                        continue
                    df_sub = df[[cat_col, chart_column]].dropna()
                    if len(df_sub) > 10:
                        grp = df_sub.groupby(cat_col)[chart_column].agg(['mean', 'count'])
                        grp_filtered = grp[grp['count'] >= 5]
                        if not grp_filtered.empty:
                            # Highest average group
                            highest_row = grp_filtered.sort_values(by='mean', ascending=False).iloc[0]
                            highest_mean = float(highest_row['mean'])
                            highest_pct_diff = ((highest_mean - overall_mean) / overall_mean * 100)
                            
                            if highest_pct_diff > max_pct_diff:
                                max_pct_diff = highest_pct_diff
                                highest_category_by_metric = {
                                    "category_column": cat_col,
                                    "category_value": str(highest_row.name),
                                    "average_value": round(highest_mean, 2),
                                    "overall_average": round(float(overall_mean), 2),
                                    "percentage_difference": round(highest_pct_diff, 2),
                                    "record_count": int(highest_row['count'])
                                }
                                
                            # Lowest average group
                            lowest_row = grp_filtered.sort_values(by='mean', ascending=True).iloc[0]
                            lowest_mean = float(lowest_row['mean'])
                            lowest_pct_diff = ((lowest_mean - overall_mean) / overall_mean * 100)
                            
                            if lowest_pct_diff < min_pct_diff:
                                min_pct_diff = lowest_pct_diff
                                lowest_category_by_metric = {
                                    "category_column": cat_col,
                                    "category_value": str(lowest_row.name),
                                    "average_value": round(lowest_mean, 2),
                                    "overall_average": round(float(overall_mean), 2),
                                    "percentage_difference": round(lowest_pct_diff, 2),
                                    "record_count": int(lowest_row['count'])
                                }
        except Exception as e:
            logger.error(f"Error computing category rankings: {e}")

    top_category_by_metric = highest_category_by_metric

    # 5. Compile Executive Summary findings (3-5 key findings)
    executive_summary = []
    
    # Finding 1: Health
    if quality_score >= 95:
        executive_summary.append(f"The dataset is in excellent health ({quality_score}% score) with minimal missing cells across all {column_count} columns.")
    elif quality_score >= 80:
        executive_summary.append(f"The dataset is in good health ({quality_score}% score), but contains some missing values ({total_missing:,} cells) that should be resolved to prevent analysis bias.")
    else:
        executive_summary.append(f"The dataset health is low ({quality_score}% score) with {total_missing:,} missing values. Imputation is highly recommended to improve data quality.")
        
    # Finding 2: Primary Metric
    if chart_column:
        mean_val = df[chart_column].mean()
        if not pd.isna(mean_val):
            formatted_mean = f"${mean_val:,.2f}" if any(kw in chart_column.lower() for kw in ["price", "amount", "cost", "revenue", "sales"]) else f"{mean_val:,.2f}"
            executive_summary.append(f"The primary business metric '{chart_column}' averages {formatted_mean} across the {row_count:,} records.")

    # Finding 3: Relationships
    if strongest_positive:
        executive_summary.append(f"A {strongest_positive['classification'].lower()} was identified between '{strongest_positive['x']}' and '{strongest_positive['y']}' (Pearson r = {strongest_positive['r']:+.2f}).")
    elif strongest_negative:
        executive_summary.append(f"A {strongest_negative['classification'].lower()} was identified between '{strongest_negative['x']}' and '{strongest_negative['y']}' (Pearson r = {strongest_negative['r']:+.2f}).")
    else:
        executive_summary.append("No notable linear relationships were detected among the numeric columns.")

    # Finding 4: Top Category
    if top_category_by_metric:
        diff_direction = "higher" if top_category_by_metric['percentage_difference'] >= 0 else "lower"
        formatted_val = f"${top_category_by_metric['average_value']:,.2f}" if any(kw in chart_column.lower() for kw in ["price", "amount", "cost", "revenue", "sales"]) else f"{top_category_by_metric['average_value']:,.2f}"
        executive_summary.append(
            f"Within '{top_category_by_metric['category_column']}', the group '{top_category_by_metric['category_value']}' has the highest average "
            f"{chart_column} of {formatted_val} ({abs(top_category_by_metric['percentage_difference']):.1f}% {diff_direction} than dataset average)."
        )

    # Finding 5: Outliers
    if largest_outlier:
        formatted_val = f"${largest_outlier['value']:,.2f}" if any(kw in largest_outlier['column'].lower() for kw in ["price", "amount", "cost", "revenue", "sales"]) else f"{largest_outlier['value']:,.2f}"
        executive_summary.append(
            f"The most significant anomaly was detected in '{largest_outlier['column']}' (value: {formatted_val}), "
            f"which deviates by {largest_outlier['z_score']:.1f} standard deviations from the mean."
        )

    # Ensure we have at least 3 findings
    while len(executive_summary) < 3:
        executive_summary.append(f"A total of {row_count:,} rows and {column_count} columns were successfully processed.")

    # Extract filter options
    filter_options = {}
    for col in df.columns:
        if not pd.api.types.is_numeric_dtype(df[col]) and not is_identifier_column(col, df[col]):
            n_uniques = df[col].dropna().nunique()
            if 0 < n_uniques <= 50:
                filter_options[col] = sorted([str(x) for x in df[col].dropna().unique().tolist()])

    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "row_count": row_count,
        "column_count": column_count,
        "columns": columns_info,
        "chart_column": chart_column,
        "chart_column_reason": chart_column_reason,
        "chart_data": chart_data,
        "duplicate_row_count": duplicate_row_count,
        "missing_value_report": missing_value_report,
        "quality_score": quality_score,
        "health_score": quality_score,
        "quality_score_breakdown": quality_score_breakdown,
        "total_missing": total_missing,
        "total_outliers": total_outliers,
        "strongest_positive": strongest_positive,
        "strongest_negative": strongest_negative,
        "top_business_insight": top_business_insight,
        "largest_outlier": largest_outlier,
        "highest_category_by_metric": highest_category_by_metric,
        "lowest_category_by_metric": lowest_category_by_metric,
        "top_category_by_metric": highest_category_by_metric,
        "executive_summary": executive_summary,
        "filter_options": filter_options
    }

@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a CSV or Excel file.
    Saves the file locally, detects schema, and returns metadata along with 
    default chart data for the first numeric column.
    """
    # 1. Validate file size using request headers if available
    content_length = file.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 100MB upload limit. Please upload a smaller file."
        )

    # 2. Validate file extension
    filename = file.filename or "dataset"
    file_ext = os.path.splitext(filename)[1].lower()
    if file_ext not in [".csv", ".xlsx", ".xls"]:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or Excel.")

    # 2. Generate unique dataset ID
    dataset_id = f"{uuid.uuid4()}{file_ext}"
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    # 3. Save the uploaded file locally
    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        await file.close()

    # Validate saved file size on disk immediately
    try:
        file_size = os.path.getsize(filepath)
    except Exception:
        file_size = 0

    if file_size > MAX_UPLOAD_SIZE:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 100MB upload limit. Please upload a smaller file."
        )

    # 4. Parse file with Pandas
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    analysis_res = process_and_analyze_df(df, dataset_id, filename)
    
    # Save cache
    try:
        analysis_cache_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_analysis.json")
        with open(analysis_cache_path, "w") as f:
            json.dump(analysis_res, f)
    except Exception as e:
        logger.error(f"Failed to save analysis cache: {e}")
    
    register_dataset(
        dataset_id=dataset_id,
        filename=filename,
        row_count=analysis_res["row_count"],
        column_count=analysis_res["column_count"],
        file_size=file_size,
        dataset_type="original",
        parent_dataset_id=None,
        analysis_status="completed"
    )
    
    # Merge metadata
    metadata = get_dataset_metadata(dataset_id)
    analysis_res.update({
        "upload_timestamp": metadata.get("upload_timestamp"),
        "last_opened": metadata.get("last_opened"),
        "file_size": metadata.get("file_size"),
        "dataset_type": metadata.get("dataset_type"),
        "parent_dataset_id": metadata.get("parent_dataset_id"),
        "analysis_status": metadata.get("analysis_status"),
        "reports_generated": metadata.get("reports_generated", []),
        "report_count": metadata.get("report_count", 0),
        "last_report_timestamp": metadata.get("last_report_timestamp"),
        "report_types_generated": metadata.get("report_types_generated", []),
        "is_favorite": metadata.get("is_favorite", False),
        "is_deleted": metadata.get("is_deleted", False),
        "open_count": metadata.get("open_count", 0),
        "version": metadata.get("version", 1)
    })
    
    return analysis_res

@app.post("/api/clean")
async def clean_dataset(req: CleanRequest):
    """
    Applies column strategies to fill missing values and drops duplicate rows if requested.
    Saves the cleaned dataset as a new CSV file.
    """
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    # 1. Validate if dataset exists
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found. Please upload again.")

    # 2. Parse existing dataset
    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    original_row_count = len(df)
    original_missing_count = int(df.isna().sum().sum())
    original_duplicate_count = int(df.duplicated().sum())

    columns_cleaned = []

    # 3. Apply cleaning strategies
    for col, strategy in req.column_strategies.items():
        if col not in df.columns:
            continue
        
        # Check if there are null values to clean
        null_count = df[col].isna().sum()
        if null_count == 0 and strategy != "drop_rows":
            continue

        if strategy == "mean":
            if pd.api.types.is_numeric_dtype(df[col]):
                mean_val = df[col].mean()
                if not pd.isna(mean_val):
                    df[col] = df[col].fillna(float(mean_val))
                    columns_cleaned.append(col)
        elif strategy == "median":
            if pd.api.types.is_numeric_dtype(df[col]):
                median_val = df[col].median()
                if not pd.isna(median_val):
                    df[col] = df[col].fillna(float(median_val))
                    columns_cleaned.append(col)
        elif strategy == "mode":
            mode_series = df[col].mode()
            if not mode_series.empty:
                df[col] = df[col].fillna(mode_series[0])
                columns_cleaned.append(col)
        elif strategy == "unknown_placeholder":
            df[col] = df[col].astype(object).fillna("Unknown")
            columns_cleaned.append(col)
        elif strategy == "drop_rows":
            df = df.dropna(subset=[col])
            columns_cleaned.append(col)
        elif strategy == "leave_as_is":
            pass

    # Row count after column strategies
    after_strategies_count = len(df)
    null_rows_dropped = original_row_count - after_strategies_count

    # 4. Handle duplicates
    if req.remove_duplicates:
        df = df.drop_duplicates()

    cleaned_row_count = len(df)
    duplicate_rows_removed = after_strategies_count - cleaned_row_count
    rows_removed = original_row_count - cleaned_row_count

    cleaned_missing_count = int(df.isna().sum().sum())
    cleaned_duplicate_count = int(df.duplicated().sum())

    # 5. Generate new cleaned dataset ID and save
    name_without_ext = os.path.splitext(dataset_id)[0]
    if name_without_ext.endswith("_cleaned"):
        name_without_ext = name_without_ext[:-8]
        
    cleaned_dataset_id = f"{name_without_ext}_cleaned.csv"
    cleaned_filepath = os.path.join(UPLOAD_DIR, cleaned_dataset_id)

    try:
        df.to_csv(cleaned_filepath, index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save cleaned file: {str(e)}")

    # Validate saved cleaned file size on disk immediately
    try:
        file_size = os.path.getsize(cleaned_filepath)
    except Exception:
        file_size = 0

    if file_size > MAX_UPLOAD_SIZE:
        if os.path.exists(cleaned_filepath):
            os.remove(cleaned_filepath)
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 100MB upload limit. Please upload a smaller file."
        )

    # 6. Re-evaluate schema and data quality for the cleaned dataset
    cleaned_dataset_meta = process_and_analyze_df(df, cleaned_dataset_id, os.path.basename(cleaned_filepath))

    # Save cache
    try:
        analysis_cache_path = os.path.join(UPLOAD_DIR, f"{cleaned_dataset_id}_analysis.json")
        with open(analysis_cache_path, "w") as f:
            json.dump(cleaned_dataset_meta, f)
    except Exception as e:
        logger.error(f"Failed to save analysis cache: {e}")
    register_dataset(
        dataset_id=cleaned_dataset_id,
        filename=os.path.basename(cleaned_filepath),
        row_count=cleaned_dataset_meta["row_count"],
        column_count=cleaned_dataset_meta["column_count"],
        file_size=file_size,
        dataset_type="cleaned",
        parent_dataset_id=dataset_id,
        analysis_status="completed"
    )

    # Merge metadata
    metadata = get_dataset_metadata(cleaned_dataset_id)
    cleaned_dataset_meta.update({
        "upload_timestamp": metadata.get("upload_timestamp"),
        "last_opened": metadata.get("last_opened"),
        "file_size": metadata.get("file_size"),
        "dataset_type": metadata.get("dataset_type"),
        "parent_dataset_id": metadata.get("parent_dataset_id"),
        "analysis_status": metadata.get("analysis_status"),
        "reports_generated": metadata.get("reports_generated", []),
        "report_count": metadata.get("report_count", 0),
        "last_report_timestamp": metadata.get("last_report_timestamp"),
        "report_types_generated": metadata.get("report_types_generated", []),
        "is_favorite": metadata.get("is_favorite", False),
        "is_deleted": metadata.get("is_deleted", False),
        "open_count": metadata.get("open_count", 0),
        "version": metadata.get("version", 1)
    })

    return {
        "cleaned_dataset_id": cleaned_dataset_id,
        "dataset": cleaned_dataset_meta,
        "columns_cleaned": columns_cleaned,
        "null_rows_dropped": null_rows_dropped,
        "duplicate_rows_removed": duplicate_rows_removed,
        "cleaning_summary": {
            "missing_before": original_missing_count,
            "missing_after": cleaned_missing_count,
            "duplicates_before": original_duplicate_count,
            "duplicates_after": cleaned_duplicate_count,
            "rows_removed": rows_removed,
            "columns_modified": len(columns_cleaned),
            "columns_cleaned": columns_cleaned,
            "null_rows_dropped": null_rows_dropped,
            "duplicate_rows_removed": duplicate_rows_removed,
            "original_row_count": original_row_count,
            "cleaned_row_count": cleaned_row_count
        }
    }

class StatsRequest(BaseModel):
    dataset_id: str

@app.post("/api/stats")
async def get_descriptive_stats(req: StatsRequest):
    """
    Returns descriptive statistics for all numeric columns in the dataset.
    """
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    row_count = len(df)
    stats_report = {}

    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            series = df[col]
            missing_count = int(series.isna().sum())
            missing_percentage = round((missing_count / row_count) * 100, 1) if row_count > 0 else 0.0
            sem_type = get_semantic_type(col, series)
            
            # Drop NaN for numeric computations
            clean_series = series.dropna()
            
            if len(clean_series) == 0:
                stats_report[col] = {
                    "semantic_type": sem_type,
                    "mean": None,
                    "median": None,
                    "mode": None,
                    "std": None,
                    "var": None,
                    "min": None,
                    "max": None,
                    "q1": None,
                    "q2": None,
                    "q3": None,
                    "missing_count": missing_count,
                    "missing_percentage": missing_percentage
                }
                continue

            # Compute mode
            mode_series = clean_series.mode()
            mode_val = float(mode_series[0]) if not mode_series.empty else None

            # Compute standard metrics
            mean_val = float(clean_series.mean())
            median_val = float(clean_series.median())
            std_val = float(clean_series.std()) if len(clean_series) > 1 else 0.0
            var_val = float(clean_series.var()) if len(clean_series) > 1 else 0.0
            min_val = float(clean_series.min())
            max_val = float(clean_series.max())
            
            # Quantiles
            q1 = float(clean_series.quantile(0.25))
            q2 = float(clean_series.quantile(0.50))
            q3 = float(clean_series.quantile(0.75))

            stats_report[col] = {
                "semantic_type": sem_type,
                "mean": round(mean_val, 4) if not pd.isna(mean_val) else None,
                "median": round(median_val, 4) if not pd.isna(median_val) else None,
                "mode": round(mode_val, 4) if mode_val is not None else None,
                "std": round(std_val, 4) if not pd.isna(std_val) else None,
                "var": round(var_val, 4) if not pd.isna(var_val) else None,
                "min": round(min_val, 4) if not pd.isna(min_val) else None,
                "max": round(max_val, 4) if not pd.isna(max_val) else None,
                "q1": round(q1, 4) if not pd.isna(q1) else None,
                "q2": round(q2, 4) if not pd.isna(q2) else None,
                "q3": round(q3, 4) if not pd.isna(q3) else None,
                "missing_count": missing_count,
                "missing_percentage": missing_percentage
            }

    return {
        "dataset_id": dataset_id,
        "row_count": row_count,
        "stats": stats_report
    }

class UnivariateRequest(BaseModel):
    dataset_id: str

@app.post("/api/univariate")
async def get_univariate_analysis(req: UnivariateRequest):
    """
    Returns univariate analysis data (histograms and boxplots for numeric, frequencies for categorical).
    """
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    row_count = len(df)
    numeric_analysis = {}
    categorical_analysis = {}

    for col in df.columns:
        sem_type = get_semantic_type(col, df[col])
        # 1. Numeric columns
        if pd.api.types.is_numeric_dtype(df[col]):
            series = df[col].dropna()
            if len(series) == 0:
                continue

            # Calculate boxplot stats
            min_val = float(series.min())
            max_val = float(series.max())
            q1 = float(series.quantile(0.25))
            median_val = float(series.median())
            q3 = float(series.quantile(0.75))
            
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr
            
            # Count outliers
            outliers = series[(series < lower_fence) | (series > upper_fence)]
            outlier_count = int(len(outliers))

            # Calculate histogram (10 bins)
            try:
                counts, bin_edges = np.histogram(series, bins=10)
                histogram_data = []
                for i in range(len(counts)):
                    # Format bin label gracefully
                    start = round(float(bin_edges[i]), 2)
                    end = round(float(bin_edges[i+1]), 2)
                    
                    # Formatting helper for labels
                    def format_bin_val(val):
                        if sem_type == "year":
                            return str(int(round(val)))
                        elif sem_type == "numeric":
                            if val.is_integer():
                                return f"{int(val):,}"
                            else:
                                return f"{val:,.2f}"
                        else:
                            if abs(val) >= 1e6:
                                return f"{val/1e6:.1f}M".replace(".0M", "M")
                            elif abs(val) >= 1e3:
                                return f"{val/1e3:.1f}K".replace(".0K", "K")
                            elif val.is_integer():
                                return f"{int(val):,}"
                            else:
                                return f"{val:,.2f}"
                    
                    bin_label = f"{format_bin_val(start)} - {format_bin_val(end)}"
                    histogram_data.append({
                        "bin_label": bin_label,
                        "start": start,
                        "end": end,
                        "count": int(counts[i])
                    })
            except Exception:
                histogram_data = []

            numeric_analysis[col] = {
                "semantic_type": sem_type,
                "histogram": histogram_data,
                "boxplot": {
                    "min": round(min_val, 4),
                    "q1": round(q1, 4),
                    "median": round(median_val, 4),
                    "q3": round(q3, 4),
                    "max": round(max_val, 4),
                    "iqr": round(iqr, 4),
                    "lower_fence": round(lower_fence, 4),
                    "upper_fence": round(upper_fence, 4),
                    "outlier_count": outlier_count,
                    "total_count": int(len(series))
                }
            }

        # 2. Categorical columns
        else:
            series = df[col].dropna()
            if len(series) == 0:
                continue

            # Calculate frequencies
            val_counts = series.value_counts()
            total_non_null = len(series)
            
            frequencies = []
            # Take top 10 categories, group the rest in 'Other'
            top_n = val_counts.head(10)
            other_count = int(val_counts.iloc[10:].sum()) if len(val_counts) > 10 else 0

            for cat, count in top_n.items():
                pct = round((count / total_non_null) * 100, 1) if total_non_null > 0 else 0.0
                frequencies.append({
                    "category": str(cat),
                    "count": int(count),
                    "percentage": pct
                })

            if other_count > 0:
                pct = round((other_count / total_non_null) * 100, 1) if total_non_null > 0 else 0.0
                frequencies.append({
                    "category": "Other",
                    "count": other_count,
                    "percentage": pct
                })

            categorical_analysis[col] = {
                "semantic_type": sem_type,
                "frequencies": frequencies
            }

    return {
        "dataset_id": dataset_id,
        "numeric_analysis": numeric_analysis,
        "categorical_analysis": categorical_analysis
    }

class InsightsRequest(BaseModel):
    dataset_id: str

def generate_insights_list(df: pd.DataFrame, dataset_id: str) -> List[Dict[str, Any]]:
    row_count = len(df)
    insights = []

    if row_count == 0:
        return []

    # Extract column lists, excluding identifier columns
    numeric_cols = []
    categorical_cols = []
    for col in df.columns:
        if is_identifier_column(col, df[col]):
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            numeric_cols.append(col)
        else:
            categorical_cols.append(col)

    # 1. Missing Value Heuristic
    # Warn if columns have > 15% missing values
    for col in df.columns:
        if is_identifier_column(col, df[col]):
            continue
        missing_count = int(df[col].isna().sum())
        if missing_count > 0:
            missing_pct = (missing_count / row_count) * 100
            if missing_pct > 15.0:
                # Score range [10, 40]
                score = 10.0 + min(30.0, missing_pct * 0.6)
                priority = "high" if missing_pct > 30.0 else "medium"
                
                finding = f"Column '{col}' has {missing_count} missing values ({missing_pct:.1f}% of dataset)."
                why_it_matters = "High levels of missing data can bias statistical estimates, reduce analytical power, and cause errors in downstream processing."
                supporting_metric = f"Missing Count = {missing_count} ({missing_pct:.1f}%)"
                
                insights.append({
                    "priority": priority,
                    "type": "missing_values",
                    "title": f"High Missingness in '{col}'" if priority == "high" else f"Missing Values in '{col}'",
                    "description": f"Column '{col}' has {missing_count} missing values ({missing_pct:.1f}% of dataset). Imputation or cleaning is recommended.",
                    "columns": [col],
                    "score": score,
                    "finding": finding,
                    "why_it_matters": why_it_matters,
                    "supporting_metric": supporting_metric
                })

    # 2. Outlier Heuristic
    # Outlier count > 2% of total rows based on 1.5 * IQR fence rule
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) > 0:
            q1 = float(series.quantile(0.25))
            q3 = float(series.quantile(0.75))
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr
            
            outliers = series[(series < lower_fence) | (series > upper_fence)]
            outlier_pct = (len(outliers) / row_count) * 100
            
            if outlier_pct > 2.0:
                # Score range [40, 60]
                score = 40.0 + min(20.0, outlier_pct * 2.0)
                
                finding = f"Column '{col}' contains {len(outliers)} outliers ({outlier_pct:.1f}% of values) outside IQR fences."
                why_it_matters = "Outliers can skew aggregate statistics like mean and variance, and may represent data entry errors or exceptional events."
                supporting_metric = f"Outlier Percentage = {outlier_pct:.1f}% ({len(outliers)} rows)"
                
                insights.append({
                    "priority": "medium",
                    "type": "outliers",
                    "title": f"Significant Outliers in '{col}'",
                    "description": f"Column '{col}' contains {len(outliers)} outliers ({outlier_pct:.1f}% of values) outside IQR fences ({lower_fence:.2f} to {upper_fence:.2f}).",
                    "columns": [col],
                    "score": score,
                    "finding": finding,
                    "why_it_matters": why_it_matters,
                    "supporting_metric": supporting_metric
                })

    # 3. Category Imbalance Heuristic
    # Top category > 75% representation
    for col in categorical_cols:
        series = df[col].dropna()
        if len(series) > 0:
            val_counts = series.value_counts()
            if not val_counts.empty:
                top_cat = val_counts.index[0]
                top_count = val_counts.iloc[0]
                top_pct = (top_count / len(series)) * 100
                
                if top_pct > 75.0:
                    # Score range [10, 40]
                    score = 10.0 + min(30.0, (top_pct - 75.0) / 25.0 * 30.0)
                    priority = "medium" if top_pct > 90.0 else "low"
                    
                    finding = f"The category '{top_cat}' accounts for {top_pct:.1f}% of all non-null values in column '{col}'."
                    why_it_matters = "Extreme category imbalance indicates low diversity, which can hide smaller sub-population patterns and bias downstream models."
                    supporting_metric = f"Dominant Class Share = {top_pct:.1f}%"
                    
                    insights.append({
                        "priority": priority,
                        "type": "category_imbalance",
                        "title": f"Extreme Dominance in '{col}'" if priority == "medium" else f"High Imbalance in '{col}'",
                        "description": f"The category '{top_cat}' accounts for {top_pct:.1f}% of all non-null values in column '{col}'.",
                        "columns": [col],
                        "score": score,
                        "finding": finding,
                        "why_it_matters": why_it_matters,
                        "supporting_metric": supporting_metric
                    })

    # 4. Correlation Heuristic
    # Very Strong Correlations (|r| >= 0.80) -> [90, 100]
    # Strong Correlations (0.60 <= |r| < 0.80) -> [80, 90]
    # Moderate/Weak/Very Weak -> Excluded or ranked in [10, 40]
    raw_correlation_insights = []
    if len(numeric_cols) > 1:
        try:
            corr_matrix = df[numeric_cols].corr(method="pearson")
            # Iterate through upper triangle of correlation matrix to avoid duplicates
            for i in range(len(numeric_cols)):
                for j in range(i + 1, len(numeric_cols)):
                    col1 = numeric_cols[i]
                    col2 = numeric_cols[j]
                    
                    if col1 == col2:
                        continue  # Safeguard: Exclude self-correlations
                        
                    r_val = corr_matrix.iloc[i, j]
                    if not pd.isna(r_val):
                        abs_r = abs(r_val)
                        if abs_r >= 0.20:
                            classification = classify_correlation(r_val)
                            
                            # Priority and score mapping
                            if abs_r >= 0.80:
                                priority = "high"
                                score = 90.0 + (abs_r - 0.80) / 0.20 * 10.0
                            elif abs_r >= 0.60:
                                priority = "high"
                                score = 80.0 + (abs_r - 0.60) / 0.20 * 10.0
                            elif abs_r >= 0.40:
                                priority = "medium"
                                score = 40.0 + (abs_r - 0.40) / 0.20 * 20.0
                            else:
                                priority = "low"
                                score = 10.0 + (abs_r - 0.20) / 0.20 * 30.0
                                
                            finding = f"Columns '{col1}' and '{col2}' show a {classification.lower()}."
                            why_it_matters = "A strong linear relationship suggests systematic co-movement, indicating data redundancies or underlying causal factors."
                            supporting_metric = f"Pearson Correlation r = {r_val:+.4f}"
                            
                            raw_correlation_insights.append({
                                "priority": priority,
                                "type": "correlation",
                                "title": classification,
                                "description": f"Columns '{col1}' and '{col2}' show a {classification.lower()} (r = {r_val:+.2f}).",
                                "columns": [col1, col2],
                                "score": score,
                                "finding": finding,
                                "why_it_matters": why_it_matters,
                                "supporting_metric": supporting_metric,
                                "abs_r": abs_r
                            })
        except Exception:
            pass

    # Deduplicate lower-value correlation insights when stronger related insights already exist
    # Sort correlation insights by absolute r descending
    raw_correlation_insights.sort(key=lambda x: x["abs_r"], reverse=True)
    seen_columns = set()
    for c_ins in raw_correlation_insights:
        col1, col2 = c_ins["columns"]
        if col1 not in seen_columns and col2 not in seen_columns:
            insights.append(c_ins)
            seen_columns.add(col1)
            seen_columns.add(col2)

    # 5. Category vs Numeric Aggregate Ranking Heuristic
    # Extreme Category Averages -> Score range [60, 80]
    metric_cols = []
    order = ['sellingprice', 'price', 'revenue', 'amount']
    for target in order:
        for c in numeric_cols:
            if c.lower() == target:
                metric_cols.append(c)
    if not metric_cols:
        for target in order:
            for c in numeric_cols:
                if target in c.lower() and c not in metric_cols:
                    metric_cols.append(c)
    if not metric_cols:
        # Fallback to first numeric that doesn't look like a year or id
        non_year_id = [c for c in numeric_cols if "year" not in c.lower() and "yr" not in c.lower() and "id" not in c.lower() and "code" not in c.lower()]
        if non_year_id:
            metric_cols = [non_year_id[0]]
        else:
            non_year = [c for c in numeric_cols if "year" not in c.lower() and "yr" not in c.lower()]
            if non_year:
                metric_cols = [non_year[0]]
            elif numeric_cols:
                metric_cols = [numeric_cols[0]]
        
    if metric_cols and categorical_cols:
        top_cats = [c for c in categorical_cols if any(kw in c.lower() for kw in ["make", "brand", "model", "type", "body", "state"])]
        if not top_cats:
            top_cats = categorical_cols[:2]
        else:
            top_cats = top_cats[:2]
            
        for cat_col in top_cats:
            for num_col in metric_cols:
                try:
                    df_sub = df[[cat_col, num_col]].dropna()
                    if len(df_sub) > 20:
                        overall_mean = float(df_sub[num_col].mean())
                        overall_std = float(df_sub[num_col].std())
                        if pd.isna(overall_std) or overall_std == 0:
                            overall_std = 1.0
                            
                        grp = df_sub.groupby(cat_col)[num_col].agg(['mean', 'count'])
                        # Apply reliability filter: count >= 20
                        grp_filtered = grp[grp['count'] >= 20]
                        if not grp_filtered.empty:
                            grp_filtered = grp_filtered.copy()
                            grp_filtered['z_score'] = (grp_filtered['mean'] - overall_mean).abs() / overall_std
                            grp_filtered['significance_score'] = grp_filtered['z_score'] * np.log10(grp_filtered['count'])
                            
                            # Sort by significance score to find the most significant category
                            highest_row = grp_filtered.sort_values(by='significance_score', ascending=False).iloc[0]
                            highest_cat = highest_row.name
                            highest_mean = float(highest_row['mean'])
                            highest_count = int(highest_row['count'])
                            sig_score = float(highest_row['significance_score'])
                            
                            # Score range [60, 80]
                            score = 60.0 + min(20.0, sig_score * 2.5)
                            
                            # Compute percentage difference against dataset average
                            if overall_mean != 0:
                                pct_diff = ((highest_mean - overall_mean) / overall_mean) * 100
                            else:
                                pct_diff = 0.0
                                
                            diff_direction = "higher" if pct_diff >= 0 else "lower"
                            comparison_text = f"{abs(pct_diff):.1f}% {diff_direction} than the dataset average"
                            
                            formatted_val = f"${highest_mean:,.2f}" if any(kw in num_col.lower() for kw in ["price", "amount", "cost", "value", "sales", "revenue"]) else f"{highest_mean:,.2f}"
                            formatted_overall_mean = f"${overall_mean:,.2f}" if any(kw in num_col.lower() for kw in ["price", "amount", "cost", "value", "sales", "revenue"]) else f"{overall_mean:,.2f}"
                            
                            finding = (
                                f"Category '{highest_cat}' in column '{cat_col}' has the highest average {num_col} of {formatted_val}, "
                                f"which is {comparison_text} of {formatted_overall_mean} (based on {highest_count} records)."
                            )
                            why_it_matters = "This group deviates significantly from the overall average, highlighting key performance drivers or high-value segments."
                            supporting_metric = (
                                f"Group Mean = {formatted_val} vs Overall Mean = {formatted_overall_mean} "
                                f"({pct_diff:+.1f}% difference), Significance Score = {sig_score:.2f}"
                            )
                            description = f"Category '{highest_cat}' in column '{cat_col}' has the highest average {num_col} of {formatted_val}, which is {comparison_text} of {formatted_overall_mean}."
                            
                            insights.append({
                                "priority": "medium",
                                "type": "category_ranking",
                                "title": f"Top Average {num_col} by {cat_col}",
                                "description": description,
                                "columns": [cat_col, num_col],
                                "score": score,
                                "finding": finding,
                                "why_it_matters": why_it_matters,
                                "supporting_metric": supporting_metric
                            })
                except Exception:
                    pass

    # Prioritize insights using the score
    for ins in insights:
        if "score" not in ins:
            if ins["priority"] == "high":
                ins["score"] = 55.0
            elif ins["priority"] == "medium":
                ins["score"] = 35.0
            else:
                ins["score"] = 15.0

    insights.sort(key=lambda x: x.get("score", 0), reverse=True)
    return insights

@app.post("/api/insights")
async def get_dataset_insights(req: InsightsRequest):
    """
    Computes heuristic data insights: correlations, missing value risks, outliers, and category imbalances.
    Returns sorted list of structured insights by priority (high -> medium -> low).
    """
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    insights = generate_insights_list(df, dataset_id)
    return {
        "dataset_id": dataset_id,
        "insights": insights
    }

def get_row_label(row: pd.Series, cols: list) -> str:
    """
    Generates a row label from standard catalog terms for context.
    """
    label_parts = []
    for kw in ["make", "model", "trim", "name", "title", "brand"]:
        matched = [c for c in cols if kw in c.lower()]
        if matched:
            val = row[matched[0]]
            if not pd.isna(val):
                label_parts.append(str(val))
    if label_parts:
        return " ".join(label_parts)
    return ""

class BivariateInitRequest(BaseModel):
    dataset_id: str

@app.post("/api/bivariate/init")
async def bivariate_init(req: BivariateInitRequest):
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    # 1. Filter out identifier columns
    numeric_cols = []
    categorical_cols = []
    for col in df.columns:
        if is_identifier_column(col, df[col]):
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            if df[col].dropna().nunique() > 1:
                numeric_cols.append(col)
        else:
            if df[col].dropna().nunique() > 1:
                categorical_cols.append(col)

    correlations = []
    strongest_pair = None
    strongest_positive = None
    strongest_negative = None
    max_abs_r = -1.0
    max_pos_r = -1.0
    min_neg_r = 1.0

    # 2. Calculate correlations and find strongest pair (non-self, non-duplicate)
    if len(numeric_cols) > 0:
        try:
            corr_df = df[numeric_cols].corr(method="pearson")
            for col1 in numeric_cols:
                for col2 in numeric_cols:
                    val = corr_df.loc[col1, col2]
                    r_val = float(val) if not pd.isna(val) else 0.0
                    correlations.append({
                        "x": col1,
                        "y": col2,
                        "r": round(r_val, 4)
                    })
                    
                    # Track strongest pair (exclude self-correlations)
                    if col1 != col2:
                        abs_r = abs(r_val)
                        if abs_r > max_abs_r:
                            max_abs_r = abs_r
                            strongest_pair = {
                                "x": col1,
                                "y": col2,
                                "r": round(r_val, 4),
                                "classification": classify_correlation(r_val)
                            }
                        if r_val > 0 and r_val > max_pos_r:
                            max_pos_r = r_val
                            strongest_positive = {
                                "x": col1,
                                "y": col2,
                                "r": round(r_val, 4),
                                "classification": classify_correlation(r_val)
                            }
                        if r_val < 0 and r_val < min_neg_r:
                            min_neg_r = r_val
                            strongest_negative = {
                                "x": col1,
                                "y": col2,
                                "r": round(r_val, 4),
                                "classification": classify_correlation(r_val)
                            }
        except Exception:
            for col1 in numeric_cols:
                for col2 in numeric_cols:
                    correlations.append({
                        "x": col1,
                        "y": col2,
                        "r": 1.0 if col1 == col2 else 0.0
                    })

    # If no strongest pair found, fall back to first two columns
    if not strongest_pair and len(numeric_cols) >= 2:
        strongest_pair = {
            "x": numeric_cols[0],
            "y": numeric_cols[1],
            "r": 0.0,
            "classification": "No Correlation"
        }

    return {
        "dataset_id": dataset_id,
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "correlations": correlations,
        "strongest_pair": strongest_pair,
        "strongest_positive": strongest_positive,
        "strongest_negative": strongest_negative
    }

class ScatterRequest(BaseModel):
    dataset_id: str
    x_column: str
    y_column: str
    sample_size: int = 500

@app.post("/api/bivariate/scatter")
async def bivariate_scatter(req: ScatterRequest):
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    x_col = req.x_column
    y_col = req.y_column

    if x_col not in df.columns or y_col not in df.columns:
        raise HTTPException(status_code=400, detail="Specified columns not found in dataset.")

    # Drop nulls
    df_clean = df[[x_col, y_col] + [c for c in df.columns if c not in [x_col, y_col]]].dropna(subset=[x_col, y_col])
    total_records = len(df_clean)

    # Calculate regression on all valid data (before sampling)
    regression_info = {
        "slope": 0.0,
        "intercept": 0.0,
        "r": 0.0,
        "r2": 0.0
    }
    if total_records >= 2:
        try:
            x_all = df_clean[x_col].values.astype(float)
            y_all = df_clean[y_col].values.astype(float)
            
            # Check variance of x to avoid division by zero / RankWarning
            if np.var(x_all) > 1e-9:
                m, c = np.polyfit(x_all, y_all, 1)
                r_matrix = np.corrcoef(x_all, y_all)
                r_val = float(r_matrix[0, 1]) if not np.isnan(r_matrix[0, 1]) else 0.0
                r2_val = r_val ** 2
                regression_info = {
                    "slope": float(m),
                    "intercept": float(c),
                    "r": float(r_val),
                    "r2": float(r2_val)
                }
        except Exception:
            pass

    # Sample if needed
    if total_records > req.sample_size:
        df_clean = df_clean.sample(n=req.sample_size, random_state=42)

    df_clean = df_clean.sort_values(by=x_col)

    data = []
    cols = df.columns.tolist()
    for idx, row in df_clean.iterrows():
        x_val = row[x_col]
        y_val = row[y_col]
        try:
            x_num = float(x_val)
            y_num = float(y_val)
        except Exception:
            continue
            
        row_label = get_row_label(row, cols)
        if not row_label:
            row_label = f"Row {idx}"

        data.append({
            "x": x_num,
            "y": y_num,
            "label": row_label
        })

    return {
        "x_column": x_col,
        "y_column": y_col,
        "total_records": total_records,
        "sampled_records": len(data),
        "data": data,
        "regression": regression_info
    }

class CategoryNumericRequest(BaseModel):
    dataset_id: str
    category_column: str
    numeric_column: str
    aggregation: str = "mean"  # "mean" | "median" | "count"
    limit: Optional[Union[int, str]] = None

@app.post("/api/bivariate/category-numeric")
async def bivariate_category_numeric(req: CategoryNumericRequest):
    dataset_id = req.dataset_id
    filepath = os.path.join(UPLOAD_DIR, dataset_id)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    cat_col = req.category_column
    num_col = req.numeric_column
    agg_type = req.aggregation.lower()

    if cat_col not in df.columns or num_col not in df.columns:
        raise HTTPException(status_code=400, detail="Specified columns not found in dataset.")

    df_clean = df[[cat_col, num_col]].dropna()
    if len(df_clean) == 0:
        return {
            "category_column": cat_col,
            "numeric_column": num_col,
            "data": []
        }

    # Group by category and aggregate
    if agg_type == "median":
        grouped = df_clean.groupby(cat_col)[num_col].agg(['count', 'median']).rename(columns={'median': 'val'})
        sort_col = 'val'
    elif agg_type == "count":
        grouped = df_clean.groupby(cat_col)[num_col].agg(['count', 'mean']).rename(columns={'count': 'val'})
        sort_col = 'val'
    else:  # mean / average
        grouped = df_clean.groupby(cat_col)[num_col].agg(['count', 'mean']).rename(columns={'mean': 'val'})
        sort_col = 'val'

    grouped = grouped.sort_values(by=sort_col, ascending=False)
    
    top_n = 15
    if req.limit is not None:
        if isinstance(req.limit, int):
            top_n = req.limit
        elif isinstance(req.limit, str):
            if req.limit.lower() == 'all':
                top_n = len(grouped)
            elif req.limit.isdigit():
                top_n = int(req.limit)
                
    data = []
    for cat, row in grouped.iterrows():
        try:
            mean_val = float(df_clean[df_clean[cat_col] == cat][num_col].mean())
            median_val = float(df_clean[df_clean[cat_col] == cat][num_col].median())
        except Exception:
            mean_val = 0.0
            median_val = 0.0

        data.append({
            "category": str(cat),
            "count": int(row['count']),
            "mean": round(mean_val, 2),
            "median": round(median_val, 2),
            "val": round(float(row['val']), 2) if agg_type != "count" else int(row['val'])
        })

    if len(data) > top_n:
        data = data[:top_n]

    return {
        "category_column": cat_col,
        "numeric_column": num_col,
        "aggregation": agg_type,
        "data": data
    }

class DashboardQueryRequest(BaseModel):
    dataset_id: str
    filter_column: Optional[str] = None
    filter_value: Optional[str] = None

@app.post("/api/dashboard/query")
async def get_dashboard_data(req: DashboardQueryRequest):
    """
    Returns filtered overview statistics, data quality score, key metric trend, and filter options.
    Enriched with executive summary metrics and findings.
    """
    dataset_id = req.dataset_id
    
    # 1. If no filter is requested, try to load from cached analysis JSON file
    if not req.filter_column and not req.filter_value:
        analysis_cache_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_analysis.json")
        if os.path.exists(analysis_cache_path):
            try:
                with open(analysis_cache_path, "r") as f:
                    return json.load(f)
            except Exception:
                pass

    # 2. If cache missing or filter requested, read from disk
    filepath = os.path.join(UPLOAD_DIR, dataset_id)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_ext = os.path.splitext(dataset_id)[1].lower()
    try:
        if file_ext == ".csv":
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    # Get filename
    registry = load_registry()
    filename = dataset_id
    for item in registry:
        if item["dataset_id"] == dataset_id:
            filename = item["filename"]
            break

    # 3. If a filter is requested, filter the dataframe
    if req.filter_column and req.filter_value:
        if req.filter_column in df.columns:
            df = df[df[req.filter_column].astype(str) == str(req.filter_value)]
            # Recalculate analysis on the filtered dataframe (do not write to primary cache)
            return process_and_analyze_df(df, dataset_id, filename)

    # 4. If no filter is requested, calculate, cache, and return
    analysis_res = process_and_analyze_df(df, dataset_id, filename)
    try:
        analysis_cache_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_analysis.json")
        with open(analysis_cache_path, "w") as f:
            json.dump(analysis_res, f)
    except Exception as e:
        logger.error(f"Failed to save analysis cache: {e}")

    return analysis_res

class LoadDatasetRequest(BaseModel):
    dataset_id: str
    filename: Optional[str] = None

@app.post("/api/dataset/load")
async def load_dataset(req: LoadDatasetRequest):
    """
    Load a dataset that is already uploaded and saved in UPLOAD_DIR.
    Reuses the get_dataset_details endpoint to ensure caching, metadata updates, and performance.
    """
    return await get_dataset_details(req.dataset_id)


def sync_dataset_reports_metadata(dataset_id: str):
    registry = load_registry()
    for item in registry:
        if item["dataset_id"] == dataset_id:
            reports_ids = item.get("reports_generated", [])
            valid_reports = []
            report_types = set()
            last_timestamp = None
            
            for r_id in reports_ids:
                r_json_path = os.path.join(REPORTS_DIR, f"{r_id}.json")
                if os.path.exists(r_json_path):
                    try:
                        with open(r_json_path, "r") as f:
                            r_meta = json.load(f)
                            valid_reports.append(r_id)
                            report_types.add(r_meta.get("report_type"))
                            ts = r_meta.get("generated_at", r_meta.get("timestamp"))
                            if not last_timestamp or ts > last_timestamp:
                                last_timestamp = ts
                    except Exception:
                        pass
            
            item["reports_generated"] = valid_reports
            item["report_count"] = len(valid_reports)
            item["last_report_timestamp"] = last_timestamp
            item["report_types_generated"] = list(report_types)
            break
    save_registry(registry)


class GenerateReportRequest(BaseModel):
    report_type: str  # "executive" or "full"

@app.post("/api/datasets/{dataset_id}/reports")
async def generate_dataset_report(dataset_id: str, req: GenerateReportRequest):
    """
    Generates a PDF report (Executive or Full Analysis) from cached analysis data.
    """
    filepath = os.path.join(UPLOAD_DIR, dataset_id)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Dataset file not found.")

    # 1. Reuse cache or regenerate
    analysis_cache_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_analysis.json")
    use_cache = False
    if os.path.exists(analysis_cache_path):
        try:
            cache_mtime = os.path.getmtime(analysis_cache_path)
            file_mtime = os.path.getmtime(filepath)
            if cache_mtime >= file_mtime:
                use_cache = True
        except Exception:
            pass

    if use_cache:
        try:
            with open(analysis_cache_path, "r") as f:
                analysis = json.load(f)
        except Exception:
            use_cache = False

    if not use_cache:
        # Load from disk and regenerate cache
        file_ext = os.path.splitext(dataset_id)[1].lower()
        try:
            if file_ext == ".csv":
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

        registry = load_registry()
        filename = dataset_id
        for item in registry:
            if item["dataset_id"] == dataset_id:
                filename = item["filename"]
                break

        analysis = process_and_analyze_df(df, dataset_id, filename)
        try:
            with open(analysis_cache_path, "w") as f:
                json.dump(analysis, f)
        except Exception as e:
            logger.error(f"Failed to save analysis cache: {e}")

    # 2. Get dataset metadata
    metadata = get_dataset_metadata(dataset_id)
    dataset_version = metadata.get("version", 1)
    dataset_name = metadata.get("filename", dataset_id)

    # 3. Create Report record
    report_id = str(uuid.uuid4())
    pdf_filename = f"{os.path.splitext(dataset_name)[0]}_{req.report_type}_report.pdf"
    pdf_path = os.path.join(REPORTS_DIR, f"{report_id}.pdf")
    json_path = os.path.join(REPORTS_DIR, f"{report_id}.json")

    # 4. Generate PDF using reports engine
    try:
        generate_pdf_report(
            dataset_metadata=metadata,
            analysis_data=analysis,
            report_type=req.report_type,
            output_path=pdf_path
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    # Get file size
    try:
        file_size = os.path.getsize(pdf_path)
    except Exception:
        file_size = 0

    # Create report metadata
    now_iso = datetime.datetime.now().isoformat()
    report_meta = {
        "report_id": report_id,
        "status": "completed",
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "dataset_name": dataset_name,
        "generated_at": now_iso,
        "report_type": req.report_type,
        "filename": pdf_filename,
        "timestamp": now_iso,
        "file_size": file_size
    }

    # Save metadata separately
    try:
        with open(json_path, "w") as f:
            json.dump(report_meta, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to save report metadata: {e}")

    # Update dataset registry references
    registry = load_registry()
    for item in registry:
        if item["dataset_id"] == dataset_id:
            reports = item.get("reports_generated", [])
            if report_id not in reports:
                reports.append(report_id)
            item["reports_generated"] = reports
            break
    save_registry(registry)
    
    sync_dataset_reports_metadata(dataset_id)

    return report_meta

@app.get("/api/reports/{report_id}")
async def download_pdf_report(report_id: str):
    """
    Downloads a generated PDF report by its UUID reference.
    """
    pdf_path = os.path.join(REPORTS_DIR, f"{report_id}.pdf")
    json_path = os.path.join(REPORTS_DIR, f"{report_id}.json")
    if not os.path.exists(pdf_path) or not os.path.exists(json_path):
        raise HTTPException(status_code=404, detail="Report not found.")

    try:
        with open(json_path, "r") as f:
            meta = json.load(f)
        filename = meta.get("filename", f"{report_id}.pdf")
    except Exception:
        filename = f"{report_id}.pdf"

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=filename
    )

@app.delete("/api/reports/{report_id}")
async def delete_pdf_report(report_id: str):
    """
    Deletes the generated PDF, its JSON metadata, and cleans up references in the dataset registry.
    """
    pdf_path = os.path.join(REPORTS_DIR, f"{report_id}.pdf")
    json_path = os.path.join(REPORTS_DIR, f"{report_id}.json")

    # Load metadata first to know which dataset it belonged to
    dataset_id = None
    if os.path.exists(json_path):
        try:
            with open(json_path, "r") as f:
                meta = json.load(f)
                dataset_id = meta.get("dataset_id")
        except Exception:
            pass

    # Delete files
    for path in [pdf_path, json_path]:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                logger.error(f"Failed to remove report file {path}: {e}")

    # Remove reference in registry
    if dataset_id:
        registry = load_registry()
        for item in registry:
            if item["dataset_id"] == dataset_id:
                reports = item.get("reports_generated", [])
                if report_id in reports:
                    reports.remove(report_id)
                item["reports_generated"] = reports
                break
        save_registry(registry)
        sync_dataset_reports_metadata(dataset_id)

    return {"status": "success", "message": "Report deleted successfully"}

@app.get("/api/reports")
async def list_all_reports():
    """
    Returns list of all generated reports across all datasets.
    """
    reports_list = []
    if os.path.exists(REPORTS_DIR):
        for filename in os.listdir(REPORTS_DIR):
            if filename.endswith(".json"):
                r_json_path = os.path.join(REPORTS_DIR, filename)
                try:
                    with open(r_json_path, "r") as f:
                        meta = json.load(f)
                        # Gracefully backfill any missing keys for legacy files
                        if "status" not in meta:
                            meta["status"] = "completed"
                        if "generated_at" not in meta:
                            meta["generated_at"] = meta.get("timestamp", "")
                        reports_list.append(meta)
                except Exception:
                    pass
                    
    # Sort by generated_at descending, fallback to timestamp
    reports_list.sort(key=lambda x: x.get("generated_at", x.get("timestamp", "")), reverse=True)
    return reports_list

@app.get("/api/datasets/{dataset_id}/reports")
async def list_dataset_reports(dataset_id: str, response: Response):
    """
    Lists all reports generated for the specified dataset.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    metadata = get_dataset_metadata(dataset_id)
    report_ids = metadata.get("reports_generated", [])
    
    reports_list = []
    for r_id in report_ids:
        r_json_path = os.path.join(REPORTS_DIR, f"{r_id}.json")
        if os.path.exists(r_json_path):
            try:
                with open(r_json_path, "r") as f:
                    reports_list.append(json.load(f))
            except Exception:
                pass
                
    # Sort by timestamp descending
    reports_list.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return reports_list

