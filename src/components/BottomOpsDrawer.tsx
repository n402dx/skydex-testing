import {
  Activity,
  AlertTriangle,
  CloudRain,
  Compass,
  ExternalLink,
  History,
  Plane,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Wind,
  X,
} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {AIRPORT_CATALOG} from '../data/aviationCatalog';
import {apiFetchJson} from '../services/directAviationClient';
import type {
  AcarsMessage,
  AirportDisruption,
  LiveFlight,
  LiveFlightUpdateItem,
  PastFlightRecord,
  RadarSettings,
  SafetyRecordResponse,
  SigmetHazard,
} from '../types/aviation';
import {Badge} from './ui/badge';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {TabsList, TabsTrigger} from './ui/tabs';

export type BottomOpsTab = 'past' | 'updates' | 'wx' | 'safety';

interface BottomOpsDrawerProps {
  open: boolean;
  activeTab: BottomOpsTab;
  onTabChange: (tab: BottomOpsTab) => void;
  onClose: () => void;
  isPortraitMobile: boolean;
  selectedFlight: LiveFlight | null;
  liveUpdates: LiveFlightUpdateItem[];
  sigmets: SigmetHazard[];
  disruptions: AirportDisruption[];
  acarsMessages: AcarsMessage[];
  radarSettings: RadarSettings;
  onUpdateRadarSettings: (patch: Partial<RadarSettings>) => void;
  onSelectFlightByHexOrCallsign: (icao24?: string, callsign?: string) => void;
  onFlyToAirport: (icao: string) => void;
  onFlyToPoint: (lat: number, lon: number, zoom?: number) => void;
}

function formatEpochShort(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const BottomOpsDrawer: React.FC<BottomOpsDrawerProps> = ({
  open,
  activeTab,
  onTabChange,
  onClose,
  isPortraitMobile,
  selectedFlight,
  liveUpdates,
  sigmets,
  disruptions,
  acarsMessages,
  radarSettings,
  onUpdateRadarSettings,
  onSelectFlightByHexOrCallsign,
  onFlyToAirport,
  onFlyToPoint,
}) => {
  const [pastQuery, setPastQuery] = useState('');
  const [pastLoading, setPastLoading] = useState(false);
  const [pastItems, setPastItems] = useState<PastFlightRecord[]>([]);
  const [pastSearched, setPastSearched] = useState(false);

  const [safetyQuery, setSafetyQuery] = useState('');
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyResult, setSafetyResult] = useState<SafetyRecordResponse | null>(null);

  // Sync default registration / flight suggestion cleanly when selected flight changes
  useEffect(() => {
    if (selectedFlight?.registration && !safetyQuery) {
      setSafetyQuery(selectedFlight.registration);
    }
    if ((selectedFlight?.flightNumber || selectedFlight?.callsign) && !pastQuery) {
      setPastQuery(selectedFlight.flightNumber || selectedFlight.callsign);
    }
  }, [selectedFlight?.registration, selectedFlight?.flightNumber, selectedFlight?.callsign, safetyQuery, pastQuery]);

  const runPastSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? pastQuery).trim().toUpperCase();
    if (!q) return;
    setPastLoading(true);
    setPastSearched(true);
    try {
      const data = await apiFetchJson<{items?: PastFlightRecord[]}>(
        `/api/past-flights?query=${encodeURIComponent(q)}`,
      );
      setPastItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setPastItems([]);
    } finally {
      setPastLoading(false);
    }
  };

  const runSafetySearch = async (overrideReg?: string) => {
    const reg = (overrideReg ?? safetyQuery).trim().toUpperCase();
    if (!reg) return;
    setSafetyLoading(true);
    try {
      const data = await apiFetchJson<SafetyRecordResponse>(
        `/api/safety-record?registration=${encodeURIComponent(reg)}`,
      );
      setSafetyResult(data);
    } catch {
      setSafetyResult({
        registration: reg,
        items: [],
        searchUrl: `https://aviation-safety.net/wikibase/dblist.php?Reg=${encodeURIComponent(reg)}`,
        source: 'Aviation Safety Network',
        fetchedAt: Date.now(),
        note: 'Unable to reach ASN mirror directly; open external ASN dossier link below.',
      });
    } finally {
      setSafetyLoading(false);
    }
  };

  const maintAcars = acarsMessages.filter(
    (m) => m.category === 'MAINT' || /EMERG|MAYDAY|PAN|DIVERT|GATE|DELAY/i.test(m.rawText),
  );

  const turbCount = sigmets.filter((s) => s.category === 'turbulence').length;
  const iceCount = sigmets.filter((s) => s.category === 'icing').length;
  const advCount = sigmets.filter((s) => !s.category || s.category === 'advisory').length;

  return (
    <section
      aria-hidden={!open}
      aria-label="Flight operations drawer"
      className={`fixed left-1/2 -translate-x-1/2 z-[565] w-[min(780px,calc(100vw-16px))] rounded-2xl border border-border bg-card/96 backdrop-blur-md shadow-2xl transition-all duration-300 ease-out flex flex-col overflow-hidden ${
        isPortraitMobile ? 'bottom-[70px] max-h-[68dvh]' : 'bottom-[68px] max-h-[58dvh]'
      } ${
        open
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-6 opacity-0 pointer-events-none'
      }`}
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border/70 shrink-0">
        <TabsList>
          <TabsTrigger active={activeTab === 'past'} onClick={() => onTabChange('past')}>
            <History className="w-3.5 h-3.5 mr-1 inline" />
            Past Flights
          </TabsTrigger>
          <TabsTrigger active={activeTab === 'updates'} onClick={() => onTabChange('updates')}>
            <Activity className="w-3.5 h-3.5 mr-1 inline" />
            Live Updates ({liveUpdates.length + maintAcars.length})
          </TabsTrigger>
          <TabsTrigger active={activeTab === 'wx'} onClick={() => onTabChange('wx')}>
            <Wind className="w-3.5 h-3.5 mr-1 inline" />
            WX &amp; Restrictions ({sigmets.length + disruptions.length})
          </TabsTrigger>
          <TabsTrigger active={activeTab === 'safety'} onClick={() => onTabChange('safety')}>
            <ShieldAlert className="w-3.5 h-3.5 mr-1 inline" />
            Safety (ASN)
          </TabsTrigger>
        </TabsList>

        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="Close operations drawer"
          className="h-7 w-7"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 space-y-3 [scrollbar-width:thin]">
        {activeTab === 'past' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={pastQuery}
                  onChange={(e) => setPastQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runPastSearch();
                  }}
                  placeholder="Enter flight number (CXA811) or tail registration (B-1356)"
                  aria-label="Search past flights by flight number or registration"
                  className="h-9 pl-8 text-xs font-mono"
                />
              </div>
              <Button size="sm" onClick={() => void runPastSearch()} disabled={pastLoading}>
                {pastLoading ? 'Searching…' : 'Search History'}
              </Button>
              {selectedFlight?.registration && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPastQuery(selectedFlight.registration);
                    void runPastSearch(selectedFlight.registration);
                  }}
                >
                  Use {selectedFlight.registration}
                </Button>
              )}
              {(selectedFlight?.flightNumber || selectedFlight?.callsign) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const q = selectedFlight.flightNumber || selectedFlight.callsign;
                    setPastQuery(q);
                    void runPastSearch(q);
                  }}
                >
                  Use {selectedFlight.flightNumber || selectedFlight.callsign}
                </Button>
              )}
            </div>

            {pastLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Querying live historical sector logs…
              </div>
            ) : pastItems.length === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/35 p-4 text-xs text-muted-foreground text-center">
                {pastSearched
                  ? `No recent sectors found for "${pastQuery}". Try a commercial flight number (e.g. UA857, CA981) or active airframe tail.`
                  : 'Search any flight number or tail registration to view recent sectors, block times, and assigned airframes.'}
              </div>
            ) : (
              <div className="space-y-2">
                {pastItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background/75 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-foreground">
                          {item.flightNumber || item.callsign}
                        </span>
                        <span className="text-muted-foreground">
                          {item.originIata || item.originIcao || '—'} → {item.destinationIata || item.destinationIcao || '—'}
                        </span>
                        {item.registration && (
                          <Badge variant="outline">{item.registration}</Badge>
                        )}
                        {item.aircraftCode && (
                          <span className="text-[10.5px] text-muted-foreground">{item.aircraftCode}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                        Dep {formatEpochShort(item.actualDep || item.scheduledDep)} · Arr{' '}
                        {formatEpochShort(item.actualArr || item.scheduledArr)} · {item.source}
                      </div>
                    </div>
                    <Badge
                      variant={
                        /cancel/i.test(item.statusText)
                          ? 'destructive'
                          : /delay/i.test(item.statusText)
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {item.statusText || 'Completed'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'updates' && (
          <div className="space-y-2.5">
            {liveUpdates.length === 0 && maintAcars.length === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/35 p-5 text-center text-xs text-muted-foreground">
                No emergency squawks, major delays (&gt;=20m), or gate changes detected in the active sector. Click any airport to monitor live gate &amp; schedule changes.
              </div>
            ) : (
              <div className="space-y-2">
                {liveUpdates.map((upd) => (
                  <div
                    key={upd.id}
                    className={`rounded-xl border p-2.5 flex items-start justify-between gap-2 text-xs ${
                      upd.severity === 'high'
                        ? 'border-red-500/60 bg-red-500/10'
                        : upd.severity === 'medium'
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-border bg-background/75'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            upd.severity === 'high'
                              ? 'destructive'
                              : upd.severity === 'medium'
                                ? 'warning'
                                : 'secondary'
                          }
                        >
                          {upd.badge}
                        </Badge>
                        <span className="font-mono font-bold text-foreground">{upd.title}</span>
                        <span className="text-[11px] text-muted-foreground">{upd.subtitle}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{upd.detail}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(upd.icao24 || upd.kind === 'emergency') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSelectFlightByHexOrCallsign(upd.icao24, upd.title)}
                        >
                          Track
                        </Button>
                      )}
                      {upd.airportIata && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onFlyToAirport(upd.airportIata!)}
                        >
                          Airport
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {maintAcars.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border bg-background/75 p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono">
                      <span className="font-bold text-foreground">
                        ACARS {m.callsign} {m.tail ? `(${m.tail})` : ''}
                      </span>
                      <Badge variant="warning">[{m.labelName}]</Badge>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground break-all">{m.rawText}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'wx' && (
          <div className="space-y-3">
            {/* Map Hazard Quick Toggles */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-secondary/35 p-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                Map Layers:
              </span>
              <Button
                size="sm"
                variant={radarSettings.showSigmets ? 'default' : 'outline'}
                onClick={() => onUpdateRadarSettings({showSigmets: !radarSettings.showSigmets})}
              >
                All Advisories
              </Button>
              <Button
                size="sm"
                variant={radarSettings.showTurbHazards ? 'default' : 'outline'}
                className={
                  radarSettings.showTurbHazards
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                    : undefined
                }
                onClick={() => onUpdateRadarSettings({showTurbHazards: !radarSettings.showTurbHazards})}
              >
                <Wind className="w-3.5 h-3.5" />
                Turbulence ({turbCount})
              </Button>
              <Button
                size="sm"
                variant={radarSettings.showIceHazards ? 'secondary' : 'outline'}
                onClick={() => onUpdateRadarSettings({showIceHazards: !radarSettings.showIceHazards})}
              >
                <Snowflake className="w-3.5 h-3.5" />
                Icing ({iceCount})
              </Button>
              <Button
                size="sm"
                variant={radarSettings.showAdvisoryHazards ? 'destructive' : 'outline'}
                onClick={() =>
                  onUpdateRadarSettings({showAdvisoryHazards: !radarSettings.showAdvisoryHazards})
                }
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                SIGMET / Conv ({advCount})
              </Button>
              <Button
                size="sm"
                variant={radarSettings.showRadar ? 'default' : 'outline'}
                onClick={() => onUpdateRadarSettings({showRadar: !radarSettings.showRadar})}
              >
                <CloudRain className="w-3.5 h-3.5" />
                Precip Radar
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* Airport Restrictions & Ground Delays */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Airport Restrictions &amp; Weather Advisories ({disruptions.length})
                </div>
                {disruptions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    No active ground stops, GDPs, or severe hub restrictions reported.
                  </div>
                ) : (
                  disruptions.slice(0, 12).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onFlyToAirport(d.icao)}
                      className="w-full text-left rounded-xl border border-border bg-background/75 hover:bg-accent/60 p-2.5 text-xs space-y-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-foreground">
                          {d.iata || d.icao} · {d.airportName}
                        </span>
                        <Badge variant={d.severity === 'HIGH' ? 'destructive' : 'warning'}>
                          {d.type}
                          {d.avgDelayMinutes ? ` ${d.avgDelayMinutes}m` : ''}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{d.reason}</p>
                    </button>
                  ))
                )}
              </div>

              {/* Active Turbulence, Icing & Convective SIGMETs */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Map SIGMETs / G-AIRMETs ({sigmets.length})
                </div>
                {sigmets.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    No active NOAA AWC SIGMET/G-AIRMET polygons decoded in feed.
                  </div>
                ) : (
                  sigmets.slice(0, 14).map((hz) => {
                    const center = hz.coords[0];
                    return (
                      <button
                        key={hz.id}
                        type="button"
                        onClick={() => center && onFlyToPoint(center[0], center[1], 5)}
                        className="w-full text-left rounded-xl border border-border bg-background/75 hover:bg-accent/60 p-2.5 text-xs space-y-1 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-foreground">
                            {hz.hazard} {hz.qualifier ? `· ${hz.qualifier}` : ''}
                          </span>
                          <Badge
                            variant={
                              hz.category === 'icing'
                                ? 'secondary'
                                : hz.category === 'turbulence'
                                  ? 'warning'
                                  : 'destructive'
                            }
                          >
                            {(hz.category ?? 'advisory').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">
                          {hz.baseFt !== null || hz.topFt !== null
                            ? `FL${Math.round((hz.baseFt ?? 0) / 100)}–FL${Math.round((hz.topFt ?? 45000) / 100)}`
                            : 'Surface–Upper'}{' '}
                          · {hz.source}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={safetyQuery}
                  onChange={(e) => setSafetyQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSafetySearch();
                  }}
                  placeholder="Enter tail registration (e.g. B-1356, N123AB, G-BYGC)"
                  aria-label="Lookup Aviation Safety Network records by registration"
                  className="h-9 pl-8 text-xs font-mono"
                />
              </div>
              <Button size="sm" onClick={() => void runSafetySearch()} disabled={safetyLoading}>
                {safetyLoading ? 'Checking ASN…' : 'Lookup ASN'}
              </Button>
              {selectedFlight?.registration && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSafetyQuery(selectedFlight.registration);
                    void runSafetySearch(selectedFlight.registration);
                  }}
                >
                  <Plane className="w-3.5 h-3.5" />
                  Use {selectedFlight.registration}
                </Button>
              )}
            </div>

            {safetyResult ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-foreground inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    ASN Database · {safetyResult.registration}
                  </span>
                  <a
                    href={safetyResult.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    Open aviation-safety.net
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {safetyResult.items.length === 0 ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-foreground">
                    <div className="font-semibold">
                      No Aviation Safety Network hull loss / incident records matched {safetyResult.registration}.
                    </div>
                    {safetyResult.note && (
                      <div className="text-[11px] text-muted-foreground mt-1">{safetyResult.note}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {safetyResult.items.map((rec, i) => (
                      <div
                        key={`${rec.date}-${i}`}
                        className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-foreground">
                            {rec.date} · {rec.type}
                          </span>
                          <Badge variant="warning">{rec.damage || 'Incident'}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {rec.operator} · {rec.location} · Fatalities: {rec.fatalities || '0'}
                        </div>
                        {rec.href && (
                          <a
                            href={rec.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Full ASN Dossier
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-secondary/35 p-4 text-xs text-muted-foreground text-center">
                Enter an airframe tail registration to query incident/accident history directly from{' '}
                <a
                  href="https://aviation-safety.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  aviation-safety.net
                </a>
                .
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export function resolveCatalogAirportCoords(code: string): {lat: number; lon: number} | null {
  const c = code.trim().toUpperCase();
  const match = AIRPORT_CATALOG.find((a) => a.icao === c || a.iata === c);
  return match ? {lat: match.lat, lon: match.lon} : null;
}
