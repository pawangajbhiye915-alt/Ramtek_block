import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Eye,
  ExternalLink,
  Plus,
  Check,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { SchoolRecord, UserLocation, LocationStatus } from '../types';
import { calculateDistanceKm, generateDirectionsUrl } from '../utils/geo';
import * as XLSX from 'xlsx';

interface SchoolDirectoryProps {
  schools: SchoolRecord[];
  userLocation: UserLocation | null;
  onSelectSchool: (school: SchoolRecord) => void;
  onViewOnMap: (school: SchoolRecord) => void;
  onAddToVisitPlan: (school: SchoolRecord) => void;
  visitPlanUdiseCodes: Set<string>;
}

export const SchoolDirectory: React.FC<SchoolDirectoryProps> = ({
  schools,
  userLocation,
  onSelectSchool,
  onViewOnMap,
  onAddToVisitPlan,
  visitPlanUdiseCodes,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [selectedGP, setSelectedGP] = useState('');
  const [selectedManagement, setSelectedManagement] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedLocStatus, setSelectedLocStatus] = useState('');
  const [selectedRuralUrban, setSelectedRuralUrban] = useState('');
  
  const [sortField, setSortField] = useState<'srNo' | 'schoolName' | 'udiseCode' | 'village' | 'distanceKm'>('srNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Compute options dynamically from master dataset
  const clusters = useMemo(
    () => Array.from(new Set(schools.map((s) => s.cluster).filter(Boolean))).sort(),
    [schools]
  );
  const villages = useMemo(
    () => Array.from(new Set(schools.map((s) => s.village).filter(Boolean))).sort(),
    [schools]
  );
  const gps = useMemo(
    () => Array.from(new Set(schools.map((s) => s.lgdPanchayat).filter(Boolean))).sort(),
    [schools]
  );
  const managements = useMemo(
    () => Array.from(new Set(schools.map((s) => s.schoolManagement).filter(Boolean))).sort(),
    [schools]
  );
  const categories = useMemo(
    () => Array.from(new Set(schools.map((s) => s.schoolCategory).filter(Boolean))).sort(),
    [schools]
  );

  // Calculate distance & filter
  const filteredAndSorted = useMemo(() => {
    const lat = userLocation?.latitude ?? 21.3980;
    const lng = userLocation?.longitude ?? 79.3308;

    let result = schools.map((s) => ({
      ...s,
      distanceKm: calculateDistanceKm(lat, lng, s.latitude, s.longitude),
    }));

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.schoolName.toLowerCase().includes(q) ||
          s.udiseCode.toLowerCase().includes(q) ||
          s.village.toLowerCase().includes(q) ||
          (s.lgdPanchayat || '').toLowerCase().includes(q) ||
          (s.block || '').toLowerCase().includes(q) ||
          (s.cluster || '').toLowerCase().includes(q) ||
          (s.pinCode || '').includes(q) ||
          (s.address || '').toLowerCase().includes(q)
      );
    }

    if (selectedCluster) {
      result = result.filter((s) => s.cluster.trim() === selectedCluster.trim());
    }
    if (selectedVillage) {
      result = result.filter((s) => s.village.trim() === selectedVillage.trim());
    }
    if (selectedGP) {
      result = result.filter((s) => s.lgdPanchayat.trim() === selectedGP.trim());
    }
    if (selectedManagement) {
      result = result.filter((s) => s.schoolManagement === selectedManagement);
    }
    if (selectedCategory) {
      result = result.filter((s) => s.schoolCategory === selectedCategory);
    }
    if (selectedStatus) {
      result = result.filter((s) => s.schoolStatus.toLowerCase() === selectedStatus.toLowerCase());
    }
    if (selectedLocStatus) {
      result = result.filter((s) => s.locationStatus === selectedLocStatus);
    }
    if (selectedRuralUrban) {
      result = result.filter((s) => s.ruralUrban.toLowerCase() === selectedRuralUrban.toLowerCase());
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    schools,
    search,
    selectedCluster,
    selectedVillage,
    selectedGP,
    selectedManagement,
    selectedCategory,
    selectedStatus,
    selectedLocStatus,
    selectedRuralUrban,
    sortField,
    sortOrder,
    userLocation,
  ]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const paginatedSchools = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCluster('');
    setSelectedVillage('');
    setSelectedGP('');
    setSelectedManagement('');
    setSelectedCategory('');
    setSelectedStatus('');
    setSelectedLocStatus('');
    setSelectedRuralUrban('');
    setCurrentPage(1);
  };

  // Export filtered to Excel/CSV
  const handleExport = (format: 'csv' | 'xlsx') => {
    const dataToExport = filteredAndSorted.map((s) => ({
      'Sr No.': s.srNo,
      'School Name': s.schoolName,
      'UDISE Code': s.udiseCode,
      'State': s.state,
      'District': s.district,
      'Block': s.block,
      'Cluster': s.cluster,
      'Village': s.village,
      'PIN Code': s.pinCode,
      'Address': s.address,
      'School Management': s.schoolManagement,
      'School Category': s.schoolCategory,
      'School Type': s.schoolType,
      'Classes': s.classesFromTo,
      'Rural/Urban': s.ruralUrban,
      'School Status': s.schoolStatus,
      'LGD Village': s.lgdVillage,
      'LGD Panchayat': s.lgdPanchayat,
      'Latitude': s.latitude,
      'Longitude': s.longitude,
      'Location Status': s.locationStatus,
      'Location Matching Priority': s.locationMatchingPriority || '',
      'Location Source': s.locationSource,
      'Location Accuracy': s.locationAccuracy || '',
      'Verification Method': s.verificationMethod || '',
      'Distance (KM)': s.distanceKm ?? 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ramtek_Schools');

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `Ramtek_Schools_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `Ramtek_Schools_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    }
  };

  const getLocationBadge = (status: LocationStatus) => {
    switch (status) {
      case 'EXACT SCHOOL LOCATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            EXACT
          </span>
        );
      case 'VILLAGE LOCATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            VILLAGE
          </span>
        );
      case 'GRAM PANCHAYAT LOCATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
            GP
          </span>
        );
      case 'LOCATION NEEDS VERIFICATION':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            NEEDS VERIF.
          </span>
        );
    }
  };

  return (
    <section id="schools-directory" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header & Export Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            All Schools Directory — Ramtek
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Showing {filteredAndSorted.length} of {schools.length} total schools loaded from RAMTEK.csv
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'table' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'cards' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => handleExport('xlsx')}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>EXCEL</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by school, village, UDISE, GP..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cluster Filter */}
          <select
            value={selectedCluster}
            onChange={(e) => {
              setSelectedCluster(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Clusters ({clusters.length})</option>
            {clusters.map((c) => (
              <option key={c} value={c}>
                Cluster: {c}
              </option>
            ))}
          </select>

          {/* Village Filter */}
          <select
            value={selectedVillage}
            onChange={(e) => {
              setSelectedVillage(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Villages ({villages.length})</option>
            {villages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          {/* Gram Panchayat Filter */}
          <select
            value={selectedGP}
            onChange={(e) => {
              setSelectedGP(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Gram Panchayats ({gps.length})</option>
            {gps.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Secondary Filter Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
          <select
            value={selectedManagement}
            onChange={(e) => {
              setSelectedManagement(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2 text-[11px] rounded-lg border border-slate-200 bg-slate-50"
          >
            <option value="">All Managements</option>
            {managements.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2 text-[11px] rounded-lg border border-slate-200 bg-slate-50"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedLocStatus}
            onChange={(e) => {
              setSelectedLocStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2 text-[11px] rounded-lg border border-slate-200 bg-slate-50"
          >
            <option value="">All Location Statuses</option>
            <option value="EXACT SCHOOL LOCATION">EXACT SCHOOL LOCATION</option>
            <option value="VILLAGE LOCATION">VILLAGE LOCATION</option>
            <option value="GRAM PANCHAYAT LOCATION">GRAM PANCHAYAT LOCATION</option>
            <option value="LOCATION NEEDS VERIFICATION">LOCATION NEEDS VERIFICATION</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2 text-[11px] rounded-lg border border-slate-200 bg-slate-50"
          >
            <option value="">Operational & Closed</option>
            <option value="Operational">Operational Only</option>
            <option value="Closed">Closed Only</option>
            <option value="Permanently Closed">Permanently Closed</option>
          </select>

          <button
            onClick={handleResetFilters}
            className="py-1.5 px-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center space-x-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>RESET FILTERS</span>
          </button>
        </div>
      </div>

      {/* Main View: Table */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider select-none">
                <tr>
                  <th
                    onClick={() => handleSort('srNo')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>#</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('schoolName')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>School Name</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('udiseCode')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>UDISE</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('village')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Village / GP</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Management</th>
                  <th
                    onClick={() => handleSort('distanceKm')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Dist (KM)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Location Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSchools.map((s) => {
                  const inPlan = visitPlanUdiseCodes.has(s.udiseCode);
                  return (
                    <tr
                      key={s.udiseCode}
                      className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectSchool(s)}
                    >
                      <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">{s.srNo}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 group-hover:text-blue-700 max-w-xs">
                        <div className="line-clamp-1">{s.schoolName}</div>
                        <div className="text-[10px] text-slate-400">PIN: {s.pinCode} | {s.cluster}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{s.udiseCode}</td>
                      <td className="py-3 px-3 text-slate-600">
                        <div>{s.village}</div>
                        <div className="text-[10px] text-slate-400">GP: {s.lgdPanchayat}</div>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600">{s.schoolCategory}</td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 max-w-[140px] truncate">
                        {s.schoolManagement}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                        {s.distanceKm ?? 0} KM
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getLocationBadge(s.locationStatus)}
                      </td>
                      <td
                        className="py-3 px-3 text-right whitespace-nowrap space-x-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onViewOnMap(s)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View on Interactive Map"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={generateDirectionsUrl(s, userLocation)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="Get Directions"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => onAddToVisitPlan(s)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            inPlan
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                          }`}
                          title={inPlan ? 'In Visit Plan' : 'Add to Visit Plan'}
                        >
                          {inPlan ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedSchools.map((s) => {
            const inPlan = visitPlanUdiseCodes.has(s.udiseCode);
            return (
              <div
                key={s.udiseCode}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-mono text-xs text-slate-400">#{s.srNo}</div>
                  <div>{getLocationBadge(s.locationStatus)}</div>
                </div>

                <div className="space-y-1">
                  <h3
                    onClick={() => onSelectSchool(s)}
                    className="font-bold text-sm text-slate-900 hover:text-blue-600 cursor-pointer line-clamp-2"
                  >
                    {s.schoolName}
                  </h3>
                  <div className="text-xs text-slate-500">
                    {s.village}, GP: {s.lgdPanchayat} (PIN {s.pinCode})
                  </div>
                  <div className="text-xs text-slate-400 font-mono">UDISE: {s.udiseCode}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <span className="font-semibold text-blue-700">{s.distanceKm ?? 0} KM from active point</span>
                  <div className="space-x-1">
                    <button
                      onClick={() => onViewOnMap(s)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded text-[11px] font-semibold"
                    >
                      MAP
                    </button>
                    <button
                      onClick={() => onAddToVisitPlan(s)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold ${
                        inPlan ? 'bg-amber-100 text-amber-800' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {inPlan ? 'PLANNED' : '+ PLAN'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-800">{Math.min(filteredAndSorted.length, (currentPage - 1) * pageSize + 1)}</span> to{' '}
          <span className="font-semibold text-slate-800">{Math.min(filteredAndSorted.length, currentPage * pageSize)}</span> of{' '}
          <span className="font-semibold text-slate-800">{filteredAndSorted.length}</span> results
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 rounded-lg border border-slate-200 text-xs bg-white"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100 text-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
