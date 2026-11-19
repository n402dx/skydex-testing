import {
  Activity,
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronUp,
  ListFilter,
  LocateFixed,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Radar,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AirportBoardPanel} from './components/AirportBoardPanel';
import {BottomOpsDrawer, type BottomOpsTab} from './components/BottomOpsDrawer';
import {FlightDeck3D} from './components/FlightDeck3D';
import {FlightInspectorPanel} from './components/FlightInspectorPanel';
import {FlightPlannerView} from './components/FlightPlannerView';
import {PWAInstallButton} from './components/PWAInstallButton';
import {DEFAULT_RADAR_SETTINGS, RadarMap, RadarSettingsPopover} from './components/RadarMap';
import {TaxiAcarsView} from './components/TaxiAcarsView';
import {getDbFlagMeta, getEmergencySquawkMeta} from './components/aircraftIcons';
import {Badge} from './components/ui/badge';
import {Button} from './components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './components/ui/card';
import {Input} from './components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from './components/ui/popover';
import {Separator} from './components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from './components/ui/table';
import {TabsList, TabsTrigger} from './components/ui/tabs';
import {
  AIRPORT_CATALOG,
  REGION_PRESETS,
  resolveCountryFromFlight,
  type RegionPreset,
} from './data/aviationCatalog';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {apiFetchJson, DEFAULT_CF_WORKER_URL} from './services/directAviationClient';
import {
  deadReckonFlight,
  haversineNm,
  loadAcarsSnapshot,
  loadFlightSnapshot,
  loadWeatherSnapshot,
  saveAcarsSnapshot,
  saveFlightSnapshot,
  saveWeatherSnapshot,
} from './services/offlineStore';
import type {
  AcarsMessage,
  AirfieldSurfaceData,
  AirportBoardFlight,
  AirportBoardResponse,
  AirportDisruption,
  AirportMarker,
  AirportWeather,
  AppView,
  FlightDetail,
  FlightsResponse,
  LiveFlight,
  LiveFlightUpdateItem,
  ProviderStatus,
  RadarSettings,
  RainViewerMeta,
  SigmetHazard,
  ThreeViewMode,
  TrafficFlagFilter,
} from './types/aviation';

const RADAR_SETTINGS_KEY = 'skydeck-radar-settings-v1';

function detectPortraitMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return (h > w && w <= 1024) || w < 640;
}

function loadSavedRadarSettings(): RadarSettings {
  try {
    const raw = window.localStorage.getItem(RADAR_SETTINGS_KEY);
    if (!raw) return DEFAULT_RADAR_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RadarSettings>;
    return {
      ...DEFAULT_RADAR_SETTINGS,
      ...parsed,
      cfWorkerUrl: parsed.cfWorkerUrl?.trim() ? parsed.cfWorkerUrl : DEFAULT_CF_WORKER_URL,
    };
  } catch {
    return DEFAULT_RADAR_SETTINGS;
  }
}

function buildLocalRegion(lat: number, lon: number, label?: string): RegionPreset {
  const latSpan = 3.2;
  const lonSpan = 4.6;
  return {
    id: 'local',
    label: label ? `Near Me (${label})` : 'Near Me (Local)',
    subtitle: `${lat.toFixed(2)}°, ${lon.toFixed(2)}° · Live local ADS-B sector`,
    center: [lat, lon],
    zoom: 8,
    bounds: {
      lamin: Math.max(-85, lat - latSpan),
      lomin: Math.max(-180, lon - lonSpan),
      lamax: Math.min(85, lat + latSpan),
      lomax: Math.min(180, lon + lonSpan),
    },
  };
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [radarSettings, setRadarSettings] = useState<RadarSettings>(() => loadSavedRadarSettings());
  const [activeView, setActiveView] = useState<AppView>('radar');
  const [threeViewMode, setThreeViewMode] = useState<ThreeViewMode>('cockpit');
  const [activeRegion, setActiveRegion] = useState<RegionPreset>(REGION_PRESETS[0]);
  const [localRegion, setLocalRegion] = useState<RegionPreset | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
    label?: string;
    source: 'gps' | 'ip';
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [flyToLocation, setFlyToLocation] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    seq: number;
  } | null>(null);
  const [bounds, setBounds] = useState(REGION_PRESETS[0].bounds);
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'air' | 'ground'>('all');
  const [trafficFilter, setTrafficFilter] = useState<TrafficFlagFilter>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(() => detectPortraitMobileViewport());
  const [mobileSheetDetent, setMobileSheetDetent] = useState<'peek' | 'expanded'>('peek');

  const [rawFlights, setRawFlights] = useState<LiveFlight[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(true);
  const [flightsError, setFlightsError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());
  const [nowEpochSec, setNowEpochSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<FlightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [followSelected, setFollowSelected] = useState(false);
  const [isolateSelected, setIsolateSelected] = useState(false);

  const [selectedAirport, setSelectedAirport] = useState<{
    icao: string;
    iata: string;
    name: string;
  } | null>(null);
  const [airportBoard, setAirportBoard] = useState<AirportBoardResponse | null>(null);
  const [airportBoardLoading, setAirportBoardLoading] = useState(false);
  const [selectedAirportSurface, setSelectedAirportSurface] = useState<AirfieldSurfaceData | null>(null);
  const [airportTrafficFilter, setAirportTrafficFilter] = useState<
    'none' | 'all' | 'arrivals' | 'departures' | 'delayed'
  >('none');
  const [sidebarMode, setSidebarMode] = useState<'flight' | 'airport' | null>(null);

  const [mapAirports, setMapAirports] = useState<AirportMarker[]>([]);
  const [airportsWeather, setAirportsWeather] = useState<AirportWeather[]>([]);
  const [sigmets, setSigmets] = useState<SigmetHazard[]>([]);
  const [rainviewer, setRainviewer] = useState<RainViewerMeta | null>(null);
  const [acarsMessages, setAcarsMessages] = useState<AcarsMessage[]>([]);
  const [acarsStatus, setAcarsStatus] = useState<string>('Airframes.io live');
  const [disruptions, setDisruptions] = useState<AirportDisruption[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [dockHidden, setDockHidden] = useState(false);
  const [showTrafficSheet, setShowTrafficSheet] = useState(false);
  const [opsDrawerOpen, setOpsDrawerOpen] = useState(false);
  const [opsTab, setOpsTab] = useState<BottomOpsTab>('updates');
  const [gateChangeUpdates, setGateChangeUpdates] = useState<LiveFlightUpdateItem[]>([]);
  const prevGateMapRef = useRef<Map<string, string>>(new Map());
  const [plannedRoute, setPlannedRoute] = useState<{
    originLat: number;
    originLon: number;
    destLat: number;
    destLon: number;
  } | null>(null);

  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const rawFlightsCountRef = useRef(0);
  rawFlightsCountRef.current = rawFlights.length;
  const flightRegistryRef = useRef<Map<string, {flight: LiveFlight; seenAtMs: number}>>(new Map());
  const initialLocateAttemptedRef = useRef(false);
  const flightsAbortRef = useRef<AbortController | null>(null);
  const airportsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const updateViewport = () => setIsPortraitMobile(detectPortraitMobileViewport());
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(RADAR_SETTINGS_KEY, JSON.stringify(radarSettings));
    } catch {
      // Ignore storage quota errors
    }
  }, [radarSettings]);

  const updateRadarSettings = useCallback((patch: Partial<RadarSettings>) => {
    setRadarSettings((prev) => {
      const next = {...prev, ...patch};
      if (patch.locateMeEnabled === false) {
        setUserLocation(null);
        setLocalRegion(null);
        if (activeRegion.id === 'local') {
          setActiveRegion(REGION_PRESETS[0]);
          setBounds(REGION_PRESETS[0].bounds);
        }
      }
      return next;
    });
  }, [activeRegion.id]);

  const resetRadarSettings = useCallback(() => {
    setRadarSettings(DEFAULT_RADAR_SETTINGS);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const id = window.setInterval(
      () => {
        setNowEpochSec(Math.floor(Date.now() / 1000));
      },
      isOnline ? 5000 : 2000,
    );
    return () => clearInterval(id);
  }, [isOnline]);

  const fetchAirportsInView = useCallback(
    async (targetBounds = boundsRef.current, zoom = activeRegion.zoom) => {
      if (!navigator.onLine) return;
      airportsAbortRef.current?.abort();
      const ac = new AbortController();
      airportsAbortRef.current = ac;
      try {
        const qs = new URLSearchParams({
          lamin: String(targetBounds.lamin),
          lomin: String(targetBounds.lomin),
          lamax: String(targetBounds.lamax),
          lomax: String(targetBounds.lomax),
          zoom: String(zoom),
        });
        const data = await apiFetchJson<{airports?: AirportMarker[]}>(
          `/api/airports?${qs.toString()}`,
          ac.signal,
        );
        if (!ac.signal.aborted && Array.isArray(data.airports)) {
          setMapAirports(data.airports);
        }
      } catch {
        // retain previous viewport airports or ignore aborted request
      }
    },
    [activeRegion.zoom],
  );

  const fetchLiveFlights = useCallback(
    async (targetBounds = boundsRef.current, regionKey = activeRegion.id) => {
      if (!navigator.onLine) {
        const cached = await loadFlightSnapshot(regionKey);
        if (cached) {
          setRawFlights(cached.flights);
          setLastFetchedAt(cached.fetchedAt);
          setFlightsError(null);
        }
        setFlightsLoading(false);
        return;
      }

      flightsAbortRef.current?.abort();
      const ac = new AbortController();
      flightsAbortRef.current = ac;

      try {
        const qs = new URLSearchParams({
          lamin: String(targetBounds.lamin),
          lomin: String(targetBounds.lomin),
          lamax: String(targetBounds.lamax),
          lomax: String(targetBounds.lomax),
          region: regionKey,
        });
        const data = await apiFetchJson<FlightsResponse>(`/api/flights?${qs.toString()}`, ac.signal);
        if (ac.signal.aborted) return;

        if (data.flights.length > 0) {
          const nowMs = Date.now();
          const reg = flightRegistryRef.current;

          for (const incoming of data.flights) {
            const key = (incoming.icao24 || incoming.id).toLowerCase();
            const prev = reg.get(key)?.flight;
            const merged: LiveFlight = prev
              ? {
                  ...prev,
                  ...incoming,
                  dbFlags: (prev.dbFlags ?? 0) | (incoming.dbFlags ?? 0) || undefined,
                  isLadd: Boolean(prev.isLadd || incoming.isLadd),
                  isMilitary: Boolean(prev.isMilitary || incoming.isMilitary),
                  isPia: Boolean(prev.isPia || incoming.isPia),
                  ownerOperator: incoming.ownerOperator || prev.ownerOperator,
                  registration: incoming.registration || prev.registration,
                  aircraftType:
                    incoming.aircraftType && incoming.aircraftType !== 'A320'
                      ? incoming.aircraftType
                      : prev.aircraftType || incoming.aircraftType,
                  origin: incoming.origin || prev.origin,
                  destination: incoming.destination || prev.destination,
                  trail:
                    incoming.trail && incoming.trail.length > 0 ? incoming.trail : prev.trail,
                }
              : incoming;
            reg.set(key, {flight: merged, seenAtMs: nowMs});
          }

          // Prune stale aircraft (> 65 seconds unseen)
          for (const [k, entry] of reg.entries()) {
            if (nowMs - entry.seenAtMs > 65_000) {
              reg.delete(k);
            }
          }

          // Keep up to 2,600 tracked aircraft, prioritizing Emergency -> Flagged -> Recent/In-Bounds
          const priorityRank = (e: {flight: LiveFlight; seenAtMs: number}) => {
            const f = e.flight;
            if (f.squawk === '7500' || f.squawk === '7600' || f.squawk === '7700') return 4;
            if (f.isLadd || f.isMilitary || f.isPia) return 3;
            const inB =
              f.lat >= targetBounds.lamin &&
              f.lat <= targetBounds.lamax &&
              f.lon >= targetBounds.lomin &&
              f.lon <= targetBounds.lomax;
            if (inB && !f.onGround) return 2;
            if (inB) return 1;
            return 0;
          };

          const mergedList = Array.from(reg.values())
            .sort((a, b) => {
              const pa = priorityRank(a);
              const pb = priorityRank(b);
              if (pa !== pb) return pb - pa;
              return b.seenAtMs - a.seenAtMs;
            })
            .slice(0, 2600)
            .map((e) => e.flight);

          setRawFlights(mergedList);
          setLastFetchedAt(data.fetchedAt);
          setFlightsError(null);
          await saveFlightSnapshot(regionKey, mergedList.slice(0, 900), data.fetchedAt);
        } else {
          const cached = await loadFlightSnapshot(regionKey);
          if (cached && rawFlightsCountRef.current === 0) {
            setRawFlights(cached.flights);
            setLastFetchedAt(cached.fetchedAt);
          }
        }
        setProviders(data.providers ?? []);
      } catch (err) {
        if (ac.signal.aborted) return;
        const cached = await loadFlightSnapshot(regionKey);
        if (cached && rawFlightsCountRef.current === 0) {
          setRawFlights(cached.flights);
          setLastFetchedAt(cached.fetchedAt);
          setFlightsError('Using cached ADS-B snapshot with Dead-Reckoning');
        } else if (rawFlightsCountRef.current === 0) {
          setFlightsError(err instanceof Error ? err.message : 'Unable to reach ADS-B feeds');
        }
      } finally {
        if (!ac.signal.aborted) setFlightsLoading(false);
      }
    },
    [activeRegion.id],
  );

  const fetchWeatherAndHazards = useCallback(async () => {
    const icaos = AIRPORT_CATALOG.map((a) => a.icao).join(',');
    try {
      const [wxData, hzData, disData] = await Promise.all([
        apiFetchJson<{airports?: AirportWeather[]}>(`/api/weather?icaos=${encodeURIComponent(icaos)}`),
        apiFetchJson<{sigmets?: SigmetHazard[]; rainviewer?: RainViewerMeta | null}>('/api/weather/hazards'),
        apiFetchJson<{items?: AirportDisruption[]}>('/api/disruptions'),
      ]);

      if (wxData.airports && wxData.airports.length > 0) {
        setAirportsWeather(wxData.airports);
        await saveWeatherSnapshot('hubs', wxData.airports);
      }
      setSigmets(hzData.sigmets ?? []);
      if (hzData.rainviewer) setRainviewer(hzData.rainviewer);
      setDisruptions(disData.items ?? []);
    } catch {
      const cachedWx = await loadWeatherSnapshot('hubs');
      if (cachedWx) setAirportsWeather(cachedWx.airports);
    }
  }, []);

  const fetchAcars = useCallback(async () => {
    try {
      const data = await apiFetchJson<{messages?: AcarsMessage[]; sourceStatus?: string}>('/api/acars');
      if (data.messages && data.messages.length > 0) {
        setAcarsMessages(data.messages);
        await saveAcarsSnapshot(data.messages);
      }
      if (data.sourceStatus) setAcarsStatus(data.sourceStatus);
    } catch {
      const cached = await loadAcarsSnapshot();
      if (cached) {
        setAcarsMessages(cached.messages);
        setAcarsStatus('Offline cached ACARS');
      }
    }
  }, []);

  const applyUserLocation = useCallback(
    (lat: number, lon: number, label: string | undefined, source: 'gps' | 'ip') => {
      const preset = buildLocalRegion(lat, lon, label);
      setUserLocation({lat, lon, label, source});
      setLocalRegion(preset);
      setActiveRegion(preset);
      setBounds(preset.bounds);
      setFlyToLocation((prev) => ({lat, lon, zoom: 8, seq: (prev?.seq ?? 0) + 1}));
    },
    [],
  );

  const syncToUserLocation = useCallback(async () => {
    if (!radarSettings.locateMeEnabled) return;
    setLocating(true);
    const tryIpFallback = async () => {
      try {
        const data = await apiFetchJson<{
          lat?: number;
          lon?: number;
          city?: string;
          country?: string;
        }>('/api/locate');
        if (typeof data.lat === 'number' && typeof data.lon === 'number') {
          const label = data.city
            ? `${data.city}${data.country ? `, ${data.country}` : ''}`
            : data.country || 'IP';
          applyUserLocation(data.lat, data.lon, label, 'ip');
        }
      } catch {
        // Keep current region if geolocation and IP lookup are unavailable
      } finally {
        setLocating(false);
      }
    };

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyUserLocation(pos.coords.latitude, pos.coords.longitude, 'GPS', 'gps');
          setLocating(false);
        },
        () => {
          void tryIpFallback();
        },
        {enableHighAccuracy: false, timeout: 5500, maximumAge: 300000},
      );
    } else {
      await tryIpFallback();
    }
  }, [applyUserLocation, radarSettings.locateMeEnabled]);

  useEffect(() => {
    if (initialLocateAttemptedRef.current) return;
    initialLocateAttemptedRef.current = true;
    if (radarSettings.locateMeEnabled) {
      void syncToUserLocation();
    }
  }, [radarSettings.locateMeEnabled, syncToUserLocation]);

  const fetchingFlightsRef = useRef(false);

  useEffect(() => {
    setFlightsLoading(true);
    fetchLiveFlights(activeRegion.bounds, activeRegion.id);
    fetchAirportsInView(activeRegion.bounds, activeRegion.zoom);
    const id = window.setInterval(() => {
      if (fetchingFlightsRef.current) return;
      fetchingFlightsRef.current = true;
      void fetchLiveFlights(boundsRef.current, activeRegion.id).finally(() => {
        fetchingFlightsRef.current = false;
      });
    }, 6000);
    return () => clearInterval(id);
  }, [activeRegion, fetchLiveFlights, fetchAirportsInView]);

  useEffect(() => {
    fetchWeatherAndHazards();
    fetchAcars();
    const wxId = window.setInterval(fetchWeatherAndHazards, 65000);
    const acarsId = window.setInterval(fetchAcars, 35000);
    return () => {
      clearInterval(wxId);
      clearInterval(acarsId);
    };
  }, [fetchWeatherAndHazards, fetchAcars]);

  const flights = useMemo(() => {
    if (isOnline) return rawFlights;
    return rawFlights.map((f) => deadReckonFlight(f, nowEpochSec, true));
  }, [rawFlights, nowEpochSec, isOnline]);

  const availableModels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of flights) {
      const code = (f.aircraftType || '').trim().toUpperCase();
      if (!code || code === 'UNKN') continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([code, count]) => ({code, count}))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [flights]);

  const availableCountries = useMemo(() => {
    const map = new Map<string, {code: string; name: string; count: number}>();
    for (const f of flights) {
      const info = resolveCountryFromFlight(f.icao24, f.registration);
      const prev = map.get(info.code);
      if (prev) prev.count += 1;
      else map.set(info.code, {code: info.code, name: info.name, count: 1});
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [flights]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (phaseFilter !== 'all' ? 1 : 0) +
    (trafficFilter !== 'all' ? 1 : 0) +
    (modelFilter !== 'all' ? 1 : 0) +
    (countryFilter !== 'all' ? 1 : 0);

  const filteredFlights = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();

    const boardMatches = (
      f: LiveFlight,
      items: AirportBoardFlight[] | undefined,
      onlyDelayed = false,
    ) => {
      if (!items || items.length === 0) return false;
      const fn = f.flightNumber.toUpperCase();
      const cs = f.callsign.toUpperCase();
      const reg = f.registration.toUpperCase();
      const hex = f.icao24.toUpperCase();
      return items.some((b) => {
        if (onlyDelayed && !b.isDelayed) return false;
        return (
          (b.flightNumber && fn && b.flightNumber.toUpperCase() === fn) ||
          (b.callsign && cs && b.callsign.toUpperCase() === cs) ||
          (b.registration && reg && b.registration.toUpperCase() === reg) ||
          (b.icao24 && hex && b.icao24.toUpperCase() === hex)
        );
      });
    };

    const apIata = selectedAirport?.iata.toUpperCase() ?? '';
    const apIcao = selectedAirport?.icao.toUpperCase() ?? '';

    return flights.filter((f) => {
      if (phaseFilter === 'air' && f.onGround) return false;
      if (phaseFilter === 'ground' && !f.onGround) return false;

      if (trafficFilter === 'ladd' && !(f.isLadd || ((f.dbFlags ?? 0) & 8) !== 0)) return false;
      if (trafficFilter === 'military' && !(f.isMilitary || ((f.dbFlags ?? 0) & 1) !== 0)) return false;
      if (trafficFilter === 'pia' && !(f.isPia || ((f.dbFlags ?? 0) & 4) !== 0)) return false;
      if (trafficFilter === 'emergency' && !getEmergencySquawkMeta(f.squawk)) return false;

      if (modelFilter !== 'all' && (f.aircraftType || '').trim().toUpperCase() !== modelFilter) {
        return false;
      }

      if (countryFilter !== 'all') {
        const regCountry = resolveCountryFromFlight(f.icao24, f.registration);
        if (regCountry.code !== countryFilter) return false;
      }

      if (selectedAirport && airportTrafficFilter !== 'none') {
        const orig = f.origin.toUpperCase();
        const dest = f.destination.toUpperCase();
        const matchesDep =
          (orig && (orig === apIata || orig === apIcao)) ||
          boardMatches(f, airportBoard?.departures);
        const matchesArr =
          (dest && (dest === apIata || dest === apIcao)) ||
          boardMatches(f, airportBoard?.arrivals);

        if (airportTrafficFilter === 'departures' && !matchesDep) return false;
        if (airportTrafficFilter === 'arrivals' && !matchesArr) return false;
        if (airportTrafficFilter === 'all' && !matchesDep && !matchesArr) return false;
        if (
          airportTrafficFilter === 'delayed' &&
          !boardMatches(f, airportBoard?.departures, true) &&
          !boardMatches(f, airportBoard?.arrivals, true)
        ) {
          return false;
        }
      }

      if (!q) return true;
      return (
        f.callsign.includes(q) ||
        f.flightNumber.includes(q) ||
        f.registration.toUpperCase().includes(q) ||
        f.icao24.toUpperCase().includes(q) ||
        f.origin.toUpperCase().includes(q) ||
        f.destination.toUpperCase().includes(q) ||
        f.aircraftType.toUpperCase().includes(q) ||
        f.squawk.includes(q)
      );
    });
  }, [
    flights,
    searchQuery,
    phaseFilter,
    trafficFilter,
    modelFilter,
    countryFilter,
    selectedAirport,
    airportTrafficFilter,
    airportBoard,
  ]);

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  useEffect(() => {
    if (!selectedFlight || !isOnline) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    const qs = new URLSearchParams({
      fr24Id: selectedFlight.fr24Id ?? '',
      icao24: selectedFlight.icao24,
      callsign: selectedFlight.callsign,
      reg: selectedFlight.registration ?? '',
      fnum: selectedFlight.flightNumber ?? '',
      orig: selectedFlight.origin ?? '',
    });
    apiFetchJson<FlightDetail>(`/api/flight-detail?${qs.toString()}`)
      .then((d) => {
        if (!cancelled) setSelectedDetail(d);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlight?.id, isOnline]);

  const nearestWeather = useMemo(() => {
    if (!selectedFlight || airportsWeather.length === 0) return airportsWeather[0];
    let best = airportsWeather[0];
    let bestDist = Infinity;
    for (const w of airportsWeather) {
      const d = haversineNm(selectedFlight.lat, selectedFlight.lon, w.lat, w.lon);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    return best;
  }, [selectedFlight, airportsWeather]);

  const groundTraffic = useMemo(() => flights.filter((f) => f.onGround), [flights]);
  const airborneTraffic = useMemo(() => flights.filter((f) => !f.onGround), [flights]);
  const estimatedCount = useMemo(() => flights.filter((f) => f.isEstimated).length, [flights]);
  const laddCount = useMemo(
    () => flights.filter((f) => Boolean(f.isLadd || ((f.dbFlags ?? 0) & 8) !== 0)).length,
    [flights],
  );
  const militaryCount = useMemo(
    () => flights.filter((f) => Boolean(f.isMilitary || ((f.dbFlags ?? 0) & 1) !== 0)).length,
    [flights],
  );
  const piaCount = useMemo(
    () => flights.filter((f) => Boolean(f.isPia || ((f.dbFlags ?? 0) & 4) !== 0)).length,
    [flights],
  );
  const emergencyFlights = useMemo(
    () => flights.filter((f) => Boolean(getEmergencySquawkMeta(f.squawk))),
    [flights],
  );

  const matchingAcars = useMemo(() => {
    if (!selectedFlight) return [];
    const cs = selectedFlight.callsign.toUpperCase();
    const reg = selectedFlight.registration.toUpperCase();
    return acarsMessages.filter(
      (m) => m.callsign.toUpperCase() === cs || (reg && m.tail.toUpperCase() === reg),
    );
  }, [acarsMessages, selectedFlight]);

  const liveUpdates = useMemo<LiveFlightUpdateItem[]>(() => {
    const items: LiveFlightUpdateItem[] = [...gateChangeUpdates];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const ef of emergencyFlights) {
      const em = getEmergencySquawkMeta(ef.squawk);
      if (!em) continue;
      items.push({
        id: `em-${ef.icao24}-${ef.squawk}`,
        kind: 'emergency',
        title: ef.callsign || ef.icao24,
        subtitle: `${ef.aircraftType} · ${ef.registration || ef.icao24}`,
        detail: `${em.title} at ${ef.onGround ? 'GND' : `${ef.altitudeFt.toLocaleString()} ft`}`,
        badge: em.shortLabel,
        severity: 'high',
        ts: ef.lastContactEpoch || nowSec,
        icao24: ef.icao24,
      });
    }

    if (airportBoard) {
      const apCode = airportBoard.iata || airportBoard.icao;
      const allBoard = [...airportBoard.departures, ...airportBoard.arrivals];
      for (const b of allBoard) {
        if (!b.isDelayed && !b.isCancelled) continue;
        const delayMin =
          b.scheduledTime && (b.estimatedTime || b.actualTime)
            ? Math.round(((b.estimatedTime || b.actualTime)! - b.scheduledTime) / 60)
            : 0;
        if (b.isCancelled || delayMin >= 20 || b.statusColor === 'red') {
          items.push({
            id: `bd-${apCode}-${b.id}`,
            kind: 'delay',
            title: b.flightNumber || b.callsign,
            subtitle: `${apCode} · ${b.originIata || '—'} → ${b.destinationIata || '—'}`,
            detail: b.isCancelled
              ? 'Flight cancelled on live airport board'
              : delayMin >= 20
                ? `Delayed +${delayMin}m (${b.statusText})`
                : b.statusText,
            badge: b.isCancelled ? 'CANCELLED' : `DLY +${Math.max(delayMin, 20)}m`,
            severity: b.isCancelled ? 'high' : 'medium',
            ts: b.estimatedTime || b.scheduledTime || nowSec,
            icao24: b.icao24 || undefined,
            airportIata: apCode,
          });
        }
        if (items.length >= 24) break;
      }
    }

    return items.slice(0, 24);
  }, [gateChangeUpdates, emergencyFlights, airportBoard]);

  const handleSelectRegion = (regionId: string) => {
    setFollowSelected(false);
    if (regionId === 'local' && localRegion) {
      setActiveRegion(localRegion);
      setBounds(localRegion.bounds);
      return;
    }
    const preset = REGION_PRESETS.find((r) => r.id === regionId) ?? REGION_PRESETS[0];
    setActiveRegion(preset);
    setBounds(preset.bounds);
  };

  const handleSelectFlight = useCallback((f: LiveFlight) => {
    setSelectedFlightId(f.id);
    setSidebarMode('flight');
    setMobileSheetDetent('peek');
    setActiveView('radar');
    setShowTrafficSheet(false);
    if (f.onGround) {
      setThreeViewMode('taxi');
    }
  }, []);

  const handleSelectAirport = useCallback(async (ap: {icao: string; iata: string; name: string}) => {
    setSelectedAirport(ap);
    setSidebarMode('airport');
    setMobileSheetDetent('peek');
    setAirportTrafficFilter('none');
    setAirportBoardLoading(true);
    setAirportBoard(null);
    setSelectedAirportSurface(null);
    setActiveView('radar');

    const matchMarker =
      mapAirports.find((m) => m.icao.toUpperCase() === ap.icao.toUpperCase()) ??
      AIRPORT_CATALOG.find((c) => c.icao.toUpperCase() === ap.icao.toUpperCase());

    if (matchMarker) {
      apiFetchJson<AirfieldSurfaceData>(
        `/api/surface?icao=${encodeURIComponent(ap.icao)}&lat=${matchMarker.lat}&lon=${matchMarker.lon}`,
      )
        .then((surf) => setSelectedAirportSurface(surf))
        .catch(() => {});
    } else {
      apiFetchJson<AirfieldSurfaceData>(
        `/api/surface?icao=${encodeURIComponent(ap.icao || ap.iata)}`,
      )
        .then((surf) => setSelectedAirportSurface(surf))
        .catch(() => {});
    }

    try {
      const qs = new URLSearchParams({
        code: ap.iata || ap.icao,
        icao: ap.icao,
      });
      const data = await apiFetchJson<AirportBoardResponse>(`/api/airport-board?${qs.toString()}`);
      setAirportBoard(data);
      // Track gate/terminal changes across airport board polls
      const apKey = (data.iata || data.icao || ap.icao).toUpperCase();
      const detectedChanges: LiveFlightUpdateItem[] = [];
      for (const row of [...data.departures, ...data.arrivals]) {
        const flightKey = `${apKey}:${(row.flightNumber || row.callsign || row.id).toUpperCase()}`;
        const curLoc = `${row.terminal ? `T${row.terminal}` : ''}${row.gate ? ` G${row.gate}` : ''}`.trim();
        if (!curLoc) continue;
        const prevLoc = prevGateMapRef.current.get(flightKey);
        if (prevLoc && prevLoc !== curLoc) {
          detectedChanges.push({
            id: `gate-${flightKey}-${Date.now()}`,
            kind: 'gate-change',
            title: row.flightNumber || row.callsign,
            subtitle: `${apKey} · ${row.originIata || '—'} → ${row.destinationIata || '—'}`,
            detail: `Gate assignment changed from ${prevLoc} to ${curLoc}`,
            badge: 'GATE CHG',
            severity: 'info',
            ts: Math.floor(Date.now() / 1000),
            icao24: row.icao24 || undefined,
            airportIata: apKey,
          });
        }
        prevGateMapRef.current.set(flightKey, curLoc);
      }
      if (detectedChanges.length > 0) {
        setGateChangeUpdates((prev) => [...detectedChanges, ...prev].slice(0, 12));
      }
      if (!matchMarker && Number.isFinite(data.lat) && Number.isFinite(data.lon) && (data.lat !== 0 || data.lon !== 0)) {
        apiFetchJson<AirfieldSurfaceData>(
          `/api/surface?icao=${encodeURIComponent(ap.icao)}&lat=${data.lat}&lon=${data.lon}`,
        )
          .then((surf) => setSelectedAirportSurface(surf))
          .catch(() => {});
      }
    } catch {
      // Keep panel open with local catalog info
    } finally {
      setAirportBoardLoading(false);
    }
  }, [mapAirports]);

  const handleSelectFlightFromBoard = useCallback(
    (item: AirportBoardFlight) => {
      const fn = item.flightNumber.toUpperCase();
      const cs = item.callsign.toUpperCase();
      const reg = item.registration.toUpperCase();
      const hex = item.icao24.toUpperCase();
      const match = flights.find(
        (f) =>
          (hex && f.icao24.toUpperCase() === hex) ||
          (reg && f.registration.toUpperCase() === reg) ||
          (fn && f.flightNumber.toUpperCase() === fn) ||
          (cs && f.callsign.toUpperCase() === cs),
      );
      if (match) {
        handleSelectFlight(match);
        setFlyToLocation((prev) => ({
          lat: match.lat,
          lon: match.lon,
          zoom: 8,
          seq: (prev?.seq ?? 0) + 1,
        }));
      } else {
        setSearchQuery(item.flightNumber || item.callsign || item.registration);
      }
    },
    [flights, handleSelectFlight],
  );

  const selectedAirportWeather = useMemo(() => {
    if (!selectedAirport) return undefined;
    return airportsWeather.find(
      (a) =>
        a.icao.toUpperCase() === selectedAirport.icao.toUpperCase() ||
        a.iata.toUpperCase() === selectedAirport.iata.toUpperCase(),
    );
  }, [airportsWeather, selectedAirport]);

  const activeSidebarType: 'flight' | 'airport' | null =
    sidebarMode === 'airport' && selectedAirport
      ? 'airport'
      : sidebarMode === 'flight' && selectedFlight
        ? 'flight'
        : selectedFlight
          ? 'flight'
          : selectedAirport
            ? 'airport'
            : null;

  const sidebarOpen = Boolean(activeSidebarType && activeView === 'radar');

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-background text-foreground">
      {/* Full-Viewport Non-Scrolling Real Map */}
      <main className="fixed inset-0 z-0">
        <RadarMap
          flights={filteredFlights}
          selectedFlight={selectedFlight}
          selectedDetail={selectedDetail}
          selectedAirportIcao={selectedAirport?.icao}
          mapAirports={mapAirports}
          airports={airportsWeather}
          sigmets={sigmets}
          disruptions={disruptions}
          rainviewer={rainviewer}
          activeRegion={activeRegion}
          theme={theme}
          loading={flightsLoading}
          plannedRoute={plannedRoute}
          userLocation={userLocation}
          flyToLocation={flyToLocation}
          followSelected={followSelected}
          isolateSelected={isolateSelected}
          isMobilePortrait={isPortraitMobile}
          onUserDragBreakFollow={() => setFollowSelected(false)}
          settings={radarSettings}
          onSelectFlight={handleSelectFlight}
          onSelectAirport={(ap) => void handleSelectAirport(ap)}
          onBoundsChange={(newBounds, zoom) => {
            setBounds(newBounds);
            fetchLiveFlights(newBounds, activeRegion.id);
            fetchAirportsInView(newBounds, zoom);
          }}
        />
      </main>

      {/* Dedicated Portrait Phone & Tablet Top App Bar (<= 52px high) */}
      {isPortraitMobile && (
        <header className="fixed top-2 left-2 right-2 z-[560] h-[48px] flex items-center justify-between gap-2 rounded-2xl bg-card/92 backdrop-blur-md border border-border px-2.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setShowTrafficSheet(false);
              setActiveView('radar');
            }}
            className="flex items-center gap-1.5 min-h-[40px] px-1.5 rounded-xl font-display text-sm font-bold text-foreground whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>SkyDeck</span>
            <span className="font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
              · {filteredFlights.length}
            </span>
          </button>

          <select
            value={activeRegion.id}
            onChange={(e) => handleSelectRegion(e.target.value)}
            aria-label="Select radar coverage region"
            className="h-9 min-w-0 flex-1 max-w-[165px] rounded-xl bg-background border border-input px-2 text-xs font-medium text-foreground truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {localRegion && <option value={localRegion.id}>{localRegion.label}</option>}
            {REGION_PRESETS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 shrink-0">
            <Popover>
              <PopoverTrigger
                className={`inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-xl border border-border transition-colors cursor-pointer relative ${
                  activeFilterCount > 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-accent'
                }`}
                aria-label="Search and filter flights"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-[10px] font-mono font-bold text-slate-950 px-1 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-[min(320px,calc(100vw-24px))] rounded-2xl p-3 space-y-2.5 shadow-xl z-[700]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Search &amp; Radar Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setPhaseFilter('all');
                        setTrafficFilter('all');
                        setModelFilter('all');
                        setCountryFilter('all');
                      }}
                      className="text-[11px] text-primary hover:underline cursor-pointer"
                    >
                      Reset ({activeFilterCount})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Callsign, tail, hex, squawk 7700"
                    aria-label="Search live ADS-B flights"
                    className="h-9"
                  />
                  {searchQuery && (
                    <Button size="icon" variant="ghost" onClick={() => setSearchQuery('')} aria-label="Clear search">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={trafficFilter}
                    onChange={(e) => setTrafficFilter(e.target.value as TrafficFlagFilter)}
                    aria-label="Filter by emergency squawk or DB flag"
                    className="h-8 rounded-lg bg-background border border-input px-2 text-xs text-foreground"
                  >
                    <option value="all">All Feeds</option>
                    <option value="emergency">Emergency (7500/7600/7700) · {emergencyFlights.length}</option>
                    <option value="ladd">LADD Restricted · {laddCount}</option>
                    <option value="military">Military / State · {militaryCount}</option>
                    <option value="pia">PIA Privacy · {piaCount}</option>
                  </select>
                  <select
                    value={phaseFilter}
                    onChange={(e) => setPhaseFilter(e.target.value as 'all' | 'air' | 'ground')}
                    aria-label="Filter by flight phase"
                    className="h-8 rounded-lg bg-background border border-input px-2 text-xs text-foreground"
                  >
                    <option value="all">Air &amp; Ground</option>
                    <option value="air">Airborne ({airborneTraffic.length})</option>
                    <option value="ground">On Ground ({groundTraffic.length})</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    aria-label="Filter by aircraft model"
                    className="h-8 rounded-lg bg-background border border-input px-2 text-xs text-foreground"
                  >
                    <option value="all">All Models ({availableModels.length})</option>
                    {availableModels.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} ({m.count})
                      </option>
                    ))}
                  </select>
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    aria-label="Filter by country of registration"
                    className="h-8 rounded-lg bg-background border border-input px-2 text-xs text-foreground"
                  >
                    <option value="all">All Countries ({availableCountries.length})</option>
                    {availableCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.count})
                      </option>
                    ))}
                  </select>
                </div>
              </PopoverContent>
            </Popover>

            {radarSettings.locateMeEnabled && (
              <button
                type="button"
                onClick={() => void syncToUserLocation()}
                disabled={locating}
                aria-label="Locate me"
                className={`inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-xl border border-border cursor-pointer ${
                  activeRegion.id === 'local'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-background text-foreground'
                }`}
              >
                <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle dark or light theme"
              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-xl border border-border bg-background text-foreground cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {/* Compact Top Status, Emergency Squawk, Filter & Mode Banners */}
      {(!isOnline ||
        flightsError ||
        emergencyFlights.length > 0 ||
        isolateSelected ||
        followSelected ||
        trafficFilter !== 'all' ||
        modelFilter !== 'all' ||
        countryFilter !== 'all' ||
        phaseFilter !== 'all' ||
        (selectedAirport && airportTrafficFilter !== 'none')) && (
        <div
          className={`fixed z-[520] flex flex-wrap items-center gap-1.5 transition-all duration-300 ${
            isPortraitMobile
              ? 'top-[62px] left-2 right-12'
              : sidebarOpen
                ? 'top-3 left-[min(420px,calc(100vw-24px))] hidden sm:flex'
                : 'top-3 left-3'
          }`}
        >
          {emergencyFlights.slice(0, 3).map((ef) => {
            const em = getEmergencySquawkMeta(ef.squawk);
            if (!em) return null;
            return (
              <button
                key={ef.id}
                type="button"
                onClick={() => {
                  handleSelectFlight(ef);
                  setFlyToLocation((prev) => ({
                    lat: ef.lat,
                    lon: ef.lon,
                    zoom: 9,
                    seq: (prev?.seq ?? 0) + 1,
                  }));
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-lg border border-white/70 cursor-pointer"
                title={em.title}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {em.shortLabel} · {ef.callsign}
              </button>
            );
          })}
          {!isOnline && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-md">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Offline DR-EST ({new Date(lastFetchedAt).toLocaleTimeString()})
            </div>
          )}
          {flightsError && isOnline && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-white shadow-md">
              {flightsError}
            </div>
          )}
          {trafficFilter !== 'all' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTrafficFilter('all')}
              className="shadow-md"
            >
              Flag: {trafficFilter.toUpperCase()} ({filteredFlights.length})
              <X className="w-3 h-3" />
            </Button>
          )}
          {modelFilter !== 'all' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setModelFilter('all')}
              className="shadow-md"
            >
              Model: {modelFilter} ({filteredFlights.length})
              <X className="w-3 h-3" />
            </Button>
          )}
          {countryFilter !== 'all' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCountryFilter('all')}
              className="shadow-md"
            >
              Origin: {availableCountries.find((c) => c.code === countryFilter)?.name || countryFilter}
              <X className="w-3 h-3" />
            </Button>
          )}
          {phaseFilter !== 'all' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPhaseFilter('all')}
              className="shadow-md"
            >
              Phase: {phaseFilter === 'air' ? 'Airborne' : 'Ground'}
              <X className="w-3 h-3" />
            </Button>
          )}
          {isolateSelected && selectedFlight && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsolateSelected(false)}
              className="shadow-md"
            >
              Isolated: {selectedFlight.callsign}
              <X className="w-3 h-3" />
            </Button>
          )}
          {followSelected && selectedFlight && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setFollowSelected(false)}
              className="shadow-md"
            >
              Following: {selectedFlight.callsign}
              <X className="w-3 h-3" />
            </Button>
          )}
          {selectedAirport && airportTrafficFilter !== 'none' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAirportTrafficFilter('none')}
              className="shadow-md"
              title="Clear airport traffic filter"
            >
              {selectedAirport.iata}: {airportTrafficFilter}
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {/* Mobile Portrait Thumb-Zone Map Quick Filter & Settings Strip (when Sheet is closed) */}
      {isPortraitMobile && activeView === 'radar' && !showTrafficSheet && !sidebarOpen && (
        <div className="fixed bottom-[72px] left-2 right-2 z-[530] flex items-center justify-between gap-1.5 pb-safe pointer-events-none">
          <div className="flex items-center gap-1 rounded-2xl bg-card/92 backdrop-blur-md border border-border p-1 shadow-lg overflow-x-auto pointer-events-auto">
            {(
              [
                {id: 'all', label: `All (${flights.length})`},
                {id: 'emergency', label: `EMERG (${emergencyFlights.length})`},
                {id: 'ladd', label: `LADD (${laddCount})`},
                {id: 'military', label: `MIL (${militaryCount})`},
                {id: 'pia', label: `PIA (${piaCount})`},
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTrafficFilter(opt.id)}
                className={`min-h-[38px] rounded-xl px-2.5 text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  trafficFilter === opt.id
                    ? opt.id === 'emergency'
                      ? 'bg-red-600 text-white'
                      : opt.id === 'ladd'
                        ? 'bg-purple-600 text-white'
                        : opt.id === 'military'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-2xl bg-card/92 backdrop-blur-md border border-border p-1 shadow-lg shrink-0 pointer-events-auto">
            <RadarSettingsPopover
              settings={radarSettings}
              onUpdateSettings={updateRadarSettings}
              onResetSettings={resetRadarSettings}
            />
            <button
              type="button"
              onClick={() => fetchLiveFlights(bounds, activeRegion.id)}
              aria-label="Refresh traffic"
              className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] rounded-xl bg-background border border-border text-foreground cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${flightsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Flight Inspector / Airport Board: Mobile Portrait 2-Detent Bottom Sheet OR Desktop Left Sidebar */}
      <aside
        aria-hidden={!sidebarOpen}
        className={
          isPortraitMobile
            ? `fixed left-0 right-0 bottom-16 z-[550] flex flex-col gap-1.5 rounded-t-3xl bg-card/96 backdrop-blur-md border-t border-border shadow-2xl transition-all duration-300 ease-out pb-safe ${
                mobileSheetDetent === 'expanded' ? 'h-[82dvh]' : 'h-[48dvh]'
              } ${
                sidebarOpen
                  ? 'translate-y-0 opacity-100 pointer-events-auto'
                  : 'translate-y-full opacity-0 pointer-events-none'
              }`
            : `fixed top-3 left-3 bottom-[84px] z-[550] w-[min(410px,calc(100vw-24px))] flex flex-col gap-2 transition-all duration-300 ease-out ${
                sidebarOpen
                  ? 'translate-x-0 opacity-100 pointer-events-auto'
                  : '-translate-x-6 opacity-0 pointer-events-none'
              }`
        }
      >
        {isPortraitMobile && sidebarOpen && (
          <div className="flex items-center justify-between px-4 pt-2 pb-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSheetDetent((d) => (d === 'peek' ? 'expanded' : 'peek'))}
              aria-label={mobileSheetDetent === 'peek' ? 'Expand sheet' : 'Collapse sheet'}
              className="flex items-center gap-2 min-h-[34px] text-[11px] font-medium text-muted-foreground cursor-pointer"
            >
              <span className="w-9 h-1.5 rounded-full bg-border inline-block" />
              {mobileSheetDetent === 'peek' ? (
                <span className="inline-flex items-center gap-1">
                  <Maximize2 className="w-3 h-3" /> Expand
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Minimize2 className="w-3 h-3" /> Map View
                </span>
              )}
            </button>
            {selectedFlight && selectedAirport && (
              <TabsList>
                <TabsTrigger active={activeSidebarType === 'flight'} onClick={() => setSidebarMode('flight')}>
                  {selectedFlight.callsign}
                </TabsTrigger>
                <TabsTrigger active={activeSidebarType === 'airport'} onClick={() => setSidebarMode('airport')}>
                  {selectedAirport.iata}
                </TabsTrigger>
              </TabsList>
            )}
          </div>
        )}

        {!isPortraitMobile && selectedFlight && selectedAirport && sidebarOpen && (
          <div className="rounded-full bg-card/95 backdrop-blur-md border border-border p-1 shadow-lg w-fit shrink-0">
            <TabsList>
              <TabsTrigger active={activeSidebarType === 'flight'} onClick={() => setSidebarMode('flight')}>
                Flight: {selectedFlight.callsign}
              </TabsTrigger>
              <TabsTrigger active={activeSidebarType === 'airport'} onClick={() => setSidebarMode('airport')}>
                Airport: {selectedAirport.iata}
              </TabsTrigger>
            </TabsList>
          </div>
        )}

        <div className={`flex-1 min-h-0 flex flex-col ${isPortraitMobile ? 'px-2 pb-2' : 'drop-shadow-xl'}`}>
          {activeSidebarType === 'airport' && selectedAirport ? (
            <AirportBoardPanel
              airport={selectedAirport}
              board={airportBoard}
              loading={airportBoardLoading}
              weather={selectedAirportWeather}
              surface={selectedAirportSurface}
              timeDisplayMode={radarSettings.timeDisplayMode}
              onTimeDisplayModeChange={(mode) => updateRadarSettings({timeDisplayMode: mode})}
              activeFilter={airportTrafficFilter}
              onFilterChange={setAirportTrafficFilter}
              onSelectFlightFromBoard={handleSelectFlightFromBoard}
              onFocusAirfield={() => {
                const coords =
                  selectedAirportSurface ??
                  airportBoard ??
                  mapAirports.find((m) => m.icao.toUpperCase() === selectedAirport.icao.toUpperCase()) ??
                  AIRPORT_CATALOG.find((c) => c.icao.toUpperCase() === selectedAirport.icao.toUpperCase());
                if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
                  setFlyToLocation((prev) => ({
                    lat: coords.lat,
                    lon: coords.lon,
                    zoom: 13.6,
                    seq: (prev?.seq ?? 0) + 1,
                  }));
                  if (isPortraitMobile) setMobileSheetDetent('peek');
                }
              }}
              onClose={() => {
                setSelectedAirport(null);
                setSelectedAirportSurface(null);
                setAirportTrafficFilter('none');
                setSidebarMode(selectedFlight ? 'flight' : null);
              }}
            />
          ) : selectedFlight ? (
            <FlightInspectorPanel
              flight={selectedFlight}
              detail={selectedDetail}
              detailLoading={detailLoading}
              nowEpochSec={nowEpochSec}
              timeDisplayMode={radarSettings.timeDisplayMode}
              userLocation={userLocation}
              mapAirports={mapAirports}
              matchingAcars={matchingAcars}
              followSelected={followSelected}
              isolateSelected={isolateSelected}
              onToggleFollow={() => {
                setFollowSelected((v) => !v);
                if (isPortraitMobile) setMobileSheetDetent('peek');
              }}
              onToggleIsolate={() => {
                setIsolateSelected((v) => !v);
                if (isPortraitMobile) setMobileSheetDetent('peek');
              }}
              onSelectAirport={(ap) => void handleSelectAirport(ap)}
              onClose={() => {
                setSelectedFlightId(null);
                setFollowSelected(false);
                setIsolateSelected(false);
                setSidebarMode(selectedAirport ? 'airport' : null);
              }}
              onOpen3DMode={(mode) => {
                setThreeViewMode(mode);
                setActiveView('deck');
              }}
            />
          ) : null}
        </div>
      </aside>

      {/* Secondary Views Overlay (3D Deck / Taxi & ACARS / Flight Plan / Sector Traffic Sheet) */}
      {(activeView !== 'radar' || showTrafficSheet) && (
        <section
          aria-label="Workspace panel"
          className={`fixed z-[540] border border-border bg-card/96 backdrop-blur-md shadow-2xl overflow-y-auto transition-all duration-300 ease-out ${
            isPortraitMobile
              ? 'inset-x-0 top-[58px] bottom-16 rounded-t-3xl p-3 pb-6'
              : 'inset-3 bottom-20 rounded-2xl p-4 sm:p-6'
          }`}
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-border mb-4 sticky top-0 bg-card/96 backdrop-blur-md z-20">
            <div className="font-display text-sm sm:text-base font-semibold text-foreground truncate">
              {showTrafficSheet && activeView === 'radar'
                ? `Sector Traffic · ${activeRegion.label}`
                : activeView === 'deck'
                  ? '3D Flight Deck & Livery Inspector'
                  : activeView === 'taxi'
                    ? 'Airport Surface Taxi & ACARS'
                    : 'Weather-Coupled Flight Planner'}
            </div>
            <Button
              size="sm"
              variant="outline"
              className={isPortraitMobile ? 'min-h-[40px] px-3' : ''}
              onClick={() => {
                setShowTrafficSheet(false);
                setActiveView('radar');
              }}
            >
              <X className="w-3.5 h-3.5" />
              Back to Map
            </Button>
          </div>

          {activeView === 'deck' && (
            <div className="h-[calc(100%-64px)] min-h-[380px]">
              <FlightDeck3D
                flight={selectedFlight}
                detail={selectedDetail}
                allFlights={flights}
                groundTraffic={groundTraffic}
                nearestWeather={nearestWeather}
                airportsWeather={airportsWeather}
                sigmets={sigmets}
                disruptions={disruptions}
                viewMode={threeViewMode}
                onViewModeChange={setThreeViewMode}
              />
            </div>
          )}

          {activeView === 'taxi' && (
            <TaxiAcarsView
              acarsMessages={acarsMessages}
              acarsStatus={acarsStatus}
              airportsWeather={airportsWeather}
              theme={theme}
              onRefreshAcars={fetchAcars}
              onInspectFlight={(f) => handleSelectFlight(f)}
            />
          )}

          {activeView === 'planner' && (
            <FlightPlannerView
              airportsWeather={airportsWeather}
              sigmets={sigmets}
              disruptions={disruptions}
              onApplyRouteToRadar={(route) => {
                setPlannedRoute(route);
                setActiveView('radar');
              }}
            />
          )}

          {showTrafficSheet && activeView === 'radar' && (
            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="px-0 pt-0 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>{activeRegion.label}</CardTitle>
                    <CardDescription>{activeRegion.subtitle}</CardDescription>
                  </div>
                  <TabsList>
                    <TabsTrigger active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>
                      All ({flights.length})
                    </TabsTrigger>
                    <TabsTrigger active={phaseFilter === 'air'} onClick={() => setPhaseFilter('air')}>
                      Airborne ({airborneTraffic.length})
                    </TabsTrigger>
                    <TabsTrigger active={phaseFilter === 'ground'} onClick={() => setPhaseFilter('ground')}>
                      Ground ({groundTraffic.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* adsb.lol DB Flag, Emergency, Aircraft Model & Registration Country Strip */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      {id: 'all', label: 'All Feeds'},
                      {id: 'ladd', label: `LADD (${laddCount})`},
                      {id: 'military', label: `Military (${militaryCount})`},
                      {id: 'pia', label: `PIA (${piaCount})`},
                      {id: 'emergency', label: `Emergency (${emergencyFlights.length})`},
                    ] as const
                  ).map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={trafficFilter === item.id ? 'default' : 'outline'}
                      onClick={() => setTrafficFilter(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}

                  <select
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    aria-label="Filter traffic by aircraft model"
                    className="h-8 rounded-full bg-background border border-input px-2.5 text-xs font-medium text-foreground cursor-pointer"
                  >
                    <option value="all">All Models ({availableModels.length})</option>
                    {availableModels.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} ({m.count})
                      </option>
                    ))}
                  </select>

                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    aria-label="Filter traffic by country of origin"
                    className="h-8 rounded-full bg-background border border-input px-2.5 text-xs font-medium text-foreground cursor-pointer"
                  >
                    <option value="all">All Countries ({availableCountries.length})</option>
                    {availableCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.count})
                      </option>
                    ))}
                  </select>

                  {activeFilterCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearchQuery('');
                        setPhaseFilter('all');
                        setTrafficFilter('all');
                        setModelFilter('all');
                        setCountryFilter('all');
                      }}
                    >
                      Clear ({activeFilterCount})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="border border-border rounded-xl overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Callsign</TableHead>
                        <TableHead>DB Flag</TableHead>
                        <TableHead>ICAO24</TableHead>
                        <TableHead>Type / Reg</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead className="text-right">Altitude</TableHead>
                        <TableHead className="text-right">GS</TableHead>
                        <TableHead className="text-right">Squawk</TableHead>
                        <TableHead className="text-right">Feed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFlights.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                            {flightsLoading
                              ? 'Polling live ADS-B receivers…'
                              : 'No ADS-B contacts matched the current filter or viewport'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredFlights.slice(0, 120).map((f) => {
                          const db = getDbFlagMeta(f);
                          return (
                            <TableRow
                              key={f.id}
                              onClick={() => handleSelectFlight(f)}
                              data-state={selectedFlight?.id === f.id ? 'selected' : undefined}
                              className="cursor-pointer"
                            >
                              <TableCell className="font-mono font-semibold text-foreground">{f.callsign}</TableCell>
                              <TableCell className="font-mono">
                                {db ? (
                                  <Badge variant="outline">{db.shortLabel}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-muted-foreground">{f.icao24}</TableCell>
                              <TableCell className="font-mono text-foreground">
                                {f.aircraftType}
                                {f.registration ? (
                                  <span className="text-muted-foreground ml-1.5">{f.registration}</span>
                                ) : null}
                              </TableCell>
                              <TableCell className="font-mono text-foreground">
                                {f.origin && f.destination ? `${f.origin} → ${f.destination}` : '—'}
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-foreground">
                                {f.onGround ? 'GND' : `${f.altitudeFt.toLocaleString()} ft`}
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-foreground">
                                {f.groundSpeedKts} kt
                              </TableCell>
                              <TableCell className="font-mono tabular-nums text-right text-foreground">
                                {f.squawk || '—'}
                              </TableCell>
                              <TableCell className="font-mono text-right">
                                <Badge variant={f.isEstimated ? 'warning' : 'outline'}>
                                  {f.isEstimated ? 'DR-EST' : f.source}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Upgraded Bottom Operations Drawer (Past Flights · Live Updates · WX/Restrictions · ASN Safety) */}
      <BottomOpsDrawer
        open={opsDrawerOpen && activeView === 'radar'}
        activeTab={opsTab}
        onTabChange={setOpsTab}
        onClose={() => setOpsDrawerOpen(false)}
        isPortraitMobile={isPortraitMobile}
        selectedFlight={selectedFlight}
        liveUpdates={liveUpdates}
        sigmets={sigmets}
        disruptions={disruptions}
        acarsMessages={acarsMessages}
        radarSettings={radarSettings}
        onUpdateRadarSettings={updateRadarSettings}
        onSelectFlightByHexOrCallsign={(icao24, callsign) => {
          const match = flights.find(
            (f) =>
              (icao24 && f.icao24.toUpperCase() === icao24.toUpperCase()) ||
              (callsign && f.callsign.toUpperCase() === callsign.toUpperCase()),
          );
          if (match) {
            handleSelectFlight(match);
            setFlyToLocation((prev) => ({
              lat: match.lat,
              lon: match.lon,
              zoom: 9,
              seq: (prev?.seq ?? 0) + 1,
            }));
            setOpsDrawerOpen(false);
          }
        }}
        onFlyToAirport={(code) => {
          const upper = code.trim().toUpperCase();
          const cat =
            AIRPORT_CATALOG.find((a) => a.icao === upper || a.iata === upper) ??
            mapAirports.find((a) => a.icao.toUpperCase() === upper || a.iata.toUpperCase() === upper);
          if (cat) {
            setFlyToLocation((prev) => ({
              lat: cat.lat,
              lon: cat.lon,
              zoom: 12.2,
              seq: (prev?.seq ?? 0) + 1,
            }));
            void handleSelectAirport({icao: cat.icao, iata: cat.iata, name: cat.name});
            setOpsDrawerOpen(false);
          }
        }}
        onFlyToPoint={(lat, lon, zoom = 6) => {
          setFlyToLocation((prev) => ({
            lat,
            lon,
            zoom,
            seq: (prev?.seq ?? 0) + 1,
          }));
          setOpsDrawerOpen(false);
        }}
      />

      {/* Navigation Dock: Dedicated Portrait Mobile/Tablet 6-Tab Thumb Bar OR Desktop Floating Island */}
      {isPortraitMobile ? (
        <nav
          aria-label="SkyDeck mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-[600] h-16 pb-safe bg-card/95 backdrop-blur-md border-t border-border grid grid-cols-6 items-center shadow-2xl"
        >
          {(
            [
              {
                id: 'radar',
                label: 'Radar',
                icon: <Radar className="w-5 h-5" />,
                active: activeView === 'radar' && !showTrafficSheet && !opsDrawerOpen,
                onClick: () => {
                  setShowTrafficSheet(false);
                  setOpsDrawerOpen(false);
                  setActiveView('radar');
                },
              },
              {
                id: 'ops',
                label: liveUpdates.length > 0 ? `Ops ${liveUpdates.length}` : 'Ops',
                icon: <Activity className="w-5 h-5" />,
                active: activeView === 'radar' && opsDrawerOpen,
                onClick: () => {
                  setShowTrafficSheet(false);
                  setActiveView('radar');
                  setOpsDrawerOpen((v) => !v);
                },
              },
              {
                id: 'traffic',
                label: laddCount > 0 ? `LADD ${laddCount}` : 'Traffic',
                icon: <ListFilter className="w-5 h-5" />,
                active: activeView === 'radar' && showTrafficSheet,
                onClick: () => {
                  setOpsDrawerOpen(false);
                  setActiveView('radar');
                  setShowTrafficSheet((v) => !v);
                },
              },
              {
                id: 'taxi',
                label: 'Taxi',
                icon: <Radio className="w-5 h-5" />,
                active: activeView === 'taxi',
                onClick: () => {
                  setShowTrafficSheet(false);
                  setOpsDrawerOpen(false);
                  setActiveView('taxi');
                },
              },
              {
                id: 'planner',
                label: 'Plan',
                icon: <Navigation className="w-5 h-5" />,
                active: activeView === 'planner',
                onClick: () => {
                  setShowTrafficSheet(false);
                  setOpsDrawerOpen(false);
                  setActiveView('planner');
                },
              },
              {
                id: 'deck',
                label: '3D Deck',
                icon: <Box className="w-5 h-5" />,
                active: activeView === 'deck',
                onClick: () => {
                  setShowTrafficSheet(false);
                  setOpsDrawerOpen(false);
                  setActiveView('deck');
                },
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              className={`flex flex-col items-center justify-center min-h-[48px] h-full px-1 transition-colors cursor-pointer ${
                tab.active
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span className="text-[10.5px] leading-tight mt-0.5 whitespace-nowrap">{tab.label}</span>
            </button>
          ))}
        </nav>
      ) : (
        <nav
          aria-label="SkyDeck navigation and radar dock"
          className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-[600] max-w-[calc(100vw-16px)] transition-all duration-300 ease-out ${
            dockHidden ? 'translate-y-0' : ''
          }`}
        >
          {dockHidden ? (
            <button
              type="button"
              onClick={() => setDockHidden(false)}
              className="inline-flex items-center gap-2 rounded-full bg-card/95 backdrop-blur-md border border-border px-4 py-2 text-xs font-semibold text-foreground shadow-xl hover:bg-accent cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              SkyDeck Dock · {filteredFlights.length} ADS-B
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-card/95 backdrop-blur-md border border-border px-2 py-1 shadow-2xl overflow-x-auto max-w-full">
              {/* Brand + View Switcher */}
              <button
                type="button"
                onClick={() => {
                  setShowTrafficSheet(false);
                  setActiveView('radar');
                }}
                className="font-display text-xs sm:text-sm font-bold tracking-tight text-foreground px-2 py-1 rounded-full hover:bg-accent whitespace-nowrap shrink-0 cursor-pointer"
              >
                SkyDeck
              </button>

              <div className="flex items-center gap-0.5 rounded-full bg-secondary/75 p-0.5 shrink-0">
                {(
                  [
                    {id: 'radar', label: 'Radar'},
                    {id: 'taxi', label: 'Taxi'},
                    {id: 'planner', label: 'Plan'},
                    {id: 'deck', label: '3D'},
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowTrafficSheet(false);
                      setActiveView(item.id);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      activeView === item.id && !showTrafficSheet
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Compact Region Selector */}
              <select
                value={activeRegion.id}
                onChange={(e) => handleSelectRegion(e.target.value)}
                aria-label="Select radar coverage region"
                className="h-8 max-w-[132px] sm:max-w-[155px] rounded-full bg-background border border-input px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer shrink-0"
              >
                {localRegion && <option value={localRegion.id}>{localRegion.label}</option>}
                {REGION_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Optional Compact Locate Me */}
              {radarSettings.locateMeEnabled && (
                <Button
                  size="icon"
                  variant={activeRegion.id === 'local' ? 'secondary' : 'outline'}
                  onClick={() => void syncToUserLocation()}
                  disabled={locating}
                  className="shrink-0 h-8 w-8"
                  title="Sync map and ADS-B sector to your current location"
                  aria-label="Locate me"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
                </Button>
              )}

              {/* Unified Search, Squawk Emergency, Model & Country Filter Popover */}
              <Popover>
                <PopoverTrigger
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    trafficFilter === 'emergency'
                      ? 'bg-red-600 text-white border-red-500'
                      : activeFilterCount > 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                  }`}
                  aria-label="Search and filter radar traffic"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filter'}
                  </span>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-80 rounded-2xl p-3.5 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Search &amp; Traffic Filters</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setPhaseFilter('all');
                          setTrafficFilter('all');
                          setModelFilter('all');
                          setCountryFilter('all');
                        }}
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        Reset all
                      </button>
                    )}
                  </div>

                  {/* Callsign / Tail / Squawk Search */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Callsign, tail, hex, squawk (7700)"
                        aria-label="Search live ADS-B flights"
                        className="h-8 pl-8"
                      />
                    </div>
                    {searchQuery && (
                      <Button size="icon" variant="ghost" onClick={() => setSearchQuery('')} aria-label="Clear search">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Emergency Squawk & adsb.lol DB Flag Grid */}
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-medium text-muted-foreground flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Emergency Squawk &amp; DB Flags
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          {id: 'all', label: `All (${flights.length})`},
                          {id: 'emergency', label: `Emergency (${emergencyFlights.length})`},
                          {id: 'ladd', label: `LADD (${laddCount})`},
                          {id: 'military', label: `Military (${militaryCount})`},
                          {id: 'pia', label: `PIA (${piaCount})`},
                        ] as const
                      ).map((opt) => (
                        <Button
                          key={opt.id}
                          size="sm"
                          variant={trafficFilter === opt.id ? 'default' : 'outline'}
                          onClick={() => setTrafficFilter(opt.id)}
                          className={`justify-start h-7 text-[11px] ${
                            opt.id === 'emergency' ? 'col-span-2' : ''
                          }`}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Phase Toggle */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/70 p-1">
                    {(
                      [
                        {id: 'all', label: 'All'},
                        {id: 'air', label: `Air (${airborneTraffic.length})`},
                        {id: 'ground', label: `Gnd (${groundTraffic.length})`},
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPhaseFilter(p.id)}
                        className={`rounded-lg py-1 text-[11px] font-medium cursor-pointer ${
                          phaseFilter === p.id
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Aircraft Model & Country of Registration Dropdowns */}
                  <div className="grid grid-cols-1 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10.5px] font-medium text-muted-foreground block">
                        Aircraft Model
                      </span>
                      <select
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        aria-label="Filter by aircraft model"
                        className="w-full h-8 rounded-lg bg-background border border-input px-2.5 text-xs text-foreground cursor-pointer"
                      >
                        <option value="all">All Aircraft Models ({availableModels.length})</option>
                        {availableModels.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.code} — {m.count} live
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-[10.5px] font-medium text-muted-foreground block">
                        Country of Registration
                      </span>
                      <select
                        value={countryFilter}
                        onChange={(e) => setCountryFilter(e.target.value)}
                        aria-label="Filter by country of origin"
                        className="w-full h-8 rounded-lg bg-background border border-input px-2.5 text-xs text-foreground cursor-pointer"
                      >
                        <option value="all">All Countries ({availableCountries.length})</option>
                        {availableCountries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.count})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Compact ADS-B Count & Traffic Drawer Trigger */}
              <Popover>
                <PopoverTrigger
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-2.5 font-mono text-[11px] text-foreground hover:bg-accent tabular-nums cursor-pointer whitespace-nowrap shrink-0"
                  aria-label="View ADS-B feed status and sector traffic"
                >
                  <span className="font-semibold">{filteredFlights.length}</span>
                  <span className="hidden lg:inline text-muted-foreground">ADS-B</span>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-80 rounded-2xl p-4 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">Live ADS-B &amp; Web Feeds</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {airborneTraffic.length} air · {groundTraffic.length} gnd · {laddCount} LADD
                        {estimatedCount > 0 ? ` · ${estimatedCount} DR` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setActiveView('radar');
                        setShowTrafficSheet((v) => !v);
                      }}
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      Table
                    </Button>
                  </div>
                  <Separator />
                  <div className="divide-y divide-border text-[11px] font-mono max-h-56 overflow-y-auto">
                    {providers.length === 0 ? (
                      <div className="py-2 text-muted-foreground">Polling live receivers…</div>
                    ) : (
                      providers.map((p) => (
                        <div key={p.provider} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-foreground">{p.provider.toUpperCase()}</div>
                            <div className="text-muted-foreground">
                              {p.ok ? `${p.count} contacts · ${p.latencyMs}ms` : p.note || 'Unavailable'}
                            </div>
                          </div>
                          <Badge variant={p.ok ? 'success' : 'warning'}>{p.ok ? 'LIVE' : 'WAF/IDLE'}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Compact Ops Drawer Trigger */}
              <Button
                size="sm"
                variant={opsDrawerOpen && activeView === 'radar' ? 'default' : 'outline'}
                onClick={() => {
                  setShowTrafficSheet(false);
                  setActiveView('radar');
                  setOpsDrawerOpen((v) => !v);
                }}
                aria-label="Open flight operations drawer"
                className="shrink-0 h-8 px-2.5 whitespace-nowrap"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Ops{liveUpdates.length > 0 ? ` (${liveUpdates.length})` : ''}</span>
              </Button>

              {/* Settings Inside Compact Dock */}
              <RadarSettingsPopover
                settings={radarSettings}
                onUpdateSettings={updateRadarSettings}
                onResetSettings={resetRadarSettings}
              />

              {/* Compact Icon Theme Toggle */}
              <Button
                size="icon"
                variant="outline"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle dark or light theme"
                title={theme === 'dark' ? 'Switch to light map' : 'Switch to night map'}
                className="shrink-0 h-8 w-8"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </Button>

              {/* Manual Refresh */}
              <Button
                size="icon"
                variant="outline"
                onClick={() => fetchLiveFlights(bounds, activeRegion.id)}
                aria-label="Refresh live ADS-B traffic"
                title="Refresh traffic"
                className="shrink-0 h-8 w-8"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${flightsLoading ? 'animate-spin' : ''}`} />
              </Button>

              <div className="hidden xl:block shrink-0">
                <PWAInstallButton onFallbackSync={() => fetchLiveFlights(bounds, activeRegion.id)} />
              </div>

              {/* Collapse Dock Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDockHidden(true)}
                aria-label="Hide bottom dock"
                title="Hide dock"
                className="shrink-0 h-8 w-8"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
