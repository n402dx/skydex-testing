import express from 'express';
import {XMLParser} from 'fast-xml-parser';
import {AIRPORT_CATALOG} from '../src/data/aviationCatalog';
import type {
  AcarsMessage,
  AircraftPhoto,
  AirfieldPolygonFeature,
  AirfieldStandFeature,
  AirfieldSurfaceData,
  AirfieldSurfaceGate,
  AirportBoardFlight,
  AirportBoardResponse,
  AirportDelaySummary,
  AirportDisruption,
  AirportMarker,
  AirportWeather,
  FlightDetail,
  FlightsResponse,
  HazardCategory,
  LiveFlight,
  PastFlightRecord,
  ProviderStatus,
  RainViewerMeta,
  RunwayCondition,
  SafetyRecordItem,
  SafetyRecordResponse,
  SigmetHazard,
  TaxiwaySegment,
  TrailPoint,
} from '../src/types/aviation';
import {
  buildOverpassAirfieldQuery,
  GLOBAL_OVERPASS_MIRRORS,
  mergeAndAlignRunways,
  parseOverpassAirfieldElements,
  type OverpassElement,
} from '../src/utils/airfieldGeometry';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const API_USER_AGENT = 'SkyDeckFlightTracker/1.0 (https://skydeck.local)';
const FR24_MOBILE_UA = 'FlightradarFree/2024090501 CFNetwork/1496.0.7 Darwin/23.5.0';

// Short-TTL in-memory caches to protect upstream public endpoints
const flightsCache = new Map<string, {ts: number; data: FlightsResponse}>();
const weatherCache = new Map<string, {ts: number; data: AirportWeather[]}>();
let hazardsCache: {ts: number; sigmets: SigmetHazard[]; rainviewer: RainViewerMeta | null} | null = null;
let acarsCache: {ts: number; messages: AcarsMessage[]; sourceStatus: string} | null = null;
let disruptionsCache: {ts: number; items: AirportDisruption[]; sources: string[]} | null = null;
const taxiwayCache = new Map<string, {ts: number; segments: TaxiwaySegment[]}>();
const photoCache = new Map<string, {ts: number; photo: AircraftPhoto | null}>();
const hexDbCache = new Map<string, {ts: number; meta: Record<string, string> | null}>();
const airportBoardCache = new Map<string, {ts: number; board: AirportBoardResponse}>();
const surfaceCache = new Map<string, {ts: number; data: AirfieldSurfaceData}>();
const openSkySectorCache = new Map<string, {ts: number; flights: LiveFlight[]}>();
const safetyRecordCache = new Map<string, {ts: number; data: SafetyRecordResponse}>();
const pastFlightsCache = new Map<string, {ts: number; items: PastFlightRecord[]}>();
let adsbMilFeedCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let adsbLaddFeedCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let adsbLolAllCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let adsbFiAllCache: {ts: number; aircraft: Array<Record<string, unknown>>; nowSec: number} | null = null;
let globalAirportsCache: {ts: number; airports: AirportMarker[]} | null = null;
interface AipRunwayEntry {
  airportIdent: string;
  leIdent: string;
  heIdent: string;
  leLat: number;
  leLon: number;
  heLat: number;
  heLon: number;
  widthM: number;
  closed: boolean;
}
let globalRunwaysCache: {ts: number; byAirport: Map<string, AipRunwayEntry[]>} | null = null;
const flightTrailHistory = new Map<string, TrailPoint[]>();
const flightIndexMap = new Map<string, LiveFlight>();

function splitCsvRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

async function getGlobalAirports(): Promise<AirportMarker[]> {
  if (globalAirportsCache && Date.now() - globalAirportsCache.ts < 86400000) {
    return globalAirportsCache.airports;
  }

  const seeded = new Map<string, AirportMarker>();
  for (const a of AIRPORT_CATALOG) {
    seeded.set(a.icao, {
      icao: a.icao,
      iata: a.iata,
      name: a.name,
      city: a.city,
      country: a.country,
      lat: a.lat,
      lon: a.lon,
      tier: 1,
    });
  }

  try {
    const res = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv', {
      headers: {'User-Agent': API_USER_AGENT},
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      if (lines.length > 1) {
        const header = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
        const idxIdent = header.indexOf('ident');
        const idxType = header.indexOf('type');
        const idxName = header.indexOf('name');
        const idxLat = header.indexOf('latitude_deg');
        const idxLon = header.indexOf('longitude_deg');
        const idxCountry = header.indexOf('iso_country');
        const idxCity = header.indexOf('municipality');
        const idxSched = header.indexOf('scheduled_service');
        const idxIcao = header.indexOf('icao_code');
        const idxIata = header.indexOf('iata_code');
        const idxGps = header.indexOf('gps_code');

        for (let i = 1; i < lines.length; i++) {
          const raw = lines[i];
          if (!raw) continue;
          const cols = splitCsvRow(raw);
          const type = cols[idxType] ?? '';
          if (type !== 'large_airport' && type !== 'medium_airport' && type !== 'small_airport') {
            continue;
          }
          const lat = Number(cols[idxLat]);
          const lon = Number(cols[idxLon]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

          const iata = (cols[idxIata] ?? '').trim().toUpperCase();
          const icao = (
            cols[idxIcao] ||
            cols[idxGps] ||
            cols[idxIdent] ||
            ''
          )
            .trim()
            .toUpperCase();
          if (!icao && !iata) continue;
          // Exclude obscure strips without any ICAO/IATA/scheduled code
          const sched = (cols[idxSched] ?? '').trim().toLowerCase() === 'yes';
          if (type === 'small_airport' && !iata && !sched && !/^[A-Z]{4}$/.test(icao)) {
            continue;
          }

          const tier: 1 | 2 | 3 =
            type === 'large_airport'
              ? 1
              : type === 'medium_airport' || Boolean(iata) || sched
                ? 2
                : 3;

          const key = icao || iata;
          if (!seeded.has(key)) {
            seeded.set(key, {
              icao: key,
              iata,
              name: (cols[idxName] ?? key).trim(),
              city: (cols[idxCity] ?? '').trim(),
              country: (cols[idxCountry] ?? '').trim(),
              lat,
              lon,
              tier,
            });
          }
        }
      }
    }
  } catch {
    // Fall back gracefully to seeded catalog if remote CSV is unreachable
  }

  const list = Array.from(seeded.values());
  globalAirportsCache = {ts: Date.now(), airports: list};
  return list;
}

async function getGlobalRunwaysByAirport(): Promise<Map<string, AipRunwayEntry[]>> {
  if (globalRunwaysCache) {
    const ttl = globalRunwaysCache.byAirport.size > 0 ? 86400000 : 300000;
    if (Date.now() - globalRunwaysCache.ts < ttl) {
      return globalRunwaysCache.byAirport;
    }
  }

  const byAirport = new Map<string, AipRunwayEntry[]>();
  try {
    const res = await fetch('https://davidmegginson.github.io/ourairports-data/runways.csv', {
      headers: {'User-Agent': API_USER_AGENT},
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      if (lines.length > 1) {
        const header = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
        const idxIdent = header.indexOf('airport_ident');
        const idxWidth = header.indexOf('width_ft');
        const idxClosed = header.indexOf('closed');
        const idxLeIdent = header.indexOf('le_ident');
        const idxLeLat = header.indexOf('le_latitude_deg');
        const idxLeLon = header.indexOf('le_longitude_deg');
        const idxHeIdent = header.indexOf('he_ident');
        const idxHeLat = header.indexOf('he_latitude_deg');
        const idxHeLon = header.indexOf('he_longitude_deg');

        for (let i = 1; i < lines.length; i++) {
          const raw = lines[i];
          if (!raw) continue;
          const cols = splitCsvRow(raw);
          const airportIdent = (cols[idxIdent] ?? '').trim().toUpperCase();
          if (!airportIdent) continue;
          const closed = (cols[idxClosed] ?? '0').trim() === '1';
          if (closed) continue;
          const leLat = Number(cols[idxLeLat]);
          const leLon = Number(cols[idxLeLon]);
          const heLat = Number(cols[idxHeLat]);
          const heLon = Number(cols[idxHeLon]);
          if (
            !Number.isFinite(leLat) ||
            !Number.isFinite(leLon) ||
            !Number.isFinite(heLat) ||
            !Number.isFinite(heLon) ||
            (leLat === 0 && leLon === 0) ||
            (heLat === 0 && heLon === 0)
          ) {
            continue;
          }
          const leIdent = (cols[idxLeIdent] ?? '').trim().toUpperCase();
          const heIdent = (cols[idxHeIdent] ?? '').trim().toUpperCase();
          const widthFt = Number(cols[idxWidth]);
          const widthM = Number.isFinite(widthFt) && widthFt > 20 ? Math.round(widthFt * 0.3048) : 45;
          const entry: AipRunwayEntry = {
            airportIdent,
            leIdent,
            heIdent,
            leLat,
            leLon,
            heLat,
            heLon,
            widthM,
            closed,
          };
          const arr = byAirport.get(airportIdent);
          if (arr) arr.push(entry);
          else byAirport.set(airportIdent, [entry]);
        }
      }
    }
  } catch {
    // fallback silently
  }

  globalRunwaysCache = {ts: Date.now(), byAirport};
  return byAirport;
}

async function safeJson<T>(res: Response | null): Promise<T | null> {
  if (!res || !res.ok) return null;
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function fetchPlanespottersPhoto(icao24: string, reg: string): Promise<AircraftPhoto | null> {
  const key = `${icao24.toUpperCase()}-${reg.toUpperCase()}`;
  const cached = photoCache.get(key);
  if (cached && Date.now() - cached.ts < 86400000) return cached.photo;

  const normReg = reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  const tryWikimedia = async (): Promise<AircraftPhoto | null> => {
    if (normReg.length < 4) return null;
    try {
      const wmUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(`"${reg}"`)}&gsrlimit=6&prop=imageinfo&iiprop=url|size&iiurlwidth=1280&format=json&origin=*`;
      const r = await fetch(wmUrl, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(2600),
      });
      const json = await safeJson<{
        query?: {pages?: Record<string, {title?: string; imageinfo?: Array<Record<string, unknown>>}>};
      }>(r);
      const pages = Object.values(json?.query?.pages ?? {});
      for (const page of pages) {
        const title = String(page.title ?? '');
        if (!/\.(jpe?g|png|webp)$/i.test(title)) continue;
        const normTitle = title.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!normTitle.includes(normReg)) continue;
        const info = page.imageinfo?.[0];
        const imgUrl = String(info?.thumburl ?? info?.url ?? '');
        if (imgUrl) {
          return {
            url: imgUrl,
            thumbUrl: imgUrl,
            photographer: 'Wikimedia Commons contributor',
            link: String(info?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`),
            source: 'wikimedia',
            width: Number(info?.thumbwidth ?? info?.width ?? 1280),
            height: Number(info?.thumbheight ?? info?.height ?? 850),
          };
        }
      }
    } catch {
      // fallback below
    }
    return null;
  };

  const tryPlanespotters = async (url: string): Promise<AircraftPhoto | null> => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(2600),
      });
      const json = await safeJson<{
        photos?: Array<{
          thumbnail?: {src?: string; size?: {width?: number; height?: number}};
          thumbnail_large?: {src?: string; size?: {width?: number; height?: number}};
          photographer?: string;
          link?: string;
        }>;
      }>(r);
      const p = json?.photos?.[0];
      const large = p?.thumbnail_large;
      const imgUrl = large?.src || p?.thumbnail?.src;
      if (p && imgUrl && p.link) {
        return {
          url: imgUrl,
          thumbUrl: p.thumbnail?.src,
          photographer: p.photographer || 'Planespotters.net contributor',
          link: p.link,
          source: 'planespotters.net',
          width: large?.size?.width,
          height: large?.size?.height,
        };
      }
    } catch {
      // ignore timeout
    }
    return null;
  };

  const [wmPhoto, psHexPhoto] = await Promise.all([
    tryWikimedia(),
    icao24 ? tryPlanespotters(`https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(icao24.toUpperCase())}`) : Promise.resolve(null),
  ]);

  let photo: AircraftPhoto | null = wmPhoto ?? psHexPhoto;
  if (!photo && reg) {
    photo = await tryPlanespotters(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg.toUpperCase())}`);
  }
  if (!photo && icao24) {
    try {
      const r = await fetch(`https://airport-data.com/api/ac_thumb.json?m=${encodeURIComponent(icao24.toUpperCase())}&n=1`, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(2200),
      });
      const json = await safeJson<{data?: Array<{image?: string; photographer?: string; link?: string}>}>(r);
      const item = json?.data?.[0];
      if (item?.image && item.link) {
        photo = {
          url: item.image,
          photographer: item.photographer || 'Airport-Data contributor',
          link: item.link,
          source: 'airport-data',
        };
      }
    } catch {
      // ignore
    }
  }

  photoCache.set(key, {ts: Date.now(), photo});
  return photo;
}

async function fetchHexDbAircraft(icao24: string): Promise<Record<string, string> | null> {
  const key = icao24.toUpperCase();
  if (!key) return null;
  const cached = hexDbCache.get(key);
  if (cached && Date.now() - cached.ts < 86400000) return cached.meta;

  try {
    const r = await fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(key)}`, {
      headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
      signal: AbortSignal.timeout(2500),
    });
    const meta = await safeJson<Record<string, string>>(r);
    hexDbCache.set(key, {ts: Date.now(), meta});
    return meta;
  } catch {
    return null;
  }
}

function mapFr24ScheduleRow(
  rawFlight: Record<string, unknown>,
  mode: 'arrivals' | 'departures',
  airportIata: string,
  airportIcao: string,
  airportName: string,
): AirportBoardFlight {
  const ident = (rawFlight.identification ?? {}) as Record<string, unknown>;
  const numObj = (ident.number ?? {}) as Record<string, unknown>;
  const statusObj = (rawFlight.status ?? {}) as Record<string, unknown>;
  const acObj = (rawFlight.aircraft ?? {}) as Record<string, unknown>;
  const modelObj = (acObj.model ?? {}) as Record<string, unknown>;
  const airlineObj = (rawFlight.airline ?? {}) as Record<string, unknown>;
  const airlineCode = (airlineObj.code ?? {}) as Record<string, unknown>;
  const apObj = (rawFlight.airport ?? {}) as Record<string, unknown>;
  const origObj = (apObj.origin ?? {}) as Record<string, unknown>;
  const origCode = (origObj.code ?? {}) as Record<string, unknown>;
  const origInfo = (origObj.info ?? {}) as Record<string, unknown>;
  const destObj = (apObj.destination ?? {}) as Record<string, unknown>;
  const destCode = (destObj.code ?? {}) as Record<string, unknown>;
  const destInfo = (destObj.info ?? {}) as Record<string, unknown>;
  const timeObj = (rawFlight.time ?? {}) as Record<string, unknown>;
  const sched = (timeObj.scheduled ?? {}) as Record<string, unknown>;
  const est = (timeObj.estimated ?? {}) as Record<string, unknown>;
  const real = (timeObj.real ?? {}) as Record<string, unknown>;

  const flightNumber = String(numObj.default ?? ident.callsign ?? '');
  const callsign = String(ident.callsign ?? flightNumber).trim().toUpperCase();
  const statusText = String(statusObj.text ?? 'Scheduled');
  const icon = String(statusObj.icon ?? 'gray').toLowerCase();

  const schedTs =
    mode === 'departures'
      ? Number(sched.departure ?? 0) || undefined
      : Number(sched.arrival ?? 0) || undefined;
  const estTs =
    mode === 'departures'
      ? Number(est.departure ?? 0) || undefined
      : Number(est.arrival ?? 0) || undefined;
  const realTs =
    mode === 'departures'
      ? Number(real.departure ?? 0) || undefined
      : Number(real.arrival ?? 0) || undefined;

  const delaySec =
    schedTs && (realTs || estTs) ? (realTs || estTs || 0) - schedTs : 0;
  const isCancelled = /cancel/i.test(statusText) || icon === 'red';
  const isDelayed =
    !isCancelled &&
    (icon === 'amber' || /delay/i.test(statusText) || delaySec >= 900);

  const statusColor: AirportBoardFlight['statusColor'] =
    isCancelled
      ? 'red'
      : icon === 'amber' || isDelayed
        ? 'amber'
        : icon === 'green' || Boolean(statusObj.live)
          ? 'green'
          : 'gray';

  const info = mode === 'departures' ? origInfo : destInfo;

  return {
    id: String(ident.id ?? ident.row ?? `${mode}-${flightNumber}-${schedTs ?? Math.random()}`),
    callsign,
    flightNumber,
    airlineName: String(airlineObj.name ?? airlineCode.icao ?? ''),
    airlineIcao: String(airlineCode.icao ?? ''),
    originIata: mode === 'departures' ? airportIata : String(origCode.iata ?? ''),
    originIcao: mode === 'departures' ? airportIcao : String(origCode.icao ?? ''),
    originName: mode === 'departures' ? airportName : String(origObj.name ?? ''),
    destinationIata: mode === 'arrivals' ? airportIata : String(destCode.iata ?? ''),
    destinationIcao: mode === 'arrivals' ? airportIcao : String(destCode.icao ?? ''),
    destinationName: mode === 'arrivals' ? airportName : String(destObj.name ?? ''),
    aircraftCode: String(modelObj.code ?? ''),
    aircraftModel: String(modelObj.text ?? modelObj.code ?? ''),
    registration: String(acObj.registration ?? ''),
    icao24: String(acObj.hex ?? '').toUpperCase(),
    terminal: info.terminal ? String(info.terminal) : undefined,
    gate: info.gate ? String(info.gate) : undefined,
    baggage: destInfo.baggage ? String(destInfo.baggage) : undefined,
    scheduledTime: schedTs,
    estimatedTime: estTs,
    actualTime: realTs,
    statusText,
    statusColor,
    isDelayed,
    isCancelled,
    isLive: Boolean(statusObj.live),
  };
}

async function fetchFr24AirportBoard(code: string, icaoHint?: string): Promise<AirportBoardResponse | null> {
  const cleanCode = (code || icaoHint || '').trim().toUpperCase();
  if (!cleanCode) return null;

  const catalog = AIRPORT_CATALOG.find(
    (a) => a.iata === cleanCode || a.icao === cleanCode || (icaoHint && a.icao === icaoHint.toUpperCase()),
  );
  const queryCode = (catalog?.iata || cleanCode).toLowerCase();
  const cacheKey = (catalog?.icao || cleanCode).toUpperCase();

  const cached = airportBoardCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60000) return cached.board;

  const ts = Math.floor(Date.now() / 1000);
  const makeBoardUrl = (mode: 'departures' | 'arrivals', page: number) =>
    `https://api.flightradar24.com/common/v1/airport.json?code=${encodeURIComponent(queryCode)}&plugin[]=&plugin-setting[schedule][timestamp]=${ts}&plugin-setting[schedule][mode]=${mode}&page=${page}&limit=100`;

  try {
    const [depRes1, depRes2, arrRes1, arrRes2] = await Promise.all([
      fetch(makeBoardUrl('departures', 1), {
        headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
        signal: AbortSignal.timeout(5200),
      }).catch(() => null),
      fetch(makeBoardUrl('departures', 2), {
        headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
        signal: AbortSignal.timeout(5200),
      }).catch(() => null),
      fetch(makeBoardUrl('arrivals', 1), {
        headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
        signal: AbortSignal.timeout(5200),
      }).catch(() => null),
      fetch(makeBoardUrl('arrivals', 2), {
        headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
        signal: AbortSignal.timeout(5200),
      }).catch(() => null),
    ]);

    type Fr24ApResp = {result?: {response?: {airport?: {pluginData?: Record<string, unknown>}}}};
    const [depJson1, depJson2, arrJson1, arrJson2] = await Promise.all([
      safeJson<Fr24ApResp>(depRes1),
      safeJson<Fr24ApResp>(depRes2),
      safeJson<Fr24ApResp>(arrRes1),
      safeJson<Fr24ApResp>(arrRes2),
    ]);

    const pdDep1 = depJson1?.result?.response?.airport?.pluginData ?? {};
    const pdDep2 = depJson2?.result?.response?.airport?.pluginData ?? {};
    const pdArr1 = arrJson1?.result?.response?.airport?.pluginData ?? {};
    const pdArr2 = arrJson2?.result?.response?.airport?.pluginData ?? {};
    const details = ((pdDep1.details ?? pdArr1.details) ?? {}) as Record<string, unknown>;
    const stats = (details.stats ?? {}) as Record<string, unknown>;
    const codeObj = (details.code ?? {}) as Record<string, unknown>;
    const posObj = (details.position ?? {}) as Record<string, unknown>;
    const regionObj = (posObj.region ?? {}) as Record<string, unknown>;
    const countryObj = (posObj.country ?? {}) as Record<string, unknown>;
    const tzObj = (details.timezone ?? {}) as Record<string, unknown>;

    const iata = String(codeObj.iata ?? catalog?.iata ?? cleanCode).toUpperCase();
    const icao = String(codeObj.icao ?? catalog?.icao ?? icaoHint ?? cleanCode).toUpperCase();
    const name = String(details.name ?? catalog?.name ?? `${iata} Airport`);
    const timezoneName = tzObj.name ? String(tzObj.name) : undefined;
    const utcOffsetSec = Number.isFinite(Number(tzObj.offset)) ? Number(tzObj.offset) : undefined;
    const timezoneAbbr = tzObj.abbr ? String(tzObj.abbr) : undefined;

    const arrStats = (stats.arrivals ?? {}) as Record<string, unknown>;
    const arrRecent = (arrStats.recent ?? arrStats) as Record<string, unknown>;
    const arrPct = (arrRecent.percentage ?? {}) as Record<string, unknown>;
    const arrQty = (arrRecent.quantity ?? {}) as Record<string, unknown>;

    const depStats = (stats.departures ?? {}) as Record<string, unknown>;
    const depRecent = (depStats.recent ?? depStats) as Record<string, unknown>;
    const depPct = (depRecent.percentage ?? {}) as Record<string, unknown>;
    const depQty = (depRecent.quantity ?? {}) as Record<string, unknown>;

    const rawDelayIndex: AirportDelaySummary = {
      arrivalsIndex: Number.isFinite(Number(arrRecent.delayIndex)) ? Number(arrRecent.delayIndex) : null,
      arrivalsDelayAvgMin: Number.isFinite(Number(arrRecent.delayAvg)) ? Number(arrRecent.delayAvg) : null,
      arrivalsDelayedPct: Number.isFinite(Number(arrPct.delayed)) ? Math.round(Number(arrPct.delayed) * 100) : null,
      arrivalsOnTimeCount: Number.isFinite(Number(arrQty.onTime)) ? Number(arrQty.onTime) : undefined,
      arrivalsDelayedCount: Number.isFinite(Number(arrQty.delayed)) ? Number(arrQty.delayed) : undefined,
      arrivalsCanceledCount: Number.isFinite(Number(arrQty.canceled)) ? Number(arrQty.canceled) : undefined,
      arrivalsTrend: arrPct.trend ? String(arrPct.trend) : undefined,
      departuresIndex: Number.isFinite(Number(depRecent.delayIndex)) ? Number(depRecent.delayIndex) : null,
      departuresDelayAvgMin: Number.isFinite(Number(depRecent.delayAvg)) ? Number(depRecent.delayAvg) : null,
      departuresDelayedPct: Number.isFinite(Number(depPct.delayed)) ? Math.round(Number(depPct.delayed) * 100) : null,
      departuresOnTimeCount: Number.isFinite(Number(depQty.onTime)) ? Number(depQty.onTime) : undefined,
      departuresDelayedCount: Number.isFinite(Number(depQty.delayed)) ? Number(depQty.delayed) : undefined,
      departuresCanceledCount: Number.isFinite(Number(depQty.canceled)) ? Number(depQty.canceled) : undefined,
      departuresTrend: depPct.trend ? String(depPct.trend) : undefined,
    };

    const getRows = (pd: Record<string, unknown>, mode: 'departures' | 'arrivals') => {
      const sched = ((pd.schedule as Record<string, unknown> | undefined)?.[mode] as Record<string, unknown> | undefined);
      return Array.isArray(sched?.data) ? (sched.data as Array<{flight?: Record<string, unknown>}>) : [];
    };

    const dedupeBoardRows = (rows: AirportBoardFlight[]): AirportBoardFlight[] => {
      const seen = new Map<string, AirportBoardFlight>();
      for (const row of rows) {
        if (!seen.has(row.id)) seen.set(row.id, row);
      }
      return Array.from(seen.values());
    };

    const depRows = [...getRows(pdDep1, 'departures'), ...getRows(pdDep2, 'departures')];
    const arrRows = [...getRows(pdArr1, 'arrivals'), ...getRows(pdArr2, 'arrivals')];

    const departures = dedupeBoardRows(
      depRows.filter((r) => r.flight).map((r) => mapFr24ScheduleRow(r.flight!, 'departures', iata, icao, name)),
    );
    const arrivals = dedupeBoardRows(
      arrRows.filter((r) => r.flight).map((r) => mapFr24ScheduleRow(r.flight!, 'arrivals', iata, icao, name)),
    );

    const delayIndex = computeDelaySummaryFromRows(departures, arrivals, rawDelayIndex);

    if (departures.length > 0 || arrivals.length > 0 || delayIndex.departuresIndex !== null || delayIndex.arrivalsIndex !== null) {
      const board: AirportBoardResponse = {
        icao,
        iata,
        name,
        city: String(regionObj.city ?? catalog?.city ?? ''),
        country: String(countryObj.name ?? catalog?.country ?? ''),
        lat: Number(posObj.latitude ?? catalog?.lat ?? 0),
        lon: Number(posObj.longitude ?? catalog?.lon ?? 0),
        timezoneName,
        utcOffsetSec,
        timezoneAbbr,
        delayIndex,
        arrivals,
        departures,
        fetchedAt: Date.now(),
        source: 'flightradar24-airport',
      };
      airportBoardCache.set(cacheKey, {ts: Date.now(), board});
      return board;
    }
  } catch {
    // fallback below
  }
  return null;
}

function deriveSideDelayStats(rows: AirportBoardFlight[]) {
  if (rows.length === 0) {
    return {
      index: null as number | null,
      avgMin: null as number | null,
      delayedPct: null as number | null,
      onTimeCount: undefined as number | undefined,
      delayedCount: undefined as number | undefined,
      canceledCount: undefined as number | undefined,
    };
  }
  let delayed = 0;
  let canceled = 0;
  let onTime = 0;
  let totalDelayMin = 0;
  for (const r of rows) {
    if (r.isCancelled) {
      canceled++;
      continue;
    }
    const refTs = r.actualTime || r.estimatedTime;
    const diffMin = r.scheduledTime && refTs ? Math.round((refTs - r.scheduledTime) / 60) : r.isDelayed ? 22 : 0;
    if (r.isDelayed || diffMin >= 15) {
      delayed++;
      totalDelayMin += Math.max(15, diffMin);
    } else {
      onTime++;
    }
  }
  const activeCount = Math.max(1, rows.length - canceled);
  const delayedPct = Math.round(((delayed + canceled) / rows.length) * 100);
  const avgMin = delayed > 0 ? Math.round(totalDelayMin / delayed) : 0;
  const rawIdx = Math.min(5, (delayedPct / 100) * 3.8 + Math.min(avgMin, 60) / 50 + (canceled / activeCount) * 1.4);
  const index = Number(rawIdx.toFixed(1));
  return {index, avgMin, delayedPct, onTimeCount: onTime, delayedCount: delayed, canceledCount: canceled};
}

function computeDelaySummaryFromRows(
  departures: AirportBoardFlight[],
  arrivals: AirportBoardFlight[],
  raw?: AirportDelaySummary | null,
): AirportDelaySummary {
  const d = deriveSideDelayStats(departures);
  const a = deriveSideDelayStats(arrivals);
  return {
    arrivalsIndex: raw?.arrivalsIndex ?? a.index,
    arrivalsDelayAvgMin: raw?.arrivalsDelayAvgMin ?? a.avgMin,
    arrivalsDelayedPct: raw?.arrivalsDelayedPct ?? a.delayedPct,
    arrivalsOnTimeCount: raw?.arrivalsOnTimeCount ?? a.onTimeCount,
    arrivalsDelayedCount: raw?.arrivalsDelayedCount ?? a.delayedCount,
    arrivalsCanceledCount: raw?.arrivalsCanceledCount ?? a.canceledCount,
    arrivalsTrend: raw?.arrivalsTrend,
    departuresIndex: raw?.departuresIndex ?? d.index,
    departuresDelayAvgMin: raw?.departuresDelayAvgMin ?? d.avgMin,
    departuresDelayedPct: raw?.departuresDelayedPct ?? d.delayedPct,
    departuresOnTimeCount: raw?.departuresOnTimeCount ?? d.onTimeCount,
    departuresDelayedCount: raw?.departuresDelayedCount ?? d.delayedCount,
    departuresCanceledCount: raw?.departuresCanceledCount ?? d.canceledCount,
    departuresTrend: raw?.departuresTrend,
  };
}

function recordFlightBreadcrumb(f: LiveFlight) {
  const key = f.icao24 || f.id;
  const prevIndex = flightIndexMap.get(key);
  if (prevIndex && !f.squawk && prevIndex.squawk) {
    f.squawk = prevIndex.squawk;
  }
  flightIndexMap.set(key, f);
  const existing = flightTrailHistory.get(key) ?? [];
  const last = existing[existing.length - 1];
  if (last) {
    const dLat = Math.abs(last.lat - f.lat);
    const dLon = Math.abs(last.lon - f.lon);
    const dt = Math.max(1, Math.abs(f.lastContactEpoch - last.ts));
    // Reject outlier squawk/position teleports (> ~22 NM jump in < 45s)
    if (dLat > 0.35 || dLon > 0.35 || (dt < 45 && Math.hypot(dLat, dLon) > 0.28)) {
      return;
    }
    if (dLat < 0.0005 && dLon < 0.0005) return;
  }
  existing.push({
    lat: f.lat,
    lon: f.lon,
    altFt: f.altitudeFt,
    speedKts: f.groundSpeedKts,
    trackDeg: f.trueTrackDeg,
    ts: f.lastContactEpoch,
  });
  if (existing.length > 120) existing.shift();
  flightTrailHistory.set(key, existing);
}

function airlineIcaoFromCallsign(callsign: string): string {
  const clean = (callsign || '').trim().toUpperCase();
  const match = clean.match(/^([A-Z]{3})\d/);
  return match ? match[1] : clean.slice(0, 3);
}

function parseFr24Feed(raw: Record<string, unknown>): LiveFlight[] {
  const flights: LiveFlight[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'full_count' || key === 'version' || key === 'stats' || !Array.isArray(value)) {
      continue;
    }
    const arr = value as unknown[];
    if (arr.length < 15) continue;

    const icao24 = String(arr[0] ?? key).toUpperCase();
    const lat = Number(arr[1]);
    const lon = Number(arr[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const track = Number(arr[3]) || 0;
    const altFt = Number(arr[4]) || 0;
    const speedKts = Number(arr[5]) || 0;
    const squawk = String(arr[6] ?? '');

    const slot7 = String(arr[7] ?? '');
    const hasRadarPrefix = /^(F-|T-|N\/A|EST|SAT|MLAT|ADSB|GLID|FLARM)/i.test(slot7) || slot7 === '';

    const aircraftType = String((hasRadarPrefix ? arr[8] : arr[7]) ?? 'A320').toUpperCase();
    const registration = String((hasRadarPrefix ? arr[9] : arr[8]) ?? '');
    const ts = Number(hasRadarPrefix ? arr[10] : arr[9]) || nowSec;
    const origin = String((hasRadarPrefix ? arr[11] : arr[10]) ?? '');
    const destination = String((hasRadarPrefix ? arr[12] : arr[11]) ?? '');
    const flightNumber = String((hasRadarPrefix ? arr[13] : arr[12]) ?? '');
    const onGroundVal = Number(hasRadarPrefix ? arr[14] : arr[13]);
    const vrate = Number(hasRadarPrefix ? arr[15] : arr[14]) || 0;
    const callsign = String((hasRadarPrefix ? arr[16] : arr[15]) ?? flightNumber ?? icao24).trim().toUpperCase();
    const airlineIcao = String(arr[18] ?? airlineIcaoFromCallsign(callsign)).toUpperCase();

    flights.push({
      id: icao24 || key,
      fr24Id: key,
      icao24,
      callsign: callsign || flightNumber || icao24,
      flightNumber: flightNumber || callsign,
      registration,
      airlineIcao,
      airlineName: airlineIcao,
      aircraftType: aircraftType || 'A320',
      lat,
      lon,
      altitudeFt: Math.max(0, Math.round(altFt)),
      groundSpeedKts: Math.max(0, Math.round(speedKts)),
      trueTrackDeg: ((track % 360) + 360) % 360,
      verticalRateFpm: Math.round(vrate),
      onGround: onGroundVal === 1 || (altFt <= 150 && speedKts < 45),
      squawk,
      origin,
      destination,
      lastContactEpoch: ts,
      source: 'fr24-web',
      isEstimated: false,
      uncertaintyNm: 0,
    });
  }

  return flights;
}

async function fetchFr24WebSingle(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<LiveFlight[]> {
  const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax.toFixed(3)},${lamin.toFixed(3)},${lomin.toFixed(3)},${lomax.toFixed(3)}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=1&stats=1`;
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      Origin: 'https://www.flightradar24.com',
      Referer: 'https://www.flightradar24.com/',
    },
    signal: AbortSignal.timeout(5500),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  return parseFr24Feed(json);
}

async function fetchFr24Web(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  try {
    const latSpan = lamax - lamin;
    const lonSpan = lomax - lomin;
    // Tile wide/zoomed-out viewports into a 2x2 grid so FR24's per-request ~1500 aircraft zone limit doesn't drop planes
    const boxes: Array<[number, number, number, number]> =
      latSpan > 16 || lonSpan > 24
        ? (() => {
            const midLat = (lamin + lamax) / 2;
            const midLon = (lomin + lomax) / 2;
            return [
              [lamin, lomin, midLat, midLon],
              [lamin, midLon, midLat, lomax],
              [midLat, lomin, lamax, midLon],
              [midLat, midLon, lamax, lomax],
            ];
          })()
        : [[lamin, lomin, lamax, lomax]];

    const settled = await Promise.allSettled(
      boxes.map((b) => fetchFr24WebSingle(b[0], b[1], b[2], b[3])),
    );
    const merged = new Map<string, LiveFlight>();
    let firstErr: string | null = null;
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        for (const f of s.value) {
          const key = f.icao24 || f.id;
          if (!merged.has(key)) merged.set(key, f);
        }
      } else if (!firstErr) {
        firstErr = s.reason instanceof Error ? s.reason.message : 'Timeout';
      }
    }
    const flights = Array.from(merged.values());
    if (flights.length === 0 && firstErr) {
      return {
        flights: [],
        status: {provider: 'fr24-web', ok: false, count: 0, latencyMs: Date.now() - start, note: firstErr},
      };
    }
    return {
      flights,
      status: {provider: 'fr24-web', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'fr24-web',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function fetchAirNavWeb(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  const urls = [
    `https://www.airnavradar.com/stations/radar/flights.json?bounds=${lamin.toFixed(2)},${lomin.toFixed(2)},${lamax.toFixed(2)},${lomax.toFixed(2)}`,
    `https://www.airnavradar.com/data/flights?bounds=${lamin.toFixed(2)},${lomin.toFixed(2)},${lamax.toFixed(2)},${lomax.toFixed(2)}`,
  ];
  try {
    let lastStatus = 403;
    let payloadText = '';
    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          Origin: 'https://www.airnavradar.com',
          Referer: 'https://www.airnavradar.com/',
        },
        signal: AbortSignal.timeout(1200),
      }).catch(() => null);
      if (!res) continue;
      lastStatus = res.status;
      const body = await res.text();
      if (res.ok && body && !body.trim().startsWith('<')) {
        payloadText = body;
        break;
      }
    }
    const text = payloadText;
    if (!text) {
      return {
        flights: [],
        status: {
          provider: 'airnav-web',
          ok: false,
          count: 0,
          latencyMs: Date.now() - start,
          note: lastStatus === 403 ? 'Cloudflare protected' : `HTTP ${lastStatus}`,
        },
      };
    }
    const json = JSON.parse(text) as {flights?: Array<Record<string, unknown>>} | Array<Record<string, unknown>>;
    const rows = Array.isArray(json) ? json : Array.isArray(json.flights) ? json.flights : [];
    const nowSec = Math.floor(Date.now() / 1000);
    const flights: LiveFlight[] = rows
      .filter((r) => Number.isFinite(Number(r.lat ?? r.la)) && Number.isFinite(Number(r.lon ?? r.lo ?? r.lng)))
      .map((r) => {
        const callsign = String(r.cs ?? r.callsign ?? r.fn ?? r.hex ?? '').trim().toUpperCase();
        const icao24 = String(r.hex ?? r.icao24 ?? callsign).toUpperCase();
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: String(r.fn ?? callsign),
          registration: String(r.reg ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign),
          airlineName: airlineIcaoFromCallsign(callsign),
          aircraftType: String(r.type ?? r.ac ?? 'A320').toUpperCase(),
          lat: Number(r.lat ?? r.la),
          lon: Number(r.lon ?? r.lo ?? r.lng),
          altitudeFt: Math.round(Number(r.alt ?? 0)),
          groundSpeedKts: Math.round(Number(r.spd ?? r.gs ?? 0)),
          trueTrackDeg: Math.round(Number(r.hdg ?? r.trk ?? 0)),
          verticalRateFpm: Math.round(Number(r.vr ?? 0)),
          onGround: Boolean(r.gnd ?? r.onGround),
          squawk: String(r.sq ?? ''),
          origin: String(r.dep ?? r.orig ?? ''),
          destination: String(r.arr ?? r.dest ?? ''),
          lastContactEpoch: nowSec,
          source: 'airnav-web',
          isEstimated: false,
          uncertaintyNm: 0,
        };
      });
    return {
      flights,
      status: {provider: 'airnav-web', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'airnav-web',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Blocked/Timeout',
      },
    };
  }
}

async function fetchVariFlightWeb(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  const overlapsChina = lamax >= 15 && lamin <= 54 && lomax >= 73 && lomin <= 136;
  if (!overlapsChina) {
    return {
      flights: [],
      status: {provider: 'variflight-web', ok: false, count: 0, latencyMs: 0, note: 'Outside CN airspace'},
    };
  }
  try {
    const res = await fetch(
      `https://flightadsb.variflight.com/flight/map?minLat=${lamin.toFixed(2)}&minLon=${lomin.toFixed(2)}&maxLat=${lamax.toFixed(2)}&maxLon=${lomax.toFixed(2)}`,
      {
        headers: {
          ...BROWSER_HEADERS,
          Origin: 'https://www.variflight.com',
          Referer: 'https://www.variflight.com/',
        },
        signal: AbortSignal.timeout(1200),
      },
    );
    const text = await res.text();
    if (!res.ok || text.trim().startsWith('<')) {
      return {
        flights: [],
        status: {
          provider: 'variflight-web',
          ok: false,
          count: 0,
          latencyMs: Date.now() - start,
          note: `Session/WAF (${res.status})`,
        },
      };
    }
    const parsed = JSON.parse(text) as {data?: Array<Record<string, unknown>>};
    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    const nowSec = Math.floor(Date.now() / 1000);
    const flights: LiveFlight[] = rows
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon ?? r.lng)))
      .map((r) => {
        const callsign = String(r.fnum ?? r.callsign ?? r.icao ?? '').trim().toUpperCase();
        const icao24 = String(r.icao ?? r.hex ?? callsign).toUpperCase();
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: String(r.fnum ?? callsign),
          registration: String(r.anum ?? r.reg ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign),
          airlineName: airlineIcaoFromCallsign(callsign),
          aircraftType: String(r.atype ?? 'A320').toUpperCase(),
          lat: Number(r.lat),
          lon: Number(r.lon ?? r.lng),
          altitudeFt: Math.round(Number(r.alt ?? 0)),
          groundSpeedKts: Math.round(Number(r.speed ?? 0)),
          trueTrackDeg: Math.round(Number(r.angle ?? r.track ?? 0)),
          verticalRateFpm: 0,
          onGround: Number(r.alt ?? 0) < 100 && Number(r.speed ?? 0) < 40,
          squawk: String(r.squawk ?? ''),
          origin: String(r.org ?? ''),
          destination: String(r.dst ?? ''),
          lastContactEpoch: nowSec,
          source: 'variflight-web',
          isEstimated: false,
          uncertaintyNm: 0,
        };
      });
    return {
      flights,
      status: {provider: 'variflight-web', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'variflight-web',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'WAF/Timeout',
      },
    };
  }
}

async function fetchAdsbLol(
  centerLat: number,
  centerLon: number,
  radiusNm: number,
  isGlobal = false,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  const r = Math.min(250, Math.max(25, Math.round(radiusNm)));
  try {
    let acRows: Array<Record<string, unknown>> = [];
    let nowSec = Math.floor(Date.now() / 1000);

    if (isGlobal && adsbLolAllCache && Date.now() - adsbLolAllCache.ts < 12000) {
      acRows = adsbLolAllCache.ac;
      nowSec = adsbLolAllCache.nowSec;
    } else {
      const targetUrl = isGlobal
        ? 'https://api.adsb.lol/v2/all'
        : `https://api.adsb.lol/v2/point/${centerLat.toFixed(3)}/${centerLon.toFixed(3)}/${r}`;
      const res = await fetch(targetUrl, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(isGlobal ? 5200 : 2800),
      });
      if (!res.ok) {
        return {
          flights: [],
          status: {provider: 'adsb.lol', ok: false, count: 0, latencyMs: Date.now() - start, note: `HTTP ${res.status}`},
        };
      }
      const json = (await res.json()) as {ac?: Array<Record<string, unknown>>; now?: number};
      acRows = json.ac ?? [];
      nowSec = Math.floor((json.now ?? Date.now()) / 1000);
      if (isGlobal && acRows.length > 0) {
        adsbLolAllCache = {ts: Date.now(), ac: acRows, nowSec};
      }
    }

    const flights: LiveFlight[] = acRows
      .filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)))
      .map((a) => {
        const icao24 = String(a.hex ?? '').toUpperCase();
        const callsign = String(a.flight ?? icao24).trim().toUpperCase();
        const onGround = a.alt_baro === 'ground' || Number(a.alt_baro ?? 0) <= 0;
        const altFt = onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0;
        const dbFlags = Number(a.dbFlags ?? 0) || 0;
        const isMilitary = (dbFlags & 1) !== 0;
        const isPia = (dbFlags & 4) !== 0;
        const isLadd = (dbFlags & 8) !== 0;
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: callsign,
          registration: String(a.r ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign),
          airlineName: String(a.ownOp ?? '') || airlineIcaoFromCallsign(callsign),
          aircraftType: String(a.t ?? 'A320').toUpperCase(),
          lat: Number(a.lat),
          lon: Number(a.lon),
          altitudeFt: Math.max(0, Math.round(altFt)),
          groundSpeedKts: Math.round(Number(a.gs ?? 0)),
          trueTrackDeg: Math.round(Number(a.track ?? 0)),
          verticalRateFpm: Math.round(Number(a.baro_rate ?? a.geom_rate ?? 0)),
          onGround,
          squawk: String(a.squawk ?? ''),
          origin: '',
          destination: '',
          lastContactEpoch: nowSec - Math.round(Number(a.seen_pos ?? 0)),
          source: 'adsb.lol',
          isEstimated: false,
          uncertaintyNm: 0,
          dbFlags,
          isMilitary,
          isPia,
          isLadd,
          ownerOperator: a.ownOp ? String(a.ownOp) : undefined,
        };
      });
    return {
      flights,
      status: {provider: 'adsb.lol', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'adsb.lol',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function fetchAdsbMil(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  try {
    let acRows: Array<Record<string, unknown>> = [];
    let nowSec = Math.floor(Date.now() / 1000);

    if (adsbMilFeedCache && Date.now() - adsbMilFeedCache.ts < 12000) {
      acRows = adsbMilFeedCache.ac;
      nowSec = adsbMilFeedCache.nowSec;
    } else {
      const res = await fetch('https://api.adsb.lol/v2/mil', {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(2800),
      });
      if (!res.ok) {
        if (adsbMilFeedCache && Date.now() - adsbMilFeedCache.ts < 45000) {
          acRows = adsbMilFeedCache.ac;
          nowSec = adsbMilFeedCache.nowSec;
        } else {
          return {
            flights: [],
            status: {provider: 'adsb.lol-mil', ok: false, count: 0, latencyMs: Date.now() - start, note: `HTTP ${res.status}`},
          };
        }
      } else {
        const json = (await res.json()) as {ac?: Array<Record<string, unknown>>; now?: number};
        acRows = json.ac ?? [];
        nowSec = Math.floor((json.now ?? Date.now()) / 1000);
        adsbMilFeedCache = {ts: Date.now(), ac: acRows, nowSec};
      }
    }

    const flights: LiveFlight[] = acRows
      .filter((a) => {
        const lat = Number(a.lat);
        const lon = Number(a.lon);
        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= lamin - 1 &&
          lat <= lamax + 1 &&
          lon >= lomin - 1 &&
          lon <= lomax + 1
        );
      })
      .map((a) => {
        const icao24 = String(a.hex ?? '').toUpperCase();
        const callsign = String(a.flight ?? a.r ?? icao24).trim().toUpperCase();
        const onGround = a.alt_baro === 'ground' || Number(a.alt_baro ?? 0) <= 0;
        const altFt = onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0;
        const dbFlags = (Number(a.dbFlags ?? 0) || 0) | 1;
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: callsign,
          registration: String(a.r ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign) || 'MIL',
          airlineName: String(a.ownOp ?? 'Military / State'),
          aircraftType: String(a.t ?? 'F16').toUpperCase(),
          lat: Number(a.lat),
          lon: Number(a.lon),
          altitudeFt: Math.max(0, Math.round(altFt)),
          groundSpeedKts: Math.round(Number(a.gs ?? 0)),
          trueTrackDeg: Math.round(Number(a.track ?? 0)),
          verticalRateFpm: Math.round(Number(a.baro_rate ?? a.geom_rate ?? 0)),
          onGround,
          squawk: String(a.squawk ?? ''),
          origin: '',
          destination: '',
          lastContactEpoch: nowSec - Math.round(Number(a.seen_pos ?? 0)),
          source: 'adsb.lol',
          isEstimated: false,
          uncertaintyNm: 0,
          dbFlags,
          isMilitary: true,
          isPia: (dbFlags & 4) !== 0,
          isLadd: (dbFlags & 8) !== 0,
          ownerOperator: a.ownOp ? String(a.ownOp) : undefined,
        };
      });
    return {
      flights,
      status: {provider: 'adsb.lol-mil', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'adsb.lol-mil',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function fetchAdsbLadd(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  try {
    let acRows: Array<Record<string, unknown>> = [];
    let nowSec = Math.floor(Date.now() / 1000);

    if (adsbLaddFeedCache && Date.now() - adsbLaddFeedCache.ts < 15000) {
      acRows = adsbLaddFeedCache.ac;
      nowSec = adsbLaddFeedCache.nowSec;
    } else {
      const res = await fetch('https://api.adsb.lol/v2/ladd', {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(3200),
      });
      if (!res.ok) {
        if (adsbLaddFeedCache && Date.now() - adsbLaddFeedCache.ts < 60000) {
          acRows = adsbLaddFeedCache.ac;
          nowSec = adsbLaddFeedCache.nowSec;
        } else {
          return {
            flights: [],
            status: {provider: 'adsb.lol-ladd', ok: false, count: 0, latencyMs: Date.now() - start, note: `HTTP ${res.status}`},
          };
        }
      } else {
        const json = (await res.json()) as {ac?: Array<Record<string, unknown>>; now?: number};
        acRows = json.ac ?? [];
        nowSec = Math.floor((json.now ?? Date.now()) / 1000);
        adsbLaddFeedCache = {ts: Date.now(), ac: acRows, nowSec};
      }
    }

    const flights: LiveFlight[] = acRows
      .filter((a) => {
        const lat = Number(a.lat);
        const lon = Number(a.lon);
        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= lamin - 1 &&
          lat <= lamax + 1 &&
          lon >= lomin - 1 &&
          lon <= lomax + 1
        );
      })
      .map((a) => {
        const icao24 = String(a.hex ?? '').toUpperCase();
        const callsign = String(a.flight ?? a.r ?? icao24).trim().toUpperCase();
        const onGround = a.alt_baro === 'ground' || Number(a.alt_baro ?? 0) <= 0;
        const altFt = onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0;
        const dbFlags = (Number(a.dbFlags ?? 0) || 0) | 8;
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: callsign,
          registration: String(a.r ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign) || 'LADD',
          airlineName: String(a.ownOp ?? 'LADD Restricted'),
          aircraftType: String(a.t ?? 'GLF6').toUpperCase(),
          lat: Number(a.lat),
          lon: Number(a.lon),
          altitudeFt: Math.max(0, Math.round(altFt)),
          groundSpeedKts: Math.round(Number(a.gs ?? 0)),
          trueTrackDeg: Math.round(Number(a.track ?? 0)),
          verticalRateFpm: Math.round(Number(a.baro_rate ?? a.geom_rate ?? 0)),
          onGround,
          squawk: String(a.squawk ?? ''),
          origin: '',
          destination: '',
          lastContactEpoch: nowSec - Math.round(Number(a.seen_pos ?? 0)),
          source: 'adsb.lol',
          isEstimated: false,
          uncertaintyNm: 0,
          dbFlags,
          isLadd: true,
          isMilitary: (dbFlags & 1) !== 0,
          isPia: (dbFlags & 4) !== 0,
          ownerOperator: a.ownOp ? String(a.ownOp) : undefined,
        };
      });
    return {
      flights,
      status: {provider: 'adsb.lol-ladd', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'adsb.lol-ladd',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function fetchOpenSky(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  // Cap bounding box around viewport center so OpenSky does not time out on continent-scale boxes
  const cLat = (lamin + lamax) / 2;
  const cLon = (lomin + lomax) / 2;
  const sMinLat = Math.max(-85, Math.max(lamin, cLat - 22));
  const sMaxLat = Math.min(85, Math.min(lamax, cLat + 22));
  const sMinLon = Math.max(-180, Math.max(lomin, cLon - 32));
  const sMaxLon = Math.min(180, Math.min(lomax, cLon + 32));
  const sectorKey = `${sMinLat.toFixed(1)},${sMinLon.toFixed(1)},${sMaxLat.toFixed(1)},${sMaxLon.toFixed(1)}`;
  const cachedSector = openSkySectorCache.get(sectorKey);

  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${sMinLat.toFixed(2)}&lomin=${sMinLon.toFixed(2)}&lamax=${sMaxLat.toFixed(2)}&lomax=${sMaxLon.toFixed(2)}`;
    const res = await fetch(url, {
      headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
      signal: AbortSignal.timeout(3800),
    });
    if (!res.ok) {
      if (cachedSector && Date.now() - cachedSector.ts < 30000) {
        return {
          flights: cachedSector.flights,
          status: {provider: 'opensky', ok: true, count: cachedSector.flights.length, latencyMs: Date.now() - start, note: 'Sector cache'},
        };
      }
      return {
        flights: [],
        status: {provider: 'opensky', ok: false, count: 0, latencyMs: Date.now() - start, note: `HTTP ${res.status}`},
      };
    }
    const json = (await res.json()) as {states?: Array<unknown[]>; time?: number};
    const nowSec = json.time ?? Math.floor(Date.now() / 1000);
    const flights: LiveFlight[] = (json.states ?? [])
      .filter((s) => Number.isFinite(Number(s[6])) && Number.isFinite(Number(s[5])))
      .slice(0, 1200)
      .map((s) => {
        const icao24 = String(s[0] ?? '').toUpperCase();
        const callsign = String(s[1] ?? icao24).trim().toUpperCase();
        const altM = Number(s[7] ?? s[13] ?? 0);
        const velMs = Number(s[9] ?? 0);
        const vrateMs = Number(s[11] ?? 0);
        return {
          id: icao24,
          icao24,
          callsign: callsign || icao24,
          flightNumber: callsign || icao24,
          registration: '',
          airlineIcao: airlineIcaoFromCallsign(callsign),
          airlineName: airlineIcaoFromCallsign(callsign),
          aircraftType: 'A320',
          lat: Number(s[6]),
          lon: Number(s[5]),
          altitudeFt: Math.max(0, Math.round(altM * 3.28084)),
          groundSpeedKts: Math.max(0, Math.round(velMs * 1.94384)),
          trueTrackDeg: Math.round(Number(s[10] ?? 0)),
          verticalRateFpm: Math.round(vrateMs * 196.85),
          onGround: Boolean(s[8]),
          squawk: s[14] ? String(s[14]) : '',
          origin: '',
          destination: '',
          lastContactEpoch: Number(s[4] ?? s[3] ?? nowSec),
          source: 'opensky',
          isEstimated: false,
          uncertaintyNm: 0,
        };
      });
    openSkySectorCache.set(sectorKey, {ts: Date.now(), flights});
    return {
      flights,
      status: {provider: 'opensky', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    if (cachedSector && Date.now() - cachedSector.ts < 30000) {
      return {
        flights: cachedSector.flights,
        status: {provider: 'opensky', ok: true, count: cachedSector.flights.length, latencyMs: Date.now() - start, note: 'Sector cache'},
      };
    }
    return {
      flights: [],
      status: {
        provider: 'opensky',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

async function fetchAdsbFi(
  centerLat: number,
  centerLon: number,
  radiusNm: number,
  isGlobal = false,
): Promise<{flights: LiveFlight[]; status: ProviderStatus}> {
  const start = Date.now();
  const r = Math.min(250, Math.max(25, Math.round(radiusNm)));
  try {
    let aircraftRows: Array<Record<string, unknown>> = [];
    let nowSec = Math.floor(Date.now() / 1000);

    if (isGlobal && adsbFiAllCache && Date.now() - adsbFiAllCache.ts < 12000) {
      aircraftRows = adsbFiAllCache.aircraft;
      nowSec = adsbFiAllCache.nowSec;
    } else {
      const targetUrl = isGlobal
        ? 'https://opendata.adsb.fi/api/v2/all'
        : `https://opendata.adsb.fi/api/v2/lat/${centerLat.toFixed(3)}/lon/${centerLon.toFixed(3)}/dist/${r}`;
      const res = await fetch(targetUrl, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(isGlobal ? 5200 : 2800),
      });
      if (!res.ok) {
        return {
          flights: [],
          status: {provider: 'adsb.fi', ok: false, count: 0, latencyMs: Date.now() - start, note: `HTTP ${res.status}`},
        };
      }
      const json = (await res.json()) as {aircraft?: Array<Record<string, unknown>>; now?: number};
      aircraftRows = json.aircraft ?? [];
      nowSec = Math.floor((json.now ?? Date.now()) / 1000);
      if (isGlobal && aircraftRows.length > 0) {
        adsbFiAllCache = {ts: Date.now(), aircraft: aircraftRows, nowSec};
      }
    }

    const flights: LiveFlight[] = aircraftRows
      .filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)))
      .map((a) => {
        const icao24 = String(a.hex ?? '').toUpperCase();
        const callsign = String(a.flight ?? icao24).trim().toUpperCase();
        const onGround = a.alt_baro === 'ground' || Number(a.alt_baro ?? 0) <= 0;
        const altFt = onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0;
        return {
          id: icao24,
          icao24,
          callsign,
          flightNumber: callsign,
          registration: String(a.r ?? ''),
          airlineIcao: airlineIcaoFromCallsign(callsign),
          airlineName: airlineIcaoFromCallsign(callsign),
          aircraftType: String(a.t ?? 'A320').toUpperCase(),
          lat: Number(a.lat),
          lon: Number(a.lon),
          altitudeFt: Math.max(0, Math.round(altFt)),
          groundSpeedKts: Math.round(Number(a.gs ?? 0)),
          trueTrackDeg: Math.round(Number(a.track ?? 0)),
          verticalRateFpm: Math.round(Number(a.baro_rate ?? a.geom_rate ?? 0)),
          onGround,
          squawk: String(a.squawk ?? ''),
          origin: '',
          destination: '',
          lastContactEpoch: nowSec - Math.round(Number(a.seen_pos ?? 0)),
          source: 'adsb.fi',
          isEstimated: false,
          uncertaintyNm: 0,
        };
      });
    return {
      flights,
      status: {provider: 'adsb.fi', ok: true, count: flights.length, latencyMs: Date.now() - start},
    };
  } catch (err) {
    return {
      flights: [],
      status: {
        provider: 'adsb.fi',
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        note: err instanceof Error ? err.message : 'Timeout',
      },
    };
  }
}

function computeRunways(
  icao: string,
  windDirDeg: number | null,
  windSpeedKts: number,
  wxString: string,
  rawMetar: string,
): RunwayCondition[] {
  const spec = AIRPORT_CATALOG.find((a) => a.icao === icao);
  if (!spec) return [];

  const isSnowOrIce = /SN|FZRA|PL|GR|GS|BLSN|IC/i.test(`${wxString} ${rawMetar}`);
  const isRainOrWet = /RA|DZ|TS|SH/i.test(`${wxString} ${rawMetar}`);
  const surface: RunwayCondition['surface'] = isSnowOrIce ? 'CONTAMINATED' : isRainOrWet ? 'WET' : 'DRY';
  const brakingAction: RunwayCondition['brakingAction'] = isSnowOrIce ? 'POOR' : isRainOrWet ? 'MEDIUM' : 'GOOD';

  let bestIdx = 0;
  let bestHeadwind = -999;

  const list = spec.runways.map((rwy, idx) => {
    let headwindKts = 0;
    let crosswindKts = 0;
    let crosswindDir: RunwayCondition['crosswindDir'] = 'CALM';

    if (windDirDeg !== null && windSpeedKts > 0) {
      const diff1 = ((windDirDeg - rwy.headingDeg + 540) % 360) - 180;
      const rad = (diff1 * Math.PI) / 180;
      const hw1 = Math.round(windSpeedKts * Math.cos(rad));
      const useOpposite = hw1 < 0;
      const effectiveHeading = useOpposite ? (rwy.headingDeg + 180) % 360 : rwy.headingDeg;
      const diff = ((windDirDeg - effectiveHeading + 540) % 360) - 180;
      const effRad = (diff * Math.PI) / 180;
      headwindKts = Math.round(windSpeedKts * Math.cos(effRad));
      const xw = Math.round(windSpeedKts * Math.sin(effRad));
      crosswindKts = Math.abs(xw);
      crosswindDir = crosswindKts === 0 ? 'CALM' : xw > 0 ? 'R' : 'L';
    }

    if (headwindKts > bestHeadwind) {
      bestHeadwind = headwindKts;
      bestIdx = idx;
    }

    return {
      ident: rwy.ident,
      headingDeg: rwy.headingDeg,
      lengthFt: rwy.lengthFt,
      surface,
      brakingAction,
      headwindKts,
      crosswindKts,
      crosswindDir,
      favored: false,
    };
  });

  if (list[bestIdx]) list[bestIdx].favored = true;
  return list;
}

function classifyAcarsLabel(label: string, text: string): {name: string; category: AcarsMessage['category']; summary: string} {
  const l = (label || '').toUpperCase();
  const t = (text || '').trim();
  if (/^Q[ABCD0]|^SA|^SQ/.test(l) || /\b(OUT|OFF|ON|IN)\b/.test(t)) {
    return {name: 'OOOI Movement', category: 'OOOI', summary: t.slice(0, 140) || 'Gate/Runway movement report'};
  }
  if (/^H1|^POS|^10|^15|^16/.test(l) || /POS|LAT|LON/.test(t)) {
    return {name: 'Position / ADS-C', category: 'POS', summary: t.slice(0, 140) || 'Enroute automated position fix'};
  }
  if (/^5Z|^WX|^20|^21/.test(l) || /METAR|TAF|WINDS|TURB/.test(t)) {
    return {name: 'Weather / Winds', category: 'WX', summary: t.slice(0, 140) || 'Weather / Turbulence advisory'};
  }
  if (/^B6|^44|^AA|^CP/.test(l) || /CLRD|PDC|ATIS|RWY|SQUAWK/.test(t)) {
    return {name: 'ATC / Clearance', category: 'ATC', summary: t.slice(0, 140) || 'Pre-departure / ATC datalink'};
  }
  if (/^80|^MA|^DF|^M1/.test(l) || /ENG|HYD|FAULT|MAINT/.test(t)) {
    return {name: 'Maintenance / EICAS', category: 'MAINT', summary: t.slice(0, 140) || 'Airframe system telemetry report'};
  }
  return {name: `Label ${l || 'GEN'}`, category: 'OTHER', summary: t.slice(0, 140) || 'Operational airline datalink'};
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. Live Multi-Source Flights Aggregator
  router.get('/flights', async (req, res) => {
    const lamin = Number(req.query.lamin ?? 18.0);
    const lomin = Number(req.query.lomin ?? 98.0);
    const lamax = Number(req.query.lamax ?? 43.0);
    const lomax = Number(req.query.lomax ?? 126.0);

    const key = `${lamin.toFixed(1)},${lomin.toFixed(1)},${lamax.toFixed(1)},${lomax.toFixed(1)}`;
    const cached = flightsCache.get(key);
    if (cached && Date.now() - cached.ts < 5500) {
      res.json({...cached.data, fromServerCache: true});
      return;
    }

    const isGlobal = lamax - lamin >= 150 && lomax - lomin >= 320;
    const centerLat = (lamin + lamax) / 2;
    const centerLon = (lomin + lomax) / 2;
    const latSpanNm = Math.abs(lamax - lamin) * 60;
    const lonSpanNm = Math.abs(lomax - lomin) * 60 * Math.cos((centerLat * Math.PI) / 180);
    const radiusNm = Math.min(250, Math.max(40, Math.hypot(latSpanNm, lonSpanNm) / 2));

    const [fr24Res, adsbRes, adsbMilRes, adsbLaddRes, adsbFiRes, openSkyRes, airNavRes, variFlightRes] = await Promise.all([
      fetchFr24Web(lamin, lomin, lamax, lomax),
      fetchAdsbLol(centerLat, centerLon, radiusNm, isGlobal),
      fetchAdsbMil(lamin, lomin, lamax, lomax),
      fetchAdsbLadd(lamin, lomin, lamax, lomax),
      fetchAdsbFi(centerLat, centerLon, radiusNm, isGlobal),
      fetchOpenSky(lamin, lomin, lamax, lomax),
      fetchAirNavWeb(lamin, lomin, lamax, lomax),
      fetchVariFlightWeb(lamin, lomin, lamax, lomax),
    ]);

    const mergedMap = new Map<string, LiveFlight>();
    const orderedLists = [
      variFlightRes.flights,
      airNavRes.flights,
      fr24Res.flights,
      adsbLaddRes.flights,
      adsbMilRes.flights,
      adsbRes.flights,
      adsbFiRes.flights,
      openSkyRes.flights,
    ];

    for (const list of orderedLists) {
      for (const f of list) {
        const dedupeKey = f.icao24 || f.callsign;
        const existing = mergedMap.get(dedupeKey);
        if (!existing) {
          mergedMap.set(dedupeKey, f);
        } else {
          if (!existing.origin && f.origin) existing.origin = f.origin;
          if (!existing.destination && f.destination) existing.destination = f.destination;
          if (!existing.squawk && f.squawk) existing.squawk = f.squawk;
          if (!existing.airlineIcao && f.airlineIcao) existing.airlineIcao = f.airlineIcao;
          if (!existing.flightNumber && f.flightNumber) existing.flightNumber = f.flightNumber;
          if ((!existing.aircraftType || existing.aircraftType === 'A320') && f.aircraftType) {
            existing.aircraftType = f.aircraftType;
          }
          if (!existing.registration && f.registration) existing.registration = f.registration;
          if (!existing.fr24Id && f.fr24Id) existing.fr24Id = f.fr24Id;
          if (f.dbFlags) existing.dbFlags = (existing.dbFlags ?? 0) | f.dbFlags;
          if (f.isLadd) existing.isLadd = true;
          if (f.isMilitary) existing.isMilitary = true;
          if (f.isPia) existing.isPia = true;
          if (!existing.ownerOperator && f.ownerOperator) existing.ownerOperator = f.ownerOperator;
        }
      }
    }

    const flights = Array.from(mergedMap.values())
      .filter((f) => f.lat >= lamin - 2 && f.lat <= lamax + 2 && f.lon >= lomin - 2 && f.lon <= lomax + 2)
      .sort((a, b) => {
        const aEmerg = a.squawk === '7700' || a.squawk === '7600' || a.squawk === '7500' ? 1 : 0;
        const bEmerg = b.squawk === '7700' || b.squawk === '7600' || b.squawk === '7500' ? 1 : 0;
        if (aEmerg !== bEmerg) return bEmerg - aEmerg;
        const aFlag = (a.isLadd ? 2 : 0) + (a.isMilitary ? 1 : 0) + (a.isPia ? 1 : 0);
        const bFlag = (b.isLadd ? 2 : 0) + (b.isMilitary ? 1 : 0) + (b.isPia ? 1 : 0);
        if (aFlag !== bFlag) return bFlag - aFlag;
        if (a.onGround !== b.onGround) return a.onGround ? 1 : -1;
        return 0;
      })
      .slice(0, 50000);

    for (const f of flights) {
      recordFlightBreadcrumb(f);
      const history = flightTrailHistory.get(f.icao24 || f.id);
      if (history && history.length > 1) {
        f.trail = history.slice(-40);
      }
    }

    const providers: ProviderStatus[] = [
      fr24Res.status,
      adsbLaddRes.status,
      adsbMilRes.status,
      adsbFiRes.status,
      adsbRes.status,
      variFlightRes.status,
      airNavRes.status,
      openSkyRes.status,
    ];

    const payload: FlightsResponse = {
      flights,
      providers,
      fetchedAt: Date.now(),
      bounds: {lamin, lomin, lamax, lomax},
    };

    if (flights.length > 0) {
      flightsCache.set(key, {ts: Date.now(), data: payload});
    } else if (cached) {
      res.json({...cached.data, providers, fromServerCache: true});
      return;
    }

    res.json(payload);
  });

  // 1b. Approximate IP Geolocation Fallback
  router.get('/locate', async (req, res) => {
    try {
      const netlifyIp = String(req.headers['x-nf-client-connection-ip'] ?? '').trim();
      const fwd = netlifyIp || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      const target =
        fwd && !fwd.startsWith('127.') && !fwd.startsWith('10.') && !fwd.startsWith('::1')
          ? `https://ipwho.is/${encodeURIComponent(fwd)}`
          : 'https://ipwho.is/';
      const r = await fetch(target, {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(2600),
      });
      const json = await safeJson<{success?: boolean; latitude?: number; longitude?: number; city?: string; country?: string}>(r);
      if (json && Number.isFinite(json.latitude) && Number.isFinite(json.longitude)) {
        res.json({
          lat: json.latitude,
          lon: json.longitude,
          city: json.city || '',
          country: json.country || '',
          source: 'ipwho.is',
        });
        return;
      }
    } catch {
      // ignore
    }
    res.status(204).end();
  });

  // 2. Live Flight Detail, Full Playback Trail, Departure/Arrival Terminal & Gate, Planespotters Photo & HexDB
  router.get('/flight-detail', async (req, res) => {
    const fr24Id = String(req.query.fr24Id ?? '');
    const icao24 = String(req.query.icao24 ?? '').toLowerCase();
    const callsign = String(req.query.callsign ?? '');
    const regParam = String(req.query.reg ?? '');
    const fnumParam = String(req.query.fnum ?? '');
    const origParam = String(req.query.orig ?? '');

    const icaoKey = icao24.toUpperCase();
    const cachedFlight = flightIndexMap.get(icaoKey) ?? flightIndexMap.get(fr24Id);
    const knownReg = regParam || cachedFlight?.registration || '';
    const knownFnum = fnumParam || cachedFlight?.flightNumber || '';
    const knownOrig = origParam || cachedFlight?.origin || '';

    const photoPromise = fetchPlanespottersPhoto(icao24, knownReg);
    const hexDbPromise = fetchHexDbAircraft(icao24);

    // 2a. FR24 Mobile Playback + Flight List + ADSBDB Callsign Lookup in parallel
    const playbackPromise = fr24Id
      ? fetch(`https://api.flightradar24.com/common/v1/flight-playback.json?flightId=${encodeURIComponent(fr24Id)}`, {
          headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
          signal: AbortSignal.timeout(2900),
        })
          .then((r) => safeJson<{result?: {response?: {data?: {flight?: Record<string, unknown>}}}}>(r))
          .catch(() => null)
      : Promise.resolve(null);

    const listQuery = knownFnum && knownFnum !== icaoKey ? knownFnum : knownReg;
    const listFetchBy = knownFnum && knownFnum !== icaoKey ? 'flight' : 'reg';
    const flightListPromise = listQuery
      ? fetch(
          `https://api.flightradar24.com/common/v1/flight/list.json?query=${encodeURIComponent(listQuery)}&fetchBy=${listFetchBy}&limit=6`,
          {
            headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
            signal: AbortSignal.timeout(2800),
          },
        )
          .then((r) => safeJson<{result?: {response?: {data?: Array<Record<string, unknown>>}}}>(r))
          .catch(() => null)
      : Promise.resolve(null);

    const adsbdbPromise =
      callsign && callsign !== icaoKey
        ? fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
            headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
            signal: AbortSignal.timeout(2500),
          })
            .then((r) => safeJson<{response?: {flightroute?: Record<string, unknown>}}>(r))
            .catch(() => null)
        : Promise.resolve(null);

    const recordedTrail = flightTrailHistory.get(icaoKey) ?? [];
    const adsbLolPromise = icao24
      ? fetch(`https://api.adsb.lol/v2/hex/${encodeURIComponent(icao24)}`, {
          headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
          signal: AbortSignal.timeout(2200),
        })
          .then((r) => safeJson<{ac?: Array<Record<string, unknown>>}>(r))
          .catch(() => null)
      : Promise.resolve(null);

    const adsbFiHexPromise = icao24
      ? fetch(`https://opendata.adsb.fi/api/v2/icao/${encodeURIComponent(icao24)}`, {
          headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
          signal: AbortSignal.timeout(2200),
        })
          .then((r) => safeJson<{ac?: Array<Record<string, unknown>>; aircraft?: Array<Record<string, unknown>>}>(r))
          .catch(() => null)
      : Promise.resolve(null);

    const [pbJson, listJson, adsbdbJson, adsbJson, adsbFiJson, photo, hexDb] = await Promise.all([
      playbackPromise,
      flightListPromise,
      adsbdbPromise,
      adsbLolPromise,
      adsbFiHexPromise,
      photoPromise,
      hexDbPromise,
    ]);

    const pbFlight = pbJson?.result?.response?.data?.flight;
    const listItems = Array.isArray(listJson?.result?.response?.data) ? listJson.result.response.data : [];
    const nowSec = Math.floor(Date.now() / 1000);
    const matchedListItem =
      listItems.find((item) => {
        const idObj = (item.identification ?? {}) as Record<string, unknown>;
        return fr24Id && String(idObj.id ?? '') === fr24Id;
      }) ??
      listItems.find((item) => Boolean((item.status as Record<string, unknown> | undefined)?.live)) ??
      listItems.find((item) => {
        const t = (item.time as Record<string, unknown> | undefined)?.scheduled as Record<string, unknown> | undefined;
        const dep = Number(t?.departure ?? 0);
        return dep > 0 && Math.abs(nowSec - dep) < 43200;
      }) ??
      listItems[0];

    const pbTrackRaw = Array.isArray(pbFlight?.track) ? (pbFlight.track as Array<Record<string, unknown>>) : [];
    const playbackTrail: TrailPoint[] = pbTrackRaw
      .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
      .map((p) => ({
        lat: Number(p.latitude),
        lon: Number(p.longitude),
        altFt: Number((p.altitude as Record<string, unknown> | undefined)?.feet ?? 0),
        speedKts: Number((p.speed as Record<string, unknown> | undefined)?.kts ?? 0),
        trackDeg: Number(p.heading ?? 0),
        ts: Number(p.timestamp ?? 0),
      }));

    // Parse origin / destination / terminal / gate / times across FR24 playback + list + adsbdb
    const pbAp = (pbFlight?.airport ?? {}) as Record<string, unknown>;
    const pbOrig = (pbAp.origin ?? {}) as Record<string, unknown>;
    const pbOrigCode = (pbOrig.code ?? {}) as Record<string, unknown>;
    const pbOrigInfo = (pbOrig.info ?? {}) as Record<string, unknown>;
    const pbDest = (pbAp.destination ?? {}) as Record<string, unknown>;
    const pbDestCode = (pbDest.code ?? {}) as Record<string, unknown>;
    const pbDestInfo = (pbDest.info ?? {}) as Record<string, unknown>;

    const listAp = (matchedListItem?.airport ?? {}) as Record<string, unknown>;
    const listOrig = (listAp.origin ?? {}) as Record<string, unknown>;
    const listOrigCode = (listOrig.code ?? {}) as Record<string, unknown>;
    const listOrigInfo = (listOrig.info ?? {}) as Record<string, unknown>;
    const listDest = (listAp.destination ?? {}) as Record<string, unknown>;
    const listDestCode = (listDest.code ?? {}) as Record<string, unknown>;
    const listDestInfo = (listDest.info ?? {}) as Record<string, unknown>;

    const frRoute = (adsbdbJson?.response?.flightroute ?? {}) as Record<string, unknown>;
    const dbOrig = (frRoute.origin ?? {}) as Record<string, unknown>;
    const dbDest = (frRoute.destination ?? {}) as Record<string, unknown>;
    const dbAirline = (frRoute.airline ?? {}) as Record<string, unknown>;

    const pbIdent = (pbFlight?.identification ?? {}) as Record<string, unknown>;
    const pbNum = (pbIdent.number ?? {}) as Record<string, unknown>;
    const pbAc = (pbFlight?.aircraft ?? {}) as Record<string, unknown>;
    const pbAcModel = (pbAc.model ?? {}) as Record<string, unknown>;
    const pbAcIdent = (pbAc.identification ?? {}) as Record<string, unknown>;
    const pbAirline = (pbFlight?.airline ?? {}) as Record<string, unknown>;
    const pbAirlineCode = (pbAirline.code ?? {}) as Record<string, unknown>;
    const pbStatus = (pbFlight?.status ?? {}) as Record<string, unknown>;

    const listAc = (matchedListItem?.aircraft ?? {}) as Record<string, unknown>;
    const listTime = (matchedListItem?.time ?? {}) as Record<string, unknown>;
    const listSched = (listTime.scheduled ?? {}) as Record<string, unknown>;
    const listReal = (listTime.real ?? {}) as Record<string, unknown>;
    const listEst = (listTime.estimated ?? {}) as Record<string, unknown>;
    const listStatus = (matchedListItem?.status ?? {}) as Record<string, unknown>;

    const originIata = String(pbOrigCode.iata ?? listOrigCode.iata ?? dbOrig.iata_code ?? knownOrig ?? '');
    const destIata = String(pbDestCode.iata ?? listDestCode.iata ?? dbDest.iata_code ?? cachedFlight?.destination ?? '');
    const originCatalog = AIRPORT_CATALOG.find((a) => a.iata === originIata || a.icao === originIata);
    const destCatalog = AIRPORT_CATALOG.find((a) => a.iata === destIata || a.icao === destIata);

    let originTerminal = String(pbOrigInfo.terminal ?? listOrigInfo.terminal ?? '') || undefined;
    let originGate = String(pbOrigInfo.gate ?? listOrigInfo.gate ?? '') || undefined;
    let destTerminal = String(pbDestInfo.terminal ?? listDestInfo.terminal ?? '') || undefined;
    let destGate = String(pbDestInfo.gate ?? listDestInfo.gate ?? '') || undefined;
    let destBaggage = String(pbDestInfo.baggage ?? listDestInfo.baggage ?? '') || undefined;
    let scheduledDep = Number(listSched.departure ?? 0) || undefined;
    let actualDep = Number(listReal.departure ?? 0) || undefined;
    let scheduledArr = Number(listSched.arrival ?? 0) || undefined;
    let estimatedArr = Number(listEst.arrival ?? 0) || undefined;

    // Enrich missing departure terminal/gate directly from origin airport's live schedule board
    if (originIata && (!originTerminal || !originGate)) {
      const originBoard = await fetchFr24AirportBoard(originIata).catch(() => null);
      if (originBoard) {
        const upperFnum = (knownFnum || String(pbNum.default ?? '')).toUpperCase();
        const upperReg = knownReg.toUpperCase();
        const matchDep = originBoard.departures.find(
          (d) =>
            (upperFnum && d.flightNumber.toUpperCase() === upperFnum) ||
            (upperReg && d.registration.toUpperCase() === upperReg) ||
            (icaoKey && d.icao24 === icaoKey),
        );
        if (matchDep) {
          if (!originTerminal && matchDep.terminal) originTerminal = matchDep.terminal;
          if (!originGate && matchDep.gate) originGate = matchDep.gate;
          if (!scheduledDep && matchDep.scheduledTime) scheduledDep = matchDep.scheduledTime;
          if (!actualDep && (matchDep.actualTime || matchDep.estimatedTime)) {
            actualDep = matchDep.actualTime ?? matchDep.estimatedTime;
          }
        }
      }
    }

    const adsbMeta = adsbJson?.ac?.[0] ?? adsbFiJson?.ac?.[0] ?? adsbFiJson?.aircraft?.[0] ?? null;
    const resolvedSquawk = String(adsbMeta?.squawk ?? cachedFlight?.squawk ?? '') || undefined;
    if (resolvedSquawk && cachedFlight && !cachedFlight.squawk) {
      cachedFlight.squawk = resolvedSquawk;
    }
    const bestTrail = playbackTrail.length >= recordedTrail.length ? playbackTrail : recordedTrail;
    const resolvedReg = String(pbAcIdent.registration ?? listAc.registration ?? adsbMeta?.r ?? hexDb?.Registration ?? knownReg);
    const ageText =
      listAc.age && typeof listAc.age === 'object' && (listAc.age as Record<string, unknown>).availability === false
        ? undefined
        : typeof listAc.age === 'string' || typeof listAc.age === 'number'
          ? String(listAc.age)
          : undefined;

    res.json({
      id: fr24Id || icaoKey || callsign,
      callsign: String(pbIdent.callsign ?? adsbMeta?.flight ?? cachedFlight?.callsign ?? callsign).trim().toUpperCase(),
      flightNumber: String(pbNum.default ?? frRoute.callsign_iata ?? cachedFlight?.flightNumber ?? callsign),
      registration: resolvedReg,
      squawk: resolvedSquawk,
      aircraftModel: String(pbAcModel.text ?? adsbMeta?.desc ?? hexDb?.Type ?? pbAcModel.code ?? cachedFlight?.aircraftType ?? ''),
      aircraftCode: String(pbAcModel.code ?? adsbMeta?.t ?? hexDb?.ICAOTypeCode ?? cachedFlight?.aircraftType ?? ''),
      manufacturer: hexDb?.Manufacturer || undefined,
      registeredOwner: String(adsbMeta?.ownOp ?? hexDb?.RegisteredOwners ?? '') || undefined,
      aircraftAge: ageText,
      airlineName: String(pbAirline.name ?? dbAirline.name ?? adsbMeta?.ownOp ?? hexDb?.RegisteredOwners ?? cachedFlight?.airlineName ?? ''),
      airlineIcao: String(pbAirlineCode.icao ?? dbAirline.icao ?? cachedFlight?.airlineIcao ?? airlineIcaoFromCallsign(callsign)),
      airlineLogo: undefined,
      originIata,
      originIcao: String(pbOrigCode.icao ?? listOrigCode.icao ?? dbOrig.icao_code ?? originCatalog?.icao ?? ''),
      originName: String(pbOrig.name ?? listOrig.name ?? dbOrig.name ?? originCatalog?.name ?? (originIata ? `${originIata} Airport` : '')),
      originTerminal,
      originGate,
      destinationIata: destIata,
      destinationIcao: String(pbDestCode.icao ?? listDestCode.icao ?? dbDest.icao_code ?? destCatalog?.icao ?? ''),
      destinationName: String(pbDest.name ?? listDest.name ?? dbDest.name ?? destCatalog?.name ?? (destIata ? `${destIata} Airport` : '')),
      destTerminal,
      destGate,
      destBaggage,
      scheduledDep,
      actualDep,
      scheduledArr,
      estimatedArr,
      statusText: String(pbStatus.text ?? listStatus.text ?? (cachedFlight?.onGround ? 'SURFACE TAXI' : 'ENROUTE LIVE')),
      photo,
      trail: bestTrail,
      source: playbackTrail.length > 0 ? 'fr24-playback' : cachedFlight?.source ?? 'adsb',
    } satisfies FlightDetail);
  });

  // 2b. Live Airport Arrivals, Departures & Delay Index Board
  router.get('/airport-board', async (req, res) => {
    const code = String(req.query.code ?? '').trim().toUpperCase();
    const icao = String(req.query.icao ?? '').trim().toUpperCase();
    if (!code && !icao) {
      res.status(400).json({error: 'Missing airport code or icao'});
      return;
    }

    const board = await fetchFr24AirportBoard(code || icao, icao);
    if (board) {
      res.json(board);
      return;
    }

    // Fallback to global directory / catalog + live ADS-B traffic index
    const catalog = AIRPORT_CATALOG.find((a) => a.iata === code || a.icao === icao || a.icao === code);
    const allAirports = await getGlobalAirports();
    const dirMatch = allAirports.find(
      (a) => (iataMatch(a.iata, code) || a.icao === icao || a.icao === code),
    );
    const iata = catalog?.iata ?? dirMatch?.iata ?? code;
    const resolvedIcao = catalog?.icao ?? dirMatch?.icao ?? (icao || code);

    function iataMatch(aIata: string, target: string) {
      return Boolean(target && aIata && aIata === target);
    }

    const nearbyFlights = Array.from(flightIndexMap.values());
    const arrivals: AirportBoardFlight[] = nearbyFlights
      .filter((f) => (iata && f.destination === iata) || f.destination === resolvedIcao)
      .slice(0, 60)
      .map((f) => ({
        id: f.id,
        callsign: f.callsign,
        flightNumber: f.flightNumber,
        airlineName: f.airlineName,
        airlineIcao: f.airlineIcao,
        originIata: f.origin,
        originIcao: '',
        originName: f.origin,
        destinationIata: iata,
        destinationIcao: resolvedIcao,
        destinationName: catalog?.name ?? dirMatch?.name ?? (iata || resolvedIcao),
        aircraftCode: f.aircraftType,
        aircraftModel: f.aircraftType,
        registration: f.registration,
        icao24: f.icao24,
        statusText: f.onGround ? 'Arrived' : 'Enroute Inbound',
        statusColor: 'green',
        isDelayed: false,
        isLive: true,
      }));
    const departures: AirportBoardFlight[] = nearbyFlights
      .filter((f) => (iata && f.origin === iata) || f.origin === resolvedIcao)
      .slice(0, 60)
      .map((f) => ({
        id: f.id,
        callsign: f.callsign,
        flightNumber: f.flightNumber,
        airlineName: f.airlineName,
        airlineIcao: f.airlineIcao,
        originIata: iata,
        originIcao: resolvedIcao,
        originName: catalog?.name ?? dirMatch?.name ?? (iata || resolvedIcao),
        destinationIata: f.destination,
        destinationIcao: '',
        destinationName: f.destination,
        aircraftCode: f.aircraftType,
        aircraftModel: f.aircraftType,
        registration: f.registration,
        icao24: f.icao24,
        statusText: f.onGround ? 'Taxiing' : 'Departed Live',
        statusColor: 'green',
        isDelayed: false,
        isLive: true,
      }));

    res.json({
      icao: resolvedIcao,
      iata,
      name: catalog?.name ?? dirMatch?.name ?? `${iata || resolvedIcao} Airport`,
      city: catalog?.city ?? dirMatch?.city ?? '',
      country: catalog?.country ?? dirMatch?.country ?? '',
      lat: catalog?.lat ?? dirMatch?.lat ?? 0,
      lon: catalog?.lon ?? dirMatch?.lon ?? 0,
      delayIndex: computeDelaySummaryFromRows(departures, arrivals, null),
      arrivals,
      departures,
      fetchedAt: Date.now(),
      source: 'adsb-fallback',
    } satisfies AirportBoardResponse);
  });

  // 2e. Aviation Safety Network (ASN) Registration Incident & Accident Records
  router.get('/safety-record', async (req, res) => {
    const registration = String(req.query.registration ?? req.query.reg ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    if (!registration) {
      res.status(400).json({error: 'Missing registration'});
      return;
    }

    const searchUrl = `https://aviation-safety.net/database/registration/regsearch.php?regi=${encodeURIComponent(registration)}`;
    const cached = safetyRecordCache.get(registration);
    if (cached && Date.now() - cached.ts < 3600000) {
      res.json(cached.data);
      return;
    }

    const stripTags = (s: string) =>
      s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();

    const items: SafetyRecordItem[] = [];
    let note: string | undefined;

    try {
      const asnRes = await fetch(searchUrl, {
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://aviation-safety.net/database/registration/',
        },
        signal: AbortSignal.timeout(5500),
      });
      if (!asnRes.ok) {
        note = `ASN HTTP ${asnRes.status}`;
      } else {
        const html = await asnRes.text();
        if (/just a moment|cloudflare|cf-challenge/i.test(html) && !html.includes('wikibase') && !html.includes('<table')) {
          note = 'ASN browser verification active — click View ASN Record';
        } else {
          const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
          let m: RegExpExecArray | null;
          while ((m = rowRegex.exec(html)) !== null) {
            const rowHtml = m[1];
            if (/<th\b/i.test(rowHtml)) continue;
            const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((c) => c[1]);
            if (cells.length < 4) continue;
            const hrefMatch = rowHtml.match(/href=["']([^"']*(?:wikibase|database\/record)[^"']*)["']/i);
            const hrefRaw = hrefMatch ? hrefMatch[1] : '';
            const href = hrefRaw
              ? hrefRaw.startsWith('http')
                ? hrefRaw
                : `https://aviation-safety.net${hrefRaw.startsWith('/') ? '' : '/'}${hrefRaw}`
              : searchUrl;
            const dateText = stripTags(cells[0]);
            if (!dateText || !/\d{4}/.test(dateText)) continue;
            items.push({
              date: dateText,
              type: stripTags(cells[1] ?? ''),
              operator: stripTags(cells[3] ?? cells[2] ?? ''),
              fatalities: stripTags(cells[4] ?? '0'),
              location: stripTags(cells[5] ?? ''),
              damage: stripTags(cells[7] ?? cells[6] ?? ''),
              href,
            });
          }
        }
      }
    } catch (err) {
      note = err instanceof Error ? err.message : 'ASN lookup timeout';
    }

    const payload: SafetyRecordResponse = {
      registration,
      items: items.slice(0, 30),
      searchUrl,
      source: 'aviation-safety.net',
      fetchedAt: Date.now(),
      note,
    };
    safetyRecordCache.set(registration, {ts: Date.now(), data: payload});
    res.json(payload);
  });

  // 2f. Past Flights Lookup by Flight Number or Aircraft Tail Registration
  router.get('/past-flights', async (req, res) => {
    const rawQuery = String(req.query.query ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const icao24Param = String(req.query.icao24 ?? '').trim().toUpperCase();
    if (!rawQuery && !icao24Param) {
      res.status(400).json({error: 'Missing query'});
      return;
    }

    const cacheKey = `${rawQuery}|${icao24Param}`;
    const cached = pastFlightsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 120000) {
      res.json({query: rawQuery, items: cached.items, fetchedAt: Date.now(), cached: true});
      return;
    }

    const isReg = /-/.test(rawQuery) || /^[BNVGDF][A-Z0-9]{3,}$/.test(rawQuery);
    const items: PastFlightRecord[] = [];
    const seen = new Set<string>();

    const fr24Promise = (async () => {
      if (!rawQuery) return;
      const modes = isReg ? ['reg', 'flight'] : ['flight', 'reg'];
      for (const fetchBy of modes) {
        try {
          const url = `https://api.flightradar24.com/common/v1/flight/list.json?fetchBy=${fetchBy}&page=1&limit=16&query=${encodeURIComponent(rawQuery)}`;
          const r = await fetch(url, {
            headers: {'User-Agent': FR24_MOBILE_UA, Accept: 'application/json'},
            signal: AbortSignal.timeout(4800),
          });
          const json = await safeJson<{result?: {response?: {data?: Array<Record<string, unknown>>}}}>(r);
          const rows = json?.result?.response?.data ?? [];
          for (const row of rows) {
            const ident = (row.identification ?? {}) as Record<string, unknown>;
            const num = (ident.number ?? {}) as Record<string, unknown>;
            const ap = (row.airport ?? {}) as Record<string, unknown>;
            const orig = (ap.origin ?? {}) as Record<string, unknown>;
            const dest = (ap.destination ?? {}) as Record<string, unknown>;
            const origCode = (orig.code ?? {}) as Record<string, unknown>;
            const destCode = (dest.code ?? {}) as Record<string, unknown>;
            const ac = (row.aircraft ?? {}) as Record<string, unknown>;
            const acModel = (ac.model ?? {}) as Record<string, unknown>;
            const timeObj = (row.time ?? {}) as Record<string, unknown>;
            const sched = (timeObj.scheduled ?? {}) as Record<string, unknown>;
            const real = (timeObj.real ?? {}) as Record<string, unknown>;
            const statusObj = (row.status ?? {}) as Record<string, unknown>;
            const fnum = String(num.default ?? ident.callsign ?? rawQuery).toUpperCase();
            const depTs = Number(real.departure ?? sched.departure ?? 0) || undefined;
            const id = String(ident.id ?? `${fnum}-${depTs ?? items.length}`);
            if (seen.has(id)) continue;
            seen.add(id);
            items.push({
              id,
              flightNumber: fnum,
              callsign: String(ident.callsign ?? fnum).toUpperCase(),
              registration: String(ac.registration ?? (isReg ? rawQuery : '')),
              originIata: String(origCode.iata ?? '').toUpperCase(),
              originIcao: String(origCode.icao ?? '').toUpperCase(),
              originName: String(orig.name ?? ''),
              destinationIata: String(destCode.iata ?? '').toUpperCase(),
              destinationIcao: String(destCode.icao ?? '').toUpperCase(),
              destinationName: String(dest.name ?? ''),
              scheduledDep: Number(sched.departure ?? 0) || undefined,
              actualDep: Number(real.departure ?? 0) || undefined,
              scheduledArr: Number(sched.arrival ?? 0) || undefined,
              actualArr: Number(real.arrival ?? 0) || undefined,
              statusText: String(statusObj.text ?? 'Completed'),
              aircraftCode: String(acModel.code ?? ''),
              source: 'fr24-history',
            });
          }
          if (items.length > 0) break;
        } catch {
          // continue
        }
      }
    })();

    const openSkyPromise = (async () => {
      let hex = icao24Param.toLowerCase();
      if (!hex && rawQuery) {
        const match = Array.from(flightIndexMap.values()).find(
          (f) =>
            f.registration.toUpperCase() === rawQuery ||
            f.callsign.toUpperCase() === rawQuery ||
            f.flightNumber.toUpperCase() === rawQuery,
        );
        if (match?.icao24) hex = match.icao24.toLowerCase();
      }
      if (!hex) return;
      try {
        const endSec = Math.floor(Date.now() / 1000);
        const beginSec = endSec - 7 * 86400;
        const r = await fetch(
          `https://opensky-network.org/api/flights/aircraft?icao24=${encodeURIComponent(hex)}&begin=${beginSec}&end=${endSec}`,
          {headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'}, signal: AbortSignal.timeout(4500)},
        );
        const rows = (await safeJson<Array<Record<string, unknown>>>(r)) ?? [];
        for (const row of rows.slice(0, 12)) {
          const cs = String(row.callsign ?? hex).trim().toUpperCase();
          const firstSeen = Number(row.firstSeen ?? 0) || undefined;
          const lastSeen = Number(row.lastSeen ?? 0) || undefined;
          const id = `os-${hex}-${firstSeen ?? items.length}`;
          if (seen.has(id)) continue;
          seen.add(id);
          items.push({
            id,
            flightNumber: cs,
            callsign: cs,
            registration: isReg ? rawQuery : '',
            originIata: '',
            originIcao: String(row.estDepartureAirport ?? '').toUpperCase(),
            originName: String(row.estDepartureAirport ?? ''),
            destinationIata: '',
            destinationIcao: String(row.estArrivalAirport ?? '').toUpperCase(),
            destinationName: String(row.estArrivalAirport ?? ''),
            scheduledDep: firstSeen,
            actualDep: firstSeen,
            scheduledArr: lastSeen,
            actualArr: lastSeen,
            statusText: 'Recorded Track',
            aircraftCode: '',
            source: 'opensky-log',
          });
        }
      } catch {
        // optional
      }
    })();

    await Promise.all([fr24Promise, openSkyPromise]);
    items.sort((a, b) => (b.actualDep ?? b.scheduledDep ?? 0) - (a.actualDep ?? a.scheduledDep ?? 0));
    pastFlightsCache.set(cacheKey, {ts: Date.now(), items});
    res.json({query: rawQuery || icao24Param, items: items.slice(0, 24), fetchedAt: Date.now()});
  });

  // 2c. Global Airports within Radar Viewport (All Airports)
  router.get('/airports', async (req, res) => {
    const lamin = Number(req.query.lamin ?? -85);
    const lomin = Number(req.query.lomin ?? -180);
    const lamax = Number(req.query.lamax ?? 85);
    const lomax = Number(req.query.lomax ?? 180);
    const zoom = Number(req.query.zoom ?? 6);
    const maxTier = zoom >= 8.5 ? 3 : zoom >= 5.5 ? 2 : 1;

    const all = await getGlobalAirports();
    const inBox = all
      .filter(
        (a) =>
          a.tier <= maxTier &&
          a.lat >= lamin &&
          a.lat <= lamax &&
          a.lon >= lomin &&
          a.lon <= lomax,
      )
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (Boolean(a.iata) !== Boolean(b.iata)) return a.iata ? -1 : 1;
        return a.icao.localeCompare(b.icao);
      })
      .slice(0, 180);

    res.json({airports: inBox, maxTier, totalInViewport: inBox.length});
  });

  // 2d. Detailed Vectorized Airfield Surface (OSM Terminals, Aprons, Stands & Taxiways + Collinear Runway Alignment)
  router.get('/surface', async (req, res) => {
    const rawCode = String(req.query.icao ?? '').trim().toUpperCase();
    const catalog = AIRPORT_CATALOG.find((a) => a.icao === rawCode || a.iata === rawCode);
    let lat = Number(req.query.lat ?? catalog?.lat ?? 0);
    let lon = Number(req.query.lon ?? catalog?.lon ?? 0);
    let icao = catalog?.icao ?? rawCode;
    let iata = catalog?.iata ?? '';

    if ((!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) && rawCode) {
      const allAirports = await getGlobalAirports();
      const dirMatch = allAirports.find(
        (a) => a.icao.toUpperCase() === rawCode || (Boolean(a.iata) && a.iata.toUpperCase() === rawCode),
      );
      if (dirMatch) {
        lat = dirMatch.lat;
        lon = dirMatch.lon;
        icao = dirMatch.icao;
        iata = dirMatch.iata;
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      res.status(400).json({error: 'Missing coordinates or airport ICAO'});
      return;
    }

    const cacheKey = icao || `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = surfaceCache.get(cacheKey);
    const cacheTtlMs =
      cached && cached.data.source === 'osm-overpass' && cached.data.taxiways.length > 0
        ? 86400000
        : 45000;
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      res.json(cached.data);
      return;
    }

    let aprons: Array<Array<[number, number]>> = [];
    let labeledAprons: AirfieldPolygonFeature[] = [];
    let terminals: AirfieldPolygonFeature[] = [];
    let stands: AirfieldStandFeature[] = [];
    let holdingPositions: NonNullable<AirfieldSurfaceData['holdingPositions']> = [];
    let osmRunways: TaxiwaySegment[] = [];
    let taxiways: TaxiwaySegment[] = [];
    let gates: AirfieldSurfaceGate[] = [];
    let osmSucceeded = false;

    const osmPromise = (async () => {
      const q = buildOverpassAirfieldQuery(lat, lon);
      try {
        const json = await Promise.any(
          GLOBAL_OVERPASS_MIRRORS.map(async (endpoint) => {
            const osmRes = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                'User-Agent': API_USER_AGENT,
              },
              body: `data=${encodeURIComponent(q)}`,
              signal: AbortSignal.timeout(10500),
            });
            if (!osmRes.ok) throw new Error(`HTTP ${osmRes.status}`);
            const parsed = (await osmRes.json()) as {elements?: OverpassElement[]};
            if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
              throw new Error('Empty Overpass payload');
            }
            return parsed;
          }),
        );

        const parsed = parseOverpassAirfieldElements(json.elements ?? []);
        osmRunways = parsed.osmRunways;
        taxiways = parsed.taxiways.slice(0, 2600);
        aprons = parsed.aprons;
        labeledAprons = parsed.labeledAprons;
        terminals = parsed.terminals;
        stands = parsed.stands;
        holdingPositions = parsed.holdingPositions;
        gates = parsed.gates;
        osmSucceeded =
          osmRunways.length > 0 || taxiways.length > 0 || aprons.length > 0 || terminals.length > 0;
      } catch {
        // fallback to AIP + synthesized airfield layout
      }
    })();

    const aipMapPromise = getGlobalRunwaysByAirport();
    await Promise.all([osmPromise, aipMapPromise]);
    const aipMap = await aipMapPromise;

    const lookupIdents = [catalog?.icao, icao].filter(Boolean) as string[];
    let aipRunways: AipRunwayEntry[] = [];
    for (const ident of lookupIdents) {
      const found = aipMap.get(ident);
      if (found && found.length > 0) {
        aipRunways = found;
        break;
      }
    }

    const runways = mergeAndAlignRunways(
      osmRunways,
      aipRunways.map((r) => ({
        ref: r.leIdent && r.heIdent ? `${r.leIdent}/${r.heIdent}` : r.leIdent || r.heIdent || undefined,
        leLat: r.leLat,
        leLon: r.leLon,
        heLat: r.heLat,
        heLon: r.heLon,
        widthM: r.widthM,
      })),
    );

    if (runways.length === 0 && catalog) {
      catalog.runways.forEach((r, idx) => {
        const rad = (r.headingDeg * Math.PI) / 180;
        const halfLenDeg = (r.lengthFt / 6076 / 60) * 0.5;
        const cosLat = Math.cos((catalog.lat * Math.PI) / 180);
        const offsetLon = (idx - (catalog.runways.length - 1) / 2) * 0.012;
        const dLat = Math.cos(rad) * halfLenDeg;
        const dLon = (Math.sin(rad) * halfLenDeg) / cosLat;
        const p1: [number, number] = [catalog.lat - dLat, catalog.lon + offsetLon - dLon];
        const p2: [number, number] = [catalog.lat + dLat, catalog.lon + offsetLon + dLon];
        runways.push({
          id: `cat-rwy-${r.ident}`,
          kind: 'runway',
          ref: r.ident,
          widthM: 45,
          coords: [p1, p2],
        });
      });
    }

    if (taxiways.length === 0 && runways.length > 0) {
      runways.forEach((rw, idx) => {
        if (rw.coords.length < 2) return;
        const p1 = rw.coords[0];
        const p2 = rw.coords[rw.coords.length - 1];
        const cosLat = Math.max(0.2, Math.cos((p1[0] * Math.PI) / 180));
        const dLat = p2[0] - p1[0];
        const dLon = (p2[1] - p1[1]) * cosLat;
        const len = Math.max(1e-5, Math.hypot(dLat, dLon));
        const sideSign = idx % 2 === 0 ? 1 : -1;
        const perpLat = (-dLon / len) * 0.0024 * sideSign;
        const perpLon = ((dLat / len) * 0.0024 * sideSign) / cosLat;
        const twyRef = ['A', 'B', 'C', 'L', 'G', 'H'][idx % 6];
        const t1: [number, number] = [p1[0] + perpLat, p1[1] + perpLon];
        const t2: [number, number] = [p2[0] + perpLat, p2[1] + perpLon];
        taxiways.push({
          id: `syn-twy-${rw.id}-par`,
          kind: 'taxiway',
          ref: twyRef,
          widthM: 22,
          coords: [t1, t2],
        });
        [0.08, 0.34, 0.66, 0.92].forEach((frac, cIdx) => {
          const rx = p1[0] + (p2[0] - p1[0]) * frac;
          const ry = p1[1] + (p2[1] - p1[1]) * frac;
          const tx = t1[0] + (t2[0] - t1[0]) * frac;
          const ty = t1[1] + (t2[1] - t1[1]) * frac;
          taxiways.push({
            id: `syn-twy-${rw.id}-ex-${cIdx}`,
            kind: 'taxiway',
            ref: `${twyRef}${cIdx + 1}`,
            widthM: 18,
            coords: [
              [rx, ry],
              [tx, ty],
            ],
          });
        });
      });
    }

    if (aprons.length === 0 && !osmSucceeded) {
      const aLat = catalog?.lat ?? lat;
      const aLon = catalog?.lon ?? lon;
      const box: Array<[number, number]> = [
        [aLat - 0.0025, aLon - 0.0038],
        [aLat + 0.0025, aLon - 0.0038],
        [aLat + 0.0025, aLon + 0.0038],
        [aLat - 0.0025, aLon + 0.0038],
      ];
      aprons.push(box);
      labeledAprons.push({
        id: 'syn-apron-main',
        ref: 'MAIN APRON',
        coords: box,
        center: [aLat, aLon],
      });
    }

    const result: AirfieldSurfaceData = {
      icao: catalog?.icao ?? icao,
      iata: catalog?.iata ?? iata,
      lat,
      lon,
      aprons,
      labeledAprons,
      terminals,
      stands,
      holdingPositions,
      runways,
      taxiways,
      gates,
      source: osmSucceeded ? 'osm-overpass' : 'catalog',
    };
    surfaceCache.set(cacheKey, {ts: Date.now(), data: result});
    res.json(result);
  });

  // 3. Live ACARS Feed
  router.get('/acars', async (_req, res) => {
    if (acarsCache && Date.now() - acarsCache.ts < 20000) {
      res.json({messages: acarsCache.messages, sourceStatus: acarsCache.sourceStatus, cached: true});
      return;
    }

    const messages: AcarsMessage[] = [];
    let sourceStatus = 'airframes.io live';

    try {
      const msgRes = await fetch('https://api.airframes.io/v1/messages?limit=35', {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
        signal: AbortSignal.timeout(4500),
      });

      if (msgRes.ok) {
        const raw = (await msgRes.json()) as Array<Record<string, unknown>> | {data?: Array<Record<string, unknown>>; messages?: Array<Record<string, unknown>>};
        const rows = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : Array.isArray(raw.messages) ? raw.messages : [];
        for (const m of rows) {
          const label = String(m.label ?? 'GEN');
          const text = String(m.text ?? m.message ?? '');
          const classified = classifyAcarsLabel(label, text);
          const flightObj = (m.flight ?? {}) as Record<string, unknown>;
          const callsign = String(flightObj.callsign ?? m.flight_id ?? m.callsign ?? m.tail ?? 'ACARS').trim().toUpperCase();
          const tsRaw = String(m.timestamp ?? m.created_at ?? new Date().toISOString());
          messages.push({
            id: String(m.id ?? `${callsign}-${tsRaw}`),
            timestamp: tsRaw,
            epochMs: Date.parse(tsRaw) || Date.now(),
            flightNumber: String(flightObj.flight_number ?? callsign),
            callsign,
            tail: String(m.tail ?? flightObj.tail ?? ''),
            airlineIcao: airlineIcaoFromCallsign(callsign),
            label,
            labelName: classified.name,
            frequencyMhz: String(m.freq ?? m.frequency ?? '131.550'),
            stationId: String(m.station_id ?? m.station ?? 'VDL2'),
            rawText: text || `[${label}] Empty payload`,
            decodedSummary: classified.summary,
            category: classified.category,
            source: 'airframes.io',
          });
        }
      } else {
        const fltRes = await fetch('https://api.airframes.io/v1/flights/active?limit=25', {
          headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
          signal: AbortSignal.timeout(4000),
        });
        if (fltRes.ok) {
          const fJson = (await fltRes.json()) as Array<Record<string, unknown>> | {data?: Array<Record<string, unknown>>};
          const rows = Array.isArray(fJson) ? fJson : Array.isArray(fJson.data) ? fJson.data : [];
          for (const f of rows) {
            const callsign = String(f.callsign ?? f.flight ?? f.tail ?? 'DATALINK').trim().toUpperCase();
            const tsRaw = String(f.last_message_at ?? f.updated_at ?? new Date().toISOString());
            const tail = String(f.tail ?? f.registration ?? '');
            const dep = String(f.departure ?? f.origin ?? '');
            const arr = String(f.arrival ?? f.destination ?? '');
            messages.push({
              id: String(f.id ?? `${callsign}-${tsRaw}`),
              timestamp: tsRaw,
              epochMs: Date.parse(tsRaw) || Date.now(),
              flightNumber: callsign,
              callsign,
              tail,
              airlineIcao: airlineIcaoFromCallsign(callsign),
              label: 'OOOI',
              labelName: 'Active VDL2 Session',
              frequencyMhz: '136.975',
              stationId: 'AIRFRAMES',
              rawText: `FLT ${callsign} REG/${tail || 'N/A'} ${dep && arr ? `RTE ${dep}-${arr}` : 'ACTIVE DATALINK'}`,
              decodedSummary: dep && arr ? `Active ACARS link on route ${dep} to ${arr}` : 'Active ACARS/VDL2 transponder link',
              category: 'OOOI',
              source: 'airframes.io',
            });
          }
          sourceStatus = 'airframes.io active-flights';
        } else {
          sourceStatus = `airframes.io HTTP ${msgRes.status}`;
        }
      }
    } catch (err) {
      sourceStatus = err instanceof Error ? `airframes.io unavailable (${err.message})` : 'airframes.io unavailable';
    }

    if (messages.length > 0) {
      acarsCache = {ts: Date.now(), messages, sourceStatus};
    } else if (acarsCache) {
      res.json({messages: acarsCache.messages, sourceStatus: `${sourceStatus} (cached)`, cached: true});
      return;
    }

    res.json({messages, sourceStatus, cached: false});
  });

  // 4. Live AviationWeather.gov METAR + TAF + Runway Conditions
  router.get('/weather', async (req, res) => {
    const icaosParam = String(
      req.query.icaos ?? 'ZBAA,ZBAD,ZSPD,ZSSS,ZGGG,ZGSZ,ZUUU,VHHH,RJTT,RKSI,KJFK,KLAX,EGLL,EDDF',
    )
      .toUpperCase()
      .replace(/[^A-Z,]/g, '');

    const cached = weatherCache.get(icaosParam);
    if (cached && Date.now() - cached.ts < 60000) {
      res.json({airports: cached.data, cached: true});
      return;
    }

    try {
      const [metarRes, tafRes] = await Promise.all([
        fetch(`https://aviationweather.gov/api/data/metar?ids=${icaosParam}&format=json`, {
          headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
          signal: AbortSignal.timeout(5500),
        }).catch(() => null),
        fetch(`https://aviationweather.gov/api/data/taf?ids=${icaosParam}&format=json`, {
          headers: {'User-Agent': API_USER_AGENT, Accept: 'application/json'},
          signal: AbortSignal.timeout(5500),
        }).catch(() => null),
      ]);

      const metars = (await safeJson<Array<Record<string, unknown>>>(metarRes)) ?? [];
      const tafs = (await safeJson<Array<Record<string, unknown>>>(tafRes)) ?? [];
      const tafMap = new Map<string, string>();
      for (const t of tafs) {
        const id = String(t.icaoId ?? '').toUpperCase();
        if (id && t.rawTAF) tafMap.set(id, String(t.rawTAF));
      }

      const airports: AirportWeather[] = metars.map((m) => {
        const icao = String(m.icaoId ?? '').toUpperCase();
        const catalog = AIRPORT_CATALOG.find((a) => a.icao === icao);
        const windDir = m.wdir !== null && m.wdir !== undefined && m.wdir !== 'VRB' ? Number(m.wdir) : null;
        const windSpeed = Number(m.wspd ?? 0) || 0;
        const windGust = m.wgst !== null && m.wgst !== undefined ? Number(m.wgst) : null;
        const rawMetar = String(m.rawOb ?? '');
        const wxString = String(m.wxString ?? '');

        let ceilingFt: number | null = null;
        if (Array.isArray(m.clouds)) {
          for (const c of m.clouds as Array<Record<string, unknown>>) {
            const cover = String(c.cover ?? '');
            const base = Number(c.base ?? 99999);
            if ((cover === 'BKN' || cover === 'OVC' || cover === 'VV') && Number.isFinite(base)) {
              ceilingFt = ceilingFt === null ? base : Math.min(ceilingFt, base);
            }
          }
        }

        const visibRaw = m.visib;
        const visibilitySm =
          typeof visibRaw === 'string' && visibRaw.includes('+')
            ? 10
            : Number.isFinite(Number(visibRaw))
              ? Number(visibRaw)
              : null;

        return {
          icao,
          iata: catalog?.iata ?? icao.slice(1),
          name: catalog?.name ?? String(m.name ?? icao),
          city: catalog?.city ?? '',
          country: catalog?.country ?? '',
          lat: Number(m.lat ?? catalog?.lat ?? 0),
          lon: Number(m.lon ?? catalog?.lon ?? 0),
          rawMetar,
          flightCategory: (String(m.fltCat ?? 'UNK').toUpperCase() as AirportWeather['flightCategory']) || 'UNK',
          windDirDeg: Number.isFinite(windDir) ? windDir : null,
          windSpeedKts: windSpeed,
          windGustKts: windGust,
          visibilitySm,
          ceilingFt,
          tempC: m.temp !== null && m.temp !== undefined ? Number(m.temp) : null,
          dewpointC: m.dewp !== null && m.dewp !== undefined ? Number(m.dewp) : null,
          altimeterHpa: m.altim !== null && m.altim !== undefined ? Number(m.altim) : null,
          wxString,
          tafRaw: tafMap.get(icao) ?? '',
          observedAt: String(m.reportTime ?? new Date().toISOString()),
          runways: computeRunways(icao, Number.isFinite(windDir) ? windDir : null, windSpeed, wxString, rawMetar),
        };
      });

      if (airports.length > 0) {
        weatherCache.set(icaosParam, {ts: Date.now(), data: airports});
      }
      res.json({airports, cached: false});
    } catch (err) {
      if (cached) {
        res.json({airports: cached.data, cached: true});
        return;
      }
      res.status(502).json({
        airports: [],
        error: err instanceof Error ? err.message : 'Weather feed unavailable',
      });
    }
  });

  // 5. Live Weather Hazards (NOAA SIGMETs + G-AIRMET Turbulence/Icing/Advisories + RainViewer)
  router.get('/weather/hazards', async (_req, res) => {
    if (hazardsCache && Date.now() - hazardsCache.ts < 60000) {
      res.json({sigmets: hazardsCache.sigmets, rainviewer: hazardsCache.rainviewer, cached: true});
      return;
    }

    const [airSigRes, iSigRes, gAirRes, rvRes] = await Promise.all([
      fetch('https://aviationweather.gov/api/data/airsigmet?format=json', {
        headers: {'User-Agent': API_USER_AGENT},
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
      fetch('https://aviationweather.gov/api/data/isigmet?format=json', {
        headers: {'User-Agent': API_USER_AGENT},
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
      fetch('https://aviationweather.gov/api/data/gairmet?format=json', {
        headers: {'User-Agent': API_USER_AGENT},
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
      fetch('https://api.rainviewer.com/public/weather-maps.json', {
        headers: {'User-Agent': API_USER_AGENT},
        signal: AbortSignal.timeout(4000),
      }).catch(() => null),
    ]);

    const classifyHazard = (haz: string, raw: string): HazardCategory => {
      const text = `${haz} ${raw}`.toUpperCase();
      if (/TURB|LLWS|MTW|CAT/.test(text)) return 'turbulence';
      if (/ICE|ICG|FZLVL|FZL|MIX|CLR/.test(text)) return 'icing';
      return 'advisory';
    };

    const sigmets: SigmetHazard[] = [];
    const ingestSigmetList = (rows: Array<Record<string, unknown>>, source: string) => {
      for (const r of rows) {
        const rawCoords = Array.isArray(r.coords) ? (r.coords as Array<Record<string, unknown>>) : [];
        const coords: Array<[number, number]> = rawCoords
          .filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon)))
          .map((c) => [Number(c.lat), Number(c.lon)]);
        if (coords.length < 3) continue;
        const hazard = String(r.hazard ?? r.product ?? 'SIGMET').toUpperCase();
        const rawText = String(r.rawAirSigmet ?? r.rawSigmet ?? r.dueTo ?? '');
        sigmets.push({
          id: String(r.airSigmetId ?? r.isigmetId ?? `${source}-${sigmets.length}`),
          hazard,
          qualifier: String(r.severity ?? r.qualifier ?? ''),
          category: classifyHazard(hazard, rawText),
          validFrom: String(r.validTimeFrom ?? r.issueTime ?? ''),
          validTo: String(r.validTimeTo ?? r.expireTime ?? ''),
          baseFt: r.altitudeLow1 !== undefined && r.altitudeLow1 !== null ? Number(r.altitudeLow1) : null,
          topFt: r.altitudeHi1 !== undefined && r.altitudeHi1 !== null ? Number(r.altitudeHi1) : null,
          rawText,
          coords,
          source,
        });
      }
    };

    const airSigData = await safeJson<Array<Record<string, unknown>>>(airSigRes);
    if (Array.isArray(airSigData)) ingestSigmetList(airSigData, 'NOAA AIR/SIGMET');

    const iSigData = await safeJson<Array<Record<string, unknown>>>(iSigRes);
    if (Array.isArray(iSigData)) ingestSigmetList(iSigData, 'NOAA INTL SIGMET');

    const gAirData = await safeJson<Array<Record<string, unknown>>>(gAirRes);
    if (Array.isArray(gAirData)) ingestSigmetList(gAirData.slice(0, 90), 'NOAA G-AIRMET');

    let rainviewer: RainViewerMeta | null = null;
    const rvJson = await safeJson<{
      host?: string;
      radar?: {past?: Array<{time: number; path: string}>; nowcast?: Array<{time: number; path: string}>};
    }>(rvRes);
    if (rvJson) {
      const frames = [...(rvJson.radar?.past ?? []), ...(rvJson.radar?.nowcast ?? [])].slice(-8);
      if (rvJson.host && frames.length > 0) {
        rainviewer = {host: rvJson.host, frames};
      }
    }

    hazardsCache = {ts: Date.now(), sigmets, rainviewer};
    res.json({sigmets, rainviewer, cached: false});
  });

  // 6. Live Disruptions (FAA NAS Status XML + NOAA METAR Weather Impacts)
  router.get('/disruptions', async (_req, res) => {
    if (disruptionsCache && Date.now() - disruptionsCache.ts < 90000) {
      res.json({items: disruptionsCache.items, sources: disruptionsCache.sources, cached: true});
      return;
    }

    const items: AirportDisruption[] = [];
    const sources: string[] = [];

    const hubIcaos = AIRPORT_CATALOG.map((a) => a.icao).join(',');
    const [faaRes, wxRes] = await Promise.all([
      fetch('https://nasstatus.faa.gov/api/airport-status-information', {
        headers: {'User-Agent': API_USER_AGENT, Accept: 'application/xml, text/xml'},
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
      fetch(`https://aviationweather.gov/api/data/metar?ids=${hubIcaos}&format=json`, {
        headers: {'User-Agent': API_USER_AGENT},
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
    ]);

    try {
      if (faaRes && faaRes.ok) {
        sources.push('FAA NAS Status');
        const xml = await faaRes.text();
        const parser = new XMLParser({ignoreAttributes: false});
        const parsed = parser.parse(xml) as {
          AIRPORT_STATUS_INFORMATION?: {
            Update_Time?: string;
            Delay_type?: Array<Record<string, unknown>> | Record<string, unknown>;
          };
        };
        const info = parsed.AIRPORT_STATUS_INFORMATION;
        const updateTime = String(info?.Update_Time ?? new Date().toISOString());
        const delayTypes = Array.isArray(info?.Delay_type)
          ? info.Delay_type
          : info?.Delay_type
            ? [info.Delay_type]
            : [];

        for (const dt of delayTypes) {
          const name = String(dt.Name ?? '');
          const extractList = (key: string) => {
            const container = dt[key] as Record<string, unknown> | undefined;
            if (!container) return [];
            const raw = container.Delay ?? container.Program ?? container.Airport;
            return Array.isArray(raw) ? raw : raw ? [raw] : [];
          };

          for (const g of extractList('Ground_Stop_List') as Array<Record<string, unknown>>) {
            const arpt = String(g.ARPT ?? '');
            if (!arpt) continue;
            items.push({
              id: `GS-${arpt}`,
              icao: arpt.length === 3 ? `K${arpt}` : arpt,
              iata: arpt,
              airportName: `${arpt} Airport`,
              type: 'GS',
              severity: 'HIGH',
              reason: String(g.Reason ?? 'Ground Stop active'),
              avgDelayMinutes: null,
              trend: String(g.End_Time ?? 'Until further notice'),
              updatedAt: updateTime,
              source: 'FAA NAS',
            });
          }

          for (const g of extractList('Ground_Delay_List') as Array<Record<string, unknown>>) {
            const arpt = String(g.ARPT ?? '');
            if (!arpt) continue;
            const avgStr = String(g.Avg ?? '');
            const mins = Number.parseInt(avgStr.replace(/\D+/g, ''), 10) || null;
            items.push({
              id: `GDP-${arpt}`,
              icao: arpt.length === 3 ? `K${arpt}` : arpt,
              iata: arpt,
              airportName: `${arpt} Airport`,
              type: 'GDP',
              severity: 'MEDIUM',
              reason: String(g.Reason ?? 'Ground Delay Program'),
              avgDelayMinutes: mins,
              trend: String(g.Max ?? ''),
              updatedAt: updateTime,
              source: 'FAA NAS',
            });
          }

          for (const g of extractList('Arrival_Departure_Delay_List') as Array<Record<string, unknown>>) {
            const arpt = String(g.ARPT ?? '');
            if (!arpt) continue;
            const arrDep = (g.Arrival_Departure ?? {}) as Record<string, unknown>;
            const minStr = String(arrDep.Min ?? '');
            const maxStr = String(arrDep.Max ?? '');
            const mins = Number.parseInt(maxStr.replace(/\D+/g, ''), 10) || null;
            items.push({
              id: `DLY-${arpt}-${name}`,
              icao: arpt.length === 3 ? `K${arpt}` : arpt,
              iata: arpt,
              airportName: `${arpt} Airport`,
              type: 'DELAY',
              severity: (mins ?? 0) >= 45 ? 'HIGH' : 'MEDIUM',
              reason: String(g.Reason ?? name ?? 'Arrival/Departure delay'),
              avgDelayMinutes: mins,
              trend: minStr && maxStr ? `${minStr}–${maxStr}` : String(arrDep.Trend ?? ''),
              updatedAt: updateTime,
              source: 'FAA NAS',
            });
          }
        }
      }
    } catch {
      // optional
    }

    try {
      const metars = (await safeJson<Array<Record<string, unknown>>>(wxRes)) ?? [];
      if (metars.length > 0) {
        sources.push('NOAA AWC Hub Weather');
        for (const m of metars) {
          const icao = String(m.icaoId ?? '').toUpperCase();
          const cat = String(m.fltCat ?? '').toUpperCase();
          const wx = String(m.wxString ?? '');
          const wspd = Number(m.wspd ?? 0);
          const wgst = Number(m.wgst ?? 0);
          const spec = AIRPORT_CATALOG.find((a) => a.icao === icao);
          if (!spec) continue;

          if (cat === 'IFR' || cat === 'LIFR' || /TS|FZ|SQ|GR|BLSN/i.test(wx) || wgst >= 28 || wspd >= 25) {
            const reasons: string[] = [];
            if (cat === 'LIFR' || cat === 'IFR') reasons.push(`${cat} low ceiling/visibility`);
            if (wx) reasons.push(`Weather: ${wx}`);
            if (wgst >= 28 || wspd >= 25) reasons.push(`Surface winds ${wspd}${wgst ? `G${wgst}` : ''} kt`);

            items.push({
              id: `WX-${icao}`,
              icao,
              iata: spec.iata,
              airportName: spec.name,
              type: 'WX-OPS',
              severity: cat === 'LIFR' || /TS|FZ/i.test(wx) ? 'HIGH' : 'MEDIUM',
              reason: reasons.join(' · '),
              avgDelayMinutes: null,
              trend: 'Live METAR advisory',
              updatedAt: String(m.reportTime ?? new Date().toISOString()),
              source: 'NOAA METAR',
            });
          }
        }
      }
    } catch {
      // ignore
    }

    disruptionsCache = {ts: Date.now(), items, sources};
    res.json({items, sources, cached: false});
  });

  // 7. Airport Surface Taxiing Feed + Runway/Taxiway Geometry
  router.get('/airport-taxi', async (req, res) => {
    const icao = String(req.query.icao ?? 'ZBAA').toUpperCase();
    const spec = AIRPORT_CATALOG.find((a) => a.icao === icao) ?? AIRPORT_CATALOG[0];

    const delta = 0.11;
    const lamin = spec.lat - delta;
    const lamax = spec.lat + delta;
    const lomin = spec.lon - delta;
    const lomax = spec.lon + delta;

    const cachedOsm = taxiwayCache.get(spec.icao);
    const osmPromise: Promise<TaxiwaySegment[]> =
      cachedOsm && Date.now() - cachedOsm.ts < 86400000
        ? Promise.resolve(cachedOsm.segments)
        : (async () => {
            const segments: TaxiwaySegment[] = [];
            try {
              const query = `[out:json][timeout:5];(way["aeroway"~"runway|taxiway"](${(spec.lat - 0.038).toFixed(4)},${(spec.lon - 0.045).toFixed(4)},${(spec.lat + 0.038).toFixed(4)},${(spec.lon + 0.045).toFixed(4)}););out body;>;out skel qt;`;
              const osmRes = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': API_USER_AGENT},
                body: `data=${encodeURIComponent(query)}`,
                signal: AbortSignal.timeout(5000),
              });
              if (osmRes.ok) {
                const osmJson = (await osmRes.json()) as {
                  elements?: Array<{
                    type: string;
                    id: number;
                    lat?: number;
                    lon?: number;
                    nodes?: number[];
                    tags?: Record<string, string>;
                  }>;
                };
                const nodeMap = new Map<number, [number, number]>();
                for (const el of osmJson.elements ?? []) {
                  if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
                    nodeMap.set(el.id, [el.lat, el.lon]);
                  }
                }
                for (const el of osmJson.elements ?? []) {
                  if (el.type === 'way' && Array.isArray(el.nodes)) {
                    const coords = el.nodes.map((nid) => nodeMap.get(nid)).filter((c): c is [number, number] => Boolean(c));
                    if (coords.length >= 2) {
                      const aeroway = el.tags?.aeroway;
                      segments.push({
                        id: `osm-${el.id}`,
                        kind: aeroway === 'runway' ? 'runway' : 'taxiway',
                        ref: el.tags?.ref,
                        coords,
                      });
                    }
                  }
                }
                if (segments.length > 0) {
                  taxiwayCache.set(spec.icao, {ts: Date.now(), segments});
                }
              }
            } catch {
              // ignore
            }
            return segments;
          })();

    const [fr24Res, adsbRes, osmSegments] = await Promise.all([
      fetchFr24Web(lamin, lomin, lamax, lomax),
      fetchAdsbLol(spec.lat, spec.lon, 10),
      osmPromise,
    ]);

    const merged = new Map<string, LiveFlight>();
    for (const f of [...fr24Res.flights, ...adsbRes.flights]) {
      const existing = merged.get(f.icao24 || f.callsign);
      if (!existing) merged.set(f.icao24 || f.callsign, f);
    }

    const allNearby = Array.from(merged.values());
    const groundTraffic = allNearby.filter((f) => f.onGround || f.altitudeFt < spec.elevationFt + 350);

    let segments = osmSegments;
    if (segments.length === 0) {
      segments = spec.runways.map((r, idx) => {
        const rad = (r.headingDeg * Math.PI) / 180;
        const halfLenDeg = (r.lengthFt / 6076 / 60) * 0.5;
        const offsetLon = (idx - (spec.runways.length - 1) / 2) * 0.012;
        const dLat = Math.cos(rad) * halfLenDeg;
        const dLon = (Math.sin(rad) * halfLenDeg) / Math.cos((spec.lat * Math.PI) / 180);
        return {
          id: `cat-rwy-${r.ident}`,
          kind: 'runway',
          ref: r.ident,
          coords: [
            [spec.lat - dLat, spec.lon + offsetLon - dLon],
            [spec.lat + dLat, spec.lon + offsetLon + dLon],
          ],
        };
      });
    }

    res.json({
      airport: spec,
      groundTraffic,
      nearbyAirborne: allNearby.filter((f) => !f.onGround && f.altitudeFt >= spec.elevationFt + 350),
      segments,
      providers: [fr24Res.status, adsbRes.status],
    });
  });

  return router;
}
