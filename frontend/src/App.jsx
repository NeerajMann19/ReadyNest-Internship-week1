/**
 * DataLens Dashboard Application
 * File: frontend/src/App.jsx
 * Description: Primary interface for DataLens MVP Phase 1. Contains CSV upload
 *              dropzone, scan/processing animations, and interactive Recharts representation.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, BarChart2, AlertCircle, RefreshCw, Layers, Database, ChevronRight, Eye, EyeOff, Sparkles, CheckCircle2, PanelLeft, Search, Star, Trash2, Calendar, Download, Info } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter } from 'recharts';

/**
 * Workspace Error Boundary to prevent component crashes from blanking the entire app.
 */
class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("WorkspaceErrorBoundary caught rendering crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full p-8 rounded-2xl glass-panel border border-rose-500/20 bg-slate-950/40 flex flex-col items-center text-center animate-fade-in my-6">
          <div className="w-14 h-14 rounded-full bg-rose-950/30 border border-rose-800/40 flex items-center justify-center mb-6">
            <AlertCircle className="w-7 h-7 text-rose-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Something went wrong inside this workspace</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-md leading-relaxed">
            A component crashed during rendering. This error has been logged to the console.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15"
            >
              Reset Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Safely format to locale string with console.error fallback log
 * @param {any} val - The value
 * @param {string} fieldName - The field identifier for debugging
 * @returns {string} The formatted string or empty
 */
const safeToLocaleString = (val, fieldName) => {
  if (val === null || val === undefined) {
    console.error(`safeToLocaleString mismatch fallback: ${fieldName} is null or undefined`);
    return '';
  }
  return val.toLocaleString();
};

/**
 * Safely format percentage difference
 * @param {any} val - The raw percentage value
 * @returns {string} The formatted percentage
 */
const formatPercentage = (val) => {
  if (val === null || val === undefined || isNaN(Number(val))) {
    console.error("formatPercentage mismatch fallback: value is null, undefined, or NaN", val);
    return "0.0";
  }
  return Number(val).toFixed(1);
};

/**
 * Custom Tooltip component for Recharts
 * @param {Object} props - Tooltip props injected by Recharts
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    let valueStr = 'N/A';
    const val = payload[0].value;
    if (val === null || val === undefined) {
      console.error("CustomTooltip mismatch fallback: payload[0].value is null or undefined", { payload, label });
    } else {
      valueStr = val.toLocaleString();
    }
    return (
      <div className="bg-[#151D30] border border-[#1E293B] p-3 rounded-lg shadow-xl">
        <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
        <p className="text-sm text-cyan-400 font-bold">
          Value: <span className="text-white">{valueStr}</span>
        </p>
      </div>
    );
  }
  return null;
};

/**
 * Formatter for Y-axis tick values to show scaled numbers
 * @param {number|string} value - The raw tick value
 * @returns {string} The formatted tick label
 */
const formatYAxisTick = (value) => {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  
  const absNum = Math.abs(num);
  if (absNum === 0) return '0';
  
  if (absNum < 1000) {
    if (Number.isInteger(num)) {
      return String(num);
    }
    return num.toFixed(3).replace(/\.?0+$/, '');
  }
  
  if (absNum >= 1e9) {
    return `${(num / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (absNum >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (absNum >= 1e3) {
    return `${(num / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  }
  
  return num.toLocaleString();
};

/**
 * Formatter for large values in cells (with K/M/B suffixes and custom precision)
 * @param {number|string} value - The value to format
 * @returns {string} The formatted value
 */
const formatLargeValue = (value) => {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  
  const absNum = Math.abs(num);
  if (absNum === 0) return '0';
  
  if (absNum < 1000) {
    if (Number.isInteger(num)) {
      return String(num);
    }
    return num.toFixed(3).replace(/\.?0+$/, '');
  }
  
  if (absNum >= 1e9) {
    return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  }
  if (absNum >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (absNum >= 1e3) {
    return `${(num / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  }
  
  return num.toLocaleString();
};

/**
 * Formatter that respects semantic column classification (year, metric, identifier, numeric)
 * @param {number|string} value - The value to format
 * @param {string} semanticType - The semantic classification of the column
 * @returns {string} The formatted value
 */
const formatValueBySemanticType = (value, semanticType) => {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);

  if (semanticType === 'year') {
    return Math.round(num).toString();
  }

  if (semanticType === 'numeric' || semanticType === 'identifier') {
    if (Number.isInteger(num)) {
      return num.toLocaleString();
    }
    return num.toFixed(3).replace(/\.?0+$/, '');
  }

  // Otherwise, default to compact formatting (metric / general)
  const absNum = Math.abs(num);
  if (absNum === 0) return '0';
  
  if (absNum < 1000) {
    if (Number.isInteger(num)) {
      return String(num);
    }
    return num.toFixed(3).replace(/\.?0+$/, '');
  }
  
  if (absNum >= 1e9) {
    return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  }
  if (absNum >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (absNum >= 1e3) {
    return `${(num / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  }
  
  return num.toLocaleString();
};

/**
 * Classifies correlation coefficient strength and direction
 * @param {number} r - Pearson correlation coefficient
 * @returns {string} The descriptive label
 */
const classifyCorrelation = (r) => {
  const absR = Math.abs(r);
  let strength = "Very Weak";
  if (absR >= 0.80) strength = "Very Strong";
  else if (absR >= 0.60) strength = "Strong";
  else if (absR >= 0.40) strength = "Moderate";
  else if (absR >= 0.20) strength = "Weak";
  
  const direction = r >= 0 ? "Positive" : "Negative";
  return `${strength} ${direction} Correlation`;
};

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://readynest-internship-week1.onrender.com');

export default function App() {
  // Application State
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [dataset, setDataset] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [chartType, setChartType] = useState('area'); // area | line
  const [currentStep, setCurrentStep] = useState(1);
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Dataset History States
  const [history, setHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true); // Default open on desktop
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | original | cleaned | favorites
  const [sortBy, setSortBy] = useState('last_opened'); // last_opened | upload_timestamp | file_size
  const [historyStats, setHistoryStats] = useState(null);

  // Data Cleaning States
  const [cleanResult, setCleanResult] = useState(null);
  const [columnStrategies, setColumnStrategies] = useState({});
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [appliedStrategies, setAppliedStrategies] = useState({});

  // Phase 3 Descriptive Stats States
  const [statsReport, setStatsReport] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Phase 3 Univariate States
  const [univariateReport, setUnivariateReport] = useState(null);
  const [isLoadingUnivariate, setIsLoadingUnivariate] = useState(false);
  const [selectedUnivariateCol, setSelectedUnivariateCol] = useState('');

  // Phase 3 Insights States
  const [insightsReport, setInsightsReport] = useState(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  // Phase 3 Bivariate States
  const [bivariateInitData, setBivariateInitData] = useState(null);
  const [isLoadingBivariate, setIsLoadingBivariate] = useState(false);
  const [selectedScatterX, setSelectedScatterX] = useState('');
  const [selectedScatterY, setSelectedScatterY] = useState('');
  const [scatterReport, setScatterReport] = useState(null);
  const [isLoadingScatter, setIsLoadingScatter] = useState(false);
  const [selectedCatCol, setSelectedCatCol] = useState('');
  const [selectedNumCol, setSelectedNumCol] = useState('');
  const [catNumAggregation, setCatNumAggregation] = useState('mean'); // mean | median | count
  const [catNumReport, setCatNumReport] = useState(null);
  const [isLoadingCatNum, setIsLoadingCatNum] = useState(false);
  const [bivariateTab, setBivariateTab] = useState('heatmap'); // heatmap | scatter | category
  
  // Safeguards & Extensions
  const [catNumLimit, setCatNumLimit] = useState(15);
  const [showRegression, setShowRegression] = useState(false);

  // Phase 3 Step 7 Dashboard States
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [selectedFilterCol, setSelectedFilterCol] = useState('');
  const [selectedFilterVal, setSelectedFilterVal] = useState('');
  const [reportsList, setReportsList] = useState([]);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showQualityBreakdown, setShowQualityBreakdown] = useState(false);

  const fileInputRef = useRef(null);

  // History and Stats Fetch Helpers
  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch dataset history:', err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/stats?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch dataset stats:', err);
    }
  };

  const loadDatasetFromHistory = async (datasetId) => {
    setStatus('uploading');
    setErrorMessage('');
    
    // Simulate stepping through loader items for visual feedback
    setActiveStep(0);
    const stepInterval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < processingSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 450);

    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets/${datasetId}`);
      clearInterval(stepInterval);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to load dataset details.');
      }
      const data = await response.json();
      setDataset(data);
      
      const initialStrategies = {};
      if (data.missing_value_report) {
        data.missing_value_report.forEach(report => {
          initialStrategies[report.column_name] = report.suggested_strategy;
        });
      }
      setColumnStrategies(initialStrategies);
      setCleanResult(null);
      setRemoveDuplicates(true);
      
      setStatus('success');
      setCurrentStep(1);
      
      // Update sidebar
      fetchHistory();
      fetchStats();
    } catch (err) {
      clearInterval(stepInterval);
      setErrorMessage(err.message || 'An error occurred while loading this dataset.');
      setStatus('error');
    }
  };

  const toggleFavorite = async (datasetId, currentStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/${datasetId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !currentStatus })
      });
      if (res.ok) {
        fetchHistory();
        fetchStats();
        if (dataset && dataset.dataset_id === datasetId) {
          setDataset(prev => ({ ...prev, is_favorite: !currentStatus }));
        }
      }
    } catch (err) {
      console.error('Failed to toggle favorite status:', err);
    }
  };

  const deleteDataset = async (datasetId) => {
    if (!window.confirm('Are you sure you want to soft-delete this dataset? (It will be hidden from history)')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/${datasetId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchHistory();
        fetchStats();
        if (dataset && dataset.dataset_id === datasetId) {
          resetUpload();
        }
      }
    } catch (err) {
      console.error('Failed to delete dataset:', err);
    }
  };

  // Helper formatting functions
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const seconds = Math.floor((now - date) / 1000);
      
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  const filteredHistory = () => {
    return history
      .filter(item => {
        const matchesSearch = item.filename.toLowerCase().includes(searchQuery.toLowerCase());
        if (typeFilter === 'all') return matchesSearch;
        if (typeFilter === 'original') return matchesSearch && item.dataset_type === 'original';
        if (typeFilter === 'cleaned') return matchesSearch && item.dataset_type === 'cleaned';
        if (typeFilter === 'favorites') return matchesSearch && item.is_favorite;
        return matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'last_opened') {
          return new Date(b.last_opened || 0) - new Date(a.last_opened || 0);
        }
        if (sortBy === 'upload_timestamp') {
          return new Date(b.upload_timestamp || 0) - new Date(a.upload_timestamp || 0);
        }
        if (sortBy === 'file_size') {
          return (b.file_size || 0) - (a.file_size || 0);
        }
        return 0;
      });
  };

  useEffect(() => {
    // Initial fetches
    fetchHistory();
    fetchStats();

    const urlParams = new URLSearchParams(window.location.search);
    const urlDatasetId = urlParams.get('dataset_id');
    if (urlDatasetId) {
      loadDatasetFromHistory(urlDatasetId);
    }
  }, []);

  // Simulated processing steps to engage the user during backend calls
  const processingSteps = [
    "Reading dataset bytes...",
    "Detecting column headers and schemas...",
    "Identifying numeric and categorical types...",
    "Running missing data analysis...",
    "Compiling default visualization chart..."
  ];

  /**
   * Handle file upload submission
   * @param {File} file - CSV or Excel file object
   */
  const handleFileUpload = async (file) => {
    if (!file) return;

    // Validate size locally first
    if (file.size > MAX_UPLOAD_SIZE) {
      setErrorMessage('File size exceeds the 100MB upload limit. Please upload a smaller file.');
      setStatus('error');
      return;
    }

    // Validate type locally first
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExt)) {
      setErrorMessage('Unsupported file format. Please upload a CSV or Excel file.');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setErrorMessage('');
    setActiveStep(0);

    // Simulate stepping through loader items for high fidelity visual feedback
    const stepInterval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < processingSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 600);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to process dataset.');
      }

      const data = await response.json();
      clearInterval(stepInterval);
      setDataset(data);
      
      // Initialize cleaning strategies to recommended suggested values
      const initialStrategies = {};
      if (data.missing_value_report) {
        data.missing_value_report.forEach(report => {
          initialStrategies[report.column_name] = report.suggested_strategy;
        });
      }
      setColumnStrategies(initialStrategies);
      setCleanResult(null);
      setRemoveDuplicates(true);
      
      setStatus('success');
      
      // Refresh history & stats
      fetchHistory();
      fetchStats();
    } catch (err) {
      clearInterval(stepInterval);
      setErrorMessage(err.message || 'An error occurred while uploading your file.');
      setStatus('error');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const resetUpload = () => {
    setDataset(null);
    setStatus('idle');
    setErrorMessage('');
    setCleanResult(null);
    setCurrentStep(1);
    setStatsReport(null);
    setUnivariateReport(null);
    setSelectedUnivariateCol('');
    setInsightsReport(null);
    setBivariateInitData(null);
    setScatterReport(null);
    setCatNumReport(null);
    setSelectedScatterX('');
    setSelectedScatterY('');
    setSelectedCatCol('');
    setSelectedNumCol('');
    setBivariateTab('heatmap');
  };

  const handleStrategyChange = (columnName, strategy) => {
    setColumnStrategies(prev => ({
      ...prev,
      [columnName]: strategy
    }));
  };

  const cleanDataset = async () => {
    if (!dataset) return;
    setIsCleaning(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clean`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_id: dataset.dataset_id,
          column_strategies: columnStrategies,
          remove_duplicates: removeDuplicates,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to clean dataset.');
      }

      const data = await response.json();
      setCleanResult(data);
      setAppliedStrategies({ ...columnStrategies });
      
      // Update active dataset to reflect cleaned metadata
      setDataset(data.dataset);

      // Reset descriptive stats, univariate, and insights cache so they reload using the new dataset_id
      setStatsReport(null);
      setUnivariateReport(null);
      setInsightsReport(null);
      setBivariateInitData(null);
      setScatterReport(null);
      setCatNumReport(null);

      // Re-initialize strategies to recommended values of the newly cleaned dataset
      const initialStrategies = {};
      if (data.dataset.missing_value_report) {
        data.dataset.missing_value_report.forEach(report => {
          initialStrategies[report.column_name] = report.suggested_strategy;
        });
      }
      setColumnStrategies(initialStrategies);

      // Refresh history & stats
      fetchHistory();
      fetchStats();
    } catch (err) {
      alert(err.message || 'An error occurred while cleaning the dataset.');
    } finally {
      setIsCleaning(false);
    }
  };


  useEffect(() => {
    const fetchStats = async () => {
      if (currentStep === 3 && dataset && (!statsReport || statsReport.dataset_id !== dataset.dataset_id)) {
        setIsLoadingStats(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: dataset.dataset_id })
          });
          if (response.ok) {
            const data = await response.json();
            setStatsReport(data);
          } else {
            console.error("Failed to fetch statistics");
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingStats(false);
        }
      }
    };
    fetchStats();
  }, [currentStep, dataset, statsReport]);

  useEffect(() => {
    const fetchUnivariate = async () => {
      if (currentStep === 4 && dataset && (!univariateReport || univariateReport.dataset_id !== dataset.dataset_id)) {
        setIsLoadingUnivariate(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/univariate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: dataset.dataset_id })
          });
          if (response.ok) {
            const data = await response.json();
            setUnivariateReport(data);
            // Default select the first column from dataset
            if (dataset.columns && dataset.columns.length > 0) {
              setSelectedUnivariateCol(dataset.columns[0].name);
            }
          } else {
            console.error("Failed to fetch univariate analysis");
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingUnivariate(false);
        }
      }
    };
    fetchUnivariate();
  }, [currentStep, dataset, univariateReport]);

  useEffect(() => {
    const fetchInsights = async () => {
      if ((currentStep === 6 || currentStep === 7) && dataset && (!insightsReport || insightsReport.dataset_id !== dataset.dataset_id)) {
        setIsLoadingInsights(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/insights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: dataset.dataset_id })
          });
          if (response.ok) {
            const data = await response.json();
            setInsightsReport(data);
          } else {
            console.error("Failed to fetch insights");
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingInsights(false);
        }
      }
    };
    fetchInsights();
  }, [currentStep, dataset, insightsReport]);

  // Phase 3 Bivariate Init Fetch
  useEffect(() => {
    const fetchBivariateInit = async () => {
      if ((currentStep === 5 || currentStep === 7) && dataset && (!bivariateInitData || bivariateInitData.dataset_id !== dataset.dataset_id)) {
        setIsLoadingBivariate(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/bivariate/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: dataset.dataset_id })
          });
          if (response.ok) {
            const data = await response.json();
            setBivariateInitData(data);
            
            // Smart defaults for scatter plot based on strongest correlation pair or scan order
            const findDefaultCol = (cols) => {
              if (!cols || cols.length === 0) return '';
              const order = ['sellingprice', 'price', 'revenue', 'amount'];
              for (const target of order) {
                const found = cols.find(c => c.toLowerCase() === target);
                if (found) return found;
              }
              for (const target of order) {
                const found = cols.find(c => c.toLowerCase().includes(target));
                if (found) return found;
              }
              // Fallback to first numeric that doesn't look like 'year'
              const nonYear = cols.filter(c => !c.toLowerCase().includes('year') && !c.toLowerCase().includes('yr'));
              if (nonYear.length > 0) return nonYear[0];
              return cols[0];
            };

            if (data.strongest_pair) {
              setSelectedScatterX(data.strongest_pair.x);
              setSelectedScatterY(data.strongest_pair.y);
            } else if (data.numeric_columns && data.numeric_columns.length > 0) {
              const defaultX = findDefaultCol(data.numeric_columns);
              const remaining = data.numeric_columns.filter(c => c !== defaultX);
              const defaultY = findDefaultCol(remaining) || defaultX;
              setSelectedScatterX(defaultX);
              setSelectedScatterY(defaultY);
            }

            // Defaults for Category vs Numeric
            if (data.numeric_columns && data.numeric_columns.length > 0) {
              setSelectedNumCol(findDefaultCol(data.numeric_columns));
            }
            if (data.categorical_columns && data.categorical_columns.length > 0) {
              setSelectedCatCol(data.categorical_columns[0]);
            }
          } else {
            console.error("Failed to initialize bivariate analysis");
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingBivariate(false);
        }
      }
    };
    fetchBivariateInit();
  }, [currentStep, dataset, bivariateInitData]);

  // Fetch Scatter Plot Data
  useEffect(() => {
    const fetchScatterData = async () => {
      if (selectedScatterX === selectedScatterY) {
        setScatterReport(null);
        return;
      }
      if (currentStep === 5 && bivariateTab === 'scatter' && dataset && selectedScatterX && selectedScatterY) {
        setIsLoadingScatter(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/bivariate/scatter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataset_id: dataset.dataset_id,
              x_column: selectedScatterX,
              y_column: selectedScatterY,
              sample_size: 500
            })
          });
          if (response.ok) {
            const data = await response.json();
            setScatterReport(data);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingScatter(false);
        }
      }
    };
    fetchScatterData();
  }, [currentStep, bivariateTab, dataset, selectedScatterX, selectedScatterY]);

  // Fetch Category vs Numeric Data
  useEffect(() => {
    const fetchCatNumData = async () => {
      if (currentStep === 5 && bivariateTab === 'category' && dataset && selectedCatCol && selectedNumCol && catNumAggregation) {
        setIsLoadingCatNum(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/bivariate/category-numeric`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataset_id: dataset.dataset_id,
              category_column: selectedCatCol,
              numeric_column: selectedNumCol,
              aggregation: catNumAggregation,
              limit: catNumLimit
            })
          });
          if (response.ok) {
            const data = await response.json();
            setCatNumReport(data);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingCatNum(false);
        }
      }
    };
    fetchCatNumData();
  }, [currentStep, bivariateTab, dataset, selectedCatCol, selectedNumCol, catNumAggregation, catNumLimit]);

  // Fetch Dashboard data (Step 7)
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (currentStep === 7 && dataset) {
        setIsLoadingDashboard(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/dashboard/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataset_id: dataset.dataset_id,
              filter_column: selectedFilterCol || null,
              filter_value: selectedFilterVal || null
            })
          });
          if (response.ok) {
            const data = await response.json();
            setDashboardData(data);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingDashboard(false);
        }
      }
    };
    fetchDashboardData();
  }, [currentStep, dataset, selectedFilterCol, selectedFilterVal]);

  const fetchReports = async (datasetId) => {
    if (!datasetId) return;
    setIsReportsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/${datasetId}/reports?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setReportsList(data);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setIsReportsLoading(false);
    }
  };

  const handleGenerateReport = async (reportType) => {
    if (!dataset) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/${dataset.dataset_id}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType })
      });
      if (res.ok) {
        fetchReports(dataset.dataset_id);
        fetchHistory();
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to generate report.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during report generation.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchReports(dataset.dataset_id);
        fetchHistory();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  useEffect(() => {
    if ((currentStep === 7 || currentStep === 8) && dataset) {
      fetchReports(dataset.dataset_id);
    }
  }, [currentStep, dataset]);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans">
      
      {/* Premium Header */}
      <header className="border-b border-[#1E293B] bg-[#0B0F19]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="w-5 h-5 text-white animate-pulse-subtle" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                DataLens
              </span>
              <span className="ml-1.5 text-[10px] uppercase tracking-widest text-cyan-400 font-semibold bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/40">
                MVP v1.0
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {/* Toggle History Button */}
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                isHistoryOpen
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-500/10'
                  : 'bg-slate-900/50 border-[#1E293B] hover:border-slate-700 text-slate-400'
              }`}
              title="Toggle dataset history sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
              <span>Dataset History</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1.5 rounded-full border border-[#1E293B]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
              <span>Engine Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row items-stretch gap-6">
        
        {/* SIDEBAR: DATASET HISTORY */}
        {isHistoryOpen && (
          <aside className="w-full lg:w-[325px] shrink-0 glass-panel border border-[#1E293B] rounded-2xl flex flex-col h-[calc(100vh-140px)] lg:sticky lg:top-24 overflow-hidden animate-fade-in">
            
            {/* Sidebar Header */}
            <div className="p-4 border-b border-[#1E293B] space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-white">Dataset History</h3>
                </div>
                {historyStats && (
                  <span className="text-[10px] bg-indigo-950/50 text-indigo-300 border border-indigo-900/40 px-1.5 py-0.5 rounded font-semibold font-mono">
                    {historyStats.total_datasets} total
                  </span>
                )}
              </div>
              
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search datasets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#1E293B] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Filters dropdown & sort toggles */}
              <div className="flex items-center gap-1.5 justify-between">
                <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'original', label: 'Orig' },
                    { id: 'cleaned', label: 'Cleaned' },
                    { id: 'favorites', label: '★ Favs' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTypeFilter(f.id)}
                      className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all ${
                        typeFilter === f.id
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                          : 'bg-transparent border-[#1E293B] hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-[#0b0f19] border border-[#1E293B] text-[10px] text-slate-350 rounded-lg p-1 outline-none cursor-pointer max-w-[100px]"
                >
                  <option value="last_opened">Recent</option>
                  <option value="upload_timestamp">Uploaded</option>
                  <option value="file_size">Size</option>
                </select>
              </div>
            </div>

            {/* Sidebar Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar bg-[#0B0F19]/25">
              {isHistoryLoading && history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mb-2 text-indigo-400" />
                  <span>Loading history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-center px-4">
                  <Database className="w-8 h-8 mb-2.5 text-slate-700" />
                  <p className="text-xs font-semibold text-slate-450">Upload a dataset to begin building your analysis history.</p>
                </div>
              ) : filteredHistory().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-center px-4">
                  <Database className="w-8 h-8 mb-2.5 text-slate-700" />
                  <p className="text-xs font-semibold text-slate-450">No datasets found</p>
                  <p className="text-[10px] text-slate-550 mt-1">Upload a dataset or adjust search filters.</p>
                </div>
              ) : (
                filteredHistory().map((item) => {
                  const isActive = dataset && dataset.dataset_id === item.dataset_id;
                  return (
                    <div
                      key={item.dataset_id}
                      className={`group p-3 rounded-xl border transition-all relative flex flex-col justify-between ${
                        isActive
                          ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-500/5'
                          : 'bg-[#151D30]/20 border-[#1E293B] hover:border-[#1E293B]/80 hover:bg-[#151D30]/40'
                      } ${item.is_favorite ? 'ring-1 ring-amber-400/40 bg-amber-950/5' : ''}`}
                    >
                      {/* Dataset Info Section */}
                      <div
                        className="cursor-pointer flex-1 min-w-0"
                        onClick={() => loadDatasetFromHistory(item.dataset_id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            {item.is_favorite && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                            <h4 className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-slate-250 group-hover:text-white'}`} title={item.filename}>
                              {item.filename}
                            </h4>
                          </div>
                          <span className={`text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded uppercase font-bold ${
                            item.dataset_type === 'cleaned'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                              : 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/40'
                          }`}>
                            {item.dataset_type}
                          </span>
                        </div>

                        {/* Parent connection if cleaned */}
                        {item.dataset_type === 'cleaned' && item.parent_filename && (
                          <div className="text-[9px] text-slate-500 mt-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/50 border border-[#1E293B]/40 max-w-full">
                            <span className="text-[8px] uppercase tracking-wider text-cyan-400 font-bold shrink-0">Parent:</span>
                            <span className="truncate font-mono text-slate-400" title={item.parent_filename}>{item.parent_filename}</span>
                          </div>
                        )}

                        {/* Meta stats line */}
                        <div className="text-[10px] text-slate-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{item.row_count?.toLocaleString()} rows</span>
                          <span className="text-slate-700">•</span>
                          <span>{item.column_count} cols</span>
                          <span className="text-slate-700">•</span>
                          <span>{formatFileSize(item.file_size)}</span>
                        </div>

                        {/* Bottom opened time / reports line */}
                        <div className="text-[9px] text-slate-500 mt-2.5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            Opened: {formatTimeAgo(item.last_opened)}
                          </span>
                          
                          {((item.reports_generated && item.reports_generated.length > 0) || (item.report_count > 0)) && (
                            <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                              📄 {item.report_count || item.reports_generated.length} reports
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Floating actions */}
                      <div className="flex items-center gap-1 absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#151D30] border border-[#1E293B] px-1 py-0.5 rounded-lg shadow-lg">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.dataset_id, item.is_favorite);
                          }}
                          className={`p-1 rounded transition-colors ${
                            item.is_favorite
                              ? 'text-amber-400 hover:text-amber-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          }`}
                          title={item.is_favorite ? 'Remove Favorite' : 'Mark Favorite'}
                        >
                          <Star className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDataset(item.dataset_id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Delete Dataset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Stats Footer */}
            {historyStats && (
              <div className="p-3 border-t border-[#1E293B] bg-[#0b0f19]/80 shrink-0 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-[#151D30]/20 p-1.5 rounded border border-[#1E293B]/60">
                  <div className="text-slate-500 font-medium">Original</div>
                  <div className="font-bold text-indigo-400 font-mono mt-0.5">{historyStats.original_datasets}</div>
                </div>
                <div className="bg-[#151D30]/20 p-1.5 rounded border border-[#1E293B]/60">
                  <div className="text-slate-500 font-medium">Cleaned</div>
                  <div className="font-bold text-emerald-400 font-mono mt-0.5">{historyStats.cleaned_datasets}</div>
                </div>
                <div className="bg-[#151D30]/20 p-1.5 rounded border border-[#1E293B]/60">
                  <div className="text-slate-500 font-medium">Favorites</div>
                  <div className="font-bold text-amber-400 font-mono mt-0.5">{historyStats.favorite_datasets}</div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* WORKSPACE COLUMN */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 w-full">
        
        {/* IDLE / DROPZONE STATE */}
        {status === 'idle' && (
          <div className="w-full max-w-3xl flex flex-col items-center text-center animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
              Understand your data,{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                instantly.
              </span>
            </h1>
            <p className="text-slate-400 max-w-lg mb-10 text-sm md:text-base leading-relaxed">
              Upload any CSV or Excel sheet. We will scan structure, clean outliers, and extract descriptive insights in seconds.
            </p>

            {/* Drag and Drop Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`w-full p-12 rounded-2xl glass-panel cursor-pointer transition-all duration-300 relative group flex flex-col items-center justify-center border-2 border-dashed ${
                isDragActive
                  ? 'border-cyan-400 bg-cyan-950/10 shadow-lg shadow-cyan-500/5Scale'
                  : 'border-[#1E293B] hover:border-indigo-500/50 hover:bg-[#151D30]/40'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv, .xlsx, .xls"
                className="block text-slate-300 bg-slate-900 border border-[#1E293B] rounded-lg p-2 mb-4"
                id="file-input-visible"
              />
              <div className="w-16 h-16 rounded-2xl bg-slate-800/40 border border-[#1E293B] flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110 group-hover:border-indigo-500/30 group-hover:bg-[#151D30]">
                <Upload className="w-7 h-7 text-indigo-400 group-hover:text-cyan-400 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Drag and drop your dataset
              </h3>
              <p className="text-slate-400 text-xs mb-4">
                Supports CSV, XLSX, or XLS files up to 25MB
              </p>
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-sm font-medium hover:brightness-110 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all text-white"
              >
                Browse Files
              </button>
            </div>
          </div>
        )}

        {/* LOADING / SCANNING STATE */}
        {status === 'uploading' && (
          <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-[#1E293B] flex flex-col items-center animate-fade-in text-center">
            <div className="relative w-24 h-24 mb-8">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
              {/* Inner glowing pulse */}
              <div className="absolute inset-2 rounded-full bg-cyan-950/20 flex items-center justify-center">
                <Database className="w-8 h-8 text-cyan-400 animate-bounce" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">Analyzing Dataset</h3>
            <p className="text-xs text-cyan-400 font-semibold mb-6 animate-pulse-subtle">
              {processingSteps[activeStep]}
            </p>

            {/* Detailed loader stepper */}
            <div className="w-full text-left space-y-3 bg-[#0B0F19]/40 p-4 rounded-xl border border-[#1E293B]/60">
              {processingSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    idx < activeStep 
                      ? 'bg-emerald-500' 
                      : idx === activeStep 
                      ? 'bg-cyan-400 animate-ping' 
                      : 'bg-slate-700'
                  }`} />
                  <span className={`text-[11px] font-medium ${
                    idx <= activeStep ? 'text-slate-200' : 'text-slate-600'
                  }`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {status === 'error' && (
          <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-rose-500/20 flex flex-col items-center text-center animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-rose-950/30 border border-rose-800/40 flex items-center justify-center mb-6">
              <AlertCircle className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Analysis Failed</h3>
            <p className="text-slate-400 text-sm mb-6 max-w-xs leading-relaxed">
              {errorMessage || "We couldn't compile that file. Check that it is a properly formatted CSV or Excel document."}
            </p>
            <button
              onClick={resetUpload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-[#1E293B] hover:bg-slate-700 hover:border-slate-600 text-sm font-medium transition-all text-white active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Try Uploading Again
            </button>
          </div>
        )}

        {/* SUCCESS STATE (METADATA + BASIC CHART) */}
        {status === 'success' && dataset && (
          <div className="w-full space-y-6 animate-slide-up">
            
            {/* Context breadcrumb & details bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#151D30]/30 border border-[#1E293B] p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-semibold text-white">{dataset.filename}</h4>
                  <p className="text-[10px] text-cyan-400 font-mono tracking-tight">{dataset.dataset_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={resetUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-slate-300 transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Analyze New File
                </button>
              </div>
            </div>

            {/* Step Navigation Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#1E293B] no-scrollbar">
              {[
                { id: 1, label: "1. Overview & Charts", desc: "Schema & Visualizer" },
                { id: 2, label: "2. Data Cleaning", desc: "Resolve nulls & duplicates" },
                { id: 3, label: "3. Descriptive Stats", desc: "Metric summarization" },
                { id: 4, label: "4. Univariate", desc: "Histograms & frequency" },
                { id: 5, label: "5. Bivariate", desc: "Scatters & correlations" },
                { id: 6, label: "6. Insights", desc: "Prioritized anomalies" },
                { id: 7, label: "7. Dashboard", desc: "Unified interactive view" },
                { id: 8, label: "8. Report Center", desc: "PDF exports & management" }
              ].map((step) => {
                // Determine if this step is unlocked
                let isUnlocked = false;
                if (step.id === 1 || step.id === 2) {
                  isUnlocked = true;
                } else {
                  const isAlreadyClean = (!dataset.missing_value_report || dataset.missing_value_report.length === 0) && dataset.duplicate_row_count === 0;
                  isUnlocked = cleanResult !== null || isAlreadyClean;
                }
                
                const isActive = currentStep === step.id;

                return (
                  <button
                    key={step.id}
                    onClick={() => isUnlocked && setCurrentStep(step.id)}
                    disabled={!isUnlocked}
                    className={`flex flex-col items-start px-4.5 py-2 rounded-xl border transition-all shrink-0 text-left ${
                      isActive
                        ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-lg shadow-indigo-500/5'
                        : isUnlocked
                        ? 'bg-[#151D30]/20 border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#151D30]/40'
                        : 'bg-transparent border-transparent text-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      {step.label}
                      {!isUnlocked && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-900 text-slate-600 border border-slate-800">
                          Locked
                        </span>
                      )}
                      {step.id >= 3 && isUnlocked && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 font-mono">
                          Unlocked
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 font-normal truncate max-w-[150px]">{step.desc}</span>
                  </button>
                );
              })}
            </div>

            <WorkspaceErrorBoundary key={currentStep} onReset={() => setCurrentStep(1)}>
              {/* STEP 1: DATASET OVERVIEW & VISUAL ANALYZER */}
              {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                {/* Quick Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="glass-panel p-4 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Rows Detected</span>
                    <span className="text-2xl font-bold text-white mt-1">{dataset.row_count.toLocaleString()}</span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Columns Detected</span>
                    <span className="text-2xl font-bold text-white mt-1">{dataset.column_count}</span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Numerical Columns</span>
                    <span className="text-2xl font-bold text-indigo-400 mt-1">
                      {dataset.columns.filter(c => c.type === 'numeric').length}
                    </span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Categorical Columns</span>
                    <span className="text-2xl font-bold text-cyan-400 mt-1">
                      {dataset.columns.filter(c => c.type === 'categorical').length}
                    </span>
                  </div>
                </div>

                {/* Dashboard Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Column list explorer (Left 1/3) */}
                  <div className="glass-panel p-6 rounded-xl border border-[#1E293B] flex flex-col h-[420px]">
                    <div className="flex items-center gap-2 mb-4">
                      <Database className="w-4 h-4 text-indigo-400" />
                      <h3 className="font-semibold text-sm text-white">Schema Navigator</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-1 space-y-2 no-scrollbar">
                      {dataset.columns.map((col, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-[#1E293B]/50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full ${col.type === 'numeric' ? 'bg-indigo-500' : 'bg-cyan-400'}`} />
                            <span className="truncate text-slate-200 font-medium">{col.name}</span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            col.type === 'numeric'
                              ? 'bg-indigo-950/50 text-indigo-300 border border-indigo-900/40'
                              : 'bg-cyan-950/50 text-cyan-300 border border-cyan-900/40'
                          }`}>
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-[#1E293B] flex items-center justify-between text-[10px] text-slate-400">
                      <span>Numeric Color: Indigo</span>
                      <span>Categorical Color: Cyan</span>
                    </div>
                  </div>

                  {/* Main Chart Viewer (Right 2/3) */}
                  <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-[#1E293B] flex flex-col h-[420px] justify-between">
                    {/* Chart header control */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                          <BarChart2 className="w-4 h-4 text-cyan-400" />
                          Visual Analyzer
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Rendering: <span className="text-indigo-400 font-medium">{dataset.chart_column}</span> (Reason: {dataset.chart_column_reason || "first numeric"})
                        </p>
                      </div>
                      
                      {/* Chart switches */}
                      <div className="flex items-center gap-1.5 bg-slate-950/50 p-1 rounded-lg border border-[#1E293B]">
                        <button
                          onClick={() => setChartType('area')}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            chartType === 'area'
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Area
                        </button>
                        <button
                          onClick={() => setChartType('line')}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            chartType === 'line'
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Line
                        </button>
                      </div>
                    </div>

                    {/* Recharts chart area */}
                    <div className="flex-1 h-[220px] w-full flex items-center justify-center">
                      {!dataset.chart_column ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <EyeOff className="w-12 h-12 text-slate-500 mb-3 animate-pulse-subtle" />
                          <h4 className="text-sm font-bold text-white">No Chartable Data</h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm">
                            All numeric columns in this dataset appear to be IDs or categorical codes.
                          </p>
                        </div>
                      ) : dataset.chart_data && dataset.chart_data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === 'area' ? (
                            <AreaChart
                              data={dataset.chart_data}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.5} />
                              <XAxis
                                dataKey="label"
                                stroke="#64748B"
                                fontSize={10}
                                tickLine={false}
                                dy={10}
                              />
                              <YAxis
                                stroke="#64748B"
                                fontSize={10}
                                tickLine={false}
                                dx={-5}
                                tickFormatter={formatYAxisTick}
                              />
                              <Tooltip content={<CustomTooltip />} />
                              <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#4F46E5"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#chartGradient)"
                                connectNulls
                              />
                            </AreaChart>
                          ) : (
                            <LineChart
                              data={dataset.chart_data}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.5} />
                              <XAxis
                                dataKey="label"
                                stroke="#64748B"
                                fontSize={10}
                                tickLine={false}
                                dy={10}
                              />
                              <YAxis
                                stroke="#64748B"
                                fontSize={10}
                                tickLine={false}
                                dx={-5}
                                tickFormatter={formatYAxisTick}
                              />
                              <Tooltip content={<CustomTooltip />} />
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#4F46E5"
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                              />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center text-slate-500 text-xs">
                          No numerical values to represent in this dataset.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between text-[11px] text-slate-400">
                      {dataset.chart_column ? (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          Previewing {dataset.chart_data ? dataset.chart_data.length : 0} representative points.
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          No active visualization preview.
                        </span>
                      )}
                      <span>Chronologically sorted order.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: DATA QUALITY & CLEANING */}
            {currentStep === 2 && (
              <div className="glass-panel p-6 rounded-xl border border-[#1E293B] animate-slide-up min-h-[420px] flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse-subtle" />
                    <h3 className="font-semibold text-base text-white">Data Quality & Cleaning</h3>
                  </div>
                  <div className="text-xs text-slate-400">
                    Analyze issues and repair your dataset
                  </div>
                </div>

                {/* No Issues State */}
                {(!dataset.missing_value_report || dataset.missing_value_report.length === 0) && dataset.duplicate_row_count === 0 && !cleanResult ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4 animate-bounce" />
                    <h4 className="text-base font-bold text-white">Data is Already Clean!</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      No missing values or duplicate rows were detected in this dataset. You are ready to explore other tabs.
                    </p>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="mt-6 px-5 py-2.5 rounded-xl bg-slate-800 border border-[#1E293B] hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all active:scale-95"
                    >
                      Proceed to Descriptive Stats
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 flex-1 flex flex-col justify-between">
                    {/* Clean Result Summary Card */}
                    {cleanResult && (
                      <div className="space-y-4 animate-fade-in mb-6">
                        {/* Confirmation Header Banner */}
                        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Cleaning Session Complete</h4>
                            <p className="text-xs text-slate-300 mt-1 font-semibold">
                              Successfully cleaned the dataset.
                            </p>
                            <div className="text-xs text-slate-400 mt-1.5 space-y-0.5">
                              <div>• Missing Values: <span className="font-mono">{cleanResult.cleaning_summary?.missing_before ?? 0}</span> → <span className="font-mono text-emerald-400 font-semibold">{cleanResult.cleaning_summary?.missing_after ?? 0}</span></div>
                              <div>• Duplicate Rows: <span className="font-mono">{cleanResult.cleaning_summary?.duplicates_before ?? 0}</span> → <span className="font-mono text-emerald-400 font-semibold">{cleanResult.cleaning_summary?.duplicates_after ?? 0}</span></div>
                              <div>• Rows Removed: <span className="font-mono text-amber-400 font-semibold">{cleanResult.cleaning_summary?.rows_removed ?? 0}</span></div>
                              <div>• Columns Modified: <span className="font-mono text-indigo-400 font-semibold">{cleanResult.cleaning_summary?.columns_modified ?? 0}</span></div>
                            </div>
                            <p className="text-[10px] text-cyan-400 font-mono mt-1">
                              New Dataset Reference ID: {cleanResult.cleaned_dataset_id}
                            </p>
                          </div>
                        </div>

                        {/* Summary Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* Missing Values before -> after */}
                          <div className="p-4 rounded-xl bg-slate-900/40 border border-[#1E293B]/60 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Missing Values</span>
                            <div className="flex items-baseline gap-2 mt-2">
                              <span className="text-slate-400 font-mono text-xs">{(cleanResult.cleaning_summary?.missing_before ?? 0).toLocaleString()}</span>
                              <span className="text-slate-500 text-xs">→</span>
                              <span className="text-lg font-bold text-emerald-400 font-mono">
                                {(cleanResult.cleaning_summary?.missing_after ?? 0).toLocaleString()}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-500 mt-1">
                              {(cleanResult.cleaning_summary?.missing_before ?? 0) - (cleanResult.cleaning_summary?.missing_after ?? 0) > 0 
                                ? `Resolved ${((cleanResult.cleaning_summary?.missing_before ?? 0) - (cleanResult.cleaning_summary?.missing_after ?? 0)).toLocaleString()} entries`
                                : 'No change'}
                            </span>
                          </div>

                          {/* Duplicate Rows before -> after */}
                          <div className="p-4 rounded-xl bg-slate-900/40 border border-[#1E293B]/60 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duplicate Rows</span>
                            <div className="flex items-baseline gap-2 mt-2">
                              <span className="text-slate-400 font-mono text-xs">{(cleanResult.cleaning_summary?.duplicates_before ?? 0).toLocaleString()}</span>
                              <span className="text-slate-500 text-xs">→</span>
                              <span className="text-lg font-bold text-emerald-400 font-mono">
                                {(cleanResult.cleaning_summary?.duplicates_after ?? 0).toLocaleString()}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-500 mt-1">
                              Removed {(cleanResult.cleaning_summary?.duplicate_rows_removed ?? 0).toLocaleString()} duplicate rows
                            </span>
                          </div>

                          {/* Rows Removed */}
                          <div className="p-4 rounded-xl bg-slate-900/40 border border-[#1E293B]/60 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rows Removed</span>
                            <span className="text-xl font-bold text-amber-400 font-mono mt-2">
                              {(cleanResult.cleaning_summary?.rows_removed ?? 0).toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-500 mt-1">
                              {(cleanResult.cleaning_summary?.null_rows_dropped ?? 0).toLocaleString()} dropped via strategies
                            </span>
                          </div>
                        </div>

                        {/* Strategy details */}
                        {cleanResult.cleaning_summary?.columns_cleaned && cleanResult.cleaning_summary.columns_cleaned.length > 0 && (
                          <div className="p-4 rounded-xl bg-slate-900/40 border border-[#1E293B]/60">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                              Cleaning Strategy Applied ({cleanResult.cleaning_summary.columns_modified} columns modified)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {cleanResult.cleaning_summary.columns_cleaned.map((colName) => {
                                const strategy = appliedStrategies[colName] || 'leave_as_is';
                                const strategyLabels = {
                                  mean: "Fill with Mean",
                                  median: "Fill with Median",
                                  mode: "Fill with Mode",
                                  unknown_placeholder: "Fill with 'Unknown'",
                                  drop_rows: "Drop rows",
                                  leave_as_is: "Leave as-is"
                                };
                                return (
                                  <div 
                                    key={colName}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151D30]/60 border border-[#1E293B] text-[11px]"
                                  >
                                    <span className="text-slate-300 font-medium">{colName}</span>
                                    <span className="text-slate-500 font-light">•</span>
                                    <span className="text-cyan-400 font-mono text-[10px]">
                                      {strategyLabels[strategy] || strategy}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                      {/* Missing values list */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                          Missing Values Report {dataset.missing_value_report && dataset.missing_value_report.length > 0 ? `(${dataset.missing_value_report.length} columns)` : ''}
                        </h4>
                        
                        {dataset.missing_value_report && dataset.missing_value_report.length > 0 ? (
                          <div className="space-y-3 max-h-[260px] overflow-y-auto no-scrollbar pr-1">
                            {dataset.missing_value_report.map((report, idx) => (
                              <div key={idx} className="p-3.5 rounded-lg bg-slate-900/40 border border-[#1E293B]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-200 truncate">{report.column_name}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-950/40 text-indigo-300 border border-indigo-900/40 uppercase">
                                      {report.column_type}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1">
                                    Missing: <span className="text-accent font-semibold">{report.missing_count}</span> ({report.missing_percentage}%)
                                  </div>
                                </div>

                                {/* Dropdown selector */}
                                <select
                                  value={columnStrategies[report.column_name] || report.suggested_strategy}
                                  onChange={(e) => handleStrategyChange(report.column_name, e.target.value)}
                                  className="bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer min-w-[140px]"
                                >
                                  <option value="leave_as_is">Leave as-is</option>
                                  <option value="drop_rows">Drop rows</option>
                                  {report.column_type === 'numeric' ? (
                                    <>
                                      <option value="mean">Fill with Mean</option>
                                      <option value="median">Fill with Median</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="mode">Fill with Mode</option>
                                      <option value="unknown_placeholder">Fill with 'Unknown'</option>
                                    </>
                                  )}
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 rounded-lg bg-slate-900/20 border border-[#1E293B]/40 text-center flex flex-col items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                            <span className="text-xs text-slate-450 font-medium">No missing values detected.</span>
                          </div>
                        )}
                      </div>

                      {/* Duplicates and Action Panel */}
                      <div className="flex flex-col justify-between h-full space-y-6">
                        <div className="space-y-4">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                            Row Redundancy Analysis
                          </h4>
                          
                          <div className="p-4 rounded-lg bg-slate-900/40 border border-[#1E293B]/60 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-slate-200">Duplicate Rows Detected</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">Identifies identical records across all columns</p>
                              </div>
                              <div className="text-right">
                                <span className={`text-sm font-bold ${dataset.duplicate_row_count > 0 ? 'text-accent' : 'text-emerald-500'}`}>
                                  {dataset.duplicate_row_count}
                                </span>
                              </div>
                            </div>
                            {dataset.duplicate_row_count === 0 && (
                              <p className="text-[10px] text-emerald-400 font-semibold font-mono border-t border-emerald-950/40 pt-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                No duplicate rows detected.
                              </p>
                            )}
                          </div>

                          {dataset.duplicate_row_count > 0 && (
                            <label className="flex items-center gap-3 cursor-pointer group p-1.5">
                              <input
                                type="checkbox"
                                checked={removeDuplicates}
                                onChange={(e) => setRemoveDuplicates(e.target.checked)}
                                className="w-4 h-4 rounded border-[#1E293B] bg-[#151D30] text-indigo-600 focus:ring-0 cursor-pointer"
                              />
                              <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors">
                                Remove duplicate rows from dataset
                              </span>
                            </label>
                          )}
                        </div>

                        <div className="pt-4 border-t border-[#1E293B]/60 flex items-center justify-end gap-3">
                          {cleanResult && (
                            <button
                              onClick={() => setCurrentStep(3)}
                              className="px-5 py-2.5 rounded-xl bg-slate-800 border border-[#1E293B] hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-all active:scale-95"
                            >
                              Proceed to Stats
                            </button>
                          )}
                          <button
                            onClick={cleanDataset}
                            disabled={isCleaning}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:brightness-110 active:scale-95 transition-all text-xs font-semibold text-white shadow-lg shadow-indigo-500/15 disabled:opacity-50 disabled:scale-100"
                          >
                            {isCleaning ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Cleaning dataset...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Clean Dataset
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: DESCRIPTIVE STATISTICS */}
            {currentStep === 3 && (
              <div className="glass-panel p-6 rounded-xl border border-[#1E293B] animate-slide-up min-h-[420px] flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold text-base text-white">Descriptive Statistics</h3>
                  </div>
                  <div className="text-xs text-slate-400">
                    Summary metrics for numeric columns
                  </div>
                </div>

                {isLoadingStats ? (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                    <span className="text-xs text-slate-400">Calculating descriptive statistics...</span>
                  </div>
                ) : statsReport && statsReport.stats && Object.keys(statsReport.stats).length > 0 ? (
                  <div className="flex-1 overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1E293B] text-slate-400 font-semibold uppercase tracking-wider">
                          <th className="py-3 px-4">Metric / Column</th>
                          {Object.keys(statsReport.stats).map((colName) => (
                            <th key={colName} className="py-3 px-4 font-bold text-slate-200">
                              {colName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B]/40 text-slate-300">
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Mean</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.mean !== null ? s.mean.toLocaleString() : 'N/A'}>
                              {s.mean !== null ? formatValueBySemanticType(s.mean, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Median</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.median !== null ? s.median.toLocaleString() : 'N/A'}>
                              {s.median !== null ? formatValueBySemanticType(s.median, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Mode</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.mode !== null ? s.mode.toLocaleString() : 'N/A'}>
                              {s.mode !== null ? formatValueBySemanticType(s.mode, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Std Dev</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.std !== null ? s.std.toLocaleString() : 'N/A'}>
                              {s.std !== null ? formatValueBySemanticType(s.std, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Variance</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.var !== null ? s.var.toLocaleString() : 'N/A'}>
                              {s.var !== null ? formatValueBySemanticType(s.var, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Min</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.min !== null ? s.min.toLocaleString() : 'N/A'}>
                              {s.min !== null ? formatValueBySemanticType(s.min, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">25% (Q1)</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.q1 !== null ? s.q1.toLocaleString() : 'N/A'}>
                              {s.q1 !== null ? formatValueBySemanticType(s.q1, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">50% (Q2)</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.q2 !== null ? s.q2.toLocaleString() : 'N/A'}>
                              {s.q2 !== null ? formatValueBySemanticType(s.q2, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">75% (Q3)</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.q3 !== null ? s.q3.toLocaleString() : 'N/A'}>
                              {s.q3 !== null ? formatValueBySemanticType(s.q3, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Max</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono" title={s.max !== null ? s.max.toLocaleString() : 'N/A'}>
                              {s.max !== null ? formatValueBySemanticType(s.max, s.semantic_type) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-slate-900/20">
                          <td className="py-2.5 px-4 font-medium text-slate-400">Missing Values</td>
                          {Object.values(statsReport.stats).map((s, i) => (
                            <td key={i} className="py-2.5 px-4 font-mono text-cyan-400">
                              {s.missing_count} ({s.missing_percentage}%)
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <Database className="w-12 h-12 text-slate-600 mb-3" />
                    <span className="text-xs text-slate-500">No numeric columns found in this dataset.</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-end">
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15"
                  >
                    Proceed to Univariate Analysis
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: UNIVARIATE ANALYSIS */}
            {currentStep === 4 && (
              <div className="glass-panel p-6 rounded-xl border border-[#1E293B] animate-slide-up min-h-[420px] flex flex-col justify-between">
                
                {/* Header Control */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E293B] pb-4 mb-6">
                  <div>
                    <h3 className="font-semibold text-base text-white flex items-center gap-1.5">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      Univariate Analysis
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Explore distributions and ranges for single columns</p>
                  </div>

                  {/* Dropdown column selector */}
                  {dataset && dataset.columns && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-medium">Select Column:</span>
                      <select
                        value={selectedUnivariateCol}
                        onChange={(e) => setSelectedUnivariateCol(e.target.value)}
                        className="bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer min-w-[160px]"
                      >
                        {dataset.columns.map((col, idx) => (
                          <option key={idx} value={col.name}>
                            {col.type === 'numeric' ? '📊 ' : '🔤 '} {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {isLoadingUnivariate ? (
                  <div className="flex flex-col items-center justify-center py-24 flex-1">
                    <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mb-4" />
                    <span className="text-xs text-slate-400">Loading single-column distribution analysis...</span>
                  </div>
                ) : univariateReport && selectedUnivariateCol ? (
                  (() => {
                    const isNum = selectedUnivariateCol in univariateReport.numeric_analysis;
                    const numStats = isNum ? univariateReport.numeric_analysis[selectedUnivariateCol] : null;
                    const catStats = !isNum ? univariateReport.categorical_analysis[selectedUnivariateCol] : null;

                    if (isNum && numStats) {
                      const formattedHistogram = numStats.histogram?.map(entry => {
                        if (numStats.semantic_type === 'year') {
                          const parts = entry.bin_label.split(/\s*-\s*|\s*–\s*/);
                          if (parts.length === 2) {
                            const start = Number(parts[0]);
                            const end = Number(parts[1]);
                            if (!isNaN(start) && !isNaN(end)) {
                              return {
                                ...entry,
                                bin_label: `${Math.floor(start)}–${Math.ceil(end)}`
                              };
                            }
                          }
                        }
                        return entry;
                      }) || [];

                      const outlierPctStr = numStats.boxplot.total_count && numStats.boxplot.total_count > 0
                        ? `${((numStats.boxplot.outlier_count / numStats.boxplot.total_count) * 100).toFixed(2)}%`
                        : '0%';

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 items-stretch">
                          
                          {/* Left: Histogram (3/5 width) */}
                          <div className="lg:col-span-3 flex flex-col justify-between h-[280px]">
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Histogram (Value Frequency Bins)</h4>
                              <p className="text-[10px] text-slate-400 mb-2">Bins automatically calculated using standard edges.</p>
                            </div>
                            <div className="flex-1 w-full min-h-[200px]">
                              {formattedHistogram.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart
                                    data={formattedHistogram}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.4} />
                                    <XAxis
                                      dataKey="bin_label"
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      angle={-30}
                                      textAnchor="end"
                                      dx={-2}
                                      dy={5}
                                    />
                                    <YAxis
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      dx={-5}
                                      tickFormatter={formatYAxisTick}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar
                                      dataKey="count"
                                      fill="#818CF8"
                                      radius={[4, 4, 0, 0]}
                                    >
                                      {formattedHistogram.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill="#818CF8" fillOpacity={0.85} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="text-slate-500 text-xs text-center py-10">No histogram data generated.</div>
                              )}
                            </div>
                          </div>

                          {/* Right: Box Plot details (2/5 width) */}
                          <div className="lg:col-span-2 p-4.5 rounded-xl bg-slate-900/40 border border-[#1E293B]/60 flex flex-col justify-between h-[280px]">
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5">Box Plot Bounds & Outliers</h4>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">Minimum</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.min, 'min')}>{formatValueBySemanticType(numStats.boxplot.min, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">25% (Q1)</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.q1, 'q1')}>{formatValueBySemanticType(numStats.boxplot.q1, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">Median (Q2)</span>
                                  <span className="font-mono text-slate-200 text-cyan-400" title={safeToLocaleString(numStats.boxplot.median, 'median')}>{formatValueBySemanticType(numStats.boxplot.median, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">75% (Q3)</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.q3, 'q3')}>{formatValueBySemanticType(numStats.boxplot.q3, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">Maximum</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.max, 'max')}>{formatValueBySemanticType(numStats.boxplot.max, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">IQR</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.iqr, 'iqr')}>{formatValueBySemanticType(numStats.boxplot.iqr, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">Lower Fence</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.lower_fence, 'lower_fence')}>{formatValueBySemanticType(numStats.boxplot.lower_fence, numStats.semantic_type)}</span>
                                </div>
                                <div className="flex justify-between border-b border-[#1E293B]/40 py-1">
                                  <span className="text-slate-400">Upper Fence</span>
                                  <span className="font-mono text-slate-200" title={safeToLocaleString(numStats.boxplot.upper_fence, 'upper_fence')}>{formatValueBySemanticType(numStats.boxplot.upper_fence, numStats.semantic_type)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Horizontal visual box plot */}
                            <div className="mt-3.5 space-y-1.5">
                              <div className="flex justify-between text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                                <span>Visual Box Range</span>
                                <span className={numStats.boxplot.outlier_count > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                                  Outliers: {numStats.boxplot.outlier_count} ({outlierPctStr})
                                </span>
                              </div>
                              <div className="relative w-full h-5 bg-slate-950/40 rounded border border-[#1E293B] flex items-center">
                                {/* Line from min to max */}
                                <div className="absolute left-4 right-4 h-0.5 bg-slate-700"></div>
                                {/* Box from Q1 to Q3 */}
                                <div className="absolute h-3.5 bg-indigo-600/30 border border-indigo-500/80 rounded" style={{
                                  left: `${Math.max(4, Math.min(85, ((numStats.boxplot.q1 - numStats.boxplot.min) / (numStats.boxplot.max - numStats.boxplot.min || 1)) * 80 + 10))}%`,
                                  right: `${Math.max(4, Math.min(85, 100 - (((numStats.boxplot.q3 - numStats.boxplot.min) / (numStats.boxplot.max - numStats.boxplot.min || 1)) * 80 + 10)))}%`
                                }}></div>
                                {/* Median line */}
                                <div className="absolute h-4.5 w-0.5 bg-cyan-400" style={{
                                  left: `${Math.max(4, Math.min(94, ((numStats.boxplot.median - numStats.boxplot.min) / (numStats.boxplot.max - numStats.boxplot.min || 1)) * 80 + 10))}%`
                                }}></div>
                              </div>
                              <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                                <span>Min: {formatValueBySemanticType(numStats.boxplot.min, numStats.semantic_type)}</span>
                                <span>Med: {formatValueBySemanticType(numStats.boxplot.median, numStats.semantic_type)}</span>
                                <span>Max: {formatValueBySemanticType(numStats.boxplot.max, numStats.semantic_type)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    } else if (catStats && catStats.frequencies) {
                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 items-stretch">
                          
                          {/* Left: Category frequency chart (3/5 width) */}
                          <div className="lg:col-span-3 flex flex-col justify-between h-[280px]">
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Category Frequencies</h4>
                              <p className="text-[10px] text-slate-400 mb-2">Frequencies for top categories (with remaining in Other).</p>
                            </div>
                            <div className="flex-1 w-full min-h-[200px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={catStats.frequencies}
                                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.4} />
                                  <XAxis
                                    dataKey="category"
                                    stroke="#64748B"
                                    fontSize={9}
                                    tickLine={false}
                                    angle={-30}
                                    textAnchor="end"
                                    dx={-2}
                                    dy={5}
                                  />
                                  <YAxis
                                    stroke="#64748B"
                                    fontSize={9}
                                    tickLine={false}
                                    dx={-5}
                                    tickFormatter={formatYAxisTick}
                                  />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Bar
                                    dataKey="count"
                                    fill="#22D3EE"
                                    radius={[4, 4, 0, 0]}
                                  >
                                    {catStats.frequencies.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill="#22D3EE" fillOpacity={0.85} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Right: Breakdown Table (2/5 width) */}
                          <div className="lg:col-span-2 p-4.5 rounded-xl bg-slate-900/40 border border-[#1E293B]/60 flex flex-col justify-between h-[280px]">
                            <div className="flex-1 overflow-y-auto no-scrollbar">
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3.5">Category Breakdown</h4>
                              <div className="space-y-2.5 text-xs">
                                {catStats.frequencies.map((freq, idx) => (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex justify-between text-[11px]">
                                      <span className="text-slate-300 font-semibold truncate max-w-[120px]">{freq.category}</span>
                                      <span className="text-slate-400 font-mono">{freq.count.toLocaleString()} ({freq.percentage}%)</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${freq.percentage}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                        </div>
                      );
                    }
                    return null;
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <Database className="w-12 h-12 text-slate-600 mb-3" />
                    <span className="text-xs text-slate-500">No analysis data loaded.</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-end">
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15"
                  >
                    Proceed to Bivariate Analysis
                  </button>
                </div>

              </div>
            )}

            {/* STEP 6: INSIGHTS ENGINE */}
            {currentStep === 6 && (
              <div className="glass-panel p-6 rounded-xl border border-[#1E293B] animate-slide-up min-h-[420px] flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse-subtle" />
                    <h3 className="font-semibold text-base text-white">Insights Engine</h3>
                  </div>
                  <div className="text-xs text-slate-400">
                    Automated anomaly detection & data relationships
                  </div>
                </div>

                {isLoadingInsights ? (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                    <span className="text-xs text-slate-400">Extracting dataset insights...</span>
                  </div>
                ) : insightsReport && insightsReport.insights && insightsReport.insights.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto max-h-[320px] pr-1 no-scrollbar">
                    {insightsReport.insights.map((insight, idx) => {
                      let priorityClass = '';
                      let iconColor = '';
                      if (insight.priority === 'high') {
                        priorityClass = 'border-rose-500/30 bg-rose-950/10 hover:border-rose-500/50';
                        iconColor = 'text-rose-500';
                      } else if (insight.priority === 'medium') {
                        priorityClass = 'border-amber-500/30 bg-amber-950/10 hover:border-amber-500/50';
                        iconColor = 'text-amber-500';
                      } else {
                        priorityClass = 'border-blue-500/30 bg-blue-950/10 hover:border-blue-500/50';
                        iconColor = 'text-blue-400';
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-5 rounded-xl border transition-all duration-300 flex items-start gap-4 ${priorityClass}`}
                        >
                          <div className={`w-10 h-10 rounded-lg bg-slate-900/60 border border-[#1E293B] flex items-center justify-center shrink-0 ${iconColor}`}>
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div className="space-y-2 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white truncate">{insight.title}</h4>
                              <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded font-mono ${
                                insight.priority === 'high'
                                  ? 'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                                  : insight.priority === 'medium'
                                  ? 'bg-amber-950/40 text-amber-400 border border-amber-900/40'
                                  : 'bg-blue-950/40 text-blue-400 border border-blue-900/40'
                              }`}>
                                {insight.priority}
                              </span>
                            </div>
                            
                            {/* Explainability View */}
                            <div className="space-y-2 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Finding</span>
                                <p className="text-slate-200 mt-0.5">{insight.finding || insight.description}</p>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block">Why It Matters</span>
                                <p className="text-slate-400 mt-0.5">{insight.why_it_matters || "Statistical anomaly detected in dataset parameters."}</p>
                              </div>
                              <div className="pt-1.5 border-t border-[#1E293B]/40 flex items-center justify-between">
                                <div>
                                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Supporting Metric</span>
                                  <span className="text-cyan-400 font-mono text-[10px] font-semibold">{insight.supporting_metric || "N/A"}</span>
                                </div>
                                <div className="flex gap-1">
                                  {insight.columns.map((col, cIdx) => (
                                    <span key={cIdx} className="text-[9px] px-1 py-0.5 rounded bg-slate-900/80 border border-[#1E293B] font-mono text-cyan-400/80">
                                      {col}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3 animate-bounce" />
                    <span className="text-xs text-slate-400 font-bold">No High-Priority Anomalies Detected</span>
                    <p className="text-[11px] text-slate-500 mt-1">Your dataset meets basic quality and distribution standards.</p>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-end">
                  <button
                    onClick={() => setCurrentStep(7)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15"
                  >
                    Proceed to Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: BIVARIA            {/* STEP 5: BIVARIATE ANALYSIS */}
            {currentStep === 5 && (
              <div className="glass-panel p-6 rounded-xl border border-[#1E293B] animate-slide-up min-h-[420px] flex flex-col justify-between">
                
                {/* Header Control */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E293B] pb-4 mb-6">
                  <div>
                    <h3 className="font-semibold text-base text-white flex items-center gap-1.5">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      Bivariate Analysis
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Explore relationships, correlations, and interactions between columns</p>
                  </div>

                  {/* Sub-tabs for Bivariate */}
                  <div className="flex items-center gap-1.5 bg-slate-950/50 p-1 rounded-lg border border-[#1E293B]">
                    <button
                      onClick={() => setBivariateTab('heatmap')}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        bivariateTab === 'heatmap'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Correlation Heatmap
                    </button>
                    <button
                      onClick={() => setBivariateTab('scatter')}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        bivariateTab === 'scatter'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Scatter Plot
                    </button>
                    <button
                      onClick={() => setBivariateTab('category')}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                        bivariateTab === 'category'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Category vs Metric
                    </button>
                  </div>
                </div>

                {isLoadingBivariate ? (
                  <div className="flex flex-col items-center justify-center py-24 flex-1">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                    <span className="text-xs text-slate-400">Loading bivariate metadata...</span>
                  </div>
                ) : bivariateInitData ? (
                  (() => {
                    // Render sub-tabs content
                    if (bivariateTab === 'heatmap') {
                      return (
                        <div className="space-y-4 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Pearson Correlation Matrix</h4>
                            {bivariateInitData.strongest_pair && (
                              <span className="text-[10px] text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-950/30 border border-cyan-900/40">
                                Strongest Pair: {bivariateInitData.strongest_pair.x} ↔ {bivariateInitData.strongest_pair.y} ({bivariateInitData.strongest_pair.r >= 0 ? '+' : ''}{bivariateInitData.strongest_pair.r.toFixed(2)})
                              </span>
                            )}
                          </div>
                          
                          {/* Heatmap Matrix Display with scrolling capability */}
                          <div className="overflow-auto max-h-[300px] border border-[#1E293B]/60 rounded-xl bg-slate-950/20 p-4 no-scrollbar">
                            {bivariateInitData.numeric_columns && bivariateInitData.numeric_columns.length > 1 && bivariateInitData.correlations && bivariateInitData.correlations.length > 0 ? (
                              <div className="flex flex-col min-w-[600px]">
                                {/* Column Headers */}
                                <div className="flex border-b border-[#1E293B] pb-2 mb-2">
                                  <div className="w-36 shrink-0 font-bold text-slate-450 text-[10px] uppercase tracking-wider">Variables</div>
                                  {bivariateInitData.numeric_columns.map(col => (
                                    <div key={col} className="flex-1 text-center font-bold text-slate-200 text-[10px] truncate px-1" title={col}>
                                      {col}
                                    </div>
                                  ))}
                                </div>
                                {/* Rows */}
                                {bivariateInitData.numeric_columns.map(rowCol => (
                                  <div key={rowCol} className="flex items-center py-1.5 border-b border-[#1E293B]/20 hover:bg-slate-900/10">
                                    <div className="w-36 shrink-0 font-bold text-slate-300 text-[11px] truncate pr-2" title={rowCol}>
                                      {rowCol}
                                    </div>
                                    {bivariateInitData.numeric_columns.map(colCol => {
                                      const cell = bivariateInitData.correlations.find(c => c.x === rowCol && c.y === colCol);
                                      const r = cell ? cell.r : 0;
                                      const absR = Math.abs(r);
                                      const isSelf = rowCol === colCol;

                                      let bgClass = 'bg-slate-800/40';
                                      let textColor = 'text-slate-400';
                                      
                                      if (isSelf) {
                                        bgClass = 'bg-transparent';
                                        textColor = 'text-transparent';
                                      } else if (r > 0.05) {
                                        textColor = r > 0.6 ? 'text-white' : 'text-slate-200';
                                        if (r > 0.8) bgClass = 'bg-indigo-600';
                                        else if (r > 0.5) bgClass = 'bg-indigo-700/80';
                                        else if (r > 0.2) bgClass = 'bg-indigo-850/50';
                                        else bgClass = 'bg-indigo-900/20';
                                      } else if (r < -0.05) {
                                        textColor = r < -0.6 ? 'text-white' : 'text-slate-200';
                                        if (r < -0.8) bgClass = 'bg-rose-600';
                                        else if (r < -0.5) bgClass = 'bg-rose-700/80';
                                        else if (r < -0.2) bgClass = 'bg-rose-850/50';
                                        else bgClass = 'bg-rose-900/20';
                                      }

                                      // Noise reduction cell opacity
                                      let opacityClass = 'opacity-30';
                                      if (isSelf) {
                                        opacityClass = 'opacity-0 pointer-events-none';
                                      } else if (absR >= 0.50) {
                                        opacityClass = 'opacity-100';
                                      } else if (absR >= 0.20) {
                                        opacityClass = 'opacity-65';
                                      }

                                      return (
                                        <div
                                          key={colCol}
                                          className={`flex-1 py-2 text-center rounded-md font-mono text-[11px] font-bold transition-all mx-0.5 relative group cursor-pointer ${bgClass} ${textColor} ${opacityClass}`}
                                          title={isSelf ? '' : `${rowCol} ↔ ${colCol}: ${r >= 0 ? '+' : ''}${r.toFixed(2)}`}
                                        >
                                          {isSelf ? null : r.toFixed(2)}

                                          {/* Hover strength tooltip */}
                                          {!isSelf && (
                                            <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[#151D30] border border-[#1E293B] p-2.5 rounded-lg text-left hidden group-hover:block shadow-2xl pointer-events-none">
                                              <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-500">Correlation Pair</p>
                                              <p className="text-[11px] font-bold text-white truncate">{rowCol} ↔ {colCol}</p>
                                              <p className="text-xs font-bold text-cyan-400 mt-1">{classifyCorrelation(r)}</p>
                                              <p className="text-[10px] text-slate-400 mt-0.5">Pearson r: {r >= 0 ? '+' : ''}{r.toFixed(4)}</p>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-500 text-xs text-center py-6">No meaningful correlations found.</div>
                            )}
                          </div>

                          {/* Legend component */}
                          <div className="flex flex-col gap-2 p-3 bg-slate-900/40 border border-[#1E293B]/60 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Correlation Scale Legend</span>
                            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono gap-2">
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-rose-600"></span>
                                -1.0 (Strong Neg)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-rose-850/50"></span>
                                -0.3 (Weak Neg)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-[#1E293B]"></span>
                                0.0 (None)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-indigo-850/50"></span>
                                +0.3 (Weak Pos)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-indigo-600"></span>
                                +1.0 (Strong Pos)
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    } else if (bivariateTab === 'scatter') {
                      // Generate two-point regression line coordinates
                      const regressionPoints = (() => {
                        if (!scatterReport || !scatterReport.regression || !scatterReport.data || scatterReport.data.length === 0) return [];
                        const xVals = scatterReport.data.map(d => d.x);
                        const minX = Math.min(...xVals);
                        const maxX = Math.max(...xVals);
                        const { slope, intercept } = scatterReport.regression;
                        return [
                          { x: minX, y: slope * minX + intercept, label: 'Regression Line Start' },
                          { x: maxX, y: slope * maxX + intercept, label: 'Regression Line End' }
                        ];
                      })();

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 items-stretch">
                          {/* Controls (Left 1/4) */}
                          <div className="space-y-4 text-xs">
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">X-Axis Column:</label>
                              <select
                                value={selectedScatterX}
                                onChange={(e) => setSelectedScatterX(e.target.value)}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                {bivariateInitData.numeric_columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">Y-Axis Column:</label>
                              <select
                                value={selectedScatterY}
                                onChange={(e) => setSelectedScatterY(e.target.value)}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                {bivariateInitData.numeric_columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>

                            {/* Show Regression Line Checkbox */}
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="checkbox"
                                id="show-regression-checkbox"
                                checked={showRegression}
                                onChange={(e) => setShowRegression(e.target.checked)}
                                className="w-4 h-4 rounded border-[#1E293B] bg-[#151D30] text-indigo-600 focus:ring-0 cursor-pointer"
                              />
                              <label htmlFor="show-regression-checkbox" className="text-slate-350 select-none cursor-pointer">
                                Show Regression Line
                              </label>
                            </div>
                            
                            <div className="p-3 bg-[#151D30]/40 border border-[#1E293B]/60 rounded-xl space-y-1.5">
                              <h5 className="font-semibold text-slate-200 text-[11px]">Bivariate Scatter</h5>
                              <p className="text-[10px] text-slate-400 leading-relaxed">
                                Evaluates linear, polynomial, or logarithmic patterns between continuous variables.
                              </p>
                              {scatterReport && (
                                <p className="text-[9px] font-mono text-cyan-400">
                                  Displaying {scatterReport.sampled_records} sampled points from {scatterReport.total_records.toLocaleString()} records
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Chart (Right 3/4) */}
                          <div className="lg:col-span-3 flex flex-col justify-between h-[250px]">
                            {/* Display Regression Parameters in Header */}
                            {selectedScatterX !== selectedScatterY && scatterReport && scatterReport.regression && (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-cyan-400 mb-2">
                                <span>Pearson r: {scatterReport.regression.r >= 0 ? '+' : ''}{scatterReport.regression.r.toFixed(4)}</span>
                                <span>R²: {scatterReport.regression.r2.toFixed(4)}</span>
                                <span>Equation: y = {scatterReport.regression.slope.toFixed(3)}x + {scatterReport.regression.intercept.toFixed(3)}</span>
                              </div>
                            )}

                            <div className="flex-1 w-full min-h-[220px]">
                              {selectedScatterX === selectedScatterY ? (
                                <div className="flex flex-col items-center justify-center h-full text-center p-6 border border-dashed border-amber-500/20 rounded-xl bg-amber-950/5">
                                  <AlertCircle className="w-10 h-10 text-amber-500 mb-3 animate-pulse-subtle" />
                                  <h4 className="text-sm font-semibold text-white">Axis Validation Warning</h4>
                                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                    Select two different numerical variables to explore a relationship.
                                  </p>
                                </div>
                              ) : isLoadingScatter ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                                  <span className="text-xs text-slate-500">Loading scatter dataset...</span>
                                </div>
                              ) : scatterReport && scatterReport.data && scatterReport.data.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.4} />
                                    <XAxis
                                      type="number"
                                      dataKey="x"
                                      name={selectedScatterX}
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      tickFormatter={formatYAxisTick}
                                    />
                                    <YAxis
                                      type="number"
                                      dataKey="y"
                                      name={selectedScatterY}
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      dx={-5}
                                      tickFormatter={formatYAxisTick}
                                    />
                                    <Tooltip
                                      cursor={{ strokeDasharray: '3 3' }}
                                      content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                          const item = payload[0].payload;
                                          if (item.label === 'Regression Line Start' || item.label === 'Regression Line End') return null;
                                          return (
                                            <div className="bg-[#151D30] border border-[#1E293B] p-3 rounded-lg shadow-2xl text-xs">
                                              <p className="font-bold text-white mb-1.5">{item.label}</p>
                                              <p className="text-slate-400">
                                                {selectedScatterX}: <span className="text-cyan-400 font-semibold">{formatLargeValue(item.x)}</span>
                                              </p>
                                              <p className="text-slate-400">
                                                {selectedScatterY}: <span className="text-indigo-400 font-semibold">{formatLargeValue(item.y)}</span>
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                    <Scatter name="Points" data={scatterReport.data} fill="#818CF8" fillOpacity={0.7} />
                                    {showRegression && regressionPoints.length > 0 && (
                                      <Scatter 
                                        name="Regression Line" 
                                        data={regressionPoints} 
                                        line={{ stroke: '#22d3ee', strokeDasharray: '5 5', strokeWidth: 2 }} 
                                        shape="none" 
                                      />
                                    )}
                                  </ScatterChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="text-slate-500 text-xs text-center py-12">No scatter data loaded.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    } else if (bivariateTab === 'category') {
                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 items-stretch">
                          {/* Controls (Left 1/4) */}
                          <div className="space-y-4 text-xs">
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">Categorical Group:</label>
                              <select
                                value={selectedCatCol}
                                onChange={(e) => setSelectedCatCol(e.target.value)}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                {bivariateInitData.categorical_columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">Numerical Metric:</label>
                              <select
                                value={selectedNumCol}
                                onChange={(e) => setSelectedNumCol(e.target.value)}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                {bivariateInitData.numeric_columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">Aggregation Function:</label>
                              <select
                                value={catNumAggregation}
                                onChange={(e) => setCatNumAggregation(e.target.value)}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="mean">Mean (Average)</option>
                                <option value="median">Median</option>
                                <option value="count">Count (Record Count)</option>
                              </select>
                            </div>
                            {/* Limit (Top N) Control Dropdown */}
                            <div>
                              <label className="text-xs text-slate-400 font-semibold block mb-1">Limit (Top N):</label>
                              <select
                                value={catNumLimit}
                                onChange={(e) => setCatNumLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="w-full bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="10">Top 10</option>
                                <option value="15">Top 15</option>
                                <option value="20">Top 20</option>
                                <option value="all">All</option>
                              </select>
                            </div>
                          </div>

                          {/* Chart (Right 3/4) */}
                          <div className="lg:col-span-3 flex flex-col justify-between h-[250px]">
                            <div className="flex-1 w-full min-h-[220px]">
                              {isLoadingCatNum ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                  <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mb-2" />
                                  <span className="text-xs text-slate-500">Calculating aggregates...</span>
                                </div>
                              ) : catNumReport && catNumReport.data && catNumReport.data.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart
                                    data={catNumReport.data}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.4} />
                                    <XAxis
                                      dataKey="category"
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      angle={-30}
                                      textAnchor="end"
                                      dx={-2}
                                      dy={5}
                                    />
                                    <YAxis
                                      stroke="#64748B"
                                      fontSize={9}
                                      tickLine={false}
                                      dx={-5}
                                      tickFormatter={formatYAxisTick}
                                    />
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                          const item = payload[0].payload;
                                          return (
                                            <div className="bg-[#151D30] border border-[#1E293B] p-3 rounded-lg shadow-2xl text-xs">
                                              <p className="font-bold text-white mb-1.5">{item.category}</p>
                                              <p className="text-slate-400">
                                                Average {selectedNumCol}: <span className="text-cyan-400 font-semibold">{formatLargeValue(item.mean)}</span>
                                              </p>
                                              <p className="text-slate-400">
                                                Median {selectedNumCol}: <span className="text-indigo-400 font-semibold">{formatLargeValue(item.median)}</span>
                                              </p>
                                              <p className="text-slate-400">
                                                Record Count: <span className="text-slate-200 font-semibold">{item.count.toLocaleString()}</span>
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }}
                                    />
                                    <Bar dataKey="val" fill="#22D3EE" radius={[4, 4, 0, 0]}>
                                      {catNumReport.data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill="#22D3EE" fillOpacity={0.85} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="text-slate-500 text-xs text-center py-12">No aggregation data loaded.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 flex-1">
                    <Database className="w-12 h-12 text-slate-600 mb-3" />
                    <span className="text-xs text-slate-500">No bivariate data found or loaded.</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-end">
                  <button
                    onClick={() => setCurrentStep(6)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15"
                  >
                    Proceed to Insights
                  </button>
                </div>

              </div>
            )}

            {/* STEP 7: EXECUTIVE DASHBOARD */}
            {currentStep === 7 && (
              <div className="space-y-6 animate-fade-in">
                {/* Dashboard Controls / Global Filter Bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#151D30]/30 border border-[#1E293B] p-4 rounded-xl">
                  <div>
                    <h3 className="font-semibold text-base text-white flex items-center gap-1.5">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      Executive Dashboard
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Unified intelligence, data quality metrics, and category-level insights</p>
                  </div>
                  
                  {/* Global Category Filter Controls */}
                  {dashboardData && dashboardData.filter_options && Object.keys(dashboardData.filter_options).length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400 font-semibold">Global Category Filter:</span>
                      <select
                        value={selectedFilterCol}
                        onChange={(e) => {
                          setSelectedFilterCol(e.target.value);
                          setSelectedFilterVal('');
                        }}
                        className="bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer min-w-[130px]"
                      >
                        <option value="">-- Select Column --</option>
                        {Object.keys(dashboardData.filter_options).map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>

                      {selectedFilterCol && (
                        <select
                          value={selectedFilterVal}
                          onChange={(e) => setSelectedFilterVal(e.target.value)}
                          className="bg-[#151D30] border border-[#1E293B] text-xs text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer min-w-[130px]"
                        >
                          <option value="">-- All Values --</option>
                          {dashboardData.filter_options[selectedFilterCol].map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      )}

                      {(selectedFilterCol || selectedFilterVal) && (
                        <button
                          onClick={() => {
                            setSelectedFilterCol('');
                            setSelectedFilterVal('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-350 transition-all border border-[#1E293B]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isLoadingDashboard || isLoadingBivariate || isLoadingInsights ? (
                  <div className="glass-panel p-20 rounded-xl border border-[#1E293B] flex flex-col items-center justify-center">
                    <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                    <span className="text-xs text-slate-450 font-medium">Assembling executive dashboard summary...</span>
                  </div>
                ) : dashboardData ? (
                  <div className="space-y-6">
                    {/* 6 KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                      {/* KPI 1: Dataset Name */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Dataset Name</span>
                          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                        </div>
                        <div className="mt-3 min-w-0">
                          <h4 className="text-sm font-bold text-white truncate" title={dataset.filename}>
                            {dataset.filename}
                          </h4>
                          <span className="text-[9px] font-mono text-cyan-400 block truncate mt-1">
                            v{dataset.version || 1}
                          </span>
                        </div>
                      </div>

                      {/* KPI 2: Total Rows */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Rows</span>
                          <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                        </div>
                        <div className="mt-3">
                          <span className="text-2xl font-extrabold text-white font-mono">
                            {dashboardData.row_count.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">Records scanned</span>
                        </div>
                      </div>

                      {/* KPI 3: Total Columns */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Columns</span>
                          <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                        </div>
                        <div className="mt-3">
                          <span className="text-2xl font-extrabold text-white font-mono">
                            {dashboardData.column_count}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">Schema fields</span>
                        </div>
                      </div>

                      {/* KPI 4: Quality Score with popover breakdown */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between relative">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quality Score</span>
                          <button
                            onClick={() => setShowQualityBreakdown(!showQualityBreakdown)}
                            className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Toggle penalty breakdown"
                          >
                            <Info className="w-4 h-4 shrink-0 text-cyan-400" />
                          </button>
                        </div>
                        
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-2xl font-extrabold text-white font-mono">
                            {dashboardData.health_score}%
                          </span>
                          <span className={`text-[9px] font-mono px-1 rounded font-bold ${
                            dashboardData.health_score >= 90 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' :
                            dashboardData.health_score >= 75 ? 'bg-amber-950/40 text-amber-400 border border-amber-900/40' :
                            'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                          }`}>
                            {dashboardData.health_score >= 90 ? 'High' : dashboardData.health_score >= 75 ? 'Fair' : 'Poor'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-550 block mt-1">Integrity rating</span>

                        {/* Interactive Penalty Breakdown Popover */}
                        {showQualityBreakdown && (
                          <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-[#151D30] border border-[#1E293B] p-3 rounded-xl shadow-2xl animate-fade-in text-xs">
                            <div className="flex items-center justify-between border-b border-[#1E293B] pb-1.5 mb-2">
                              <span className="font-bold text-white">Score Breakdown</span>
                              <button 
                                onClick={() => setShowQualityBreakdown(false)}
                                className="text-slate-500 hover:text-slate-350 text-[10px] font-bold"
                              >
                                Close
                              </button>
                            </div>
                            <div className="space-y-1.5 font-mono text-[10.5px]">
                              <div className="flex justify-between text-slate-400">
                                <span>Base Score:</span>
                                <span className="text-slate-200">100</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Missing Penalty:</span>
                                <span className={dashboardData.quality_score_breakdown?.missing_penalty < 0 ? "text-rose-400 font-semibold" : "text-slate-500"}>
                                  {dashboardData.quality_score_breakdown?.missing_penalty ?? 0}
                                </span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Duplicate Penalty:</span>
                                <span className={dashboardData.quality_score_breakdown?.duplicate_penalty < 0 ? "text-rose-400 font-semibold" : "text-slate-500"}>
                                  {dashboardData.quality_score_breakdown?.duplicate_penalty ?? 0}
                                </span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Outlier Penalty:</span>
                                <span className={dashboardData.quality_score_breakdown?.outlier_penalty < 0 ? "text-rose-400 font-semibold" : "text-slate-500"}>
                                  {dashboardData.quality_score_breakdown?.outlier_penalty ?? 0}
                                </span>
                              </div>
                              <div className="flex justify-between text-white font-bold border-t border-[#1E293B]/60 pt-1.5 mt-1.5 text-xs">
                                <span>Final Score:</span>
                                <span className="text-indigo-400">{dashboardData.health_score}/100</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* KPI 5: Missing Cells */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Missing Cells</span>
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        </div>
                        <div className="mt-3">
                          <span className={`text-2xl font-extrabold font-mono ${dashboardData.total_missing > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {dashboardData.total_missing.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-550 block mt-1">Null occurrences</span>
                        </div>
                      </div>

                      {/* KPI 6: Duplicate Rows */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duplicates</span>
                          <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                        <div className="mt-3">
                          <span className={`text-2xl font-extrabold font-mono ${dashboardData.duplicate_row_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {dashboardData.duplicate_row_count.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-550 block mt-1">Row redundancies</span>
                        </div>
                      </div>
                    </div>

                    {/* 5 Business Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {/* Card 1: Strongest Positive Correlation */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] min-h-[160px] flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Strongest Positive Correlation</span>
                          {dashboardData.strongest_positive ? (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-bold text-indigo-300 truncate" title={`${dashboardData.strongest_positive.x} ↔ ${dashboardData.strongest_positive.y}`}>
                                {dashboardData.strongest_positive.x} ↔ {dashboardData.strongest_positive.y}
                              </p>
                              <p className="text-[10px] text-slate-350">{dashboardData.strongest_positive.classification}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic mt-1">No meaningful correlations found.</p>
                          )}
                        </div>
                        {dashboardData.strongest_positive && (
                          <div className="text-right mt-3">
                            <span className="text-lg font-extrabold text-indigo-400 font-mono">
                              r = {dashboardData.strongest_positive.r >= 0 ? '+' : ''}{dashboardData.strongest_positive.r.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card 2: Strongest Negative Correlation */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] min-h-[160px] flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Strongest Negative Correlation</span>
                          {dashboardData.strongest_negative ? (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-bold text-rose-300 truncate" title={`${dashboardData.strongest_negative.x} ↔ ${dashboardData.strongest_negative.y}`}>
                                {dashboardData.strongest_negative.x} ↔ {dashboardData.strongest_negative.y}
                              </p>
                              <p className="text-[10px] text-slate-350">{dashboardData.strongest_negative.classification}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic mt-1">No meaningful correlations found.</p>
                          )}
                        </div>
                        {dashboardData.strongest_negative && (
                          <div className="text-right mt-3">
                            <span className="text-lg font-extrabold text-rose-400 font-mono">
                              r = {dashboardData.strongest_negative.r.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card 3: Highest Ranked Category */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] min-h-[160px] flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Highest Ranked Category</span>
                          {dashboardData.highest_category_by_metric ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 truncate">Column: {dashboardData.highest_category_by_metric.category_column}</p>
                              <p className="text-[11.5px] font-bold text-cyan-400 truncate" title={dashboardData.highest_category_by_metric.category_value}>
                                '{dashboardData.highest_category_by_metric.category_value}'
                              </p>
                              <p className="text-[10px] text-slate-300 font-medium">
                                Avg: <span className="font-semibold text-white font-mono">{formatLargeValue(dashboardData.highest_category_by_metric.average_value)}</span>
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic mt-1">No category rankings found.</p>
                          )}
                        </div>
                        {dashboardData.highest_category_by_metric && (
                          <div className="text-right mt-2">
                            <span className="text-[11px] font-bold text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/40 px-1.5 py-0.5 rounded">
                              +{formatPercentage(dashboardData.highest_category_by_metric.percentage_difference)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card 4: Lowest Ranked Category */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] min-h-[160px] flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Lowest Ranked Category</span>
                          {dashboardData.lowest_category_by_metric ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 truncate">Column: {dashboardData.lowest_category_by_metric.category_column}</p>
                              <p className="text-[11.5px] font-bold text-rose-350 truncate" title={dashboardData.lowest_category_by_metric.category_value}>
                                '{dashboardData.lowest_category_by_metric.category_value}'
                              </p>
                              <p className="text-[10px] text-slate-300 font-medium">
                                Avg: <span className="font-semibold text-white font-mono">{formatLargeValue(dashboardData.lowest_category_by_metric.average_value)}</span>
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic mt-1">No category rankings found.</p>
                          )}
                        </div>
                        {dashboardData.lowest_category_by_metric && (
                          <div className="text-right mt-2">
                            <span className="text-[11px] font-bold text-rose-400 font-mono bg-rose-950/40 border border-rose-900/40 px-1.5 py-0.5 rounded">
                              {formatPercentage(dashboardData.lowest_category_by_metric.percentage_difference)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card 5: Top Insight */}
                      <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] min-h-[160px] flex flex-col justify-between md:col-span-1">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Top Insight</span>
                            {dashboardData.top_business_insight && (
                              <span className="text-[8px] font-mono px-1 rounded uppercase bg-rose-950/30 text-rose-400 border border-rose-900/35 font-bold shrink-0">
                                {dashboardData.top_business_insight.priority}
                              </span>
                            )}
                          </div>
                          {dashboardData.top_business_insight ? (
                            <p className="text-[10.5px] text-slate-250 leading-relaxed line-clamp-4" title={dashboardData.top_business_insight.finding || dashboardData.top_business_insight.description}>
                              {dashboardData.top_business_insight.finding || dashboardData.top_business_insight.description}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 italic mt-1">No significant insights extracted.</p>
                          )}
                        </div>
                        {dashboardData.top_business_insight && (
                          <div className="text-[9px] text-slate-550 font-mono truncate mt-2">
                            Metrics: {(() => {
                              const cols = dashboardData.top_business_insight.columns;
                              if (!Array.isArray(cols)) {
                                console.error("Step 7 top_business_insight columns mismatch fallback: not an array", cols);
                                return 'N/A';
                              }
                              return cols.join(', ');
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Executive Summary List & Key Trend Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Executive findings (1/3 wide) */}
                      <div className="glass-panel p-5 rounded-xl border border-[#1E293B] flex flex-col justify-between h-[360px]">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Executive Summary</h4>
                          <p className="text-[10px] text-slate-450 mb-4">Key findings extracted programmatically from dataset characteristics:</p>
                          
                          <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 no-scrollbar">
                            {dashboardData.executive_summary && dashboardData.executive_summary.map((finding, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-slate-300 leading-relaxed font-medium">{finding}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Key Metric Trend Chart (2/3 wide) */}
                      <div className="lg:col-span-2 glass-panel p-5 rounded-xl border border-[#1E293B] flex flex-col h-[360px] justify-between">
                        <div className="mb-2">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Key Business Metric Trend</h4>
                          <p className="text-[10px] text-slate-455 mt-0.5">
                            Plotting primary business metric: <span className="text-indigo-400 font-semibold">{dashboardData.chart_column}</span>
                          </p>
                        </div>

                        <div className="flex-1 w-full min-h-[220px]">
                          {dashboardData.chart_column && dashboardData.chart_data && dashboardData.chart_data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={dashboardData.chart_data}
                                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                              >
                                <defs>
                                  <linearGradient id="dashboardGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.4} />
                                <XAxis
                                  dataKey="label"
                                  stroke="#64748B"
                                  fontSize={9}
                                  tickLine={false}
                                />
                                <YAxis
                                  stroke="#64748B"
                                  fontSize={9}
                                  tickLine={false}
                                  dx={-5}
                                  tickFormatter={formatYAxisTick}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Area
                                  type="monotone"
                                  dataKey="value"
                                  stroke="#4F46E5"
                                  strokeWidth={2}
                                  fillOpacity={1}
                                  fill="url(#dashboardGradient)"
                                  connectNulls
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
                              No key metric visual data available.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Navigation Control Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#1E293B] pt-6 mt-6">
                      <button
                        onClick={resetUpload}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-slate-300 transition-all active:scale-95"
                      >
                        <Upload className="w-4 h-4" />
                        Upload New Dataset
                      </button>

                      <button
                        onClick={() => setCurrentStep(8)}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/15 flex items-center gap-1.5"
                      >
                        Proceed to Report Center
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-500 text-xs py-12">
                    Failed to fetch dashboard data.
                  </div>
                )}
              </div>
            )}

            {/* STEP 8: REPORT CENTER */}
            {currentStep === 8 && (
              <div className="space-y-6 animate-fade-in w-full">
                {/* Header */}
                <div className="bg-[#151D30]/30 border border-[#1E293B] p-5 rounded-xl flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base text-white flex items-center gap-1.5">
                      <FileText className="w-5 h-5 text-indigo-400" />
                      Report Center
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Generate and manage high-fidelity PDF documents for {dataset.filename}</p>
                  </div>
                </div>

                {/* KPIs Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* KPI 1: Report Count */}
                  <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex items-center justify-between bg-[#151D30]/10">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Reports Generated</span>
                      <span className="text-2xl font-extrabold text-white font-mono mt-1 block">
                        {reportsList.length}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-indigo-950/40 border border-indigo-900/30 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-indigo-400" />
                    </div>
                  </div>

                  {/* KPI 2: Latest Report Timestamp */}
                  <div className="glass-panel p-4.5 rounded-xl border border-[#1E293B] flex items-center justify-between bg-[#151D30]/10">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Latest Report</span>
                      <span className="text-xs font-semibold text-slate-200 mt-1.5 block">
                        {reportsList.length > 0 ? formatTimeAgo(reportsList[0].generated_at || reportsList[0].timestamp) : 'No reports yet'}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-cyan-950/40 border border-cyan-900/30 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-cyan-400" />
                    </div>
                  </div>
                </div>

                {/* Report Generators */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card 1: Executive Report */}
                  <div className="glass-panel p-5 rounded-xl border border-[#1E293B] flex flex-col justify-between min-h-[170px] bg-gradient-to-b from-[#151D30]/20 to-[#0B0F19]/20">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Executive Summary Report</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        A concise summary report compiling the dataset health score, data quality penalties, primary metric visualizations, and strategic conclusions.
                      </p>
                    </div>
                    <button
                      onClick={() => handleGenerateReport('executive')}
                      disabled={isGeneratingReport}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:brightness-110 active:scale-95 transition-all text-xs font-semibold text-white disabled:opacity-50 disabled:scale-100 shadow-lg shadow-indigo-500/10"
                    >
                      {isGeneratingReport ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Generating Executive PDF...
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          Generate Executive Report
                        </>
                      )}
                    </button>
                  </div>

                  {/* Card 2: Full Analysis Report */}
                  <div className="glass-panel p-5 rounded-xl border border-[#1E293B] flex flex-col justify-between min-h-[170px] bg-gradient-to-b from-[#151D30]/20 to-[#0B0F19]/20">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Full Analysis Report</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Comprehensive report including complete descriptive statistics, univariate frequency distributions, bivariate correlation matrices, outlier analysis, and extensive data insights.
                      </p>
                    </div>
                    <button
                      onClick={() => handleGenerateReport('full')}
                      disabled={isGeneratingReport}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-700 hover:brightness-110 active:scale-95 transition-all text-xs font-semibold text-white disabled:opacity-50 disabled:scale-100 shadow-lg shadow-cyan-500/10"
                    >
                      {isGeneratingReport ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Generating Full PDF...
                        </>
                      ) : (
                        <>
                          <Database className="w-3.5 h-3.5" />
                          Generate Full Report
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Generated Reports Table / Logs */}
                <div className="glass-panel p-5 rounded-xl border border-[#1E293B]">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Generated Reports</h4>
                  <div className="overflow-x-auto border border-[#1E293B]/50 rounded-xl bg-slate-950/20 no-scrollbar">
                    {isReportsLoading ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin mb-2" />
                        <span className="text-xs text-slate-500">Retrieving report logs...</span>
                      </div>
                    ) : reportsList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <FileText className="w-10 h-10 text-slate-750 mb-3" />
                        <p className="text-xs font-bold text-slate-350">No reports generated yet</p>
                        <p className="text-[10px] text-slate-550 mt-1 max-w-xs">
                          Generate an Executive or Full Report above to populate this center.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                        <thead>
                          <tr className="bg-slate-900/50 border-b border-[#1E293B] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="p-3">Document Title</th>
                            <th className="p-3">Scope</th>
                            <th className="p-3">Generated</th>
                            <th className="p-3 text-right">Size</th>
                            <th className="p-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportsList.map((r) => (
                            <tr key={r.report_id} className="border-b border-[#1E293B]/40 hover:bg-[#151D30]/20 text-slate-200">
                              <td className="p-3 font-medium truncate max-w-[200px]" title={r.filename}>
                                {r.filename}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase font-bold ${
                                  r.report_type === 'full'
                                    ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-900/40'
                                    : 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/40'
                                }`}>
                                  {r.report_type}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400">
                                {formatTimeAgo(r.generated_at || r.timestamp)}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-400">
                                {formatFileSize(r.file_size)}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center justify-center gap-3">
                                  <a
                                    href={`${API_BASE_URL}/api/reports/${r.report_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1 rounded text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-colors flex items-center gap-1.5"
                                    title="Download PDF"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                  <button
                                    onClick={() => handleDeleteReport(r.report_id)}
                                    className="p-1 rounded text-slate-500 hover:text-rose-450 hover:bg-slate-800/60 transition-colors"
                                    title="Delete Report"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
            </WorkspaceErrorBoundary>

          </div>
        )}

        </div>
      </main>

      {/* Premium Footer */}
      <footer className="border-t border-[#1E293B]/60 bg-[#0B0F19] py-4 text-center text-[10px] text-slate-500 tracking-wider uppercase">
        DataLens Ecosystem &copy; {new Date().getFullYear()} — Built with React, FastAPI & Recharts
      </footer>

    </div>
  );
}
