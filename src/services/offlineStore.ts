import {openDB, type DBSchema, type IDBPDatabase} from 'idb';
import type {AcarsMessage, AirportWeather, LiveFlight, SavedFlightPlan} from '../types/aviation';

interface SkyDeckDB extends DBSchema {
  snapshots: {
    key: string;
    value: {
      key: string;
      flights: LiveFlight[];
      fetchedAt: number;
    };
  };
  weatherCache: {
    key: string;
    value: {
      key: string;
      airports: AirportWeather[];
      fetchedAt: number;
    };
  };
  acarsCache: {
    key: string;
    value: {
      key: string;
      messages: AcarsMessage[];
      fetchedAt: number;
    };
  };
  flightPlans: {
    key: string;
    value: SavedFlightPlan;
  };
}

let dbPromise: Promise<IDBPDatabase<SkyDeckDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<SkyDeckDB>('skydeck-offline-v1', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', {keyPath: 'key'});
        }
        if (!db.objectStoreNames.contains('weatherCache')) {
          db.createObjectStore('weatherCache', {keyPath: 'key'});
        }
        if (!db.objectStoreNames.contains('acarsCache')) {
          db.createObjectStore('acarsCache', {keyPath: 'key'});
        }
        if (!db.objectStoreNames.contains('flightPlans')) {
          db.createObjectStore('flightPlans', {keyPath: 'id'});
        }
      },
    });
  }
  return dbPromise;
}

export async function saveFlightSnapshot(key: string, flights: LiveFlight[], fetchedAt: number) {
  try {
    const db = await getDb();
    await db.put('snapshots', {key, flights: flights.slice(0, 400), fetchedAt});
  } catch {
    // ignore storage quota failures
  }
}

export async function loadFlightSnapshot(
  key: string,
): Promise<{flights: LiveFlight[]; fetchedAt: number} | null> {
  try {
    const db = await getDb();
    const record = await db.get('snapshots', key);
    return record ? {flights: record.flights, fetchedAt: record.fetchedAt} : null;
  } catch {
    return null;
  }
}

export async function saveWeatherSnapshot(key: string, airports: AirportWeather[]) {
  try {
    const db = await getDb();
    await db.put('weatherCache', {key, airports, fetchedAt: Date.now()});
  } catch {
    // ignore
  }
}

export async function loadWeatherSnapshot(
  key: string,
): Promise<{airports: AirportWeather[]; fetchedAt: number} | null> {
  try {
    const db = await getDb();
    const rec = await db.get('weatherCache', key);
    return rec ? {airports: rec.airports, fetchedAt: rec.fetchedAt} : null;
  } catch {
    return null;
  }
}

export async function saveAcarsSnapshot(messages: AcarsMessage[]) {
  try {
    const db = await getDb();
    await db.put('acarsCache', {key: 'latest', messages: messages.slice(0, 60), fetchedAt: Date.now()});
  } catch {
    // ignore
  }
}

export async function loadAcarsSnapshot(): Promise<{messages: AcarsMessage[]; fetchedAt: number} | null> {
  try {
    const db = await getDb();
    const rec = await db.get('acarsCache', 'latest');
    return rec ? {messages: rec.messages, fetchedAt: rec.fetchedAt} : null;
  } catch {
    return null;
  }
}

export async function saveFlightPlanOffline(plan: SavedFlightPlan) {
  const db = await getDb();
  await db.put('flightPlans', plan);
}

export async function listSavedFlightPlans(): Promise<SavedFlightPlan[]> {
  try {
    const db = await getDb();
    const items = await db.getAll('flightPlans');
    return items.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteSavedFlightPlan(id: string) {
  const db = await getDb();
  await db.delete('flightPlans', id);
}

const EARTH_RADIUS_NM = 3440.065;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Great-circle Dead-Reckoning position projection for limited-connectivity / offline regions.
 */
export function deadReckonFlight(flight: LiveFlight, nowSec: number, forceEstimate = false): LiveFlight {
  const ageSec = Math.max(0, nowSec - flight.lastContactEpoch);
  const shouldEstimate = (forceEstimate || ageSec > 18) && !flight.onGround && flight.groundSpeedKts > 35;

  if (!shouldEstimate || ageSec <= 0) {
    return {
      ...flight,
      isEstimated: false,
      uncertaintyNm: 0,
    };
  }

  // Cap extrapolation horizon at 90 minutes to prevent unrealistic drift
  const effectiveSec = Math.min(ageSec, 5400);
  const distNm = flight.groundSpeedKts * (effectiveSec / 3600);
  const δ = distNm / EARTH_RADIUS_NM;
  const θ = (flight.trueTrackDeg * Math.PI) / 180;
  const φ1 = (flight.lat * Math.PI) / 180;
  const λ1 = (flight.lon * Math.PI) / 180;

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  const projectedAlt = Math.max(
    0,
    Math.min(45000, Math.round(flight.altitudeFt + (flight.verticalRateFpm * Math.min(effectiveSec, 300)) / 60)),
  );

  // Uncertainty grows smoothly with time since last ADS-B reception
  const uncertaintyNm = Number(Math.min(35, Math.max(0.8, (effectiveSec / 60) * 1.15)).toFixed(1));

  return {
    ...flight,
    lat: (φ2 * 180) / Math.PI,
    lon: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
    altitudeFt: projectedAlt,
    isEstimated: true,
    uncertaintyNm,
  };
}
