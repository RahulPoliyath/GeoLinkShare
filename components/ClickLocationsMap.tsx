'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type LType from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Crosshair,
  Globe2,
  Copy,
  Check,
  Maximize2,
  Smartphone,
  Monitor,
  Tablet,
  Layers,
  Clock,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getCountryFlag, getRelativeTime } from '@/lib/utils';

export interface MapClickLocation {
  id: string;
  linkId: string;
  shortCode: string;
  timestamp: string;
  ip: string;
  countryCode: string;
  countryName: string;
  city: string;
  region?: string | null;
  timezone?: string | null;
  referrer: string;
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
  geoSource: 'gps' | 'ip';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters?: number | null;
  gpsSamplesCount?: number | null;
}

interface ClickLocationsMapProps {
  locations: MapClickLocation[];
  selectedLocationId: string | null;
  onSelectLocation: (id: string) => void;
}

function buildSafePopupElement(loc: MapClickLocation): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.minWidth = '200px';
  wrap.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  wrap.style.fontSize = '12px';
  wrap.style.lineHeight = '1.45';
  wrap.style.color = '#0f172a';

  const header = document.createElement('div');
  header.style.fontWeight = '700';
  header.style.marginBottom = '4px';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';

  const codeSpan = document.createElement('span');
  codeSpan.style.fontFamily = 'ui-monospace, monospace';
  codeSpan.style.color = '#4f46e5';
  codeSpan.textContent = `/r/${loc.shortCode}`;
  header.appendChild(codeSpan);

  const sourceSpan = document.createElement('span');
  sourceSpan.style.fontSize = '10px';
  sourceSpan.style.fontWeight = '600';
  sourceSpan.style.color = loc.geoSource === 'gps' ? '#059669' : '#0284c7';
  sourceSpan.textContent =
    loc.geoSource === 'gps' && loc.accuracyMeters != null
      ? `GPS ±${loc.accuracyMeters.toFixed(2)}m`
      : 'IP City';
  header.appendChild(sourceSpan);
  wrap.appendChild(header);

  const place = document.createElement('div');
  place.style.fontWeight = '600';
  place.textContent = `${loc.city}${loc.region ? `, ${loc.region}` : ''}, ${loc.countryName}`;
  wrap.appendChild(place);

  const coords = document.createElement('div');
  coords.style.fontFamily = 'ui-monospace, monospace';
  coords.style.fontSize = '11px';
  coords.style.color = '#475569';
  coords.style.marginTop = '2px';
  const decimals = loc.geoSource === 'gps' ? 7 : 4;
  coords.textContent = `${loc.latitude.toFixed(decimals)}, ${loc.longitude.toFixed(decimals)}`;
  wrap.appendChild(coords);

  const meta = document.createElement('div');
  meta.style.fontSize = '11px';
  meta.style.color = '#64748b';
  meta.style.marginTop = '4px';
  meta.textContent = `${loc.device} · ${loc.browser} / ${loc.os} · ${loc.ip}`;
  wrap.appendChild(meta);

  return wrap;
}

export function ClickLocationsMap({
  locations,
  selectedLocationId,
  onSelectLocation,
}: ClickLocationsMapProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const tileLayerRef = useRef<LType.TileLayer | null>(null);
  const markersLayerRef = useRef<LType.LayerGroup | null>(null);
  const markerByIdRef = useRef<Map<string, LType.Marker>>(new Map());
  const leafletRef = useRef<typeof LType | null>(null);
  const lastAutoFittedKeyRef = useRef<string>('');
  const onSelectRef = useRef(onSelectLocation);
  useEffect(() => {
    onSelectRef.current = onSelectLocation;
  }, [onSelectLocation]);

  const [sourceFilter, setSourceFilter] = useState<'all' | 'gps' | 'ip'>('all');
  const [tileMode, setTileMode] = useState<'adaptive' | 'street'>('adaptive');
  const [mapReady, setMapReady] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const filteredLocations = useMemo(() => {
    if (sourceFilter === 'all') return locations;
    return locations.filter((l) => l.geoSource === sourceFilter);
  }, [locations, sourceFilter]);

  const activeLocation = useMemo(() => {
    if (filteredLocations.length === 0) return null;
    if (selectedLocationId) {
      const found = filteredLocations.find((l) => l.id === selectedLocationId);
      if (found) return found;
    }
    return filteredLocations[0];
  }, [filteredLocations, selectedLocationId]);

  const gpsCount = useMemo(
    () => locations.filter((l) => l.geoSource === 'gps').length,
    [locations]
  );
  const ipCount = useMemo(
    () => locations.filter((l) => l.geoSource === 'ip').length,
    [locations]
  );

  // Compute slightly fanned coordinates for overlapping IP city markers so every click pin is clickable
  const plottedLocations = useMemo(() => {
    const coordBucketCounts = new Map<string, number>();
    return filteredLocations.map((loc) => {
      const bucketKey = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
      const index = coordBucketCounts.get(bucketKey) || 0;
      coordBucketCounts.set(bucketKey, index + 1);

      if (index === 0 || loc.geoSource === 'gps') {
        return { loc, plotLat: loc.latitude, plotLng: loc.longitude };
      }

      const angle = (index * 137.5 * Math.PI) / 180;
      const radiusDeg = 0.0028 * Math.sqrt(index);
      return {
        loc,
        plotLat: loc.latitude + Math.sin(angle) * radiusDeg,
        plotLng: loc.longitude + Math.cos(angle) * radiusDeg,
      };
    });
  }, [filteredLocations]);

  // Initialize Leaflet map once on client mount
  useEffect(() => {
    let cancelled = false;
    const markerMap = markerByIdRef.current;

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        center: [20, 10],
        zoom: 2,
        minZoom: 2,
        maxZoom: 19,
        worldCopyJump: true,
        zoomControl: true,
      });

      const markersLayer = L.layerGroup().addTo(map);
      mapRef.current = map;
      markersLayerRef.current = markersLayer;
      setMapReady(true);
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
        markerMap.clear();
      }
    };
  }, []);

  // Switch tile layer dynamically with theme or street mode toggle
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !mapReady) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
    let maxZoom = 19;

    if (tileMode === 'street') {
      url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
    } else if (theme === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    }

    const layer = L.tileLayer(url, {
      attribution,
      maxZoom,
      subdomains: tileMode === 'street' ? [] : ['a', 'b', 'c', 'd'],
    });
    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [theme, tileMode, mapReady]);

  // Render visitor click pins & accuracy circles
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !L || !layerGroup || !mapReady) return;

    layerGroup.clearLayers();
    markerByIdRef.current.clear();

    const boundsCoords: [number, number][] = [];

    for (const { loc, plotLat, plotLng } of plottedLocations) {
      const isSelected = activeLocation?.id === loc.id;
      const isGps = loc.geoSource === 'gps';
      const ringColor = isGps ? '#10b981' : '#0ea5e9';
      const coreColor = isSelected ? '#4f46e5' : isGps ? '#059669' : '#0284c7';
      const size = isSelected ? 22 : 16;

      if (isGps && loc.accuracyMeters != null && loc.accuracyMeters > 0) {
        L.circle([plotLat, plotLng], {
          radius: Math.max(loc.accuracyMeters, 2),
          color: '#10b981',
          weight: 1.5,
          opacity: 0.75,
          fillColor: '#10b981',
          fillOpacity: 0.14,
        }).addTo(layerGroup);
      }

      const icon = L.divIcon({
        className: 'lp-map-marker-icon',
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${coreColor};border:2.5px solid #ffffff;box-shadow:0 0 0 3px ${ringColor}44,0 4px 12px rgba(15,23,42,0.45);transform:translate(-50%,-50%);cursor:pointer;"></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([plotLat, plotLng], {
        icon,
        zIndexOffset: isSelected ? 600 : isGps ? 300 : 100,
      });

      marker.bindPopup(buildSafePopupElement(loc), {
        closeButton: true,
        offset: [0, -8],
      });

      marker.on('click', () => {
        onSelectRef.current(loc.id);
      });

      marker.addTo(layerGroup);
      markerByIdRef.current.set(loc.id, marker);
      boundsCoords.push([plotLat, plotLng]);
    }

    // Fit map cleanly whenever the set of visible location IDs changes
    const boundsKey = plottedLocations.map((p) => p.loc.id).join('|');
    if (boundsCoords.length > 0 && lastAutoFittedKeyRef.current !== boundsKey) {
      lastAutoFittedKeyRef.current = boundsKey;
      if (boundsCoords.length === 1) {
        const only = plottedLocations[0].loc;
        map.setView(boundsCoords[0], only.geoSource === 'gps' ? 16 : 11, {
          animate: false,
        });
      } else {
        const bounds = L.latLngBounds(boundsCoords);
        map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14, animate: false });
      }
    }
  }, [plottedLocations, activeLocation?.id, mapReady]);

  // Focus & open popup when a user selects a specific click row
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedLocationId) return;
    const match = plottedLocations.find((p) => p.loc.id === selectedLocationId);
    if (!match) return;

    const targetZoom =
      match.loc.geoSource === 'gps'
        ? Math.max(map.getZoom(), 16)
        : Math.max(map.getZoom(), 11);

    map.flyTo([match.plotLat, match.plotLng], targetZoom, {
      duration: 0.6,
    });
    const marker = markerByIdRef.current.get(match.loc.id);
    if (marker) {
      marker.openPopup();
    }
  }, [selectedLocationId, plottedLocations, mapReady]);

  const handleFitAll = () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || plottedLocations.length === 0) return;

    if (plottedLocations.length === 1) {
      const only = plottedLocations[0];
      map.flyTo([only.plotLat, only.plotLng], only.loc.geoSource === 'gps' ? 16 : 11, {
        duration: 0.5,
      });
      return;
    }

    const bounds = L.latLngBounds(plottedLocations.map((p) => [p.plotLat, p.plotLng]));
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
  };

  const handleCopyActiveCoords = () => {
    if (!activeLocation) return;
    const decimals = activeLocation.geoSource === 'gps' ? 7 : 4;
    navigator.clipboard.writeText(
      `${activeLocation.latitude.toFixed(decimals)}, ${activeLocation.longitude.toFixed(decimals)}`
    );
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1800);
  };

  const DeviceIcon =
    activeLocation?.device === 'mobile'
      ? Smartphone
      : activeLocation?.device === 'tablet'
        ? Tablet
        : Monitor;

  return (
    <div className="space-y-4">
      {/* Map Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setSourceFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                sourceFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({locations.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('gps')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                sourceFilter === 'gps'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              GPS Exact ({gpsCount})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('ip')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                sourceFilter === 'ip'
                  ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              IP City ({ipCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              setTileMode((prev) => (prev === 'adaptive' ? 'street' : 'adaptive'))
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-medium transition-colors whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{tileMode === 'street' ? 'Clean Map' : 'Street Detail'}</span>
          </button>

          {plottedLocations.length > 0 && (
            <button
              type="button"
              onClick={handleFitAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-white/15 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-medium transition-colors whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fit All Pins</span>
            </button>
          )}
        </div>
      </div>

      {/* Map Viewport + Selected Visitor Location Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Interactive Map Container (isolated z-index so Leaflet never overlaps sticky Navbar) */}
        <div className="lg:col-span-2 relative z-0 isolate rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/15 bg-slate-100 dark:bg-slate-950 min-h-[340px] sm:min-h-[420px]">
          <div ref={containerRef} className="w-full h-[340px] sm:h-[420px]" />

          {plottedLocations.length === 0 && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center p-6 text-center bg-slate-50/80 dark:bg-slate-950/75 backdrop-blur-xs pointer-events-none">
              <MapPin className="w-8 h-8 text-indigo-500 mb-2" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No click locations recorded yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1">
                When visitors open any of your shortened links, their city or GPS location pin
                will appear automatically on this map.
              </p>
            </div>
          )}
        </div>

        {/* Selected Visitor Details + Clickable Pin List */}
        <div className="flex flex-col justify-between gap-4 p-4 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
          {activeLocation ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">
                    {getCountryFlag(activeLocation.countryCode)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate">
                      /r/{activeLocation.shortCode}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {activeLocation.city}
                      {activeLocation.region ? `, ${activeLocation.region}` : ''},{' '}
                      {activeLocation.countryName}
                    </div>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${
                    activeLocation.geoSource === 'gps'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-sky-600 dark:text-sky-400'
                  }`}
                >
                  {activeLocation.geoSource === 'gps' ? (
                    <Crosshair className="w-3.5 h-3.5" />
                  ) : (
                    <Globe2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {activeLocation.geoSource === 'gps' && activeLocation.accuracyMeters != null
                      ? `GPS ±${activeLocation.accuracyMeters.toFixed(2)}m`
                      : 'IP City'}
                  </span>
                </span>
              </div>

              {/* Coordinates + Copy */}
              <div className="p-3 rounded-xl bg-white/75 dark:bg-slate-950/60 border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeLocation.geoSource === 'gps'
                      ? 'Verified GNSS Coordinates'
                      : 'Approximate IP Coordinates'}
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums truncate">
                    {activeLocation.latitude.toFixed(activeLocation.geoSource === 'gps' ? 7 : 4)},{' '}
                    {activeLocation.longitude.toFixed(activeLocation.geoSource === 'gps' ? 7 : 4)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyActiveCoords}
                  className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 shrink-0"
                  title="Copy Coordinates"
                >
                  {copiedCoords ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Visitor Metadata Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Device &amp; OS</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100 truncate">
                    <DeviceIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">
                      {activeLocation.device} · {activeLocation.os}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Browser</div>
                  <div className="mt-0.5 font-medium text-slate-800 dark:text-slate-100 truncate">
                    {activeLocation.browser}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Masked IP</div>
                  <div className="mt-0.5 font-mono tabular-nums text-slate-800 dark:text-slate-100 truncate">
                    {activeLocation.ip}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Clicked</div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono tabular-nums text-slate-800 dark:text-slate-100 truncate">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{getRelativeTime(activeLocation.timestamp)}</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="truncate max-w-full">
                  Source: <span className="text-slate-700 dark:text-slate-200">{activeLocation.referrer}</span>
                </span>
                {activeLocation.timezone && (
                  <span className="font-mono">{activeLocation.timezone}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="w-6 h-6 text-slate-400 mb-1.5" />
              <span>Select a pin on the map to inspect visitor details.</span>
            </div>
          )}

          {/* Quick Pin Switcher List */}
          {plottedLocations.length > 0 && (
            <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Recent Visitor Pins ({plottedLocations.length})
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {plottedLocations.slice(0, 15).map(({ loc }) => {
                  const isSelected = activeLocation?.id === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => onSelectLocation(loc.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-indigo-600/12 dark:bg-indigo-500/20 border border-indigo-500/35 text-slate-900 dark:text-white'
                          : 'hover:bg-slate-200/60 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0">{getCountryFlag(loc.countryCode)}</span>
                        <span className="truncate font-medium">
                          {loc.city}, {loc.countryCode}
                        </span>
                        <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 shrink-0">
                          /r/{loc.shortCode}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono tabular-nums shrink-0 ${
                          loc.geoSource === 'gps'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {loc.geoSource === 'gps' && loc.accuracyMeters != null
                          ? `±${loc.accuracyMeters.toFixed(1)}m`
                          : getRelativeTime(loc.timestamp)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-emerald-500" />
          <span>Green pin &amp; circle: Exact visitor GNSS/GPS fix</span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5 text-sky-500" />
          <span>Blue pin: Approximate IP city location</span>
        </span>
      </div>
    </div>
  );
}
