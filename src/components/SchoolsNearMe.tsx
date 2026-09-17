import React, { useState, useMemo, useEffect } from 'react';
import {
  Navigation,
  MapPin,
  Compass,
  CheckCircle2,
  ExternalLink,
  Plus,
  Info,
  ShieldAlert,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  SlidersHorizontal,
  Building,
  GraduationCap,
} from 'lucide-react';
import { SchoolRecord, UserLocation, LocationStatus } from '../types';
import { calculateDistanceKm, generateDirectionsUrl } from '../utils/geo';

interface SchoolsNearMeProps {
  schools: SchoolRecord[];
  userLocation: UserLocation | null;
  onRequestLocation: () => void;
  onSelectSchool: (school: SchoolRecord) => void;
  onViewOnMap: (school: SchoolRecord) => void;
  onAddToVisitPlan: (school: SchoolRecord) => void;
  visitPlanUdiseCodes: Set<string>;
  onSimulateLocation: (lat: number, lng: number, label: string) => void;
}

export const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: '5 KM', value: 5 },
  { label: '10 KM', value: 10 },
  { label: '15 KM', value: 15 },
  { label: '20 KM', value: 20 },
  { label: '25 KM', value: 25 },
  { label: '50 KM', value: 50 },
  { label: '100 KM', value: 100 },
  { label: '150 KM', value: 150 },
  { label: '200 KM', value: 200 },
  { label: 'ALL', value: null },
];

export const SchoolsNearMe: React.FC<SchoolsNearMeProps> = ({
  schools,
  userLocation,
  onRequestLocation,
  onSelectSchool,
  onViewOnMap,
  onAddToVisitPlan,
  visitPlanUdiseCodes,
  onSimulateLocation,
}) => {
  // Radius filter state (null = ALL, or distance in KM)
  const [selectedRadius, setSelectedRadius] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  
  // Pagination / Display controls (allows browsing all records without discarding)
  const [pageSize, setPageSize] = useState<number | 'ALL'>(24);
  const [currentPage, setCurrentPage] = useState<1 | number>(1);

  // Reset to page 1 when radius or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRadius, filterQuery]);

  // Compute distances for all schools relative to current active userLocation (or Ramtek center if none)
  const schoolsWithDistance = useMemo(() => {
    const lat = userLocation?.latitude ?? 21.3980; // default Ramtek center
    const lng = userLocation?.longitude ?? 79.3308;

    return schools
      .map((s) => ({
        ...s,
        distanceKm: calculateDistanceKm(lat, lng, s.latitude, s.longitude),
      }))
      // Sort strictly: Nearest → Farthest
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [schools, userLocation]);

  // Compute count of schools inside each radius option for the pill badges
  const radiusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const lat = userLocation?.latitude ?? 21.3980;
    const lng = userLocation?.longitude ?? 79.3308;

    RADIUS_OPTIONS.forEach((opt) => {
      if (opt.value === null) {
        counts[opt.label] = schools.length;
      } else {
        const count = schools.filter(
          (s) => calculateDistanceKm(lat, lng, s.latitude, s.longitude) <= opt.value!
        ).length;
        counts[opt.label] = count;
      }
    });
    return counts;
  }, [schools, userLocation]);

  // Filter list by selected radius and comprehensive text query (all 7 required search fields)
  const filteredSchools = useMemo(() => {
    return schoolsWithDistance.filter((s) => {
      // 1. Geographic radius filter (Max distance ceiling, NOT a result count limit)
      if (selectedRadius !== null && (s.distanceKm ?? Infinity) > selectedRadius) {
        return false;
      }

      // 2. Search query across all 7 fields:
      // School Name, UDISE Code, Village, Gram Panchayat, Block, Cluster, PIN Code
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase().trim();
        const matchesName = s.schoolName.toLowerCase().includes(q);
        const matchesUdise = (s.udiseCode || '').toLowerCase().includes(q);
        const matchesVillage = (s.village || '').toLowerCase().includes(q);
        const matchesGP = (s.lgdPanchayat || '').toLowerCase().includes(q);
        const matchesBlock = (s.block || '').toLowerCase().includes(q);
        const matchesCluster = (s.cluster || '').toLowerCase().includes(q);
        const matchesPin = (s.pinCode || '').toLowerCase().includes(q);

        if (
          !matchesName &&
          !matchesUdise &&
          !matchesVillage &&
          !matchesGP &&
          !matchesBlock &&
          !matchesCluster &&
          !matchesPin
        ) {
          return false;
        }
      }

      return true;
    });
  }, [schoolsWithDistance, selectedRadius, filterQuery]);

  // Pagination calculation - NEVER discards schools
  const totalCount = filteredSchools.length;
  const numericPageSize = pageSize === 'ALL' ? totalCount || 1 : pageSize;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalCount / numericPageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const displayedSchools = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredSchools;
    }
    const start = (safeCurrentPage - 1) * numericPageSize;
    return filteredSchools.slice(start, start + numericPageSize);
  }, [filteredSchools, pageSize, safeCurrentPage, numericPageSize]);

  const getLocationBadge = (status: LocationStatus) => {
    switch (status) {
      case 'EXACT SCHOOL LOCATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            ✓ Exact School Location
          </span>
        );
      case 'VILLAGE LOCATION':
      case 'GRAM PANCHAYAT LOCATION':
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300"
            title="Approximate location derived from village / Gram Panchayat boundary"
          >
            Approximate Location
          </span>
        );
      case 'LOCATION NEEDS VERIFICATION':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            Location Needs Verification
          </span>
        );
    }
  };

  return (
    <section id="schools-around-me" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header with GPS Status Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Schools Around Your Location
                </h2>
                <p className="text-xs text-slate-500">
                  Comprehensive proximity discovery using high-precision geodesic calculation. Sorted strictly Nearest → Farthest.
                </p>
              </div>
            </div>
          </div>

          {/* Location Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRequestLocation}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer ${
                userLocation
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{userLocation ? 'RE-ACQUIRE LIVE GPS' : 'ENABLE LIVE GPS'}</span>
            </button>

            {/* Quick Test Location Switchers */}
            <div className="hidden sm:flex items-center space-x-1 text-xs text-slate-500 bg-slate-100 p-1 rounded-xl">
              <span className="px-2 text-[11px] font-medium text-slate-400">Test Points:</span>
              <button
                onClick={() => onSimulateLocation(21.3980, 79.3308, 'Ramtek Center')}
                className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-700 font-medium transition-colors cursor-pointer"
                title="Simulate GPS at Ramtek Tahsil Center"
              >
                Ramtek Center
              </button>
              <button
                onClick={() => onSimulateLocation(21.4012, 79.2598, 'Mansar')}
                className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-700 font-medium transition-colors cursor-pointer"
                title="Simulate GPS at Mansar Junction"
              >
                Mansar
              </button>
              <button
                onClick={() => onSimulateLocation(21.5885, 79.3820, 'Deolapar')}
                className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-700 font-medium transition-colors cursor-pointer"
                title="Simulate GPS at Deolapar NH44"
              >
                Deolapar
              </button>
            </div>
          </div>
        </div>

        {/* Current Origin Coordinate Banner */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Current Reference Point:</span>
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800">
              {userLocation
                ? `${userLocation.latitude.toFixed(6)}° N, ${userLocation.longitude.toFixed(6)}° E (±${Math.round(userLocation.accuracy)}m)`
                : '21.398000° N, 79.330800° E (Ramtek Center Default)'}
            </span>
          </div>
          <span className="text-slate-500 text-[11px]">
            {userLocation ? 'Live Device GPS Active' : 'Click "ENABLE LIVE GPS" or use test points to calculate exact distances'}
          </span>
        </div>
      </div>

      {/* Radius Filters & Comprehensive Search Bar */}
      <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Geographic Radius Filter (Select Maximum Distance):</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Shows all schools within the selected radius. Distance acts strictly as a geographic boundary.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search Name, UDISE, Village, GP, Block, PIN..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Radius Filter Pills - Exactly matches 5, 10, 15, 20, 25, 50, 100, 150, 200 KM & ALL */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {RADIUS_OPTIONS.map((opt) => {
            const isSelected = selectedRadius === opt.value;
            const count = radiusCounts[opt.label] || 0;
            return (
              <button
                key={opt.label}
                onClick={() => setSelectedRadius(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs scale-102'
                    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Result Count Banner & View Controls */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold text-blue-950">
            {totalCount} {totalCount === 1 ? 'school' : 'schools'} found
            {selectedRadius !== null ? ` within ${selectedRadius} KM` : ' across all distances'}
            {filterQuery.trim() && ` matching "${filterQuery}"`}
          </div>
          <div className="text-xs text-blue-800 mt-0.5">
            Sorted strictly from <span className="font-semibold underline">Nearest to Farthest</span>. All matching schools are included.
          </div>
        </div>

        {/* Page size / View All selector */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-600 font-medium">Display Mode:</span>
          <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              onClick={() => setPageSize(24)}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                pageSize === 24 ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              24
            </button>
            <button
              onClick={() => setPageSize(48)}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                pageSize === 48 ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              48
            </button>
            <button
              onClick={() => setPageSize(96)}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                pageSize === 96 ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              96
            </button>
            <button
              onClick={() => setPageSize('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-semibold ${
                pageSize === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Show All ({totalCount})
            </button>
          </div>
        </div>
      </div>

      {/* School Cards Grid - All 13 Required Fields Displayed */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayedSchools.map((school) => {
          const isVisited = visitPlanUdiseCodes.has(school.udiseCode);
          return (
            <div
              key={school.udiseCode}
              id={`near-school-${school.udiseCode}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative"
            >
              {/* Header Row: Distance in KM & Location Accuracy Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-1.5 text-blue-700 bg-blue-50/90 px-3 py-1 rounded-xl border border-blue-100">
                  <Compass className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-bold text-sm tracking-tight">
                    {school.distanceKm ?? 0} KM
                  </span>
                  <span className="text-[10px] text-blue-500 font-medium">away</span>
                </div>
                <div>{getLocationBadge(school.locationStatus)}</div>
              </div>

              {/* 1. School Name */}
              <div className="space-y-2">
                <h3
                  onClick={() => onSelectSchool(school)}
                  className="font-bold text-base text-slate-900 hover:text-blue-600 transition-colors line-clamp-2 cursor-pointer leading-snug"
                  title={school.schoolName}
                >
                  {school.schoolName}
                </h3>

                <div className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                  UDISE: <span className="font-semibold text-slate-800">{school.udiseCode}</span>
                </div>

                {/* Structured 13-Point Field Specifications Grid */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs pt-1 border-t border-slate-100">
                  {/* 3. Village */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Village</span>
                    <span className="font-semibold text-slate-800 truncate block" title={school.village}>
                      {school.village || 'N/A'}
                    </span>
                  </div>

                  {/* 4. Gram Panchayat */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Gram Panchayat</span>
                    <span className="font-semibold text-slate-800 truncate block" title={school.lgdPanchayat}>
                      {school.lgdPanchayat || school.village || 'N/A'}
                    </span>
                  </div>

                  {/* 5. Block */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Block</span>
                    <span className="font-semibold text-slate-800 truncate block">
                      {school.block || 'RAMTEK'}
                    </span>
                  </div>

                  {/* 6. Cluster */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Cluster</span>
                    <span className="font-semibold text-slate-800 truncate block" title={school.cluster}>
                      {school.cluster || 'N/A'}
                    </span>
                  </div>

                  {/* 7. PIN Code */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">PIN Code</span>
                    <span className="font-semibold text-slate-800 block">
                      {school.pinCode || '441401'}
                    </span>
                  </div>

                  {/* 11. School Status */}
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Status</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        school.schoolStatus.toLowerCase().includes('closed')
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {school.schoolStatus || 'Operational'}
                    </span>
                  </div>

                  {/* 8. School Category */}
                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Category</span>
                    <span className="font-medium text-slate-700 text-[11px] block truncate" title={school.schoolCategory}>
                      {school.schoolCategory}
                    </span>
                  </div>

                  {/* 9. School Management & 10. School Type */}
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium" title="School Management">
                      Mgmt: {school.schoolManagement}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium" title="School Type">
                      Type: {school.schoolType}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: 12. View on Map, 13. Get Directions, + Visit Planner */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                {/* 12. View on Map */}
                <button
                  onClick={() => onViewOnMap(school)}
                  className="py-2 px-1 text-center text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                  title="Center and show this school marker on interactive map"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>VIEW MAP</span>
                </button>

                {/* 13. Get Directions */}
                <a
                  href={generateDirectionsUrl(school, userLocation)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-1 text-center text-xs font-semibold rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                  title="Open live Google Maps navigation directions"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>DIRECTIONS</span>
                </a>

                {/* Visit Planner */}
                <button
                  onClick={() => onAddToVisitPlan(school)}
                  className={`py-2 px-1 text-center text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer ${
                    isVisited
                      ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title={isVisited ? 'Already in Field Visit Plan' : 'Add to Field Visit Plan'}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{isVisited ? 'IN PLAN' : '+ VISIT'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls - Visible when more than 1 page and not in 'ALL' mode */}
      {totalPages > 1 && pageSize !== 'ALL' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            Showing <span className="font-bold text-slate-900">{(safeCurrentPage - 1) * numericPageSize + 1}</span> to{' '}
            <span className="font-bold text-slate-900">
              {Math.min(safeCurrentPage * numericPageSize, totalCount)}
            </span>{' '}
            of <span className="font-bold text-slate-900">{totalCount}</span> schools within{' '}
            {selectedRadius !== null ? `${selectedRadius} KM` : 'all ranges'}
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span className="px-3 py-1 font-semibold text-slate-800">
              Page {safeCurrentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredSchools.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No schools found in this range</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try expanding your proximity radius to 50 KM, 100 KM, 150 KM, or 200 KM to encompass all schools.
          </p>
          <button
            onClick={() => {
              setSelectedRadius(null);
              setFilterQuery('');
            }}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
          >
            Show All Schools (Reset Radius & Filters)
          </button>
        </div>
      )}
    </section>
  );
};
