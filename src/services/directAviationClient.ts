import {AIRPORT_CATALOG} from '../data/aviationCatalog';
import type {
  AircraftPhoto,
  AirfieldPolygonFeature,
  AirfieldStandFeature,
  AirfieldSurfaceData,
  AirfieldSurfaceGate,
  AirportBoardFlight,
  AirportBoardResponse,
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
} from '../types/aviation';
import {
  buildOverpassAirfieldQuery,
  GLOBAL_OVERPASS_MIRRORS,
  mergeAndAlignRunways,
  parseOverpassAirfieldElements,
  type OverpassElement,
} from '../utils/airfieldGeometry';

let staticHostingDetected = false;
let globalAirportsPromise: Promise<AirportMarker[]> | null = null;
let cachedGlobalAirports: AirportMarker[] | null = null;
const browserTrailMap = new Map<string, TrailPoint[]>();
const browserFlightIndex = new Map<string, LiveFlight>();
const browserSurfaceCache = new Map<string, {ts: number; data: AirfieldSurfaceData}>();
const browserWeatherCache = new Map<string, {ts: number; airports: AirportWeather[]}>();
const browserBoardCache = new Map<string, {ts: number; board: AirportBoardResponse}>();
const browserSafetyCache = new Map<string, {ts: number; data: SafetyRecordResponse}>();
const browserPastCache = new Map<string, {ts: number; items: PastFlightRecord[]}>();
let browserGlobalLolCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let browserGlobalFiCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;

let inFlightFlightsPromise: Promise<FlightsResponse> | null = null;
let lastGoodFlightsSnapshot: {ts: number; data: FlightsResponse} | null = null;
let browserMilCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let browserLaddCache: {ts: number; ac: Array<Record<string, unknown>>; nowSec: number} | null = null;
let staticSnapshotPromise: Promise<LiveFlight[] | null> | null = null;
let cachedStaticSnapshot: {ts: number; flights: LiveFlight[]} | null = null;
let workerCooldownUntil = 0;
let relayQueue: Promise<void> = Promise.resolve();
let flightPollCycle = 0;

export const DEFAULT_CF_WORKER_URL = 'https://royal-cherry-f2c2.feianthony666.workers.dev';

export function isNoWorkerModePreferred(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('noworker') === '1') return true;
    const raw = window.localStorage.getItem('skydeck-radar-settings-v1');
    if (raw) {
      const parsed = JSON.parse(raw) as {preferNoWorkerMode?: boolean};
      if (parsed.preferNoWorkerMode) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

interface CorsRelayState {
  id: string;
  cooldownUntil: number;
  lastUsedAt: number;
  minSpacingMs: number;
  buildUrl: (targetUrl: string) => string;
  unwrap: (rawText: string) => string | null;
}

const CORS_RELAYS: CorsRelayState[] = [
  {
    id: 'cors.lol',
    cooldownUntil: 0,
    lastUsedAt: 0,
    minSpacingMs: 2600,
    buildUrl: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    unwrap: (t) => t,
  },
  {
    id: 'allorigins-raw',
    cooldownUntil: 0,
    lastUsedAt: 0,
    minSpacingMs: 1200,
    buildUrl: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    unwrap: (t) => t,
  },
  {
    id: 'allorigins-get',
    cooldownUntil: 0,
    lastUsedAt: 0,
    minSpacingMs: 1200,
    buildUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    unwrap: (t) => {
      try {
        const j = JSON.parse(t) as {contents?: string; status?: {http_code?: number}};
        if (typeof j.contents === 'string' && j.contents.length > 0) {
          if (j.status?.http_code && j.status.http_code >= 400) return null;
          return j.contents;
        }
      } catch {
        return null;
      }
      return null;
    },
  },
];

function isInvalidProxyPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('<')) return true;
  if (/rate limit exceeded|api key is required|corsfix_error|domain_not_registered/i.test(trimmed.slice(0, 260))) {
    return true;
  }
  return false;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function getCloudflareWorkerUrl(): string {
  if (typeof window === 'undefined') return '';
  if (isNoWorkerModePreferred()) return '';
  const cleanWorker = (u: string) => normalizeBaseUrl(u).replace(/\?url=.*$/i, '');
  try {
    const qs = new URLSearchParams(window.location.search);
    const paramW = qs.get('worker') ? cleanWorker(qs.get('worker')!) : '';
    if (paramW && /^https?:\/\//i.test(paramW)) {
      window.localStorage.setItem('skydeck-cf-worker', paramW);
      return paramW;
    }
    const stored = cleanWorker(window.localStorage.getItem('skydeck-cf-worker') ?? '');
    if (stored && /^https?:\/\//i.test(stored)) return stored;

    const settingsRaw = window.localStorage.getItem('skydeck-radar-settings-v1');
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw) as {cfWorkerUrl?: string; apiBaseUrl?: string};
      const w = parsed.cfWorkerUrl ? cleanWorker(parsed.cfWorkerUrl) : '';
      if (w && /^https?:\/\//i.test(w)) return w;
      if (parsed.apiBaseUrl && /\.workers\.dev/i.test(parsed.apiBaseUrl)) {
        return cleanWorker(parsed.apiBaseUrl);
      }
    }
    const legacyApi = window.localStorage.getItem('skydeck-api-base') ?? '';
    if (/\.workers\.dev/i.test(legacyApi)) {
      return cleanWorker(legacyApi);
    }
  } catch {
    // ignore
  }
  const envWorker =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as {env?: Record<string, string | undefined>}).env?.VITE_CF_WORKER_URL;
  return cleanWorker(envWorker || DEFAULT_CF_WORKER_URL);
}

function getCustomApiBase(): string {
  if (typeof window === 'undefined') return '';
  const normalize = (u: string) => u.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  try {
    const qs = new URLSearchParams(window.location.search);
    const paramApi = qs.get('api') ? normalize(qs.get('api')!) : '';
    if (paramApi && /^https?:\/\//i.test(paramApi) && !/\.workers\.dev/i.test(paramApi)) {
      window.localStorage.setItem('skydeck-api-base', paramApi);
      return paramApi;
    }
    const stored = normalize(window.localStorage.getItem('skydeck-api-base') ?? '');
    if (stored && /^https?:\/\//i.test(stored) && !/\.workers\.dev/i.test(stored)) return stored;
    const settingsRaw = window.localStorage.getItem('skydeck-radar-settings-v1');
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw) as {apiBaseUrl?: string};
      const val = parsed.apiBaseUrl ? normalize(parsed.apiBaseUrl) : '';
      if (val && /^https?:\/\//i.test(val) && !/\.workers\.dev/i.test(val)) return val;
    }
  } catch {
    // ignore
  }
  return '';
}

function withRelayQueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = relayQueue.then(fn, fn);
  relayQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchTextViaCorsRelay(targetUrl: string, timeoutMs = 8000): Promise<string | null> {
  const cfWorker = Date.now() >= workerCooldownUntil ? getCloudflareWorkerUrl() : '';
  if (cfWorker) {
    try {
      const workerReqUrl = `${cfWorker}/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(workerReqUrl, {signal: AbortSignal.timeout(timeoutMs)});
      if (res.ok) {
        const raw = await res.text();
        if (raw && !/^rate limit exceeded|corsfix_error|domain_not_registered/i.test(raw.trim().slice(0, 200))) {
          return raw;
        }
      }
    } catch {
      workerCooldownUntil = Date.now() + 45000;
    }
  }

  return withRelayQueue(async () => {
    const now = Date.now();
    for (const relay of CORS_RELAYS) {
      if (now < relay.cooldownUntil) continue;
      const waitMs = relay.lastUsedAt + relay.minSpacingMs - Date.now();
      if (waitMs > 0) {
        if (waitMs > 1800) continue;
        await new Promise((r) => setTimeout(r, waitMs));
      }
      relay.lastUsedAt = Date.now();
      try {
        const res = await fetch(relay.buildUrl(targetUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          relay.cooldownUntil = Date.now() + (res.status === 429 ? 35000 : 60000);
          continue;
        }
        if (!res.ok) {
          relay.cooldownUntil = Date.now() + 20000;
          continue;
        }
        const raw = await res.text();
        const unwrapped = relay.unwrap(raw);
        if (!unwrapped || unwrapped.trim().length === 0) {
          relay.cooldownUntil = Date.now() + 20000;
          continue;
        }
        return unwrapped;
      } catch {
        relay.cooldownUntil = Date.now() + 20000;
      }
    }
    return null;
  });
}

async function fetchJsonViaCorsRelay<T>(targetUrl: string, timeoutMs = 8000): Promise<T | null> {
  // 1. User's Cloudflare Worker CORS Proxy (skipped if No-Worker mode or cooldown active)
  const cfWorker = Date.now() >= workerCooldownUntil ? getCloudflareWorkerUrl() : '';
  if (cfWorker) {
    try {
      const workerReqUrl = `${cfWorker}/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(workerReqUrl, {signal: AbortSignal.timeout(timeoutMs)});
      if (res.ok) {
        const raw = await res.text();
        if (raw && !isInvalidProxyPayload(raw)) {
          return JSON.parse(raw) as T;
        }
      }
    } catch {
      workerCooldownUntil = Date.now() + 45000;
    }
  }

  // 2. Fallback Paced Public CORS Relays (non-worker hosts)
  return withRelayQueue(async () => {
    const now = Date.now();
    for (const relay of CORS_RELAYS) {
      if (now < relay.cooldownUntil) continue;
      const waitMs = relay.lastUsedAt + relay.minSpacingMs - Date.now();
      if (waitMs > 0) {
        if (waitMs > 1800) continue;
        await new Promise((r) => setTimeout(r, waitMs));
      }
      relay.lastUsedAt = Date.now();
      try {
        const res = await fetch(relay.buildUrl(targetUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          relay.cooldownUntil = Date.now() + (res.status === 429 ? 35000 : 60000);
          continue;
        }
        if (!res.ok) {
          relay.cooldownUntil = Date.now() + 20000;
          continue;
        }
        const raw = await res.text();
        const unwrapped = relay.unwrap(raw);
        if (!unwrapped || isInvalidProxyPayload(unwrapped)) {
          relay.cooldownUntil = Date.now() + 20000;
          continue;
        }
        return JSON.parse(unwrapped) as T;
      } catch {
        relay.cooldownUntil = Date.now() + 20000;
      }
    }
    return null;
  });
}

async function fetchStaticSnapshotFlights(): Promise<LiveFlight[]> {
  if (cachedStaticSnapshot && Date.now() - cachedStaticSnapshot.ts < 300000) {
    return cachedStaticSnapshot.flights;
  }
  if (!staticSnapshotPromise) {
    staticSnapshotPromise = fetch('./flights/latest.json', {signal: AbortSignal.timeout(6000)})
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as {flights?: LiveFlight[]};
        if (Array.isArray(json.flights) && json.flights.length > 0) {
          cachedStaticSnapshot = {ts: Date.now(), flights: json.flights};
          return json.flights;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        staticSnapshotPromise = null;
      });
  }
  return (await staticSnapshotPromise) ?? [];
}

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
    const callsign = String((hasRadarPrefix ? arr[16] : arr[15]) ?? flightNumber ?? icao24)
      .trim()
      .toUpperCase();
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

function parseAdsbExchangeList(
  rows: Array<Record<string, unknown>>,
  source: 'adsb.lol' | 'adsb.fi',
  nowSec: number,
  forceFlagBits = 0,
): LiveFlight[] {
  return rows
    .filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)))
    .map((a) => {
      const icao24 = String(a.hex ?? '').toUpperCase();
      const callsign = String(a.flight ?? a.r ?? icao24).trim().toUpperCase();
      const onGround = a.alt_baro === 'ground' || Number(a.alt_baro ?? 0) <= 0;
      const altFt = onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0;
      const dbFlags = (Number(a.dbFlags ?? 0) || 0) | forceFlagBits;
      const isMilitary = (dbFlags & 1) !== 0;
      const isPia = (dbFlags & 4) !== 0;
      const isLadd = (dbFlags & 8) !== 0;
      return {
        id: icao24,
        icao24,
        callsign,
        flightNumber: callsign,
        registration: String(a.r ?? ''),
        airlineIcao: airlineIcaoFromCallsign(callsign) || (isMilitary ? 'MIL' : isLadd ? 'LADD' : ''),
        airlineName: String(a.ownOp ?? '') || airlineIcaoFromCallsign(callsign),
        aircraftType: String(a.t ?? (isLadd ? 'GLF6' : isMilitary ? 'F16' : 'A320')).toUpperCase(),
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
        source,
        isEstimated: false,
        uncertaintyNm: 0,
        dbFlags,
        isMilitary,
        isPia,
        isLadd,
        ownerOperator: a.ownOp ? String(a.ownOp) : undefined,
      };
    });
}

function recordBrowserBreadcrumb(f: LiveFlight) {
  const key = f.icao24 || f.id;
  browserFlightIndex.set(key, f);
  const existing = browserTrailMap.get(key) ?? [];
  const last = existing[existing.length - 1];
  if (last) {
    const dLat = Math.abs(last.lat - f.lat);
    const dLon = Math.abs(last.lon - f.lon);
    const dt = Math.max(1, Math.abs(f.lastContactEpoch - last.ts));
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
  browserTrailMap.set(key, existing);
}

async function getBrowserGlobalAirports(): Promise<AirportMarker[]> {
  if (cachedGlobalAirports) return cachedGlobalAirports;
  if (globalAirportsPromise) return globalAirportsPromise;

  globalAirportsPromise = (async () => {
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
        signal: AbortSignal.timeout(9000),
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
            if (type !== 'large_airport' && type !== 'medium_airport' && type !== 'small_airport') continue;
            const lat = Number(cols[idxLat]);
            const lon = Number(cols[idxLon]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            const iata = (cols[idxIata] ?? '').trim().toUpperCase();
            const icao = (cols[idxIcao] || cols[idxGps] || cols[idxIdent] || '').trim().toUpperCase();
            if (!icao && !iata) continue;
            const sched = (cols[idxSched] ?? '').trim().toLowerCase() === 'yes';
            if (type === 'small_airport' && !iata && !sched && !/^[A-Z]{4}$/.test(icao)) continue;

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
      // keep catalog airports
    }

    const list = Array.from(seeded.values());
    cachedGlobalAirports = list;
    return list;
  })();

  return globalAirportsPromise;
}

interface DirectAipRunwayEntry {
  airportIdent: string;
  leIdent: string;
  heIdent: string;
  leLat: number;
  leLon: number;
  heLat: number;
  heLon: number;
  widthM: number;
}
let directRunwaysPromise: Promise<Map<string, DirectAipRunwayEntry[]>> | null = null;
let cachedDirectRunways: {ts: number; map: Map<string, DirectAipRunwayEntry[]>} | null = null;

async function getBrowserGlobalRunways(): Promise<Map<string, DirectAipRunwayEntry[]>> {
  if (cachedDirectRunways) {
    const ttl = cachedDirectRunways.map.size > 0 ? 86400000 : 300000;
    if (Date.now() - cachedDirectRunways.ts < ttl) return cachedDirectRunways.map;
  }
  if (directRunwaysPromise) return directRunwaysPromise;

  directRunwaysPromise = (async () => {
    const byAirport = new Map<string, DirectAipRunwayEntry[]>();
    try {
      const cfWorker = getCloudflareWorkerUrl();
      const target = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
      let res = await fetch(target, {signal: AbortSignal.timeout(4500)}).catch(() => null);
      if ((!res || !res.ok) && cfWorker) {
        res = await fetch(`${cfWorker}/?url=${encodeURIComponent(target)}`, {
          signal: AbortSignal.timeout(4500),
        }).catch(() => null);
      }
      if (res && res.ok) {
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
            if ((cols[idxClosed] ?? '0').trim() === '1') continue;
            const airportIdent = (cols[idxIdent] ?? '').trim().toUpperCase();
            if (!airportIdent) continue;
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
            const widthFt = Number(cols[idxWidth]);
            const entry: DirectAipRunwayEntry = {
              airportIdent,
              leIdent: (cols[idxLeIdent] ?? '').trim().toUpperCase(),
              heIdent: (cols[idxHeIdent] ?? '').trim().toUpperCase(),
              leLat,
              leLon,
              heLat,
              heLon,
              widthM: Number.isFinite(widthFt) && widthFt > 20 ? Math.round(widthFt * 0.3048) : 45,
            };
            const arr = byAirport.get(airportIdent);
            if (arr) arr.push(entry);
            else byAirport.set(airportIdent, [entry]);
          }
        }
      }
    } catch {
      // optional
    }
    cachedDirectRunways = {ts: Date.now(), map: byAirport};
    return byAirport;
  })().finally(() => {
    directRunwaysPromise = null;
  });

  return directRunwaysPromise;
}

async function fetchNativeCorsJson<T>(url: string, timeoutMs = 6500): Promise<T | null> {
  try {
    const res = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchDirectFlights(params: URLSearchParams): Promise<FlightsResponse> {
  if (inFlightFlightsPromise) return inFlightFlightsPromise;

  const task = (async (): Promise<FlightsResponse> => {
    const lamin = Math.max(-85, Number(params.get('lamin') ?? 18));
    const lomin = Math.max(-180, Number(params.get('lomin') ?? 98));
    const lamax = Math.min(85, Number(params.get('lamax') ?? 43));
    const lomax = Math.min(180, Number(params.get('lomax') ?? 126));

    const isGlobal = lamax - lamin >= 150 && lomax - lomin >= 320;
    const noWorker = isNoWorkerModePreferred();

    const centerLat = (lamin + lamax) / 2;
    const centerLon = (lomin + lomax) / 2;
    const latSpanNm = Math.abs(lamax - lamin) * 60;
    const lonSpanNm = Math.abs(lomax - lomin) * 60 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
    const radiusNm = Math.min(250, Math.max(50, Math.round(Math.hypot(latSpanNm, lonSpanNm) / 2)));

    const osMinLat = Math.max(-85, Math.max(lamin, centerLat - 24));
    const osMaxLat = Math.min(85, Math.min(lamax, centerLat + 24));
    const osMinLon = Math.max(-180, Math.max(lomin, centerLon - 34));
    const osMaxLon = Math.min(180, Math.min(lomax, centerLon + 34));

    const latSpan = lamax - lamin;
    const lonSpan = lomax - lomin;
    const frMinLat = Math.max(-85, lamin);
    const frMaxLat = Math.min(85, lamax);
    const frMinLon = Math.max(-180, lomin);
    const frMaxLon = Math.min(180, lomax);

    flightPollCycle++;
    const providers: ProviderStatus[] = [];

    // 1. Direct native-CORS OpenSky fetch (zero worker / zero CORS issues)
    const openSkyPromise = (async (): Promise<LiveFlight[]> => {
      const t0 = Date.now();
      try {
        const url = isGlobal
          ? 'https://opensky-network.org/api/states/all'
          : `https://opensky-network.org/api/states/all?lamin=${osMinLat.toFixed(2)}&lomin=${osMinLon.toFixed(2)}&lamax=${osMaxLat.toFixed(2)}&lomax=${osMaxLon.toFixed(2)}`;
        const res = await fetch(url, {signal: AbortSignal.timeout(12000)});
        if (!res.ok) {
          providers.push({
            provider: 'opensky',
            ok: false,
            count: 0,
            latencyMs: Date.now() - t0,
            note: `HTTP ${res.status}`,
          });
          return [];
        }
        const json = (await res.json()) as {states?: Array<unknown[]>; time?: number};
        const nowSec = json.time ?? Math.floor(Date.now() / 1000);
        const list: LiveFlight[] = [];
        const sliceLimit = isGlobal ? 4500 : 1800;
        for (const s of (json.states ?? []).slice(0, sliceLimit)) {
          const lat = Number(s[6]);
          const lon = Number(s[5]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const icao24 = String(s[0] ?? '').toUpperCase();
          const callsign = String(s[1] ?? icao24).trim().toUpperCase();
          const altM = Number(s[7] ?? s[13] ?? 0);
          const velMs = Number(s[9] ?? 0);
          const vrateMs = Number(s[11] ?? 0);
          list.push({
            id: icao24,
            icao24,
            callsign: callsign || icao24,
            flightNumber: callsign || icao24,
            registration: '',
            airlineIcao: airlineIcaoFromCallsign(callsign),
            airlineName: airlineIcaoFromCallsign(callsign),
            aircraftType: 'A320',
            lat,
            lon,
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
          });
        }
        providers.push({
          provider: 'opensky',
          ok: true,
          count: list.length,
          latencyMs: Date.now() - t0,
        });
        return list;
      } catch (err) {
        providers.push({
          provider: 'opensky',
          ok: false,
          count: 0,
          latencyMs: Date.now() - t0,
          note: err instanceof Error ? err.message : 'Timeout',
        });
        return [];
      }
    })();

    // 2. Native-CORS adsb.lol & adsb.fi direct browser calls (No worker required!)
    const directAdsbPromise = (async (): Promise<LiveFlight[]> => {
      const t0 = Date.now();
      const nowMs = Date.now();
      const needMil = !browserMilCache || nowMs - browserMilCache.ts >= 15000;
      const needLadd = !browserLaddCache || nowMs - browserLaddCache.ts >= 18000;
      const lolUrl = isGlobal
        ? 'https://api.adsb.lol/v2/all'
        : `https://api.adsb.lol/v2/point/${centerLat.toFixed(3)}/${centerLon.toFixed(3)}/${radiusNm}`;
      const fiUrl = isGlobal
        ? 'https://opendata.adsb.fi/api/v2/all'
        : `https://opendata.adsb.fi/api/v2/lat/${centerLat.toFixed(3)}/lon/${centerLon.toFixed(3)}/dist/${radiusNm}`;

      const useCachedGlobalLol = isGlobal && browserGlobalLolCache && nowMs - browserGlobalLolCache.ts < 12000;
      const useCachedGlobalFi = isGlobal && browserGlobalFiCache && nowMs - browserGlobalFiCache.ts < 12000;

      const [lolJson, milJson, laddJson, fiJson] = await Promise.all([
        useCachedGlobalLol
          ? Promise.resolve({ac: browserGlobalLolCache!.ac, now: browserGlobalLolCache!.nowSec * 1000})
          : fetchNativeCorsJson<{ac?: Array<Record<string, unknown>>; now?: number}>(lolUrl, isGlobal ? 9000 : 6500),
        needMil
          ? fetchNativeCorsJson<{ac?: Array<Record<string, unknown>>; now?: number}>('https://api.adsb.lol/v2/mil', 6500)
          : Promise.resolve(null),
        needLadd
          ? fetchNativeCorsJson<{ac?: Array<Record<string, unknown>>; now?: number}>('https://api.adsb.lol/v2/ladd', 6500)
          : Promise.resolve(null),
        useCachedGlobalFi
          ? Promise.resolve<{ac?: Array<Record<string, unknown>>; aircraft?: Array<Record<string, unknown>>; now?: number}>({
              aircraft: browserGlobalFiCache!.ac,
              now: browserGlobalFiCache!.nowSec * 1000,
            })
          : fetchNativeCorsJson<{ac?: Array<Record<string, unknown>>; aircraft?: Array<Record<string, unknown>>; now?: number}>(fiUrl, isGlobal ? 9000 : 6500),
      ]);

      if (isGlobal && lolJson?.ac && !useCachedGlobalLol) {
        browserGlobalLolCache = {ts: Date.now(), ac: lolJson.ac, nowSec: Math.floor((lolJson.now ?? Date.now()) / 1000)};
      }
      if (milJson?.ac) {
        browserMilCache = {ts: Date.now(), ac: milJson.ac, nowSec: Math.floor((milJson.now ?? Date.now()) / 1000)};
      }
      if (laddJson?.ac) {
        browserLaddCache = {ts: Date.now(), ac: laddJson.ac, nowSec: Math.floor((laddJson.now ?? Date.now()) / 1000)};
      }
      const fiRows = fiJson?.aircraft ?? fiJson?.ac;
      if (isGlobal && fiRows && !useCachedGlobalFi) {
        browserGlobalFiCache = {ts: Date.now(), ac: fiRows, nowSec: Math.floor((fiJson?.now ?? Date.now()) / 1000)};
      }

      const out: LiveFlight[] = [];
      if (lolJson?.ac) {
        const parsed = parseAdsbExchangeList(lolJson.ac, 'adsb.lol', Math.floor((lolJson.now ?? Date.now()) / 1000));
        out.push(...parsed);
        providers.push({provider: 'adsb.lol-direct', ok: parsed.length > 0, count: parsed.length, latencyMs: Date.now() - t0});
      }
      if (browserLaddCache?.ac) {
        const laddRows = isGlobal
          ? browserLaddCache.ac
          : browserLaddCache.ac.filter((a) => {
              const lat = Number(a.lat);
              const lon = Number(a.lon);
              return Number.isFinite(lat) && Number.isFinite(lon) && lat >= lamin - 1 && lat <= lamax + 1 && lon >= lomin - 1 && lon <= lomax + 1;
            });
        const laddParsed = parseAdsbExchangeList(laddRows, 'adsb.lol', browserLaddCache.nowSec, 8);
        if (laddParsed.length > 0) {
          out.push(...laddParsed);
          providers.push({provider: 'adsb.lol-ladd', ok: true, count: laddParsed.length, latencyMs: Date.now() - t0});
        }
      }
      if (browserMilCache?.ac) {
        const milRows = isGlobal
          ? browserMilCache.ac
          : browserMilCache.ac.filter((a) => {
              const lat = Number(a.lat);
              const lon = Number(a.lon);
              return Number.isFinite(lat) && Number.isFinite(lon) && lat >= lamin - 1 && lat <= lamax + 1 && lon >= lomin - 1 && lon <= lomax + 1;
            });
        const milParsed = parseAdsbExchangeList(milRows, 'adsb.lol', browserMilCache.nowSec, 1);
        if (milParsed.length > 0) {
          out.push(...milParsed);
          providers.push({provider: 'adsb.lol-mil', ok: true, count: milParsed.length, latencyMs: Date.now() - t0});
        }
      }
      if (fiRows && fiRows.length > 0) {
        const fiParsed = parseAdsbExchangeList(fiRows, 'adsb.fi', Math.floor((fiJson?.now ?? Date.now()) / 1000));
        out.push(...fiParsed);
        providers.push({provider: 'adsb.fi-direct', ok: fiParsed.length > 0, count: fiParsed.length, latencyMs: Date.now() - t0});
      }
      return out;
    })();

    // 3. FR24 Enriched Feed (via Worker or non-worker CORS Relays; always kept active for China even in Strict Wi-Fi / No-Worker Mode)
    const fr24Promise = (async (): Promise<LiveFlight[]> => {
      const makeFr24Url = (bMinLat: number, bMaxLat: number, bMinLon: number, bMaxLon: number) =>
        `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${bMaxLat.toFixed(3)},${bMinLat.toFixed(3)},${bMinLon.toFixed(3)},${bMaxLon.toFixed(3)}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=1&stats=1`;

      const overlapsChina = isGlobal || (lamax >= 15 && lamin <= 56 && lomax >= 70 && lomin <= 140);
      const frOut: LiveFlight[] = [];

      if (!noWorker || overlapsChina) {
        const t0 = Date.now();
        const hasWorker = Boolean(getCloudflareWorkerUrl());
        const frBoxes: Array<[number, number, number, number]> =
          noWorker && isGlobal
            ? [
                [29, 48, 102, 134],
                [17, 31, 74, 126],
              ]
            : isGlobal
              ? [
                  [10, 62, -130, -55],
                  [30, 65, -15, 45],
                  [5, 55, 70, 145],
                  [-45, 15, -80, 160],
                ]
              : noWorker && overlapsChina
                ? [
                    [
                      Math.max(15, frMinLat),
                      Math.min(55, frMaxLat),
                      Math.max(70, frMinLon),
                      Math.min(138, frMaxLon),
                    ],
                  ]
                : latSpan > 16 || lonSpan > 24
                  ? (() => {
                      const mLat = (frMinLat + frMaxLat) / 2;
                      const mLon = (frMinLon + frMaxLon) / 2;
                      return [
                        [frMinLat, mLat, frMinLon, mLon],
                        [frMinLat, mLat, mLon, frMaxLon],
                        [mLat, frMaxLat, frMinLon, mLon],
                        [mLat, frMaxLat, mLon, frMaxLon],
                      ];
                    })()
                  : [[frMinLat, frMaxLat, frMinLon, frMaxLon]];

        if (hasWorker) {
          const frJsonList = await Promise.all(
            frBoxes.map((b) =>
              fetchJsonViaCorsRelay<Record<string, unknown>>(makeFr24Url(b[0], b[1], b[2], b[3]), 8000),
            ),
          );
          for (const frJson of frJsonList) {
            if (!frJson) continue;
            const parsed = parseFr24Feed(frJson);
            if (parsed.length > 0) frOut.push(...parsed);
          }
          providers.push({
            provider: 'fr24-worker',
            ok: frOut.length > 0,
            count: frOut.length,
            latencyMs: Date.now() - t0,
            note: frOut.length === 0 ? 'Worker unavailable or empty' : undefined,
          });
        } else {
          for (const b of frBoxes.slice(0, 2)) {
            const frJson = await fetchJsonViaCorsRelay<Record<string, unknown>>(
              makeFr24Url(b[0], b[1], b[2], b[3]),
              8000,
            );
            if (frJson) {
              const parsed = parseFr24Feed(frJson);
              if (parsed.length > 0) frOut.push(...parsed);
            }
          }
          providers.push({
            provider: noWorker ? 'fr24-china-relay' : 'fr24-relay',
            ok: frOut.length > 0,
            count: frOut.length,
            latencyMs: Date.now() - t0,
            note: noWorker ? 'China FR24 active (Strict Wi-Fi)' : undefined,
          });
        }
      }

      // If strict No-Worker mode OR FR24 relays were blocked/empty, merge same-origin FR24 snapshot for callsign/route enrichment
      if (noWorker || frOut.length === 0) {
        const snap = await fetchStaticSnapshotFlights();
        if (snap.length > 0) {
          const inBox = snap.filter(
            (f) => f.lat >= lamin - 2 && f.lat <= lamax + 2 && f.lon >= lomin - 2 && f.lon <= lomax + 2,
          );
          frOut.push(...inBox);
          providers.push({
            provider: 'fr24-snapshot',
            ok: true,
            count: inBox.length,
            latencyMs: 5,
            note: noWorker ? 'Strict Wi-Fi snapshot + China FR24' : 'FR24 relay fallback',
          });
        }
      }
      return frOut;
    })();

    const [fr24Flights, directAdsbFlights, openSkyFlights] = await Promise.all([
      fr24Promise,
      directAdsbPromise,
      openSkyPromise,
    ]);

    const mergedMap = new Map<string, LiveFlight>();
    for (const list of [fr24Flights, directAdsbFlights, openSkyFlights]) {
      for (const f of list) {
        const key = f.icao24 || f.callsign || f.id;
        const existing = mergedMap.get(key);
        if (!existing) {
          mergedMap.set(key, f);
        } else {
          if (!existing.origin && f.origin) existing.origin = f.origin;
          if (!existing.destination && f.destination) existing.destination = f.destination;
          if (!existing.squawk && f.squawk) existing.squawk = f.squawk;
          if (!existing.registration && f.registration) existing.registration = f.registration;
          if (!existing.flightNumber && f.flightNumber) existing.flightNumber = f.flightNumber;
          if (!existing.airlineIcao && f.airlineIcao) existing.airlineIcao = f.airlineIcao;
          if ((!existing.aircraftType || existing.aircraftType === 'A320') && f.aircraftType) {
            existing.aircraftType = f.aircraftType;
          }
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
      recordBrowserBreadcrumb(f);
      const trail = browserTrailMap.get(f.icao24 || f.id);
      if (trail && trail.length > 1) f.trail = trail.slice(-40);
    }

    if (flights.length > 0) {
      const payload: FlightsResponse = {
        flights,
        providers,
        fetchedAt: Date.now(),
        bounds: {lamin, lomin, lamax, lomax},
      };
      lastGoodFlightsSnapshot = {ts: Date.now(), data: payload};
      return payload;
    }

    if (lastGoodFlightsSnapshot && Date.now() - lastGoodFlightsSnapshot.ts < 90000) {
      return {
        ...lastGoodFlightsSnapshot.data,
        providers,
        fromServerCache: true,
      };
    }

    return {
      flights: [],
      providers,
      fetchedAt: Date.now(),
      bounds: {lamin, lomin, lamax, lomax},
    };
  })();

  inFlightFlightsPromise = task.finally(() => {
    inFlightFlightsPromise = null;
  });
  return inFlightFlightsPromise;
}

function computeDirectRunways(
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

async function fetchDirectWeather(params: URLSearchParams): Promise<{airports: AirportWeather[]; cached: boolean}> {
  const icaosRaw = (params.get('icaos') || AIRPORT_CATALOG.map((a) => a.icao).join(',')).toUpperCase();
  const cached = browserWeatherCache.get(icaosRaw);
  if (cached && Date.now() - cached.ts < 180000) {
    return {airports: cached.airports, cached: true};
  }

  const targetUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icaosRaw)}&format=json`;
  const rows =
    (await fetchNativeCorsJson<Array<Record<string, unknown>>>(targetUrl, 5000)) ??
    (await fetchJsonViaCorsRelay<Array<Record<string, unknown>>>(targetUrl, 7500));
  if (!Array.isArray(rows) || rows.length === 0) {
    return {airports: cached?.airports ?? [], cached: Boolean(cached)};
  }

  const byIcao = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const id = String(r.icaoId ?? '').toUpperCase();
    if (id && !byIcao.has(id)) byIcao.set(id, r);
  }

  const airports: AirportWeather[] = [];
  for (const spec of AIRPORT_CATALOG) {
    const m = byIcao.get(spec.icao);
    if (!m) continue;
    const rawMetar = String(m.rawOb ?? '');
    const wspd = Number(m.wspd ?? 0);
    const wdir = Number.isFinite(Number(m.wdir)) ? Number(m.wdir) : null;
    const wgst = Number.isFinite(Number(m.wgst)) ? Number(m.wgst) : null;
    const vis = Number.isFinite(Number(m.visib)) ? Number(m.visib) : null;
    const wxString = String(m.wxString ?? '');
    const fltCatRaw = String(m.fltCat ?? 'VFR').toUpperCase();
    const flightCategory: AirportWeather['flightCategory'] =
      fltCatRaw === 'MVFR' || fltCatRaw === 'IFR' || fltCatRaw === 'LIFR' || fltCatRaw === 'VFR'
        ? fltCatRaw
        : 'UNK';

    airports.push({
      icao: spec.icao,
      iata: spec.iata,
      name: spec.name,
      city: spec.city,
      country: spec.country,
      lat: spec.lat,
      lon: spec.lon,
      rawMetar,
      flightCategory,
      windDirDeg: wdir,
      windSpeedKts: Math.round(wspd),
      windGustKts: wgst,
      visibilitySm: vis,
      ceilingFt: null,
      tempC: Number.isFinite(Number(m.temp)) ? Number(m.temp) : null,
      dewpointC: Number.isFinite(Number(m.dewp)) ? Number(m.dewp) : null,
      altimeterHpa: Number.isFinite(Number(m.altim)) ? Math.round(Number(m.altim)) : null,
      wxString,
      tafRaw: '',
      observedAt: String(m.reportTime ?? new Date().toISOString()),
      runways: computeDirectRunways(spec.icao, wdir, Math.round(wspd), wxString, rawMetar),
    });
  }

  if (airports.length > 0) {
    browserWeatherCache.set(icaosRaw, {ts: Date.now(), airports});
  }
  return {airports, cached: false};
}

async function fetchDirectPhoto(icao24: string, reg: string): Promise<AircraftPhoto | null> {
  // 1. Planespotters.net official CORS JSON API first
  for (const url of [
    icao24 ? `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(icao24.toUpperCase())}` : '',
    reg ? `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg.toUpperCase())}` : '',
  ]) {
    if (!url) continue;
    try {
      const r = await fetch(url, {signal: AbortSignal.timeout(3800)});
      if (!r.ok) continue;
      const json = (await r.json()) as {
        photos?: Array<{
          thumbnail?: {src?: string; size?: {width?: number; height?: number}};
          thumbnail_large?: {src?: string; size?: {width?: number; height?: number}};
          photographer?: string;
          link?: string;
        }>;
      };
      const p = json.photos?.[0];
      const large = p?.thumbnail_large;
      if (p && large?.src && p.link) {
        return {
          url: large.src,
          thumbUrl: p.thumbnail?.src,
          photographer: p.photographer || 'Planespotters.net contributor',
          link: p.link,
          source: 'planespotters.net',
          width: large.size?.width,
          height: large.size?.height,
        };
      }
    } catch {
      // continue to wikimedia fallback
    }
  }

  // 2. Wikimedia Commons fallback photo search by registration (native CORS via origin=*)
  const normReg = reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (normReg.length >= 4) {
    try {
      const wmRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(`"${reg}"`)}&gsrlimit=6&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json&origin=*`,
        {signal: AbortSignal.timeout(4000)},
      );
      if (wmRes.ok) {
        const wmJson = (await wmJsonPromise(wmRes)) as {
          query?: {pages?: Record<string, {title?: string; imageinfo?: Array<Record<string, unknown>>}>};
        };
        const pages = Object.values(wmJson.query?.pages ?? {});
        for (const page of pages) {
          const title = String(page.title ?? '');
          const normTitle = title.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          if (!normTitle.includes(normReg)) continue;
          if (!/\.(jpe?g|png|webp)$/i.test(title)) continue;
          const info = page.imageinfo?.[0];
          const url = String(info?.thumburl ?? info?.url ?? '');
          if (url) {
            return {
              url,
              thumbUrl: url,
              photographer: 'Wikimedia Commons contributor',
              link: String(info?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`),
              source: 'wikimedia',
              width: Number(info?.thumbwidth ?? info?.width ?? 1280),
              height: Number(info?.thumbheight ?? info?.height ?? 850),
            };
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function wmJsonPromise(res: Response): Promise<unknown> {
  return res.json();
}

async function fetchDirectFlightDetail(params: URLSearchParams): Promise<FlightDetail> {
  const icao24 = (params.get('icao24') ?? '').toUpperCase();
  const callsign = (params.get('callsign') ?? '').toUpperCase();
  const regParam = params.get('reg') ?? '';
  const fnumParam = params.get('fnum') ?? '';
  const origParam = params.get('orig') ?? '';
  const fr24Id = params.get('fr24Id') ?? '';

  const [hexRes, routeRes, playbackRes] = await Promise.all([
    icao24
      ? fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(icao24)}`, {
          signal: AbortSignal.timeout(3500),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
    callsign && callsign !== icao24
      ? fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
          signal: AbortSignal.timeout(3500),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
    fr24Id
      ? fetchJsonViaCorsRelay<{result?: {response?: {data?: {flight?: Record<string, unknown>}}}}>(
          `https://api.flightradar24.com/common/v1/flight-playback.json?flightId=${encodeURIComponent(fr24Id)}`,
          6500,
        )
      : Promise.resolve(null),
  ]);

  const hex = (hexRes ?? {}) as Record<string, string>;
  const resolvedReg = regParam || hex.Registration || '';
  const photo = await fetchDirectPhoto(icao24, resolvedReg);

  const route = ((routeRes as {response?: {flightroute?: Record<string, unknown>}} | null)?.response?.flightroute ??
    {}) as Record<string, unknown>;
  const dbOrig = (route.origin ?? {}) as Record<string, unknown>;
  const dbDest = (route.destination ?? {}) as Record<string, unknown>;
  const dbAirline = (route.airline ?? {}) as Record<string, unknown>;

  const pbFlight = playbackRes?.result?.response?.data?.flight;
  const pbTrackRaw = Array.isArray(pbFlight?.track) ? (pbFlight.track as Array<Record<string, unknown>>) : [];
  const pbTrail: TrailPoint[] = pbTrackRaw
    .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
    .map((p) => ({
      lat: Number(p.latitude),
      lon: Number(p.longitude),
      altFt: Number((p.altitude as Record<string, unknown> | undefined)?.feet ?? 0),
      speedKts: Number((p.speed as Record<string, unknown> | undefined)?.kts ?? 0),
      trackDeg: Number(p.heading ?? 0),
      ts: Number(p.timestamp ?? 0),
    }));

  const cached = browserFlightIndex.get(icao24);
  const trail = pbTrail.length >= 2 ? pbTrail : browserTrailMap.get(icao24) ?? [];

  return {
    id: icao24 || callsign,
    callsign: callsign || icao24,
    flightNumber: String(route.callsign_iata ?? fnumParam ?? callsign),
    registration: resolvedReg,
    squawk: cached?.squawk || undefined,
    aircraftModel: String(hex.Type ?? cached?.aircraftType ?? ''),
    aircraftCode: String(hex.ICAOTypeCode ?? cached?.aircraftType ?? ''),
    manufacturer: hex.Manufacturer || undefined,
    registeredOwner: hex.RegisteredOwners || undefined,
    airlineName: String(dbAirline.name ?? hex.RegisteredOwners ?? cached?.airlineName ?? ''),
    airlineIcao: String(dbAirline.icao ?? cached?.airlineIcao ?? airlineIcaoFromCallsign(callsign)),
    originIata: String(dbOrig.iata_code ?? origParam ?? cached?.origin ?? ''),
    originIcao: String(dbOrig.icao_code ?? ''),
    originName: String(dbOrig.name ?? ''),
    destinationIata: String(dbDest.iata_code ?? cached?.destination ?? ''),
    destinationIcao: String(dbDest.icao_code ?? ''),
    destinationName: String(dbDest.name ?? ''),
    statusText: cached?.onGround ? 'SURFACE TAXI' : 'ENROUTE LIVE',
    photo,
    trail,
    source: pbTrail.length >= 2 ? 'fr24-playback-cors' : 'cors-direct',
  };
}

function mapFr24BoardRow(
  row: Record<string, unknown>,
  mode: 'departures' | 'arrivals',
  airportIata: string,
  airportIcao: string,
  airportName: string,
): AirportBoardFlight {
  const identification = (row.identification ?? {}) as Record<string, unknown>;
  const idNum = (identification.number ?? {}) as Record<string, unknown>;
  const statusObj = (row.status ?? {}) as Record<string, unknown>;
  const statusGen = (statusObj.generic as Record<string, unknown> | undefined)?.status as
    | Record<string, unknown>
    | undefined;
  const aircraft = (row.aircraft ?? {}) as Record<string, unknown>;
  const model = (aircraft.model ?? {}) as Record<string, unknown>;
  const airline = (row.airline ?? {}) as Record<string, unknown>;
  const airlineCode = (airline.code ?? {}) as Record<string, unknown>;
  const apObj = (row.airport ?? {}) as Record<string, unknown>;
  const orig = (apObj.origin ?? {}) as Record<string, unknown>;
  const dest = (apObj.destination ?? {}) as Record<string, unknown>;
  const origCode = (orig.code ?? {}) as Record<string, unknown>;
  const destCode = (dest.code ?? {}) as Record<string, unknown>;
  const timeObj = (row.time ?? {}) as Record<string, unknown>;
  const sched = (timeObj.scheduled ?? {}) as Record<string, unknown>;
  const est = (timeObj.estimated ?? {}) as Record<string, unknown>;
  const real = (timeObj.real ?? {}) as Record<string, unknown>;

  const schedTs = Number(mode === 'departures' ? sched.departure : sched.arrival) || undefined;
  const estTs = Number(mode === 'departures' ? est.departure : est.arrival) || undefined;
  const realTs = Number(mode === 'departures' ? real.departure : real.arrival) || undefined;
  const statusText = String(statusObj.text ?? statusGen?.text ?? 'Scheduled');
  const rawColor = String(statusGen?.color ?? 'gray').toLowerCase();
  const statusColor: AirportBoardFlight['statusColor'] =
    rawColor === 'green' || rawColor === 'amber' || rawColor === 'red' ? rawColor : 'gray';
  const delaySec = ((realTs ?? estTs ?? schedTs ?? 0) - (schedTs ?? 0));
  const isCancelled = /cancel/i.test(statusText) || rawColor === 'red';
  const isDelayed =
    !isCancelled && (rawColor === 'amber' || /delay/i.test(statusText) || delaySec > 900);

  return {
    id: String(identification.id ?? identification.callsign ?? Math.random()),
    callsign: String(identification.callsign ?? idNum.default ?? '').toUpperCase(),
    flightNumber: String(idNum.default ?? identification.callsign ?? '').toUpperCase(),
    airlineName: String(airline.name ?? airlineCode.icao ?? ''),
    airlineIcao: String(airlineCode.icao ?? ''),
    originIata: mode === 'departures' ? airportIata : String(origCode.iata ?? '').toUpperCase(),
    originIcao: mode === 'departures' ? airportIcao : String(origCode.icao ?? '').toUpperCase(),
    originName: mode === 'departures' ? airportName : String(orig.name ?? ''),
    destinationIata: mode === 'arrivals' ? airportIata : String(destCode.iata ?? '').toUpperCase(),
    destinationIcao: mode === 'arrivals' ? airportIcao : String(destCode.icao ?? '').toUpperCase(),
    destinationName: mode === 'arrivals' ? airportName : String(dest.name ?? ''),
    aircraftCode: String(model.code ?? ''),
    aircraftModel: String(model.text ?? model.code ?? ''),
    registration: String(aircraft.registration ?? ''),
    icao24: String(aircraft.hex ?? '').toUpperCase(),
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

function computeDirectDelaySummary(
  departures: AirportBoardFlight[],
  arrivals: AirportBoardFlight[],
  pdDep?: Record<string, unknown> | null,
  pdArr?: Record<string, unknown> | null,
): AirportBoardResponse['delayIndex'] {
  const summarize = (rows: AirportBoardFlight[], pd?: Record<string, unknown> | null) => {
    const delayed = rows.filter((r) => r.isDelayed).length;
    const canceled = rows.filter((r) => r.isCancelled).length;
    const onTime = Math.max(0, rows.length - delayed - canceled);
    const total = Math.max(1, rows.length);
    const pct = rows.length > 0 ? Math.round(((delayed + canceled) / total) * 100) : null;
    const diffs = rows
      .map((r) => {
        const t = r.actualTime ?? r.estimatedTime;
        return t && r.scheduledTime ? Math.max(0, Math.round((t - r.scheduledTime) / 60)) : null;
      })
      .filter((v): v is number => v !== null);
    const avgMin = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : pct !== null ? Math.round(pct * 0.35) : null;
    const flightInfo = (pd?.flightInfo as Record<string, unknown> | undefined) ?? undefined;
    const rawIdx = Number(flightInfo?.delayIndex);
    const computedIdx = pct !== null ? Number(Math.min(5, Math.max(0.2, (pct / 18) + (avgMin ?? 0) / 35)).toFixed(2)) : null;
    return {
      index: Number.isFinite(rawIdx) ? rawIdx : computedIdx,
      avgMin,
      pct,
      onTime,
      delayed,
      canceled,
    };
  };

  const d = summarize(departures, pdDep);
  const a = summarize(arrivals, pdArr);
  return {
    arrivalsIndex: a.index,
    arrivalsDelayAvgMin: a.avgMin,
    arrivalsDelayedPct: a.pct,
    arrivalsOnTimeCount: a.onTime,
    arrivalsDelayedCount: a.delayed,
    arrivalsCanceledCount: a.canceled,
    departuresIndex: d.index,
    departuresDelayAvgMin: d.avgMin,
    departuresDelayedPct: d.pct,
    departuresOnTimeCount: d.onTime,
    departuresDelayedCount: d.delayed,
    departuresCanceledCount: d.canceled,
  };
}

async function fetchDirectAirportBoard(params: URLSearchParams): Promise<AirportBoardResponse> {
  const code = (params.get('code') ?? '').toUpperCase();
  const icao = (params.get('icao') ?? '').toUpperCase();
  const all = await getBrowserGlobalAirports();
  const catalog = AIRPORT_CATALOG.find((a) => a.iata === code || a.icao === icao || a.icao === code);
  const dir = all.find((a) => (code && a.iata === code) || a.icao === icao || a.icao === code);
  const iata = catalog?.iata ?? dir?.iata ?? code;
  const resolvedIcao = catalog?.icao ?? dir?.icao ?? (icao || code);
  const cacheKey = resolvedIcao || iata;

  const cachedBoard = browserBoardCache.get(cacheKey);
  if (cachedBoard && Date.now() - cachedBoard.ts < 60000) return cachedBoard.board;

  const queryCode = (iata || resolvedIcao).toLowerCase();
  if (queryCode && !isNoWorkerModePreferred()) {
    const ts = Math.floor(Date.now() / 1000);
    const makeUrl = (mode: 'departures' | 'arrivals') =>
      `https://api.flightradar24.com/common/v1/airport.json?code=${encodeURIComponent(queryCode)}&plugin[]=&plugin-setting[schedule][timestamp]=${ts}&plugin-setting[schedule][mode]=${mode}&page=1&limit=45`;

    const depJson = await fetchJsonViaCorsRelay<{result?: {response?: {airport?: {pluginData?: Record<string, unknown>}}}}>(
      makeUrl('departures'),
      7000,
    );
    const arrJson = await fetchJsonViaCorsRelay<{result?: {response?: {airport?: {pluginData?: Record<string, unknown>}}}}>(
      makeUrl('arrivals'),
      7000,
    );

    const pdDep = depJson?.result?.response?.airport?.pluginData ?? {};
    const pdArr = arrJson?.result?.response?.airport?.pluginData ?? {};
    const depRows = ((pdDep.schedule as Record<string, unknown> | undefined)?.departures as Record<string, unknown> | undefined)?.data as
      | Array<{flight?: Record<string, unknown>}>
      | undefined;
    const arrRows = ((pdArr.schedule as Record<string, unknown> | undefined)?.arrivals as Record<string, unknown> | undefined)?.data as
      | Array<{flight?: Record<string, unknown>}>
      | undefined;

    if ((Array.isArray(depRows) && depRows.length > 0) || (Array.isArray(arrRows) && arrRows.length > 0)) {
      const apName = catalog?.name ?? dir?.name ?? `${iata || resolvedIcao} Airport`;
      const departures = (depRows ?? []).filter((r) => r.flight).map((r) => mapFr24BoardRow(r.flight!, 'departures', iata, resolvedIcao, apName));
      const arrivals = (arrRows ?? []).filter((r) => r.flight).map((r) => mapFr24BoardRow(r.flight!, 'arrivals', iata, resolvedIcao, apName));
      const board: AirportBoardResponse = {
        icao: resolvedIcao,
        iata,
        name: apName,
        city: catalog?.city ?? dir?.city ?? '',
        country: catalog?.country ?? dir?.country ?? '',
        lat: catalog?.lat ?? dir?.lat ?? 0,
        lon: catalog?.lon ?? dir?.lon ?? 0,
        delayIndex: computeDirectDelaySummary(departures, arrivals, pdDep, pdArr),
        arrivals,
        departures,
        fetchedAt: Date.now(),
        source: 'fr24-cors-board',
      };
      browserBoardCache.set(cacheKey, {ts: Date.now(), board});
      return board;
    }
  }

  const snapFlights = await fetchStaticSnapshotFlights().catch(() => []);
  const combinedMap = new Map<string, LiveFlight>();
  for (const f of [...snapFlights, ...Array.from(browserFlightIndex.values())]) {
    combinedMap.set(f.icao24 || f.callsign, f);
  }
  const nearby = Array.from(combinedMap.values());
  const arrivals: AirportBoardFlight[] = nearby
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
      destinationName: catalog?.name ?? dir?.name ?? iata,
      aircraftCode: f.aircraftType,
      aircraftModel: f.aircraftType,
      registration: f.registration,
      icao24: f.icao24,
      statusText: f.onGround ? 'Arrived' : 'Enroute Inbound',
      statusColor: 'green',
      isDelayed: false,
      isLive: true,
    }));
  const departures: AirportBoardFlight[] = nearby
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
      originName: catalog?.name ?? dir?.name ?? iata,
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
  return {
    icao: resolvedIcao,
    iata,
    name: catalog?.name ?? dir?.name ?? `${iata || resolvedIcao} Airport`,
    city: catalog?.city ?? dir?.city ?? '',
    country: catalog?.country ?? dir?.country ?? '',
    lat: catalog?.lat ?? dir?.lat ?? 0,
    lon: catalog?.lon ?? dir?.lon ?? 0,
    delayIndex: computeDirectDelaySummary(departures, arrivals, null, null),
    arrivals,
    departures,
    fetchedAt: Date.now(),
    source: 'direct-adsb',
  };
}

async function fetchDirectSurface(params: URLSearchParams): Promise<AirfieldSurfaceData> {
  const rawCode = (params.get('icao') ?? '').trim().toUpperCase();
  const catalog = AIRPORT_CATALOG.find((a) => a.icao === rawCode || a.iata === rawCode);
  let lat = Number(params.get('lat') ?? catalog?.lat ?? 0);
  let lon = Number(params.get('lon') ?? catalog?.lon ?? 0);
  let icao = catalog?.icao ?? rawCode;
  let iata = catalog?.iata ?? '';

  if ((!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) && rawCode) {
    const all = await getBrowserGlobalAirports().catch(() => []);
    const dirMatch = all.find(
      (a) => a.icao.toUpperCase() === rawCode || (Boolean(a.iata) && a.iata.toUpperCase() === rawCode),
    );
    if (dirMatch) {
      lat = dirMatch.lat;
      lon = dirMatch.lon;
      icao = dirMatch.icao;
      iata = dirMatch.iata;
    }
  }

  const cacheKey = `${icao || `${lat.toFixed(3)},${lon.toFixed(3)}`}`;
  const existing = browserSurfaceCache.get(cacheKey);
  const existingTtl =
    existing && existing.data.source === 'osm-overpass' && existing.data.taxiways.length > 0
      ? 86400000
      : 45000;
  if (existing && Date.now() - existing.ts < existingTtl) return existing.data;

  let aprons: Array<Array<[number, number]>> = [];
  let labeledAprons: AirfieldPolygonFeature[] = [];
  let terminals: AirfieldPolygonFeature[] = [];
  let stands: AirfieldStandFeature[] = [];
  let holdingPositions: NonNullable<AirfieldSurfaceData['holdingPositions']> = [];
  let osmRunways: TaxiwaySegment[] = [];
  let taxiways: TaxiwaySegment[] = [];
  let gates: AirfieldSurfaceGate[] = [];
  let osmSucceeded = false;

  const overpassPromise = (async () => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    const q = buildOverpassAirfieldQuery(lat, lon);
    const cfWorker = getCloudflareWorkerUrl();
    const endpoints = [
      ...GLOBAL_OVERPASS_MIRRORS.slice(0, 3),
      ...(cfWorker
        ? [
            `${cfWorker}/?url=${encodeURIComponent('https://overpass.openstreetmap.fr/api/interpreter')}`,
            `${cfWorker}/?url=${encodeURIComponent('https://overpass-api.de/api/interpreter')}`,
          ]
        : []),
    ];

    try {
      const json = await Promise.any(
        endpoints.map(async (ep) => {
          const osmRes = await fetch(ep, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
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
      // fall back to AIP + synthesized geometry
    }
  })();

  const aipMapPromise = getBrowserGlobalRunways();
  await Promise.all([overpassPromise, aipMapPromise]);
  const aipMap = await aipMapPromise;

  const lookupIdents = [catalog?.icao, icao].filter(Boolean) as string[];
  let aipRunways: DirectAipRunwayEntry[] = [];
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
  browserSurfaceCache.set(cacheKey, {ts: Date.now(), data: result});
  return result;
}

async function fetchDirectSafetyRecord(params: URLSearchParams): Promise<SafetyRecordResponse> {
  const registration = (params.get('registration') ?? params.get('reg') ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  const searchUrl = `https://aviation-safety.net/database/registration/regsearch.php?regi=${encodeURIComponent(registration)}`;
  if (!registration) {
    return {registration: '', items: [], searchUrl, source: 'aviation-safety.net', fetchedAt: Date.now(), note: 'Missing registration'};
  }
  const cached = browserSafetyCache.get(registration);
  if (cached && Date.now() - cached.ts < 3600000) return cached.data;

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

  if (isNoWorkerModePreferred()) {
    note = 'Strict Wi-Fi / No-Worker mode active — open aviation-safety.net directly';
  } else {
    const html = await fetchTextViaCorsRelay(searchUrl, 6500);
    if (!html) {
      note = 'Relay unavailable — click Open on aviation-safety.net';
    } else if (/just a moment|cloudflare|cf-challenge/i.test(html) && !html.includes('wikibase') && !html.includes('<table')) {
      note = 'ASN browser verification active — open aviation-safety.net directly';
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

  const data: SafetyRecordResponse = {
    registration,
    items: items.slice(0, 30),
    searchUrl,
    source: 'aviation-safety.net',
    fetchedAt: Date.now(),
    note,
  };
  browserSafetyCache.set(registration, {ts: Date.now(), data});
  return data;
}

async function fetchDirectPastFlights(params: URLSearchParams): Promise<{query: string; items: PastFlightRecord[]; fetchedAt: number; cached?: boolean}> {
  const rawQuery = (params.get('query') ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const icao24Param = (params.get('icao24') ?? '').trim().toUpperCase();
  const cacheKey = `${rawQuery}|${icao24Param}`;
  const cached = browserPastCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 120000) {
    return {query: rawQuery || icao24Param, items: cached.items, fetchedAt: Date.now(), cached: true};
  }

  const isReg = /-/.test(rawQuery) || /^[BNVGDF][A-Z0-9]{3,}$/.test(rawQuery);
  const items: PastFlightRecord[] = [];
  const seen = new Set<string>();

  const openSkyTask = (async () => {
    let hex = icao24Param.toLowerCase();
    if (!hex && rawQuery) {
      const snap = await fetchStaticSnapshotFlights().catch(() => []);
      const all = [...Array.from(browserFlightIndex.values()), ...snap];
      const match = all.find(
        (f) =>
          f.registration.toUpperCase() === rawQuery ||
          f.callsign.toUpperCase() === rawQuery ||
          f.flightNumber.toUpperCase() === rawQuery,
      );
      if (match?.icao24) hex = match.icao24.toLowerCase();
    }
    if (!hex) return;
    const endSec = Math.floor(Date.now() / 1000);
    const beginSec = endSec - 7 * 86400;
    const rows = await fetchNativeCorsJson<Array<Record<string, unknown>>>(
      `https://opensky-network.org/api/flights/aircraft?icao24=${encodeURIComponent(hex)}&begin=${beginSec}&end=${endSec}`,
      5500,
    );
    if (Array.isArray(rows)) {
      for (const row of rows.slice(0, 14)) {
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
    }
  })();

  const fr24Task = (async () => {
    if (!rawQuery) return;
    const modes = isReg ? ['reg', 'flight'] : ['flight', 'reg'];
    for (const fetchBy of modes) {
      const json = await fetchJsonViaCorsRelay<{result?: {response?: {data?: Array<Record<string, unknown>>}}}>(
        `https://api.flightradar24.com/common/v1/flight/list.json?fetchBy=${fetchBy}&page=1&limit=16&query=${encodeURIComponent(rawQuery)}`,
        6000,
      );
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
      if (rows.length > 0) break;
    }
  })();

  await Promise.all([openSkyTask, fr24Task]);

  if (items.length === 0 && rawQuery) {
    const snap = await fetchStaticSnapshotFlights().catch(() => []);
    for (const f of [...Array.from(browserFlightIndex.values()), ...snap]) {
      if (
        f.registration.toUpperCase() === rawQuery ||
        f.callsign.toUpperCase() === rawQuery ||
        f.flightNumber.toUpperCase() === rawQuery
      ) {
        const id = `live-${f.icao24}-${f.lastContactEpoch}`;
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          flightNumber: f.flightNumber || f.callsign,
          callsign: f.callsign,
          registration: f.registration,
          originIata: f.origin,
          originIcao: f.origin,
          originName: f.origin,
          destinationIata: f.destination,
          destinationIcao: f.destination,
          destinationName: f.destination,
          scheduledDep: f.lastContactEpoch,
          actualDep: f.lastContactEpoch,
          statusText: f.onGround ? 'On Ground' : 'Observed Sector',
          aircraftCode: f.aircraftType,
          source: f.source,
        });
      }
    }
  }

  items.sort((a, b) => (b.actualDep ?? b.scheduledDep ?? 0) - (a.actualDep ?? a.scheduledDep ?? 0));
  browserPastCache.set(cacheKey, {ts: Date.now(), items});
  return {query: rawQuery || icao24Param, items: items.slice(0, 24), fetchedAt: Date.now()};
}

function classifyDirectHazardCategory(hazard: string, rawText: string): HazardCategory {
  const s = `${hazard} ${rawText}`.toUpperCase();
  if (/TURB|LLWS|WS\b|LLWAS|MTW|WAV/.test(s)) return 'turbulence';
  if (/ICE|ICG|FZRA|FZDZ|RIME|MIXED/.test(s)) return 'icing';
  return 'advisory';
}

function parseDirectSigmetList(features: Array<Record<string, unknown>>, source: string): SigmetHazard[] {
  const out: SigmetHazard[] = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const props = ((f.properties as Record<string, unknown> | undefined) ?? f) as Record<string, unknown>;
    const geom = (f.geometry ?? {}) as Record<string, unknown>;
    const rawCoords = geom.coordinates as unknown;
    let ring: Array<[number, number]> = [];
    if (geom.type === 'Polygon' && Array.isArray(rawCoords) && Array.isArray(rawCoords[0])) {
      ring = (rawCoords[0] as Array<[number, number]>)
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map((p) => [Number(p[1]), Number(p[0])] as [number, number]);
    } else if (Array.isArray(props.coords)) {
      ring = (props.coords as Array<{lat?: number; lon?: number}>)
        .filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon)))
        .map((c) => [Number(c.lat), Number(c.lon)] as [number, number]);
    }
    if (ring.length < 3) continue;
    const hazard = String(props.hazard ?? props.airSigmetType ?? 'SIGMET').toUpperCase();
    const rawText = String(props.rawAirSigmet ?? props.rawSigmet ?? props.rawText ?? '');
    out.push({
      id: `${source}-${props.airSigmetId ?? props.isigmetId ?? props.id ?? i}`,
      hazard,
      qualifier: String(props.severity ?? props.qualifier ?? ''),
      category: classifyDirectHazardCategory(hazard, rawText),
      validFrom: String(props.validTimeFrom ?? props.validFrom ?? ''),
      validTo: String(props.validTimeTo ?? props.validTo ?? ''),
      baseFt: Number.isFinite(Number(props.altitudeLow1 ?? props.base)) ? Number(props.altitudeLow1 ?? props.base) : null,
      topFt: Number.isFinite(Number(props.altitudeHi1 ?? props.top)) ? Number(props.altitudeHi1 ?? props.top) : null,
      rawText,
      coords: ring,
      source,
    });
  }
  return out;
}

async function fetchDirectHazards(): Promise<{sigmets: SigmetHazard[]; rainviewer: RainViewerMeta | null; cached: boolean}> {
  const awcFetch = async (url: string) =>
    (await fetchNativeCorsJson<Record<string, unknown> | Array<Record<string, unknown>>>(url, 4500)) ??
    (await fetchJsonViaCorsRelay<Record<string, unknown> | Array<Record<string, unknown>>>(url, 6500));

  const [airRaw, intlRaw, gAirRaw, rvJson] = await Promise.all([
    awcFetch('https://aviationweather.gov/api/data/airsigmet?format=geojson'),
    awcFetch('https://aviationweather.gov/api/data/isigmet?format=geojson'),
    awcFetch('https://aviationweather.gov/api/data/gairmet?format=geojson'),
    fetchNativeCorsJson<{
      host?: string;
      radar?: {past?: Array<{time: number; path: string}>; nowcast?: Array<{time: number; path: string}>};
    }>('https://api.rainviewer.com/public/weather-maps.json', 4500),
  ]);

  const toFeatures = (raw: unknown): Array<Record<string, unknown>> =>
    Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : Array.isArray((raw as {features?: unknown[]})?.features)
        ? ((raw as {features: Array<Record<string, unknown>>}).features)
        : [];

  const sigmets = [
    ...parseDirectSigmetList(toFeatures(airRaw), 'US AIR/SIGMET'),
    ...parseDirectSigmetList(toFeatures(intlRaw), 'INTL SIGMET'),
    ...parseDirectSigmetList(toFeatures(gAirRaw), 'G-AIRMET').slice(0, 80),
  ];

  let rainviewer: RainViewerMeta | null = null;
  if (rvJson?.host) {
    const frames = [...(rvJson.radar?.past ?? []), ...(rvJson.radar?.nowcast ?? [])].slice(-8);
    if (frames.length > 0) rainviewer = {host: rvJson.host, frames};
  }
  return {sigmets, rainviewer, cached: false};
}

async function fetchDirectDisruptions(): Promise<{items: AirportDisruption[]; sources: string[]; cached: boolean}> {
  const items: AirportDisruption[] = [];
  const sources: string[] = [];
  const hubIcaos = AIRPORT_CATALOG.map((a) => a.icao).join(',');
  const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(hubIcaos)}&format=json`;
  const metars =
    (await fetchNativeCorsJson<Array<Record<string, unknown>>>(metarUrl, 4500)) ??
    (await fetchJsonViaCorsRelay<Array<Record<string, unknown>>>(metarUrl, 6500)) ??
    [];

  if (Array.isArray(metars) && metars.length > 0) {
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
  return {items, sources, cached: false};
}

async function handleStaticRoute(path: string, params: URLSearchParams): Promise<unknown> {
  if (path === '/api/flights') {
    return fetchDirectFlights(params);
  }
  if (path === '/api/airports') {
    const lamin = Number(params.get('lamin') ?? -85);
    const lomin = Number(params.get('lomin') ?? -180);
    const lamax = Number(params.get('lamax') ?? 85);
    const lomax = Number(params.get('lomax') ?? 180);
    const zoom = Number(params.get('zoom') ?? 6);
    const maxTier = zoom >= 8.5 ? 3 : zoom >= 5.5 ? 2 : 1;
    const all = await getBrowserGlobalAirports();
    const airports = all
      .filter((a) => a.tier <= maxTier && a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax)
      .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.icao.localeCompare(b.icao)))
      .slice(0, 180);
    return {airports, maxTier, totalInViewport: airports.length};
  }
  if (path === '/api/flight-detail') {
    return fetchDirectFlightDetail(params);
  }
  if (path === '/api/safety-record') {
    return fetchDirectSafetyRecord(params);
  }
  if (path === '/api/past-flights') {
    return fetchDirectPastFlights(params);
  }
  if (path === '/api/surface') {
    return fetchDirectSurface(params);
  }
  if (path === '/api/locate') {
    const res = await fetch('https://ipwho.is/', {signal: AbortSignal.timeout(3500)});
    const json = (await res.json()) as {latitude?: number; longitude?: number; city?: string; country?: string};
    return {
      lat: json.latitude,
      lon: json.longitude,
      city: json.city || '',
      country: json.country || '',
      source: 'ipwho.is',
    };
  }
  if (path === '/api/weather/hazards') {
    return fetchDirectHazards();
  }
  if (path === '/api/airport-board') {
    return fetchDirectAirportBoard(params);
  }
  if (path === '/api/airport-taxi') {
    const icao = (params.get('icao') ?? 'ZBAA').toUpperCase();
    const spec = AIRPORT_CATALOG.find((a) => a.icao === icao) ?? AIRPORT_CATALOG[0];
    const surf = await fetchDirectSurface(
      new URLSearchParams({icao: spec.icao, lat: String(spec.lat), lon: String(spec.lon)}),
    );
    const nearby = Array.from(browserFlightIndex.values());
    const segments: TaxiwaySegment[] = [...surf.runways, ...surf.taxiways];
    return {
      airport: spec,
      groundTraffic: nearby.filter((f) => f.onGround),
      nearbyAirborne: nearby.filter((f) => !f.onGround),
      segments,
      providers: [],
    };
  }
  if (path === '/api/weather') {
    return fetchDirectWeather(params);
  }
  if (path === '/api/disruptions') return fetchDirectDisruptions();
  if (path === '/api/acars') return {messages: [], sourceStatus: 'Static CORS Direct Mode', cached: false};
  return {};
}

function isKnownStaticHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return true;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.github.io') ||
    host.endsWith('.gitlab.io') ||
    host.endsWith('.tiiny.site') ||
    host.endsWith('.tiiny.host') ||
    host.endsWith('.surge.sh') ||
    host.endsWith('.neocities.org')
  );
}

let backendProbePromise: Promise<boolean> | null = null;

async function hasLiveBackend(): Promise<boolean> {
  if (staticHostingDetected || isKnownStaticHost()) {
    staticHostingDetected = true;
    return false;
  }
  if (!backendProbePromise) {
    backendProbePromise = fetch('./api/airports?lamin=39&lomin=115&lamax=41&lomax=117&zoom=6', {
      signal: AbortSignal.timeout(2500),
    })
      .then((res) => {
        const ct = res.headers.get('content-type') ?? '';
        const ok = res.ok && ct.includes('application/json');
        if (!ok) staticHostingDetected = true;
        return ok;
      })
      .catch(() => {
        staticHostingDetected = true;
        return false;
      });
  }
  return backendProbePromise;
}

export async function apiFetchJson<T>(inputUrl: string, signal?: AbortSignal): Promise<T> {
  const parsed = new URL(inputUrl, typeof window !== 'undefined' ? window.location.origin : 'https://skydeck.local');
  const cleanPath = parsed.pathname.replace(/^\/+/, '/');
  const params = parsed.searchParams;

  const customBase = getCustomApiBase();
  if (customBase) {
    try {
      const fetchSig = signal ? AbortSignal.any([signal, AbortSignal.timeout(9000)]) : AbortSignal.timeout(9000);
      const res = await fetch(`${customBase}${cleanPath}${parsed.search}`, {
        signal: fetchSig,
      });
      const ct = res.headers.get('content-type') ?? '';
      if (res.ok && ct.includes('application/json')) {
        return (await res.json()) as T;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Fall back to direct browser / Cloudflare Worker pipeline
    }
  }

  const backendAvailable = await hasLiveBackend();
  if (!backendAvailable) {
    return (await handleStaticRoute(cleanPath, params)) as T;
  }

  try {
    const relUrl = `.${cleanPath}${parsed.search}`;
    const res = await fetch(relUrl, signal ? {signal} : undefined);
    const ct = res.headers.get('content-type') ?? '';
    if (res.status === 404 || !ct.includes('application/json')) {
      staticHostingDetected = true;
      return (await handleStaticRoute(cleanPath, params)) as T;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof Error && err.message.startsWith('HTTP 5')) {
      throw err;
    }
    staticHostingDetected = true;
    return (await handleStaticRoute(cleanPath, params)) as T;
  }
}
