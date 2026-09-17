import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Layers,
  Compass,
  CheckCircle2,
  ExternalLink,
  Plus,
  Search,
  Filter,
  Info,
} from 'lucide-react';
import { SchoolRecord, UserLocation, LocationStatus } from '../types';
import { calculateDistanceKm, generateDirectionsUrl } from '../utils/geo';

interface MapViewProps {
  schools: SchoolRecord[];
  userLocation: UserLocation | null;
  selectedSchool: SchoolRecord | null;
  focusedSchool: SchoolRecord | null;
  onSelectSchool: (school: SchoolRecord) => void;
  onAddToVisitPlan: (school: SchoolRecord) => void;
  visitPlanUdiseCodes: Set<string>;
  routeSchools: SchoolRecord[];
}

const RAMTEK_CENTER: [number, number] = [21.3980, 79.3308];

const MAP_RADIUS_OPTIONS: { label: string; value: number | null }[] = [
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

export const MapView: React.FC<MapViewProps> = ({
  schools,
  userLocation,
  selectedSchool,
  focusedSchool,
  onSelectSchool,
  onAddToVisitPlan,
  visitPlanUdiseCodes,
  routeSchools,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circleLayerRef = useRef<L.Circle | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());

  // Geographic Radius Filter (Distance ceiling, NOT a result count limit)
  const [selectedRadiusKm, setSelectedRadiusKm] = useState<number | null>(100);
  const [filterLocStatus, setFilterLocStatus] = useState<string>('ALL');
  const [mapSearch, setMapSearch] = useState<string>('');

  // Create customized SVG DivIcons for each status
  const createMarkerIcon = (status: LocationStatus, isRouteStop?: number) => {
    let bgColor = '#2563eb'; // blue
    let label = 'V';

    if (isRouteStop !== undefined) {
      bgColor = '#4f46e5'; // indigo
      return L.divIcon({
        className: 'custom-route-marker',
        html: `<div style="background-color: ${bgColor}; color: white; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">${isRouteStop + 1}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
    }

    switch (status) {
      case 'EXACT SCHOOL LOCATION':
        bgColor = '#059669'; // emerald green
        label = 'E';
        break;
      case 'VILLAGE LOCATION':
        bgColor = '#2563eb'; // blue
        label = 'V';
        break;
      case 'GRAM PANCHAYAT LOCATION':
        bgColor = '#7c3aed'; // violet/purple
        label = 'GP';
        break;
      case 'LOCATION NEEDS VERIFICATION':
      default:
        bgColor = '#d97706'; // amber
        label = '!';
        break;
    }

    return L.divIcon({
      className: 'custom-school-marker',
      html: `<div style="background-color: ${bgColor}; color: white; border: 2px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; cursor: pointer;">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14],
    });
  };

  // Filter schools on the map - Shows ALL matching schools within radius
  const visibleSchools = useMemo(() => {
    const lat = userLocation?.latitude ?? RAMTEK_CENTER[0];
    const lng = userLocation?.longitude ?? RAMTEK_CENTER[1];

    return schools.filter((s) => {
      const dist = calculateDistanceKm(lat, lng, s.latitude, s.longitude);
      if (selectedRadiusKm !== null && dist > selectedRadiusKm) return false;

      if (filterLocStatus !== 'ALL' && s.locationStatus !== filterLocStatus) {
        return false;
      }

      // Search across all 7 fields
      if (mapSearch.trim()) {
        const q = mapSearch.toLowerCase().trim();
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
  }, [schools, userLocation, selectedRadiusKm, filterLocStatus, mapSearch]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: RAMTEK_CENTER,
      zoom: 11,
      zoomControl: false,
    });

    // Clean OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | Lighthouse Ramtek',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer for markers
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Coverage Radius Circle
    circleLayerRef.current = L.circle(RAMTEK_CENTER, {
      radius: (selectedRadiusKm ?? 100) * 1000,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: selectedRadiusKm === null ? 0 : 0.05,
      weight: selectedRadiusKm === null ? 0 : 1.5,
      dashArray: '5, 8',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Coverage Radius Circle when selectedRadiusKm or userLocation changes
  useEffect(() => {
    if (!mapInstanceRef.current || !circleLayerRef.current) return;
    const center = userLocation
      ? ([userLocation.latitude, userLocation.longitude] as [number, number])
      : RAMTEK_CENTER;
    circleLayerRef.current.setLatLng(center);

    if (selectedRadiusKm === null) {
      circleLayerRef.current.setStyle({ fillOpacity: 0, weight: 0 });
    } else {
      circleLayerRef.current.setStyle({ fillOpacity: 0.05, weight: 1.5 });
      circleLayerRef.current.setRadius(selectedRadiusKm * 1000);
    }
  }, [selectedRadiusKm, userLocation]);

  // Update User Location Live Marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `
          <div style="position: relative; width: 24px; height: 24px;">
            <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; border-radius: 50%; background-color: #2563eb; border: 3px solid #ffffff; box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([userLocation.latitude, userLocation.longitude], {
          icon: userIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px;">
              <strong style="color: #1e3a8a;">Your Current Location</strong>
              <div style="font-size: 11px; color: #475569; margin-top: 4px;">
                Accuracy: ±${Math.round(userLocation.accuracy)} meters
              </div>
            </div>
          `);
      } else {
        userMarkerRef.current.setLatLng([userLocation.latitude, userLocation.longitude]);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // Render EVERY visible school marker on the map - NO DISCARDING
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();
    markersMapRef.current.clear();

    const routeIndexMap = new Map<string, number>();
    routeSchools.forEach((s, idx) => routeIndexMap.set(s.udiseCode, idx));

    // Show every single filtered school marker
    visibleSchools.forEach((school) => {
      const isRouteStop = routeIndexMap.get(school.udiseCode);
      const icon = createMarkerIcon(school.locationStatus, isRouteStop);

      const marker = L.marker([school.latitude, school.longitude], { icon });

      const dist = userLocation
        ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, school.latitude, school.longitude)
        : calculateDistanceKm(RAMTEK_CENTER[0], RAMTEK_CENTER[1], school.latitude, school.longitude);

      const inPlan = visitPlanUdiseCodes.has(school.udiseCode);

      // Format location accuracy
      const accuracyLabel =
        school.locationStatus === 'EXACT SCHOOL LOCATION'
          ? '✓ Exact School Compound'
          : 'Approximate Location (Village / GP)';

      const popupHtml = `
        <div style="min-width: 260px; font-family: system-ui, -apple-system, sans-serif; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 700; color: #1e293b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">UDISE: ${school.udiseCode}</span>
            <span style="font-size: 11px; font-weight: 800; color: #1e40af; background: #dbeafe; padding: 2px 6px; border-radius: 4px;">${dist} KM away</span>
          </div>

          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.3;">
            ${school.schoolName}
          </h4>

          <div style="font-size: 11px; color: #475569; margin-bottom: 6px; line-height: 1.4;">
            <div><strong>Village:</strong> ${school.village} | <strong>GP:</strong> ${school.lgdPanchayat || school.village}</div>
            <div><strong>Block:</strong> ${school.block} | <strong>Cluster:</strong> ${school.cluster} | <strong>PIN:</strong> ${school.pinCode}</div>
          </div>

          <div style="font-size: 10px; padding: 4px 6px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 8px;">
            <div><strong>Accuracy:</strong> <span style="color: ${school.locationStatus === 'EXACT SCHOOL LOCATION' ? '#059669' : '#2563eb'}; font-weight: 600;">${accuracyLabel}</span></div>
            <div><strong>Category:</strong> ${school.schoolCategory}</div>
            <div><strong>Management:</strong> ${school.schoolManagement} | <strong>Type:</strong> ${school.schoolType}</div>
            <div><strong>Status:</strong> <span style="font-weight: 600; color: #059669;">${school.schoolStatus}</span></div>
          </div>

          <div style="display: flex; gap: 4px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
            <button id="btn-popup-details-${school.udiseCode}" style="flex: 1; padding: 6px 6px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
              Details
            </button>
            <a href="${generateDirectionsUrl(school, userLocation)}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; text-decoration: none; padding: 6px 6px; background: #059669; color: white; border-radius: 6px; font-size: 11px; font-weight: 700;">
              Directions
            </a>
            <button id="btn-popup-plan-${school.udiseCode}" style="flex: 1; padding: 6px 6px; background: ${inPlan ? '#d97706' : '#4f46e5'}; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
              ${inPlan ? 'In Plan' : '+ Plan'}
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        setTimeout(() => {
          const btnDetails = document.getElementById(`btn-popup-details-${school.udiseCode}`);
          if (btnDetails) {
            btnDetails.onclick = () => onSelectSchool(school);
          }
          const btnPlan = document.getElementById(`btn-popup-plan-${school.udiseCode}`);
          if (btnPlan) {
            btnPlan.onclick = () => onAddToVisitPlan(school);
          }
        }, 50);
      });

      layer.addLayer(marker);
      markersMapRef.current.set(school.udiseCode, marker);
    });
  }, [visibleSchools, userLocation, routeSchools, visitPlanUdiseCodes]);

  // Handle focusedSchool flyTo animation and auto-popup
  useEffect(() => {
    if (!mapInstanceRef.current || !focusedSchool) return;
    const map = mapInstanceRef.current;
    map.flyTo([focusedSchool.latitude, focusedSchool.longitude], 15, {
      duration: 1.2,
    });

    const marker = markersMapRef.current.get(focusedSchool.udiseCode);
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 1200);
    }
  }, [focusedSchool]);

  // Update Route Polyline if active stops exist
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (routeSchools.length >= 2) {
      const latLngs: [number, number][] = [];
      if (userLocation) {
        latLngs.push([userLocation.latitude, userLocation.longitude]);
      }
      routeSchools.forEach((s) => latLngs.push([s.latitude, s.longitude]));

      routePolylineRef.current = L.polyline(latLngs, {
        color: '#4f46e5',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 6',
      }).addTo(map);

      map.fitBounds(routePolylineRef.current.getBounds(), { padding: [50, 50] });
    }
  }, [routeSchools, userLocation]);

  const recenterMap = (target: 'ramtek' | 'user') => {
    if (!mapInstanceRef.current) return;
    if (target === 'user' && userLocation) {
      mapInstanceRef.current.flyTo([userLocation.latitude, userLocation.longitude], 13);
    } else {
      mapInstanceRef.current.flyTo(RAMTEK_CENTER, 11);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] min-h-[580px] bg-slate-100 overflow-hidden">
      {/* Floating Filter Controls Header */}
      <div className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Radius Filter & Search Toolbar */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-xs p-2 rounded-2xl shadow-lg border border-slate-200/80 flex flex-wrap items-center gap-2 max-w-full">
          {/* Dynamic Pin Counter */}
          <div className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold border border-blue-100">
            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              {visibleSchools.length} {visibleSchools.length === 1 ? 'school' : 'schools'} on map
              {selectedRadiusKm !== null ? ` (within ${selectedRadiusKm} KM)` : ' (All Distances)'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          {/* Radius selector buttons - 5, 10, 15, 20, 25, 50, 100, 150, 200 KM, ALL */}
          <div className="flex items-center flex-wrap gap-1">
            {MAP_RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSelectedRadiusKm(opt.value)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedRadiusKm === opt.value
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          {/* Quick Search on Map - Searches across all 7 fields */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={mapSearch}
              onChange={(e) => setMapSearch(e.target.value)}
              placeholder="Search map pins..."
              className="pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 sm:w-44"
            />
          </div>
        </div>

        {/* Recenter & Map Tools */}
        <div className="pointer-events-auto flex items-center space-x-2">
          {userLocation && (
            <button
              onClick={() => recenterMap('user')}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Center on My Live GPS Location"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Center GPS</span>
            </button>
          )}
          <button
            onClick={() => recenterMap('ramtek')}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Reset to Ramtek Center"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Ramtek Center</span>
          </button>
        </div>
      </div>

      {/* Floating Map Legend */}
      <div className="absolute bottom-6 left-4 z-[1000] bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl shadow-lg border border-slate-200/80 max-w-xs text-xs space-y-2">
        <div className="font-bold text-slate-900 flex items-center justify-between">
          <span>Map Pin Legend</span>
          <span className="text-[11px] font-normal text-slate-500">{visibleSchools.length} pins plotted</span>
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 inline-block shrink-0"></span>
            <span className="text-slate-700">Exact School Location (Ground Pin)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-blue-600 inline-block shrink-0"></span>
            <span className="text-slate-700">Approximate Location (Village Pin)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-purple-600 inline-block shrink-0"></span>
            <span className="text-slate-700">Approximate Location (Gram Panchayat)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
            <span className="text-slate-700">Location Needs Verification</span>
          </div>
        </div>
        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>{selectedRadiusKm !== null ? `Radius: ${selectedRadiusKm} KM` : 'All Distances'}</span>
          <span>All matching pins rendered</span>
        </div>
      </div>

      {/* Leaflet Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
};
