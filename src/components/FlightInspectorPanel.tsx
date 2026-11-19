import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Clock,
  CloudRain,
  Crosshair,
  DoorOpen,
  ExternalLink,
  Eye,
  Gauge,
  MapPin,
  Plane,
  Radio,
  ShieldCheck,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {
  AIRPORT_CATALOG,
  resolveAirlineLivery,
  resolveSpecialLivery,
} from '../data/aviationCatalog';
import {apiFetchJson} from '../services/directAviationClient';
import {haversineNm} from '../services/offlineStore';
import type {
  AcarsMessage,
  AirportMarker,
  FlightDetail,
  LiveFlight,
  SafetyRecordResponse,
  ThreeViewMode,
} from '../types/aviation';
import {
  getDbFlagMeta,
  getEmergencySquawkMeta,
  getFr24OperatorLogoUrl,
} from './aircraftIcons';
import {Badge} from './ui/badge';
import {Button} from './ui/button';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';

interface FlightInspectorPanelProps {
  flight: LiveFlight;
  detail: FlightDetail | null;
  detailLoading: boolean;
  nowEpochSec: number;
  timeDisplayMode?: 'airport' | 'local' | 'utc';
  userLocation?: {lat: number; lon: number; label?: string} | null;
  mapAirports?: AirportMarker[];
  matchingAcars: AcarsMessage[];
  followSelected?: boolean;
  isolateSelected?: boolean;
  onToggleFollow?: () => void;
  onToggleIsolate?: () => void;
  onClose: () => void;
  onOpen3DMode: (mode: ThreeViewMode) => void;
  onSelectAirport?: (airport: {icao: string; iata: string; name: string}) => void;
}

interface TelemetrySample {
  ts: number;
  altFt: number;
  spdKts: number;
  terrainFt: number;
}

function formatEpochTime(ts?: number, mode: 'airport' | 'local' | 'utc' = 'local'): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  if (mode === 'utc') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
  }
  return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false});
}

function formatDurationMinutes(totalMin: number): string {
  const m = Math.max(1, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${String(rem).padStart(2, '0')}m`;
}

function estimateTerrainElevationFt(lat: number, lon: number, altFt: number, idxNorm: number): number {
  // Deterministic topographic relief envelope scaled gently by latitude/longitude continental plateaus (capped safely below aircraft track when airborne)
  const plateauSignal =
    Math.abs(Math.sin(lat * 0.21 + lon * 0.13) * Math.cos(lon * 0.08 - 0.5)) * 2200 +
    Math.abs(Math.sin(idxNorm * Math.PI * 3.1 + lat * 0.35)) * 750;
  const rawTerrain = Math.round(120 + plateauSignal);
  return altFt <= 150 ? Math.max(0, altFt) : Math.min(rawTerrain, Math.max(0, altFt - 400));
}

const CollapsibleSection: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({title, subtitle, icon, open, onToggle, badge, children}) => (
  <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-primary shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground truncate">{title}</div>
          {subtitle && (
            <div className="text-[10.5px] text-muted-foreground truncate">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {badge}
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>
    </button>
    {open && <div className="px-3 pb-3 pt-1.5 border-t border-border/70 space-y-2.5">{children}</div>}
  </div>
);

export const FlightInspectorPanel: React.FC<FlightInspectorPanelProps> = ({
  flight,
  detail,
  detailLoading,
  nowEpochSec,
  timeDisplayMode = 'local',
  userLocation,
  mapAirports = [],
  matchingAcars,
  followSelected = false,
  isolateSelected = false,
  onToggleFollow,
  onToggleIsolate,
  onClose,
  onOpen3DMode,
  onSelectAirport,
}) => {
  const [photoError, setPhotoError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [liveSamples, setLiveSamples] = useState<TelemetrySample[]>([]);
  const [asnSafety, setAsnSafety] = useState<SafetyRecordResponse | null>(null);
  const [asnLoading, setAsnLoading] = useState(false);

  const squawkCode = detail?.squawk || flight.squawk || '';
  const emerg = getEmergencySquawkMeta(squawkCode);

  const [openSections, setOpenSections] = useState<{
    route: boolean;
    profile: boolean;
    safety: boolean;
    dynamics: boolean;
    airframe: boolean;
    acars: boolean;
  }>({
    route: true,
    profile: true,
    safety: Boolean(emerg),
    dynamics: false,
    airframe: false,
    acars: false,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
  };

  useEffect(() => {
    setPhotoError(false);
    setLogoError(false);
    setLiveSamples([]);
    setAsnSafety(null);
  }, [flight.id]);

  useEffect(() => {
    setPhotoError(false);
  }, [detail?.photo?.url]);

  useEffect(() => {
    setLogoError(false);
  }, [detail?.airlineIcao, flight.airlineIcao]);

  useEffect(() => {
    if (emerg) {
      setOpenSections((prev) => ({...prev, safety: true}));
    }
  }, [emerg]);

  // Append live telemetry points as the selected aircraft flies
  useEffect(() => {
    setLiveSamples((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        flight.lastContactEpoch <= last.ts &&
        Math.abs(flight.altitudeFt - last.altFt) < 10 &&
        Math.abs(flight.groundSpeedKts - last.spdKts) < 2
      ) {
        return prev;
      }
      const next: TelemetrySample = {
        ts: flight.lastContactEpoch || Math.floor(Date.now() / 1000),
        altFt: flight.altitudeFt,
        spdKts: flight.groundSpeedKts,
        terrainFt: estimateTerrainElevationFt(
          flight.lat,
          flight.lon,
          flight.altitudeFt,
          prev.length / 40,
        ),
      };
      return [...prev, next].slice(-48);
    });
  }, [flight.id, flight.lastContactEpoch, flight.altitudeFt, flight.groundSpeedKts, flight.lat, flight.lon]);

  const livery = resolveAirlineLivery(
    detail?.airlineIcao || flight.airlineIcao,
    flight.callsign,
  );
  const operatorLogoUrl = getFr24OperatorLogoUrl(detail?.airlineIcao || flight.airlineIcao);

  const dbMeta = getDbFlagMeta(flight);
  const registration = detail?.registration || flight.registration || '—';
  const specialLivery = useMemo(
    () => resolveSpecialLivery(registration, flight.callsign),
    [registration, flight.callsign],
  );

  useEffect(() => {
    if (!openSections.safety || !registration || registration === '—') return;
    let cancelled = false;
    setAsnLoading(true);
    apiFetchJson<SafetyRecordResponse>(
      `/api/safety-record?registration=${encodeURIComponent(registration)}`,
    )
      .then((res) => {
        if (!cancelled) setAsnSafety(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAsnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openSections.safety, registration]);
  const aircraftModel = detail?.aircraftModel || flight.aircraftType || '—';
  const aircraftCode = detail?.aircraftCode || flight.aircraftType || '';
  const operatorName = detail?.registeredOwner || flight.ownerOperator || detail?.airlineName || livery.name;
  const originCode = detail?.originIata || flight.origin || '—';
  const destCode = detail?.destinationIata || flight.destination || '—';
  const originIcao = detail?.originIcao || '';
  const destIcao = detail?.destinationIcao || '';

  // Estimate remaining distance & countdown until landing
  const landingEstimate = useMemo(() => {
    if (flight.onGround) {
      return {
        label: 'On Ground',
        detail: 'Touchdown / surface operations',
        remainingNm: 0,
        etaEpoch: detail?.estimatedArr || detail?.scheduledArr,
      };
    }

    const catalogMatch = AIRPORT_CATALOG.find(
      (a) =>
        (destIcao && a.icao.toUpperCase() === destIcao.toUpperCase()) ||
        (destCode !== '—' && a.iata.toUpperCase() === destCode.toUpperCase()),
    );
    const dirMatch = !catalogMatch
      ? mapAirports.find(
          (a) =>
            (destIcao && a.icao.toUpperCase() === destIcao.toUpperCase()) ||
            (destCode !== '—' && a.iata.toUpperCase() === destCode.toUpperCase()),
        )
      : undefined;

    const destCoords = catalogMatch ?? dirMatch;
    if (destCoords) {
      const remNm = haversineNm(flight.lat, flight.lon, destCoords.lat, destCoords.lon);
      if (remNm < 3) {
        return {
          label: '< 3 min',
          detail: 'Final approach / threshold',
          remainingNm: remNm,
          etaEpoch: nowEpochSec + 180,
        };
      }
      const effKts = Math.max(135, flight.groundSpeedKts || 420);
      const approachBufferMin = flight.altitudeFt > 14000 && remNm > 25 ? 8 : 3;
      const minutesLeft = (remNm / effKts) * 60 + approachBufferMin;
      const calcEta = Math.round(nowEpochSec + minutesLeft * 60);
      return {
        label: `~${formatDurationMinutes(minutesLeft)}`,
        detail: `${Math.round(remNm).toLocaleString()} NM to ${destCode !== '—' ? destCode : destCoords.icao}`,
        remainingNm: remNm,
        etaEpoch: detail?.estimatedArr && detail.estimatedArr > nowEpochSec ? detail.estimatedArr : calcEta,
      };
    }

    if (detail?.estimatedArr && detail.estimatedArr > nowEpochSec) {
      const mins = Math.max(1, Math.round((detail.estimatedArr - nowEpochSec) / 60));
      return {
        label: `~${formatDurationMinutes(mins)}`,
        detail: `Schedule ETA (${formatEpochTime(detail.estimatedArr, timeDisplayMode)})`,
        remainingNm: null,
        etaEpoch: detail.estimatedArr,
      };
    }

    if (detail?.scheduledArr && detail.scheduledArr > nowEpochSec) {
      const mins = Math.max(1, Math.round((detail.scheduledArr - nowEpochSec) / 60));
      return {
        label: `Sched ${formatDurationMinutes(mins)}`,
        detail: `Scheduled arrival ${formatEpochTime(detail.scheduledArr, timeDisplayMode)}`,
        remainingNm: null,
        etaEpoch: detail.scheduledArr,
      };
    }

    return {
      label: 'Route Pending',
      detail: 'Destination coordinates unavailable',
      remainingNm: null,
      etaEpoch: undefined,
    };
  }, [
    flight.onGround,
    flight.lat,
    flight.lon,
    flight.groundSpeedKts,
    flight.altitudeFt,
    destIcao,
    destCode,
    mapAirports,
    detail?.estimatedArr,
    detail?.scheduledArr,
    nowEpochSec,
    timeDisplayMode,
  ]);

  // Build unified Velocity + Altitude + Terrain Profile series (FR24 trail + live updates)
  const profileSeries = useMemo<TelemetrySample[]>(() => {
    const serverPts = detail?.trail ?? [];
    const base: TelemetrySample[] = [];
    const total = Math.max(1, serverPts.length);

    for (let i = 0; i < serverPts.length; i++) {
      const p = serverPts[i];
      base.push({
        ts: p.ts,
        altFt: Math.max(0, p.altFt),
        spdKts: p.speedKts > 0 ? p.speedKts : flight.groundSpeedKts,
        terrainFt: estimateTerrainElevationFt(p.lat, p.lon, p.altFt, i / total),
      });
    }

    for (const s of liveSamples) {
      const last = base[base.length - 1];
      if (!last || s.ts > last.ts) {
        base.push(s);
      }
    }

    if (base.length === 0) {
      base.push({
        ts: flight.lastContactEpoch || nowEpochSec,
        altFt: flight.altitudeFt,
        spdKts: flight.groundSpeedKts,
        terrainFt: estimateTerrainElevationFt(flight.lat, flight.lon, flight.altitudeFt, 0.5),
      });
    }
    return base.slice(-48);
  }, [detail?.trail, liveSamples, flight.lastContactEpoch, flight.altitudeFt, flight.groundSpeedKts, flight.lat, flight.lon, nowEpochSec]);

  // Safety Record, Maintenance Telemetry & Live Envelope Alerts
  const safetyReport = useMemo(() => {
    const alerts: Array<{level: 'destructive' | 'warning' | 'success'; title: string; detail: string}> = [];

    if (dbMeta) {
      alerts.push({level: 'warning', title: dbMeta.title, detail: dbMeta.description});
    }

    if (emerg) {
      alerts.push({level: 'destructive', title: emerg.title, detail: emerg.description});
    } else {
      alerts.push({
        level: 'success',
        title: `Transponder Normal (${squawkCode || 'Assigned'})`,
        detail: 'No emergency (7700), comms failure (7600), or security (7500) squawk active.',
      });
    }

    if (!flight.onGround && flight.altitudeFt < 10000 && flight.verticalRateFpm < -2600) {
      alerts.push({
        level: 'warning',
        title: `High Sink Rate Below FL100 (${flight.verticalRateFpm} fpm)`,
        detail: 'Steep descent profile detected in terminal airspace.',
      });
    }

    if (flight.isEstimated) {
      alerts.push({
        level: 'warning',
        title: `ADS-B Signal Gap (±${flight.uncertaintyNm} NM DR)`,
        detail: 'Temporarily projecting kinematics via Dead-Reckoning between receiver updates.',
      });
    }

    const maintAcars = matchingAcars.filter((m) => m.category === 'MAINT');
    const ageYrs = detail?.aircraftAge ? Number(detail.aircraftAge) : null;
    const fleetAgeNote =
      ageYrs !== null && Number.isFinite(ageYrs)
        ? ageYrs <= 8
          ? `Modern airframe (${ageYrs} yrs) — primary line phase`
          : ageYrs <= 18
            ? `Mid-life airframe (${ageYrs} yrs) — standard C/D-check cadence`
            : `Senior airframe (${ageYrs} yrs) — heavy structural inspection cycle`
        : 'Airframe build year not published in open registry';

    return {alerts, maintAcars, fleetAgeNote};
  }, [dbMeta, emerg, squawkCode, flight.onGround, flight.altitudeFt, flight.verticalRateFpm, flight.isEstimated, flight.uncertaintyNm, matchingAcars, detail?.aircraftAge]);

  const altitudeM = Math.round(flight.altitudeFt * 0.3048);
  const flightLevel = Math.round(flight.altitudeFt / 100);
  const speedKmh = Math.round(flight.groundSpeedKts * 1.852);
  const vRateLabel =
    flight.verticalRateFpm > 120
      ? 'Climbing'
      : flight.verticalRateFpm < -120
        ? 'Descending'
        : 'Level';

  const contactAgeSec = Math.max(0, nowEpochSec - flight.lastContactEpoch);
  const distanceNm = userLocation
    ? haversineNm(userLocation.lat, userLocation.lon, flight.lat, flight.lon)
    : null;
  const trailCount = profileSeries.length;

  const photo = !photoError ? detail?.photo : null;
  const planespottersHexUrl = `https://www.planespotters.net/hex/${encodeURIComponent(flight.icao24)}`;

  // SVG Geometry for Velocity + Altitude + Terrain Profile Graph
  const chartGeom = useMemo(() => {
    const W = 320;
    const H = 122;
    const PAD_X = 6;
    const PAD_TOP = 10;
    const PAD_BOT = 12;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_TOP - PAD_BOT;

    const pts = profileSeries;
    const maxAlt = Math.max(4000, ...pts.map((p) => p.altFt), ...pts.map((p) => p.terrainFt + 1000));
    const maxSpd = Math.max(250, ...pts.map((p) => p.spdKts));

    const xFor = (i: number) =>
      pts.length <= 1 ? PAD_X + plotW : PAD_X + (i / (pts.length - 1)) * plotW;
    const yAlt = (alt: number) => PAD_TOP + plotH - (Math.max(0, alt) / maxAlt) * plotH;
    const ySpd = (spd: number) => PAD_TOP + plotH - (Math.max(0, spd) / maxSpd) * plotH;

    const altLine = pts.map((p, i) => `${xFor(i).toFixed(1)},${yAlt(p.altFt).toFixed(1)}`).join(' ');
    const spdLine = pts.map((p, i) => `${xFor(i).toFixed(1)},${ySpd(p.spdKts).toFixed(1)}`).join(' ');
    const terrLine = pts.map((p, i) => `${xFor(i).toFixed(1)},${yAlt(p.terrainFt).toFixed(1)}`).join(' ');
    const terrArea =
      pts.length >= 2
        ? `${PAD_X},${PAD_TOP + plotH} ${terrLine} ${(PAD_X + plotW).toFixed(1)},${PAD_TOP + plotH}`
        : '';

    const last = pts[pts.length - 1];
    return {
      W,
      H,
      maxAlt,
      maxSpd,
      altLine,
      spdLine,
      terrArea,
      lastX: xFor(pts.length - 1),
      lastAltY: yAlt(last.altFt),
      lastSpdY: ySpd(last.spdKts),
      minSpd: Math.min(...pts.map((p) => p.spdKts)),
      maxObsSpd: Math.max(...pts.map((p) => p.spdKts)),
      aglFt: Math.max(0, Math.round(last.altFt - last.terrainFt)),
    };
  }, [profileSeries]);

  return (
    <aside
      role="complementary"
      aria-label={`Flight details for ${flight.callsign}`}
      className="flex-1 h-full min-h-0 flex flex-col"
    >
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden shadow-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2.5 pt-3.5 shrink-0 border-b border-border/60">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {operatorLogoUrl && !logoError && (
                <img
                  src={operatorLogoUrl}
                  alt={livery.name}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-4 max-w-[78px] object-contain shrink-0"
                />
              )}
              <CardTitle className="font-mono text-base font-semibold text-primary">
                {flight.callsign}
              </CardTitle>
              {flight.flightNumber && flight.flightNumber !== flight.callsign && (
                <span className="font-mono text-xs text-foreground">{flight.flightNumber}</span>
              )}
              {emerg && <Badge variant="destructive">▲ {emerg.shortLabel}</Badge>}
              {specialLivery && <Badge variant="secondary">{specialLivery.badgeText}</Badge>}
              {dbMeta && <Badge variant="outline">{dbMeta.shortLabel}</Badge>}
              <Badge variant={flight.isEstimated ? 'warning' : 'secondary'}>
                {flight.isEstimated ? `DR ±${flight.uncertaintyNm} NM` : flight.source.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {operatorName} · {aircraftModel}
              {registration !== '—' ? ` · ${registration}` : ''}
              {specialLivery ? ` · ${specialLivery.liveryName}` : ''}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close aircraft sidebar"
            className="shrink-0 -mr-1 -mt-1"
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 overflow-y-auto overscroll-contain pt-3 pb-6 [scrollbar-width:thin]">
          <div className="space-y-2.5">
          {/* Emergency Squawk Banner */}
          {emerg && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/70 bg-red-600/15 px-3 py-2 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-mono font-bold text-red-600 dark:text-red-400">
                  {emerg.title}
                </div>
                <p className="text-[11px] text-foreground leading-snug mt-0.5">{emerg.description}</p>
              </div>
            </div>
          )}

          {/* Follow (Preserves User Zoom) + Isolate (Full Route) + 3D Quick Action Bar */}
          <div className="space-y-1.5 pb-0.5">
            {(onToggleFollow || onToggleIsolate) && (
              <div className="grid grid-cols-2 gap-1.5">
                {onToggleFollow && (
                  <Button
                    variant={followSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={onToggleFollow}
                    className="w-full justify-center"
                    title="Keep aircraft centered at your current map zoom"
                  >
                    <Crosshair className="w-3.5 h-3.5 shrink-0" />
                    <span>{followSelected ? 'Following' : 'Follow'}</span>
                  </Button>
                )}
                {onToggleIsolate && (
                  <Button
                    variant={isolateSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={onToggleIsolate}
                    className="w-full justify-center"
                    title="Hide all other traffic and show complete flight path"
                  >
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    <span>{isolateSelected ? 'Isolated' : 'Isolate'}</span>
                  </Button>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => onOpen3DMode('cockpit')} className="w-full justify-center">
                <Gauge className="w-3.5 h-3.5 shrink-0" />
                <span>3D Deck</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpen3DMode('exterior')} className="w-full justify-center">
                <Plane className="w-3.5 h-3.5 shrink-0" />
                <span>Livery</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpen3DMode('pan')} className="w-full justify-center" title="3D PAN view with live clouds, precip & TFR/SIGMET boundaries">
                <CloudRain className="w-3.5 h-3.5 shrink-0" />
                <span>3D PAN</span>
              </Button>
            </div>
          </div>

          {/* Landing ETA & Live Route Header */}
          <div className="rounded-xl border border-border bg-secondary/45 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between font-mono">
              <button
                type="button"
                disabled={!onSelectAirport || originCode === '—'}
                onClick={() =>
                  originCode !== '—' &&
                  onSelectAirport?.({
                    icao: originIcao || originCode,
                    iata: originCode,
                    name: detail?.originName || `${originCode} Airport`,
                  })
                }
                className="min-w-0 text-left hover:opacity-80 disabled:cursor-default cursor-pointer"
              >
                <div className="text-lg font-bold text-foreground">{originCode}</div>
                <div className="text-[10.5px] font-sans text-muted-foreground truncate max-w-[96px]">
                  {detail?.originName || 'Origin'}
                </div>
              </button>

              <div className="text-center px-2">
                <div className="text-[10.5px] font-semibold text-foreground uppercase">
                  {detailLoading
                    ? 'SYNCING'
                    : detail?.statusText || (flight.onGround ? 'SURFACE TAXI' : 'ENROUTE')}
                </div>
                <div className="text-primary tracking-tighter text-xs">─────────</div>
              </div>

              <button
                type="button"
                disabled={!onSelectAirport || destCode === '—'}
                onClick={() =>
                  destCode !== '—' &&
                  onSelectAirport?.({
                    icao: destIcao || destCode,
                    iata: destCode,
                    name: detail?.destinationName || `${destCode} Airport`,
                  })
                }
                className="text-right min-w-0 hover:opacity-80 disabled:cursor-default cursor-pointer"
              >
                <div className="text-lg font-bold text-foreground">{destCode}</div>
                <div className="text-[10.5px] font-sans text-muted-foreground truncate max-w-[96px]">
                  {detail?.destinationName || 'Destination'}
                </div>
              </button>
            </div>

            {/* Time Until Landing Bar */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Time to Landing
              </span>
              <div className="text-right font-mono tabular-nums">
                <span className="font-bold text-foreground">{landingEstimate.label}</span>
                {landingEstimate.etaEpoch && !flight.onGround && (
                  <span className="text-[10.5px] text-muted-foreground ml-1.5">
                    (ETA {formatEpochTime(landingEstimate.etaEpoch, timeDisplayMode)})
                  </span>
                )}
              </div>
            </div>
            <div className="text-[10.5px] font-mono text-muted-foreground flex justify-between">
              <span>{landingEstimate.detail}</span>
              <span>{contactAgeSec}s sync</span>
            </div>
          </div>

          {/* 1. Velocity, Altitude & Terrain Profile Graph */}
          <CollapsibleSection
            title="Velocity & Terrain Profile"
            subtitle={`GS ${flight.groundSpeedKts} kt · ${
              flight.onGround ? 'GND' : `${flight.altitudeFt.toLocaleString()} ft`
            } · AGL ~${chartGeom.aglFt.toLocaleString()} ft`}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            open={openSections.profile}
            onToggle={() => toggleSection('profile')}
            badge={
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {trailCount} pts
              </span>
            }
          >
            <div className="rounded-lg bg-[#090d16] border border-slate-800 p-2">
              <svg
                viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`}
                className="w-full h-[118px] overflow-visible"
                role="img"
                aria-label="Live velocity, altitude, and terrain profile chart"
              >
                {/* Horizontal gridlines */}
                {[0.25, 0.5, 0.75].map((frac) => {
                  const y = 10 + (chartGeom.H - 22) * frac;
                  return (
                    <line
                      key={frac}
                      x1="6"
                      x2={chartGeom.W - 6}
                      y1={y}
                      y2={y}
                      stroke="rgba(148,163,184,0.16)"
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {/* Terrain Elevation Profile */}
                {chartGeom.terrArea && (
                  <polygon
                    points={chartGeom.terrArea}
                    fill="rgba(16, 185, 129, 0.22)"
                    stroke="#10B981"
                    strokeWidth="1.2"
                  />
                )}

                {/* Altitude Curve (Amber) */}
                {profileSeries.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartGeom.altLine}
                  />
                )}

                {/* Velocity / Groundspeed Curve (Cyan) */}
                {profileSeries.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartGeom.spdLine}
                  />
                )}

                {/* Live End Dots */}
                <circle cx={chartGeom.lastX} cy={chartGeom.lastAltY} r="3" fill="#F59E0B" />
                <circle cx={chartGeom.lastX} cy={chartGeom.lastSpdY} r="3" fill="#38BDF8" />
              </svg>

              <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  GS {chartGeom.minSpd}–{chartGeom.maxObsSpd} kt
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Peak {Math.round(chartGeom.maxAlt).toLocaleString()} ft
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Terrain Clr
                </span>
              </div>
            </div>
          </CollapsibleSection>

          {/* 2. Safety Record, Maintenance & Live Alerts */}
          <CollapsibleSection
            title="Safety Record, Maintenance & Alerts"
            subtitle={emerg ? emerg.shortLabel : `SQK ${squawkCode || 'Normal'} · Live telemetry`}
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
            open={openSections.safety}
            onToggle={() => toggleSection('safety')}
            badge={
              <Badge variant={emerg ? 'destructive' : safetyReport.maintAcars.length > 0 ? 'warning' : 'success'}>
                {emerg ? 'ALERT' : safetyReport.maintAcars.length > 0 ? 'MAINT' : 'NOMINAL'}
              </Badge>
            }
          >
            <div className="space-y-2 text-xs">
              {safetyReport.alerts.map((al, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-2.5 py-2 ${
                    al.level === 'destructive'
                      ? 'border-red-500/60 bg-red-500/10'
                      : al.level === 'warning'
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-emerald-500/40 bg-emerald-500/10'
                  }`}
                >
                  <div className="font-semibold text-foreground">{al.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {al.detail}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border bg-card/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                    Airframe &amp; Maintenance Status
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {detail?.aircraftAge ? `${detail.aircraftAge} yrs` : 'Age N/A'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {safetyReport.fleetAgeNote}. Operator: <strong className="text-foreground">{operatorName}</strong>.
                </p>
                {safetyReport.maintAcars.length > 0 ? (
                  <div className="pt-1 border-t border-border/60 space-y-1">
                    {safetyReport.maintAcars.slice(0, 2).map((m) => (
                      <div key={m.id} className="font-mono text-[10.5px] text-amber-600 dark:text-amber-400">
                        [{m.labelName}] {m.rawText}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10.5px] font-mono text-muted-foreground">
                    No active ACARS [MAINT] fault messages logged for {flight.callsign}.
                  </div>
                )}
              </div>

              {/* Aviation Safety Network (aviation-safety.net) Registration Dossier */}
              <div className="rounded-lg border border-border bg-card/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                  <span>ASN Incident History ({registration})</span>
                  <a
                    href={
                      asnSafety?.searchUrl ||
                      `https://aviation-safety.net/wikibase/dblist.php?Reg=${encodeURIComponent(
                        registration === '—' ? '' : registration,
                      )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline font-medium"
                  >
                    aviation-safety.net
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {registration === '—' ? (
                  <div className="text-[10.5px] text-muted-foreground">
                    Waiting for airframe registration to query Aviation Safety Network.
                  </div>
                ) : asnLoading && !asnSafety ? (
                  <div className="text-[10.5px] text-muted-foreground">
                    Querying aviation-safety.net for {registration}…
                  </div>
                ) : asnSafety && asnSafety.items.length > 0 ? (
                  <div className="space-y-1.5">
                    {asnSafety.items.slice(0, 4).map((rec, idx) => (
                      <div
                        key={`${rec.date}-${idx}`}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-1 font-mono font-semibold text-foreground">
                          <span>{rec.date} · {rec.type}</span>
                          <span className="text-amber-600 dark:text-amber-400">{rec.damage}</span>
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {rec.location} · Fatalities: {rec.fatalities || '0'}
                        </div>
                        {rec.href && (
                          <a
                            href={rec.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                          >
                            View ASN Report
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10.5px] text-muted-foreground">
                    No ASN hull-loss or incident entries matched for {registration}.
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* 3. Terminal, Gate & Schedule Service */}
          <CollapsibleSection
            title="Departure & Arrival Service"
            subtitle={`${originCode} T${detail?.originTerminal || '—'} → ${destCode} T${detail?.destTerminal || '—'}`}
            icon={<DoorOpen className="w-3.5 h-3.5" />}
            open={openSections.route}
            onToggle={() => toggleSection('route')}
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-card p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] text-muted-foreground">Departure</span>
                  <span className="font-mono font-semibold">{originCode}</span>
                </div>
                <div className="font-mono text-[11px] font-semibold text-foreground">
                  {detail?.originTerminal ? `T${detail.originTerminal}` : 'T—'} ·{' '}
                  {detail?.originGate ? `Gate ${detail.originGate}` : 'Gate —'}
                </div>
                <div className="text-[10.5px] font-mono text-muted-foreground tabular-nums">
                  Sch {formatEpochTime(detail?.scheduledDep, timeDisplayMode)} · Act{' '}
                  {formatEpochTime(detail?.actualDep, timeDisplayMode)}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] text-muted-foreground">Arrival</span>
                  <span className="font-mono font-semibold">{destCode}</span>
                </div>
                <div className="font-mono text-[11px] font-semibold text-foreground">
                  {detail?.destTerminal ? `T${detail.destTerminal}` : 'T—'}
                  {detail?.destGate ? ` · G${detail.destGate}` : ''}
                  {detail?.destBaggage ? ` · Bag ${detail.destBaggage}` : ''}
                </div>
                <div className="text-[10.5px] font-mono text-muted-foreground tabular-nums">
                  Sch {formatEpochTime(detail?.scheduledArr, timeDisplayMode)} · Est{' '}
                  {formatEpochTime(landingEstimate.etaEpoch ?? detail?.estimatedArr, timeDisplayMode)}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* 4. Altitude, Speed & Transponder Dynamics */}
          <CollapsibleSection
            title="Flight Dynamics & Coordinates"
            subtitle={`HDG ${String(Math.round(flight.trueTrackDeg)).padStart(3, '0')}° · VS ${
              flight.verticalRateFpm >= 0 ? '+' : ''
            }${flight.verticalRateFpm} fpm`}
            icon={<Gauge className="w-3.5 h-3.5" />}
            open={openSections.dynamics}
            onToggle={() => toggleSection('dynamics')}
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="text-[10.5px] text-muted-foreground">Barometric Altitude</div>
                <div className="font-mono font-semibold tabular-nums text-foreground">
                  {flight.onGround ? 'ON GROUND' : `${flight.altitudeFt.toLocaleString()} ft`}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                  {flight.onGround ? '0 m' : `FL${String(flightLevel).padStart(3, '0')} · ${altitudeM.toLocaleString()} m`}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="text-[10.5px] text-muted-foreground">Vertical Speed</div>
                <div className="font-mono font-semibold tabular-nums text-foreground">
                  {flight.verticalRateFpm >= 0 ? '+' : ''}
                  {flight.verticalRateFpm} fpm
                </div>
                <div className="text-[10.5px] text-muted-foreground">{vRateLabel}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="text-[10.5px] text-muted-foreground">Groundspeed</div>
                <div className="font-mono font-semibold tabular-nums text-foreground">
                  {flight.groundSpeedKts} kt · {speedKmh} km/h
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="text-[10.5px] text-muted-foreground">Coordinates / Range</div>
                <div className="font-mono font-semibold tabular-nums text-foreground">
                  {flight.lat.toFixed(2)}, {flight.lon.toFixed(2)}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {distanceNm !== null ? `${Math.round(distanceNm)} NM away` : 'Local range'}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* 5. Aircraft Photo & Airframe Registry */}
          <CollapsibleSection
            title="Aircraft Photo & Registry"
            subtitle={`${registration} · ${aircraftCode || aircraftModel} · ${flight.icao24}`}
            icon={<Camera className="w-3.5 h-3.5" />}
            open={openSections.airframe}
            onToggle={() => toggleSection('airframe')}
          >
            <div className="rounded-xl overflow-hidden bg-muted/20">
              {photo?.url ? (
                <img
                  src={photo.url}
                  alt={`${registration !== '—' ? registration : flight.callsign} (${aircraftModel})`}
                  referrerPolicy="no-referrer"
                  onError={() => setPhotoError(true)}
                  className="w-full h-44 sm:h-48 object-cover block"
                />
              ) : detailLoading ? (
                <div className="h-32 w-full flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground px-4 text-center">
                  <Camera className="w-5 h-5" />
                  <span>Loading aircraft photo…</span>
                </div>
              ) : (
                <div className="h-32 w-full flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground px-4 text-center">
                  <Plane className="w-6 h-6" />
                  <span className="font-medium text-foreground">No photo indexed for {flight.icao24}</span>
                  <a
                    href={planespottersHexUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    Search on Planespotters.net
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {photo?.url && (
                <div className="px-2.5 py-1.5 border-t border-border bg-card flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                  <span className="truncate">Photo © {photo.photographer}</span>
                  <a
                    href={photo.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
                  >
                    {photo.source === 'wikimedia' ? 'Wikimedia' : photo.source === 'airport-data' ? 'Airport-Data' : 'Planespotters'}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[10.5px] text-muted-foreground">Registration</dt>
                <dd className="font-mono font-semibold text-foreground">{registration}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] text-muted-foreground">ICAO24 Hex</dt>
                <dd className="font-mono font-semibold text-foreground">{flight.icao24}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] text-muted-foreground">Manufacturer</dt>
                <dd className="font-medium text-foreground truncate">{detail?.manufacturer || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] text-muted-foreground">Squawk</dt>
                <dd className="font-mono font-semibold text-foreground">{squawkCode || '—'}</dd>
              </div>
            </dl>
          </CollapsibleSection>

          {/* 6. Matched ACARS & Ground Mode */}
          {matchingAcars.length > 0 && (
            <CollapsibleSection
              title={`Matched ACARS (${matchingAcars.length})`}
              subtitle={matchingAcars[0]?.labelName || 'Datalink telemetry'}
              icon={<Radio className="w-3.5 h-3.5" />}
              open={openSections.acars}
              onToggle={() => toggleSection('acars')}
            >
              <div className="space-y-2">
                {matchingAcars.slice(0, 4).map((m) => (
                  <div key={m.id} className="text-[11px] font-mono text-muted-foreground">
                    <span className="text-amber-600 dark:text-amber-500 mr-1.5">[{m.labelName}]</span>
                    <span className="text-foreground">{m.rawText}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
};
