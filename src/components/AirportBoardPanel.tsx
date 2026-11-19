import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  BookOpen,
  Clock,
  Compass,
  ExternalLink,
  Filter,
  Map as MapIcon,
  Plane,
  Radio,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {AIRPORT_CATALOG, getAirportDataSheet} from '../data/aviationCatalog';
import type {
  AirfieldSurfaceData,
  AirportBoardFlight,
  AirportBoardResponse,
  AirportWeather,
} from '../types/aviation';
import {Badge} from './ui/badge';
import {Button} from './ui/button';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Input} from './ui/input';
import {Separator} from './ui/separator';
import {TabsList, TabsTrigger} from './ui/tabs';

interface AirportBoardPanelProps {
  airport: {icao: string; iata: string; name: string};
  board: AirportBoardResponse | null;
  loading: boolean;
  weather?: AirportWeather;
  surface?: AirfieldSurfaceData | null;
  timeDisplayMode: 'airport' | 'local' | 'utc';
  onTimeDisplayModeChange: (mode: 'airport' | 'local' | 'utc') => void;
  activeFilter: 'none' | 'all' | 'arrivals' | 'departures' | 'delayed';
  onFilterChange: (filter: 'none' | 'all' | 'arrivals' | 'departures' | 'delayed') => void;
  onSelectFlightFromBoard: (item: AirportBoardFlight) => void;
  onFocusAirfield?: () => void;
  onClose: () => void;
}

function formatEpochInMode(
  ts: number | undefined,
  mode: 'airport' | 'local' | 'utc',
  tzName?: string,
  utcOffsetSec?: number,
): string {
  if (!ts) return '—';
  try {
    if (mode === 'utc') {
      return new Intl.DateTimeFormat([], {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ts * 1000));
    }
    if (mode === 'airport') {
      if (tzName) {
        return new Intl.DateTimeFormat([], {
          timeZone: tzName,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(ts * 1000));
      }
      if (typeof utcOffsetSec === 'number') {
        return new Intl.DateTimeFormat([], {
          timeZone: 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date((ts + utcOffsetSec) * 1000));
      }
    }
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}

function formatSynchronizedStatus(
  item: AirportBoardFlight,
  tab: 'departures' | 'arrivals',
  mode: 'airport' | 'local' | 'utc',
  tzName?: string,
  utcOffsetSec?: number,
): string {
  const raw = item.statusText || '';
  if (/cancel/i.test(raw)) return 'Canceled';

  const fmt = (t?: number) => formatEpochInMode(t, mode, tzName, utcOffsetSec);

  if (/landed/i.test(raw)) {
    const t = item.actualTime || item.estimatedTime || item.scheduledTime;
    return t ? `Landed ${fmt(t)}` : raw;
  }
  if (/departed/i.test(raw)) {
    const t = item.actualTime || item.estimatedTime || item.scheduledTime;
    return t ? `Departed ${fmt(t)}` : raw;
  }
  if (/delay/i.test(raw)) {
    const t = item.estimatedTime || item.actualTime || item.scheduledTime;
    return t ? `Delayed ${fmt(t)}` : 'Delayed';
  }
  if (item.actualTime) {
    return `${tab === 'departures' ? 'Departed' : 'Arrived'} ${fmt(item.actualTime)}`;
  }
  if (item.estimatedTime) {
    return `${tab === 'departures' ? 'Est Dep' : 'Est Arr'} ${fmt(item.estimatedTime)}`;
  }
  if (item.scheduledTime && /est|sched/i.test(raw)) {
    return `Sched ${fmt(item.scheduledTime)}`;
  }
  return raw || 'Scheduled';
}

function delayBadgeVariant(index: number | null): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (index === null) return 'secondary';
  if (index >= 3) return 'destructive';
  if (index >= 1.5) return 'warning';
  return 'success';
}

function delayLabel(index: number | null): string {
  if (index === null) return 'N/A';
  if (index >= 3) return 'High Delays';
  if (index >= 1.5) return 'Moderate';
  return 'Normal Ops';
}

interface SchematicRunway {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelA: string;
  labelB: string;
}

interface SchematicTaxiway {
  id: string;
  ref?: string;
  points: string;
  midX: number;
  midY: number;
}

interface SchematicPolygon {
  id: string;
  points: string;
}

interface AirfieldSchematic {
  runways: SchematicRunway[];
  taxiways: SchematicTaxiway[];
  aprons: SchematicPolygon[];
  terminals: SchematicPolygon[];
}

function buildAirfieldSchematic(
  icao: string,
  surface?: AirfieldSurfaceData | null,
  W = 320,
  H = 104,
): AirfieldSchematic {
  const padX = Math.round(W * 0.11);
  const padY = Math.round(H * 0.15);

  if (surface && surface.runways.length > 0) {
    const rwyPts = surface.runways.flatMap((r) => r.coords);
    let rLatSum = 0;
    let rLonSum = 0;
    for (const [lat, lon] of rwyPts) {
      rLatSum += lat;
      rLonSum += lon;
    }
    const rLatMid = rLatSum / Math.max(1, rwyPts.length);
    const rLonMid = rLonSum / Math.max(1, rwyPts.length);

    const nearSurface = (pts: Array<[number, number]>) =>
      pts.length > 0 && Math.hypot(pts[0][0] - rLatMid, pts[0][1] - rLonMid) < 0.065;

    const nearAprons = (surface.aprons ?? []).filter(nearSurface);
    const nearTerminals = (surface.terminals ?? []).filter((t) => nearSurface(t.coords));
    const allPts = [
      ...rwyPts,
      ...nearAprons.flat(),
      ...nearTerminals.flatMap((t) => t.coords),
    ];

    if (allPts.length >= 2) {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      for (const [lat, lon] of allPts) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
      const midLatRad = (((minLat + maxLat) * 0.5) * Math.PI) / 180;
      const cosLat = Math.max(0.2, Math.cos(midLatRad));
      const spanX = Math.max(0.004, (maxLon - minLon) * cosLat);
      const spanY = Math.max(0.004, maxLat - minLat);
      const scale = Math.min((W - padX * 2) / spanX, (H - padY * 2) / spanY);
      const offX = (W - spanX * scale) * 0.5;
      const offY = (H - spanY * scale) * 0.5;

      const proj = ([lat, lon]: [number, number]) => ({
        x: offX + (lon - minLon) * cosLat * scale,
        y: offY + (maxLat - lat) * scale,
      });

      const toPointsStr = (coords: Array<[number, number]>) =>
        coords
          .map((c) => {
            const p = proj(c);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(' ');

      const aprons: SchematicPolygon[] = nearAprons.slice(0, 40).map((coords, idx) => ({
        id: `ap-${idx}`,
        points: toPointsStr(coords),
      }));

      const terminals: SchematicPolygon[] = nearTerminals.slice(0, 28).map((t) => ({
        id: t.id,
        points: toPointsStr(t.coords),
      }));

      const runways = surface.runways.slice(0, 8).map((r) => {
        const a = proj(r.coords[0]);
        const b = proj(r.coords[r.coords.length - 1]);
        const parts = (r.ref || '').split('/');
        return {
          id: r.id,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          labelA: (parts[0] || '').trim(),
          labelB: (parts[1] || '').trim(),
        };
      });

      const taxiways = surface.taxiways
        .slice(0, 180)
        .filter((t) => t.coords.length >= 2)
        .map((t) => {
          const midPt = proj(t.coords[Math.floor(t.coords.length * 0.5)]);
          return {
            id: t.id,
            ref: t.ref,
            points: toPointsStr(t.coords),
            midX: midPt.x,
            midY: midPt.y,
          };
        });

      return {runways, taxiways, aprons, terminals};
    }
  }

  const cat = AIRPORT_CATALOG.find((a) => a.icao.toUpperCase() === icao.toUpperCase());
  const rwys = cat?.runways ?? [];
  if (rwys.length === 0) return {runways: [], taxiways: [], aprons: [], terminals: []};

  return {
    taxiways: [],
    aprons: [],
    terminals: [],
    runways: rwys.slice(0, 4).map((r, idx) => {
      const rad = ((r.headingDeg - 90) * Math.PI) / 180;
      const halfLen = W * 0.14;
      const spreadY = (idx - (rwys.length - 1) * 0.5) * (H * 0.19);
      const cx = W * 0.5;
      const cy = H * 0.5 + spreadY;
      const parts = r.ident.split('/');
      return {
        id: `${icao}-${r.ident}-${idx}`,
        x1: cx - Math.cos(rad) * halfLen,
        y1: cy - Math.sin(rad) * halfLen,
        x2: cx + Math.cos(rad) * halfLen,
        y2: cy + Math.sin(rad) * halfLen,
        labelA: (parts[0] || '').trim(),
        labelB: (parts[1] || '').trim(),
      };
    }),
  };
}

export const AirportBoardPanel: React.FC<AirportBoardPanelProps> = ({
  airport,
  board,
  loading,
  weather,
  surface,
  timeDisplayMode,
  onTimeDisplayModeChange,
  activeFilter,
  onFilterChange,
  onSelectFlightFromBoard,
  onFocusAirfield,
  onClose,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'board' | 'chart' | 'datasheet' | 'approach'>('board');
  const [boardTab, setBoardTab] = useState<'departures' | 'arrivals'>('departures');
  const [listStatusFilter, setListStatusFilter] = useState<'all' | 'delayed' | 'cancelled'>('all');
  const [boardSearch, setBoardSearch] = useState('');
  const [chartZoom, setChartZoom] = useState(1);
  const [selectedApproachIdx, setSelectedApproachIdx] = useState(0);

  const isRowCancelled = (item: AirportBoardFlight) =>
    Boolean(item.isCancelled || /cancel/i.test(item.statusText) || item.statusColor === 'red');

  const rawTabRows = useMemo(
    () => (boardTab === 'departures' ? (board?.departures ?? []) : (board?.arrivals ?? [])),
    [board, boardTab],
  );

  const listItems = useMemo(() => {
    const q = boardSearch.trim().toUpperCase();
    return rawTabRows.filter((item) => {
      if (listStatusFilter === 'delayed' && !item.isDelayed) return false;
      if (listStatusFilter === 'cancelled' && !isRowCancelled(item)) return false;
      if (!q) return true;
      const peerCode = boardTab === 'departures' ? item.destinationIata : item.originIata;
      const peerName = boardTab === 'departures' ? item.destinationName : item.originName;
      return (
        item.flightNumber.toUpperCase().includes(q) ||
        item.callsign.toUpperCase().includes(q) ||
        peerCode.toUpperCase().includes(q) ||
        peerName.toUpperCase().includes(q) ||
        item.airlineName.toUpperCase().includes(q) ||
        item.registration.toUpperCase().includes(q) ||
        item.aircraftCode.toUpperCase().includes(q) ||
        (item.terminal ?? '').toUpperCase().includes(q) ||
        (item.gate ?? '').toUpperCase().includes(q) ||
        item.statusText.toUpperCase().includes(q)
      );
    });
  }, [rawTabRows, listStatusFilter, boardSearch, boardTab]);

  const cancelledTabCount = useMemo(
    () => rawTabRows.filter((f) => isRowCancelled(f)).length,
    [rawTabRows],
  );

  const delayedTotalCount = useMemo(() => {
    const all = [...(board?.departures ?? []), ...(board?.arrivals ?? [])];
    return all.filter((f) => f.isDelayed).length;
  }, [board]);

  const airfieldSchematic = useMemo(
    () => buildAirfieldSchematic(airport.icao, surface, 320, 104),
    [airport.icao, surface],
  );

  const detailedChartSchematic = useMemo(
    () => buildAirfieldSchematic(airport.icao, surface, 360, 260),
    [airport.icao, surface],
  );

  const dataSheet = useMemo(
    () =>
      getAirportDataSheet({
        icao: airport.icao,
        iata: airport.iata,
        name: board?.name || airport.name,
        city: board?.city,
        country: board?.country,
        lat: surface?.lat || board?.lat || 0,
        lon: surface?.lon || board?.lon || 0,
        runways: weather?.runways.map((r) => ({
          ident: r.ident,
          headingDeg: r.headingDeg,
          lengthFt: r.lengthFt,
        })),
      }),
    [airport.icao, airport.iata, airport.name, board, surface, weather?.runways],
  );

  const selectedApproach =
    dataSheet.approaches[Math.min(selectedApproachIdx, Math.max(0, dataSheet.approaches.length - 1))] ??
    dataSheet.approaches[0];

  const delayIdx = board?.delayIndex;
  const onTimePct = useMemo(() => {
    const depPct = delayIdx?.departuresDelayedPct;
    const arrPct = delayIdx?.arrivalsDelayedPct;
    if (typeof depPct === 'number' && typeof arrPct === 'number') {
      return Math.max(0, Math.min(100, Math.round(100 - (depPct + arrPct) * 0.5)));
    }
    if (typeof depPct === 'number') return Math.max(0, Math.min(100, Math.round(100 - depPct)));
    const all = [...(board?.departures ?? []), ...(board?.arrivals ?? [])];
    if (all.length > 0) {
      const delayed = all.filter((f) => f.isDelayed || isRowCancelled(f)).length;
      return Math.max(0, Math.min(100, Math.round(((all.length - delayed) / all.length) * 100)));
    }
    return null;
  }, [board, delayIdx]);

  const opsTone =
    onTimePct === null
      ? 'Flights operating'
      : onTimePct >= 82
        ? 'Flights are on time.'
        : onTimePct >= 65
          ? 'Minor schedule delays.'
          : 'Significant airport delays.';

  const airportLocalClock = formatEpochInMode(
    Math.floor(Date.now() / 1000),
    'airport',
    board?.timezoneName,
    board?.utcOffsetSec,
  );

  const tzAbbr =
    timeDisplayMode === 'utc'
      ? 'UTC'
      : timeDisplayMode === 'airport'
        ? board?.timezoneAbbr || 'APT'
        : 'LOCAL';

  return (
    <aside
      role="complementary"
      aria-label={`Airport arrivals, departures, and charts for ${airport.iata || airport.icao}`}
      className="flex-1 h-full min-h-0 flex flex-col"
    >
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden shadow-2xl">
        {/* Compact Sticky Airport Top Bar */}
        <CardHeader className="py-2.5 px-4 shrink-0 border-b border-border/70 space-y-2">
          <div className="flex flex-row items-center justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">
                  {airport.iata ? `${airport.iata}` : airport.icao}
                </span>
                {board?.city && <span className="truncate">{board.city}</span>}
                <span className="tabular-nums text-foreground/80">{airportLocalClock}</span>
                <span className="text-[10px]">({airport.icao})</span>
                {weather && (
                  <Badge
                    variant={
                      weather.flightCategory === 'VFR'
                        ? 'success'
                        : weather.flightCategory === 'MVFR'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {weather.flightCategory}
                  </Badge>
                )}
              </div>
              <CardTitle className="font-display text-sm sm:text-base font-bold leading-tight text-foreground truncate">
                {board?.name || airport.name}
              </CardTitle>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onFocusAirfield && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onFocusAirfield}
                  title="Zoom radar onto airport taxiways and runways"
                >
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Airfield</span>
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                aria-label="Close airport board"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Sub-Navigation Tabs: Board | Chart | Data Sheet | Approach */}
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger active={activeSubTab === 'board'} onClick={() => setActiveSubTab('board')}>
              Board
            </TabsTrigger>
            <TabsTrigger active={activeSubTab === 'chart'} onClick={() => setActiveSubTab('chart')}>
              Chart
            </TabsTrigger>
            <TabsTrigger
              active={activeSubTab === 'datasheet'}
              onClick={() => setActiveSubTab('datasheet')}
            >
              Data Sheet
            </TabsTrigger>
            <TabsTrigger
              active={activeSubTab === 'approach'}
              onClick={() => setActiveSubTab('approach')}
            >
              Approach
            </TabsTrigger>
          </TabsList>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 overflow-y-auto overscroll-contain pt-3 pb-6 [scrollbar-width:thin]">
          {activeSubTab === 'chart' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                  <MapIcon className="w-3.5 h-3.5 text-primary" />
                  Aerodrome Ground Chart · {dataSheet.icao}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setChartZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                    aria-label="Zoom out chart"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <span className="font-mono text-[11px] tabular-nums px-1.5 text-muted-foreground">
                    {chartZoom.toFixed(1)}x
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setChartZoom((z) => Math.min(3.5, Number((z + 0.5).toFixed(1))))}
                    aria-label="Zoom in chart"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                  {chartZoom > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setChartZoom(1)}
                      aria-label="Reset chart zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Interactive Zoomable Vector Aerodrome Chart */}
              <div className="rounded-xl border border-border bg-[#070B12] overflow-auto max-h-[300px]">
                <svg
                  viewBox="0 0 360 260"
                  style={{width: `${chartZoom * 100}%`, height: `${chartZoom * 240}px`}}
                  className="block min-w-full"
                  role="img"
                  aria-label={`Detailed aerodrome chart for ${dataSheet.icao}`}
                >
                  <rect width="360" height="260" fill="#070B12" />
                  {/* Compass / Elevation corner stamp */}
                  <text
                    x="12"
                    y="18"
                    fill="#94A3B8"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="700"
                  >
                    {dataSheet.icao} / {dataSheet.iata} · ELEV {dataSheet.elevationFt} FT · VAR{' '}
                    {dataSheet.magneticVarDeg >= 0 ? `${dataSheet.magneticVarDeg}°E` : `${Math.abs(dataSheet.magneticVarDeg)}°W`}
                  </text>
                  <text
                    x="348"
                    y="18"
                    fill="#38BDF8"
                    fontSize="8.5"
                    fontFamily="JetBrains Mono, monospace"
                    textAnchor="end"
                  >
                    TWR {dataSheet.towerFreq} · GND {dataSheet.groundFreq}
                  </text>

                  {detailedChartSchematic.aprons.map((ap) => (
                    <polygon
                      key={ap.id}
                      points={ap.points}
                      fill="#141C2B"
                      fillOpacity="0.92"
                      stroke="rgba(250, 204, 21, 0.28)"
                      strokeWidth="0.6"
                    />
                  ))}
                  {detailedChartSchematic.terminals.map((term) => (
                    <polygon
                      key={term.id}
                      points={term.points}
                      fill="#1E3A5F"
                      fillOpacity="0.95"
                      stroke="#38BDF8"
                      strokeWidth="0.8"
                    />
                  ))}
                  {detailedChartSchematic.taxiways.map((twy) => (
                    <g key={twy.id}>
                      <polyline
                        points={twy.points}
                        fill="none"
                        stroke="rgba(250, 204, 21, 0.55)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {twy.ref && (
                        <text
                          x={twy.midX}
                          y={twy.midY}
                          fill="#FDE047"
                          fontSize="5.5"
                          fontFamily="JetBrains Mono, monospace"
                          textAnchor="middle"
                        >
                          {twy.ref}
                        </text>
                      )}
                    </g>
                  ))}
                  {detailedChartSchematic.runways.map((r) => (
                    <g key={r.id}>
                      <line
                        x1={r.x1}
                        y1={r.y1}
                        x2={r.x2}
                        y2={r.y2}
                        stroke="rgba(255,255,255,0.28)"
                        strokeWidth="7"
                        strokeLinecap="butt"
                      />
                      <line
                        x1={r.x1}
                        y1={r.y1}
                        x2={r.x2}
                        y2={r.y2}
                        stroke="#F8FAFC"
                        strokeWidth="2.2"
                        strokeDasharray="6 4"
                      />
                      {r.labelA && (
                        <text
                          x={r.x1}
                          y={Math.max(28, r.y1 - 5)}
                          fill="#FFFFFF"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {r.labelA}
                        </text>
                      )}
                      {r.labelB && (
                        <text
                          x={r.x2}
                          y={Math.min(252, r.y2 + 11)}
                          fill="#FFFFFF"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {r.labelB}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              </div>

              {/* Official Country eAIP & Aerodrome Chart Portals */}
              <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Official Country Aerodrome Charts &amp; AIP
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <a
                    href={dataSheet.eaipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border bg-background/80 hover:bg-accent px-3 py-2 text-xs font-medium text-foreground"
                  >
                    <span>Official State eAIP / d-TPP ({dataSheet.icao})</span>
                    <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  </a>
                  <a
                    href={dataSheet.chartFoxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border bg-background/80 hover:bg-accent px-3 py-2 text-xs font-medium text-foreground"
                  >
                    <span>ChartFox Vector &amp; PDF Chart Index</span>
                    <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  </a>
                  <a
                    href={dataSheet.skyVectorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border bg-background/80 hover:bg-accent px-3 py-2 text-xs font-medium text-foreground"
                  >
                    <span>SkyVector Airport Diagram &amp; Sectionals</span>
                    <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  </a>
                </div>
              </div>
            </div>
          ) : activeSubTab === 'datasheet' ? (
            <div className="space-y-3">
              {/* Field Reference Grid */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-xs">
                <div>
                  <div className="text-[10.5px] text-muted-foreground">Field Elevation</div>
                  <div className="font-mono font-bold text-foreground tabular-nums">
                    {dataSheet.elevationFt} ft MSL
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-muted-foreground">Transition Altitude</div>
                  <div className="font-mono font-bold text-foreground tabular-nums">
                    {dataSheet.transitionAltFt.toLocaleString()} ft
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-muted-foreground">Magnetic Variation</div>
                  <div className="font-mono font-bold text-foreground tabular-nums">
                    {dataSheet.magneticVarDeg >= 0
                      ? `${dataSheet.magneticVarDeg.toFixed(1)}° E`
                      : `${Math.abs(dataSheet.magneticVarDeg).toFixed(1)}° W`}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-muted-foreground">ARP Coordinates</div>
                  <div className="font-mono font-semibold text-foreground tabular-nums">
                    {dataSheet.lat.toFixed(3)}, {dataSheet.lon.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* VHF COM Frequencies */}
              <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-primary" />
                  VHF Communications ({dataSheet.icao})
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                  <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5 flex justify-between">
                    <span className="text-muted-foreground">ATIS</span>
                    <span className="font-bold text-foreground">{dataSheet.atisFreq}</span>
                  </div>
                  <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5 flex justify-between">
                    <span className="text-muted-foreground">CLR</span>
                    <span className="font-bold text-foreground">{dataSheet.clearanceFreq}</span>
                  </div>
                  <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5 flex justify-between">
                    <span className="text-muted-foreground">GND</span>
                    <span className="font-bold text-foreground">{dataSheet.groundFreq}</span>
                  </div>
                  <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5 flex justify-between">
                    <span className="text-muted-foreground">TWR</span>
                    <span className="font-bold text-foreground">{dataSheet.towerFreq}</span>
                  </div>
                  <div className="col-span-2 rounded-lg bg-secondary/50 px-2.5 py-1.5 flex justify-between">
                    <span className="text-muted-foreground">APP / DEP</span>
                    <span className="font-bold text-foreground">{dataSheet.approachFreq}</span>
                  </div>
                </div>
              </div>

              {/* Runway Wind & Surface Table */}
              <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  Runway Performance &amp; Surface Status
                </div>
                {weather?.runways && weather.runways.length > 0 ? (
                  <div className="space-y-1.5">
                    {weather.runways.map((r) => (
                      <div
                        key={r.ident}
                        className="rounded-lg border border-border/70 bg-secondary/35 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono font-bold text-foreground">
                            RWY {r.ident}{' '}
                            {r.favored && <Badge variant="success">ACTIVE FAV</Badge>}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                            {r.lengthFt.toLocaleString()} ft · HDG {String(r.headingDeg).padStart(3, '0')}° ·{' '}
                            {r.surface} ({r.brakingAction})
                          </div>
                        </div>
                        <div className="text-right font-mono text-[11px] tabular-nums">
                          <div className="font-semibold text-foreground">
                            HW {r.headwindKts >= 0 ? `+${r.headwindKts}` : r.headwindKts} kt
                          </div>
                          <div className="text-muted-foreground">
                            XW {r.crosswindKts} kt {r.crosswindDir}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Live METAR runway component sync pending for {dataSheet.icao}.
                  </div>
                )}
              </div>
            </div>
          ) : activeSubTab === 'approach' ? (
            <div className="space-y-3">
              {/* Procedure Selector */}
              <div className="flex flex-wrap gap-1.5">
                {dataSheet.approaches.map((proc, idx) => (
                  <Button
                    key={proc.runwayIdent}
                    size="sm"
                    variant={idx === selectedApproachIdx ? 'default' : 'outline'}
                    onClick={() => setSelectedApproachIdx(idx)}
                  >
                    {proc.runwayIdent}
                  </Button>
                ))}
              </div>

              {selectedApproach && (
                <>
                  {/* Brief Strip */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/40 p-2.5 text-xs font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] text-muted-foreground">ILS / LOC</div>
                      <div className="font-bold text-primary">{selectedApproach.ilsFreqMhz} MHz</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">FINAL CRS</div>
                      <div className="font-bold text-foreground">
                        {String(selectedApproach.courseDeg).padStart(3, '0')}°
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">DA (HAT)</div>
                      <div className="font-bold text-amber-500">{selectedApproach.daFt} ft</div>
                    </div>
                  </div>

                  {/* Approach Plan View SVG */}
                  <div className="rounded-xl border border-border bg-[#070B12] p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>PLAN VIEW · {selectedApproach.runwayIdent}</span>
                      <span>MISSED HDG {String(selectedApproach.missedHeadingDeg).padStart(3, '0')}° → {selectedApproach.missedAltFt} FT</span>
                    </div>
                    <svg viewBox="0 0 320 90" className="w-full h-[86px] block">
                      <rect width="320" height="90" fill="#070B12" />
                      {/* Final Approach Course */}
                      <line
                        x1="28"
                        y1="46"
                        x2="255"
                        y2="46"
                        stroke="#38BDF8"
                        strokeWidth="1.6"
                        strokeDasharray="5 3"
                      />
                      {/* Missed Approach Track */}
                      <line
                        x1="255"
                        y1="46"
                        x2="306"
                        y2="24"
                        stroke="#F59E0B"
                        strokeWidth="1.4"
                        strokeDasharray="3 3"
                      />
                      {/* Runway strip */}
                      <rect x="255" y="42" width="32" height="8" rx="1" fill="#F8FAFC" />
                      {/* IAF -> IF -> FAF waypoints */}
                      {[
                        {x: 34, label: selectedApproach.iafFix, sub: 'IAF'},
                        {x: 112, label: selectedApproach.ifFix, sub: `${selectedApproach.ifDistNm}NM`},
                        {x: 186, label: selectedApproach.fafFix, sub: `${selectedApproach.fafDistNm}NM`},
                      ].map((wp) => (
                        <g key={wp.label}>
                          <polygon
                            points={`${wp.x},39 ${wp.x + 6},46 ${wp.x},53 ${wp.x - 6},46`}
                            fill="#0284C7"
                            stroke="#E0F2FE"
                            strokeWidth="1"
                          />
                          <text
                            x={wp.x}
                            y="30"
                            fill="#F8FAFC"
                            fontSize="8.5"
                            fontFamily="JetBrains Mono, monospace"
                            textAnchor="middle"
                            fontWeight="700"
                          >
                            {wp.label}
                          </text>
                          <text
                            x={wp.x}
                            y="66"
                            fill="#94A3B8"
                            fontSize="7.5"
                            fontFamily="JetBrains Mono, monospace"
                            textAnchor="middle"
                          >
                            {wp.sub}
                          </text>
                        </g>
                      ))}
                      <text
                        x="270"
                        y="66"
                        fill="#22C55E"
                        fontSize="8"
                        fontFamily="JetBrains Mono, monospace"
                        textAnchor="middle"
                      >
                        THR
                      </text>
                    </svg>
                  </div>

                  {/* 3.0° Glideslope Vertical Profile SVG */}
                  <div className="rounded-xl border border-border bg-[#070B12] p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>PROFILE VIEW · GS {selectedApproach.glideslopeDeg.toFixed(1)}°</span>
                      <span>{selectedApproach.lightingSystem}</span>
                    </div>
                    <svg viewBox="0 0 320 110" className="w-full h-[106px] block">
                      <rect width="320" height="110" fill="#070B12" />
                      {/* Terrain ground datum */}
                      <line x1="10" y1="92" x2="310" y2="92" stroke="#475569" strokeWidth="1.5" />
                      {/* Stepdown / Glideslope beam */}
                      <polyline
                        points="26,22 108,42 184,60 264,92"
                        fill="none"
                        stroke="#22C55E"
                        strokeWidth="2"
                      />
                      {/* PAPI red/white indicator beside threshold */}
                      <circle cx="272" cy="88" r="2.2" fill="#FFFFFF" />
                      <circle cx="278" cy="88" r="2.2" fill="#FFFFFF" />
                      <circle cx="284" cy="88" r="2.2" fill="#EF4444" />
                      <circle cx="290" cy="88" r="2.2" fill="#EF4444" />

                      {[
                        {x: 26, y: 22, alt: `${selectedApproach.iafAltFt}'`, fix: selectedApproach.iafFix},
                        {x: 108, y: 42, alt: `${selectedApproach.ifAltFt}'`, fix: selectedApproach.ifFix},
                        {x: 184, y: 60, alt: `${selectedApproach.fafAltFt}'`, fix: selectedApproach.fafFix},
                      ].map((pt) => (
                        <g key={pt.fix}>
                          <line
                            x1={pt.x}
                            y1={pt.y}
                            x2={pt.x}
                            y2="92"
                            stroke="rgba(148,163,184,0.28)"
                            strokeDasharray="2 2"
                          />
                          <circle cx={pt.x} cy={pt.y} r="3" fill="#38BDF8" />
                          <text
                            x={pt.x}
                            y={pt.y - 6}
                            fill="#F8FAFC"
                            fontSize="8"
                            fontFamily="JetBrains Mono, monospace"
                            textAnchor="middle"
                          >
                            {pt.alt}
                          </text>
                        </g>
                      ))}
                      <text
                        x="264"
                        y="104"
                        fill="#F8FAFC"
                        fontSize="7.5"
                        fontFamily="JetBrains Mono, monospace"
                        textAnchor="middle"
                      >
                        TDZE {dataSheet.elevationFt}' · DA {selectedApproach.daFt}'
                      </text>
                    </svg>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* FlightDeck-style Dark Airfield Schematic (Runways + Gold Taxiways for ALL Airports) */}
              <div className="relative rounded-xl bg-[#0B0E14] text-white overflow-hidden border border-border">
                <div className="h-[104px] w-full relative">
                  <svg
                    viewBox="0 0 320 104"
                    className="w-full h-full block"
                    role="img"
                    aria-label={`Runway schematic for ${airport.iata || airport.icao}`}
                  >
                    <rect width="320" height="104" fill="#0B0E14" />
                    <g stroke="rgba(255,255,255,0.045)" strokeWidth="1">
                      <line x1="0" y1="26" x2="320" y2="26" />
                      <line x1="0" y1="52" x2="320" y2="52" />
                      <line x1="0" y1="78" x2="320" y2="78" />
                      <line x1="80" y1="0" x2="80" y2="104" />
                      <line x1="160" y1="0" x2="160" y2="104" />
                      <line x1="240" y1="0" x2="240" y2="104" />
                    </g>
                    {airfieldSchematic.aprons.map((ap) => (
                      <polygon
                        key={ap.id}
                        points={ap.points}
                        fill="#131b2b"
                        fillOpacity="0.85"
                        stroke="rgba(250, 204, 21, 0.25)"
                        strokeWidth="0.6"
                      />
                    ))}
                    {airfieldSchematic.terminals.map((term) => (
                      <polygon
                        key={term.id}
                        points={term.points}
                        fill="#1e2d44"
                        fillOpacity="0.95"
                        stroke="rgba(56, 189, 248, 0.6)"
                        strokeWidth="0.8"
                      />
                    ))}
                    {airfieldSchematic.taxiways.map((twy) => (
                      <polyline
                        key={twy.id}
                        points={twy.points}
                        fill="none"
                        stroke="rgba(250, 204, 21, 0.42)"
                        strokeWidth="0.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {airfieldSchematic.runways.map((r) => (
                      <g key={r.id}>
                        <line
                          x1={r.x1}
                          y1={r.y1}
                          x2={r.x2}
                          y2={r.y2}
                          stroke="rgba(255,255,255,0.22)"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={r.x1}
                          y1={r.y1}
                          x2={r.x2}
                          y2={r.y2}
                          stroke="#F8FAFC"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        {r.labelA && (
                          <text
                            x={r.x1}
                            y={Math.max(11, r.y1 - 4)}
                            fill="rgba(248,250,252,0.88)"
                            fontSize="8.5"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="700"
                            textAnchor="middle"
                          >
                            {r.labelA}
                          </text>
                        )}
                        {r.labelB && (
                          <text
                            x={r.x2}
                            y={Math.min(100, r.y2 + 10)}
                            fill="rgba(248,250,252,0.88)"
                            fontSize="8.5"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="700"
                            textAnchor="middle"
                          >
                            {r.labelB}
                          </text>
                        )}
                      </g>
                    ))}
                    {airfieldSchematic.runways.length === 0 && (
                      <text
                        x="160"
                        y="55"
                        fill="rgba(248,250,252,0.55)"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                        textAnchor="middle"
                      >
                        Loading {airport.icao} runway &amp; taxiway geometry…
                      </text>
                    )}
                  </svg>
                  {onFocusAirfield && (
                    <button
                      type="button"
                      onClick={onFocusAirfield}
                      className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/12 hover:bg-white/22 backdrop-blur-md px-2.5 py-0.5 text-[10.5px] font-medium text-white border border-white/15 cursor-pointer"
                    >
                      <Compass className="w-3 h-3 text-amber-300" />
                      Zoom Airfield
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs font-medium text-muted-foreground">{opsTone}</p>
              {/* FlightDeck-style On-Time Today & Weather Summary Card */}
              <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-border bg-secondary/45 p-3">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground font-medium">On time today</div>
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 -rotate-90" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeWidth="3"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke={
                      onTimePct === null || onTimePct >= 80
                        ? '#22c55e'
                        : onTimePct >= 65
                          ? '#f59e0b'
                          : '#ef4444'
                    }
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${((onTimePct ?? 85) / 100) * 56.55} 56.55`}
                  />
                </svg>
                <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                  {onTimePct !== null ? `${onTimePct}%` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1 border-l border-border pl-3">
              <div className="text-[11px] text-muted-foreground font-medium">Weather</div>
              <div className="font-mono text-sm font-bold text-foreground truncate tabular-nums">
                {weather ? (
                  <>
                    {weather.tempC !== null ? `${Math.round(weather.tempC)}°C` : weather.flightCategory}{' '}
                    <span className="font-sans text-xs font-semibold text-muted-foreground">
                      {weather.wxString || weather.flightCategory}
                    </span>
                  </>
                ) : (
                  'Syncing METAR…'
                )}
              </div>
              {weather && (
                <div className="font-mono text-[10px] text-muted-foreground truncate tabular-nums">
                  {weather.windDirDeg ?? 'VRB'}°/{weather.windSpeedKts}kt · Vis {weather.visibilitySm ?? '—'}SM
                </div>
              )}
            </div>
          </div>

          {/* Live Delay Index Breakdown Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Dep Delay Index
                </span>
                <Badge variant={delayBadgeVariant(delayIdx?.departuresIndex ?? null)}>
                  {delayIdx?.departuresIndex !== null && delayIdx?.departuresIndex !== undefined
                    ? delayIdx.departuresIndex.toFixed(2)
                    : '—'}
                </Badge>
              </div>
              <div className="mt-1.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                {delayIdx?.departuresDelayAvgMin !== null && delayIdx?.departuresDelayAvgMin !== undefined
                  ? `${delayIdx.departuresDelayAvgMin} min avg`
                  : delayLabel(delayIdx?.departuresIndex ?? null)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {delayIdx?.departuresDelayedPct !== null && delayIdx?.departuresDelayedPct !== undefined
                  ? `${delayIdx.departuresDelayedPct}% delayed · ${delayIdx.departuresDelayedCount ?? 0}/${
                      (delayIdx.departuresOnTimeCount ?? 0) + (delayIdx.departuresDelayedCount ?? 0)
                    }`
                  : 'Live ops monitor'}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  Arr Delay Index
                </span>
                <Badge variant={delayBadgeVariant(delayIdx?.arrivalsIndex ?? null)}>
                  {delayIdx?.arrivalsIndex !== null && delayIdx?.arrivalsIndex !== undefined
                    ? delayIdx.arrivalsIndex.toFixed(2)
                    : '—'}
                </Badge>
              </div>
              <div className="mt-1.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                {delayIdx?.arrivalsDelayAvgMin !== null && delayIdx?.arrivalsDelayAvgMin !== undefined
                  ? `${delayIdx.arrivalsDelayAvgMin} min avg`
                  : delayLabel(delayIdx?.arrivalsIndex ?? null)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {delayIdx?.arrivalsDelayedPct !== null && delayIdx?.arrivalsDelayedPct !== undefined
                  ? `${delayIdx.arrivalsDelayedPct}% delayed · ${delayIdx.arrivalsDelayedCount ?? 0}/${
                      (delayIdx.arrivalsOnTimeCount ?? 0) + (delayIdx.arrivalsDelayedCount ?? 0)
                    }`
                  : 'Live ops monitor'}
              </div>
            </div>
          </div>

          {weather && (
            <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-[11px] font-mono text-foreground">
              Wind {weather.windDirDeg ?? 'VRB'}° @ {weather.windSpeedKts} kt · Vis {weather.visibilitySm ?? '—'} SM · QNH{' '}
              {weather.altimeterHpa ?? '—'} hPa
            </div>
          )}

          {/* Filter Radar Traffic to this Airport */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filter Radar Traffic
              </span>
              {activeFilter !== 'none' && (
                <Button size="sm" variant="ghost" onClick={() => onFilterChange('none')}>
                  Reset
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={activeFilter === 'none' ? 'default' : 'outline'}
                onClick={() => onFilterChange('none')}
              >
                All Sector
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                onClick={() => onFilterChange('all')}
              >
                {airport.iata || airport.icao} All
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'departures' ? 'default' : 'outline'}
                onClick={() => onFilterChange('departures')}
              >
                Departures
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'arrivals' ? 'default' : 'outline'}
                onClick={() => onFilterChange('arrivals')}
              >
                Arrivals
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'delayed' ? 'destructive' : 'outline'}
                onClick={() => onFilterChange('delayed')}
              >
                Delayed ({delayedTotalCount})
              </Button>
            </div>
          </div>

          <Separator />

          {/* Synchronized Schedule Timezone Switcher + Board Tabs */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Times ({tzAbbr})
              </span>
              <TabsList>
                <TabsTrigger
                  active={timeDisplayMode === 'airport'}
                  onClick={() => onTimeDisplayModeChange('airport')}
                >
                  Airport
                </TabsTrigger>
                <TabsTrigger
                  active={timeDisplayMode === 'local'}
                  onClick={() => onTimeDisplayModeChange('local')}
                >
                  My Local
                </TabsTrigger>
                <TabsTrigger
                  active={timeDisplayMode === 'utc'}
                  onClick={() => onTimeDisplayModeChange('utc')}
                >
                  UTC
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger active={boardTab === 'departures'} onClick={() => setBoardTab('departures')}>
                  Departures ({board?.departures.length ?? 0})
                </TabsTrigger>
                <TabsTrigger active={boardTab === 'arrivals'} onClick={() => setBoardTab('arrivals')}>
                  Arrivals ({board?.arrivals.length ?? 0})
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={listStatusFilter === 'delayed' ? 'destructive' : 'outline'}
                  onClick={() =>
                    setListStatusFilter((prev) => (prev === 'delayed' ? 'all' : 'delayed'))
                  }
                >
                  <AlertTriangle className="w-3 h-3" />
                  Delayed
                </Button>
                <Button
                  size="sm"
                  variant={listStatusFilter === 'cancelled' ? 'destructive' : 'outline'}
                  onClick={() =>
                    setListStatusFilter((prev) => (prev === 'cancelled' ? 'all' : 'cancelled'))
                  }
                >
                  <Ban className="w-3 h-3" />
                  Cancelled ({cancelledTabCount})
                </Button>
              </div>
            </div>

            {/* Live Search Bar for Departures / Arrivals / Cancelled Flights */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                placeholder={`Search ${boardTab} by flight, airport, reg, gate, or "cancelled"`}
                aria-label="Search airport board flights"
                className="h-8 pl-8 pr-8 text-xs"
              />
              {boardSearch && (
                <button
                  type="button"
                  onClick={() => setBoardSearch('')}
                  aria-label="Clear board search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Flight Board Rows (All fetched entries, >25) */}
          <div className="space-y-2">
            {loading && !board ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Fetching live arrivals, departures, and delay index…
              </div>
            ) : listItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No {listStatusFilter !== 'all' ? `${listStatusFilter} ` : ''}
                {boardTab} matched{boardSearch ? ` "${boardSearch}"` : ''} right now.
              </div>
            ) : (
              listItems.map((item) => {
                const peerCode = boardTab === 'departures' ? item.destinationIata : item.originIata;
                const peerName = boardTab === 'departures' ? item.destinationName : item.originName;
                const schedClock = formatEpochInMode(
                  item.scheduledTime || item.estimatedTime || item.actualTime,
                  timeDisplayMode,
                  board?.timezoneName,
                  board?.utcOffsetSec,
                );
                const syncStatus = formatSynchronizedStatus(
                  item,
                  boardTab,
                  timeDisplayMode,
                  board?.timezoneName,
                  board?.utcOffsetSec,
                );

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectFlightFromBoard(item)}
                    className="w-full text-left rounded-xl border border-border bg-background/70 hover:bg-accent/70 p-2.5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.flightNumber || item.callsign}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground truncate">
                          {boardTab === 'departures' ? `→ ${peerCode || '—'}` : `← ${peerCode || '—'}`}
                        </span>
                        {item.aircraftCode && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {item.aircraftCode}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={
                          item.statusColor === 'red'
                            ? 'destructive'
                            : item.statusColor === 'amber'
                              ? 'warning'
                              : item.statusColor === 'green'
                                ? 'success'
                                : 'secondary'
                        }
                      >
                        {syncStatus}
                      </Badge>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {peerName || item.airlineName || 'Scheduled service'}
                      </span>
                      <span className="font-mono tabular-nums shrink-0 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Sched {schedClock} {tzAbbr}
                      </span>
                    </div>

                    {(item.terminal || item.gate || item.baggage || item.registration) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-foreground">
                        {item.terminal && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">T{item.terminal}</span>
                        )}
                        {item.gate && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">Gate {item.gate}</span>
                        )}
                        {item.baggage && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">Bag {item.baggage}</span>
                        )}
                        {item.registration && (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <Plane className="w-2.5 h-2.5" />
                            {item.registration}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
          </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
};
