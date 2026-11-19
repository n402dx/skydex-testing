import {AlertTriangle, BookmarkPlus, CheckCircle2, MapPin, Navigation, Trash2, Wind} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {AIRPORT_CATALOG} from '../data/aviationCatalog';
import {apiFetchJson} from '../services/directAviationClient';
import {
  deleteSavedFlightPlan,
  haversineNm,
  initialBearingDeg,
  listSavedFlightPlans,
  saveFlightPlanOffline,
} from '../services/offlineStore';
import type {
  AirportDisruption,
  AirportWeather,
  SavedFlightPlan,
  SigmetHazard,
} from '../types/aviation';
import {Badge} from './ui/badge';
import {Button} from './ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from './ui/card';
import {Separator} from './ui/separator';

interface FlightPlannerViewProps {
  airportsWeather: AirportWeather[];
  sigmets: SigmetHazard[];
  disruptions: AirportDisruption[];
  onApplyRouteToRadar: (route: {
    originLat: number;
    originLon: number;
    destLat: number;
    destLon: number;
  }) => void;
}

const AIRCRAFT_PROFILES = [
  {code: 'C919', label: 'COMAC C919', tasKts: 450, maxXwKts: 33},
  {code: 'A359', label: 'Airbus A350-900', tasKts: 490, maxXwKts: 38},
  {code: 'B789', label: 'Boeing 787-9', tasKts: 488, maxXwKts: 38},
  {code: 'B77W', label: 'Boeing 777-300ER', tasKts: 492, maxXwKts: 38},
  {code: 'A320', label: 'Airbus A320neo', tasKts: 448, maxXwKts: 33},
  {code: 'B738', label: 'Boeing 737-800', tasKts: 452, maxXwKts: 33},
];

function pointNearSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  toleranceDeg = 3.0,
): boolean {
  const minLat = Math.min(aLat, bLat) - toleranceDeg;
  const maxLat = Math.max(aLat, bLat) + toleranceDeg;
  const minLon = Math.min(aLon, bLon) - toleranceDeg;
  const maxLon = Math.max(aLon, bLon) + toleranceDeg;
  return pLat >= minLat && pLat <= maxLat && pLon >= minLon && pLon <= maxLon;
}

export const FlightPlannerView: React.FC<FlightPlannerViewProps> = ({
  airportsWeather,
  sigmets,
  disruptions,
  onApplyRouteToRadar,
}) => {
  const [originIcao, setOriginIcao] = useState('ZBAA');
  const [destIcao, setDestIcao] = useState('ZSPD');
  const [altIcao, setAltIcao] = useState('ZSSS');
  const [aircraftType, setAircraftType] = useState('C919');
  const [cruiseAltFt, setCruiseAltFt] = useState(35000);
  const [savedPlans, setSavedPlans] = useState<SavedFlightPlan[]>([]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [fetchedWeather, setFetchedWeather] = useState<Record<string, AirportWeather>>({});

  useEffect(() => {
    listSavedFlightPlans().then(setSavedPlans);
  }, []);

  useEffect(() => {
    const icaos = [originIcao, destIcao, altIcao].filter(Boolean).join(',');
    apiFetchJson<{airports?: AirportWeather[]}>(`/api/weather?icaos=${encodeURIComponent(icaos)}`)
      .then((data) => {
        if (!data?.airports) return;
        setFetchedWeather((prev) => {
          const next = {...prev};
          for (const a of data.airports!) next[a.icao] = a;
          return next;
        });
      })
      .catch(() => {});
  }, [originIcao, destIcao, altIcao]);

  const originSpec = useMemo(
    () => AIRPORT_CATALOG.find((a) => a.icao === originIcao) ?? AIRPORT_CATALOG[0],
    [originIcao],
  );
  const destSpec = useMemo(
    () => AIRPORT_CATALOG.find((a) => a.icao === destIcao) ?? AIRPORT_CATALOG[2],
    [destIcao],
  );
  const altSpec = useMemo(
    () => AIRPORT_CATALOG.find((a) => a.icao === altIcao) ?? AIRPORT_CATALOG[3],
    [altIcao],
  );

  const originWx = useMemo(
    () => fetchedWeather[originIcao] ?? airportsWeather.find((w) => w.icao === originIcao),
    [fetchedWeather, airportsWeather, originIcao],
  );
  const destWx = useMemo(
    () => fetchedWeather[destIcao] ?? airportsWeather.find((w) => w.icao === destIcao),
    [fetchedWeather, airportsWeather, destIcao],
  );

  const profile = AIRCRAFT_PROFILES.find((p) => p.code === aircraftType) ?? AIRCRAFT_PROFILES[0];
  const distanceNm = Math.round(haversineNm(originSpec.lat, originSpec.lon, destSpec.lat, destSpec.lon));
  const bearingDeg = Math.round(initialBearingDeg(originSpec.lat, originSpec.lon, destSpec.lat, destSpec.lon));
  const eteMinutes = Math.max(20, Math.round((distanceNm / profile.tasKts) * 60 + 18));

  const intersectingSigmets = useMemo(() => {
    return sigmets.filter((sig) =>
      sig.coords.some(([lat, lon]) =>
        pointNearSegment(lat, lon, originSpec.lat, originSpec.lon, destSpec.lat, destSpec.lon, 2.5),
      ),
    );
  }, [sigmets, originSpec, destSpec]);

  const routeDisruptions = useMemo(() => {
    return disruptions.filter(
      (d) => d.icao === originIcao || d.icao === destIcao || d.icao === altIcao,
    );
  }, [disruptions, originIcao, destIcao, altIcao]);

  const handleSaveOffline = async () => {
    const plan: SavedFlightPlan = {
      id: `${originIcao}-${destIcao}-${Date.now()}`,
      name: `${originSpec.iata} → ${destSpec.iata} (${aircraftType})`,
      originIcao,
      destinationIcao: destIcao,
      alternateIcao: altIcao,
      aircraftType,
      cruiseAltFt,
      distanceNm,
      eteMinutes,
      savedAt: Date.now(),
      originWeather: originWx,
      destinationWeather: destWx,
      intersectingSigmets,
      disruptions: routeDisruptions,
    };
    await saveFlightPlanOffline(plan);
    setSavedPlans(await listSavedFlightPlans());
    setStatusNotice(`Saved ${plan.name} with live METAR/TAF and runway data to IndexedDB`);
    window.setTimeout(() => setStatusNotice(null), 4000);
  };

  const handleDeletePlan = async (id: string) => {
    await deleteSavedFlightPlan(id);
    setSavedPlans(await listSavedFlightPlans());
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <Card className="lg:col-span-7 flex flex-col">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Flight and Runway Dispatch</CardTitle>
            <CardDescription>
              Live NOAA METAR/TAF runway crosswinds, SIGMET corridor checks, and disruptions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                onApplyRouteToRadar({
                  originLat: originSpec.lat,
                  originLon: originSpec.lon,
                  destLat: destSpec.lat,
                  destLon: destSpec.lon,
                })
              }
            >
              <MapPin className="w-3.5 h-3.5" />
              Plot on Radar
            </Button>
            <Button onClick={handleSaveOffline}>
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save Offline
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {statusNotice && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Departure</span>
              <select
                value={originIcao}
                onChange={(e) => setOriginIcao(e.target.value)}
                className="h-8 rounded-md bg-background border border-input px-2.5 font-mono text-foreground"
              >
                {AIRPORT_CATALOG.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.icao} ({a.iata})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Arrival</span>
              <select
                value={destIcao}
                onChange={(e) => setDestIcao(e.target.value)}
                className="h-8 rounded-md bg-background border border-input px-2.5 font-mono text-foreground"
              >
                {AIRPORT_CATALOG.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.icao} ({a.iata})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Alternate</span>
              <select
                value={altIcao}
                onChange={(e) => setAltIcao(e.target.value)}
                className="h-8 rounded-md bg-background border border-input px-2.5 font-mono text-foreground"
              >
                {AIRPORT_CATALOG.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.icao} ({a.iata})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Airframe</span>
              <select
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value)}
                className="h-8 rounded-md bg-background border border-input px-2.5 font-mono text-foreground"
              >
                {AIRCRAFT_PROFILES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Cruise Level</span>
              <select
                value={cruiseAltFt}
                onChange={(e) => setCruiseAltFt(Number(e.target.value))}
                className="h-8 rounded-md bg-background border border-input px-2.5 font-mono text-foreground"
              >
                {[29000, 31000, 33000, 35000, 37000, 39000, 41000].map((fl) => (
                  <option key={fl} value={fl}>
                    FL{fl / 100}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-border py-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Great-Circle Distance</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {distanceNm} NM
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">True Course</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {String(bearingDeg).padStart(3, '0')}°
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Est. Enroute Time</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {Math.floor(eteMinutes / 60)}h {String(eteMinutes % 60).padStart(2, '0')}m
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Max X-Wind Limit</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {profile.maxXwKts} kt
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {role: 'Departure', spec: originSpec, wx: originWx},
              {role: 'Arrival', spec: destSpec, wx: destWx},
            ].map(({role, spec, wx}) => (
              <div key={role} className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    {role}: {spec.icao} ({spec.iata})
                  </span>
                  <Badge variant="secondary">{wx?.flightCategory ?? 'SYNCING'}</Badge>
                </div>

                {wx ? (
                  <>
                    <p className="font-mono text-[11px] text-muted-foreground leading-relaxed border-b border-border pb-2">
                      {wx.rawMetar}
                    </p>
                    {wx.tafRaw && (
                      <p className="font-mono text-[10px] text-muted-foreground leading-relaxed border-b border-border pb-2">
                        TAF: {wx.tafRaw.slice(0, 180)}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {wx.runways.map((rwy) => {
                        const exceedsLimit = rwy.crosswindKts > profile.maxXwKts;
                        return (
                          <div
                            key={rwy.ident}
                            className="flex items-center justify-between text-xs font-mono tabular-nums py-1.5 border-b border-border/60"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">RWY {rwy.ident}</span>
                              {rwy.favored && <Badge variant="success">Favored</Badge>}
                            </div>
                            <div className="flex items-center gap-2.5 text-[11px]">
                              <span className="text-muted-foreground">
                                HW {rwy.headwindKts >= 0 ? `+${rwy.headwindKts}` : rwy.headwindKts}kt
                              </span>
                              <span className={exceedsLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                                XW {rwy.crosswindKts}kt {rwy.crosswindDir}
                              </span>
                              <span
                                className={
                                  rwy.surface === 'DRY'
                                    ? 'text-muted-foreground'
                                    : rwy.surface === 'WET'
                                      ? 'text-sky-500'
                                      : 'text-amber-500 font-semibold'
                                }
                              >
                                {rwy.surface}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground py-4">
                    Waiting for NOAA METAR/TAF for {spec.icao}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Cached Offline Flight Plans ({savedPlans.length})
            </h3>
            {savedPlans.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Save a briefing above to retain runway winds, METARs, and hazards offline
              </p>
            ) : (
              <div className="divide-y divide-border">
                {savedPlans.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-mono font-semibold text-foreground">{p.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                        {p.distanceNm} NM · FL{p.cruiseAltFt / 100} · ALT {p.alternateIcao} · Saved{' '}
                        {new Date(p.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setOriginIcao(p.originIcao);
                          setDestIcao(p.destinationIcao);
                          setAltIcao(p.alternateIcao);
                          setAircraftType(p.aircraftType);
                          setCruiseAltFt(p.cruiseAltFt);
                          setFetchedWeather((prev) => {
                            const next = {...prev};
                            if (p.originWeather && !next[p.originIcao]) next[p.originIcao] = p.originWeather;
                            if (p.destinationWeather && !next[p.destinationIcao]) {
                              next[p.destinationIcao] = p.destinationWeather;
                            }
                            return next;
                          });
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePlan(p.id)}
                        aria-label={`Delete saved plan ${p.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-5 flex flex-col">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Weather Hazards and Disruptions</CardTitle>
          <CardDescription>
            FAA NAS Ground Stops/GDPs, NOAA SIGMETs, and hub METAR advisories
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 flex-1">
          <div className="border-y border-border py-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Wind className="w-3.5 h-3.5 text-muted-foreground" />
                Corridor SIGMETs ({originIcao} → {destIcao})
              </span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {intersectingSigmets.length} active
              </span>
            </div>
            {intersectingSigmets.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                No active NOAA SIGMET polygons intersect the direct corridor
              </p>
            ) : (
              <div className="space-y-2.5">
                {intersectingSigmets.slice(0, 4).map((sig) => (
                  <div key={sig.id} className="text-xs border-b border-border pb-2 last:border-0">
                    <div className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {sig.hazard} {sig.qualifier} ·{' '}
                      {sig.baseFt !== null ? `FL${Math.round(sig.baseFt / 100)}` : 'SFC'}–
                      {sig.topFt !== null ? `FL${Math.round(sig.topFt / 100)}` : 'UNL'}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground mt-1">
                      {sig.rawText.slice(0, 160)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                Airport Disruptions
              </span>
              <span className="font-mono text-muted-foreground tabular-nums">{disruptions.length} active</span>
            </div>

            <div className="max-h-[460px] overflow-y-auto divide-y divide-border">
              {disruptions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No active delays or severe weather disruptions reported across monitored hubs
                </div>
              ) : (
                disruptions.map((d) => (
                  <div key={d.id} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-mono font-semibold">
                        <Badge
                          variant={
                            d.severity === 'HIGH'
                              ? 'destructive'
                              : d.severity === 'MEDIUM'
                                ? 'warning'
                                : 'secondary'
                          }
                        >
                          {d.type}
                        </Badge>
                        <span className="text-foreground">
                          {d.icao} ({d.iata})
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{d.source}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{d.reason}</p>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {d.avgDelayMinutes !== null && <span>Avg Delay {d.avgDelayMinutes} min</span>}
                      {d.trend && <span>{d.trend}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-2">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>Alternate: {altSpec.icao} ({altSpec.name})</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
