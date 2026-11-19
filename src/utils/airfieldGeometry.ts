import type {
  AirfieldHoldingPosition,
  AirfieldPolygonFeature,
  AirfieldStandFeature,
  AirfieldSurfaceGate,
  TaxiwaySegment,
} from '../types/aviation';

export interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

export interface OverpassRelationMember {
  type: string;
  role?: string;
  geometry?: OverpassGeomPoint[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation' | string;
  id: number;
  lat?: number;
  lon?: number;
  geometry?: OverpassGeomPoint[];
  members?: OverpassRelationMember[];
  tags?: Record<string, string>;
}

export interface AipRunwaySimple {
  ref?: string;
  leLat: number;
  leLon: number;
  heLat: number;
  heLon: number;
  widthM: number;
}

export const GLOBAL_OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function buildOverpassAirfieldQuery(lat: number, lon: number): string {
  const s = (lat - 0.055).toFixed(4);
  const w = (lon - 0.080).toFixed(4);
  const n = (lat + 0.055).toFixed(4);
  const e = (lon + 0.080).toFixed(4);
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:14];(way["aeroway"~"^(runway|taxiway|taxilane|apron|terminal|parking_position|holding_position)$"](${bbox});relation["aeroway"~"^(apron|terminal)$"](${bbox});way["building"="terminal"](${bbox});relation["building"="terminal"](${bbox});node["aeroway"~"^(gate|parking_position|terminal|holding_position)$"](${bbox}););out geom qt;`;
}

function cleanTaxiwayRef(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  s = s.replace(/^(taxiway|taxilane|twy)\s+/i, '').trim();
  return s || undefined;
}

export function polygonCentroid(coords: Array<[number, number]>): [number, number] {
  if (coords.length === 0) return [0, 0];
  let sumLat = 0;
  let sumLon = 0;
  const count =
    coords.length > 2 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1
      : coords.length;
  for (let i = 0; i < count; i++) {
    sumLat += coords[i][0];
    sumLon += coords[i][1];
  }
  return [sumLat / Math.max(1, count), sumLon / Math.max(1, count)];
}

function stitchOuterRings(members: OverpassRelationMember[]): Array<Array<[number, number]>> {
  const rawSegs: Array<Array<[number, number]>> = [];
  for (const m of members) {
    if (m.role && m.role !== 'outer') continue;
    if (!Array.isArray(m.geometry) || m.geometry.length < 2) continue;
    const pts: Array<[number, number]> = m.geometry
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [p.lat, p.lon]);
    if (pts.length >= 2) rawSegs.push(pts);
  }
  if (rawSegs.length === 0) return [];

  const rings: Array<Array<[number, number]>> = [];
  const used = new Array(rawSegs.length).fill(false);
  const closeEnough = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;

  for (let i = 0; i < rawSegs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [...rawSegs[i]];
    let extended = true;
    while (extended && !closeEnough(chain[0], chain[chain.length - 1])) {
      extended = false;
      const tail = chain[chain.length - 1];
      for (let j = 0; j < rawSegs.length; j++) {
        if (used[j]) continue;
        const cand = rawSegs[j];
        if (closeEnough(tail, cand[0])) {
          chain.push(...cand.slice(1));
          used[j] = true;
          extended = true;
          break;
        }
        if (closeEnough(tail, cand[cand.length - 1])) {
          chain.push(...[...cand].reverse().slice(1));
          used[j] = true;
          extended = true;
          break;
        }
      }
    }
    if (chain.length >= 3) {
      rings.push(chain);
    }
  }
  return rings;
}

function bearingDeg(p1: [number, number], p2: [number, number]): number {
  const toRad = Math.PI / 180;
  const lat1 = p1[0] * toRad;
  const lat2 = p2[0] * toRad;
  const dLon = (p2[1] - p1[1]) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function axisDiffDeg(a: number, b: number): number {
  const d = Math.abs((((a - b) % 180) + 180) % 180);
  return Math.min(d, 180 - d);
}

export function mergeAndAlignRunways(
  osmRunways: TaxiwaySegment[],
  aipRunways: AipRunwaySimple[],
): TaxiwaySegment[] {
  // 1. Merge collinear end-to-end OSM runway ways (e.g., displaced thresholds / stopways)
  const working: TaxiwaySegment[] = osmRunways
    .filter((r) => r.coords.length >= 2)
    .map((r) => ({...r, coords: [...r.coords]}));

  const endpointNear = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.00055;

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < working.length; i++) {
      const a = working[i];
      const brgA = bearingDeg(a.coords[0], a.coords[a.coords.length - 1]);
      for (let j = i + 1; j < working.length; j++) {
        const b = working[j];
        const brgB = bearingDeg(b.coords[0], b.coords[b.coords.length - 1]);
        if (axisDiffDeg(brgA, brgB) > 4.5) continue;

        const a0 = a.coords[0];
        const a1 = a.coords[a.coords.length - 1];
        const b0 = b.coords[0];
        const b1 = b.coords[b.coords.length - 1];

        let combined: Array<[number, number]> | null = null;
        if (endpointNear(a1, b0)) {
          combined = [...a.coords, ...b.coords.slice(1)];
        } else if (endpointNear(a1, b1)) {
          combined = [...a.coords, ...[...b.coords].reverse().slice(1)];
        } else if (endpointNear(a0, b1)) {
          combined = [...b.coords, ...a.coords.slice(1)];
        } else if (endpointNear(a0, b0)) {
          combined = [...[...b.coords].reverse(), ...a.coords.slice(1)];
        }

        if (combined) {
          const bestRef =
            a.ref && a.ref.includes('/')
              ? a.ref
              : b.ref && b.ref.includes('/')
                ? b.ref
                : a.ref || b.ref;
          working[i] = {
            ...a,
            ref: bestRef,
            widthM: Math.max(a.widthM ?? 45, b.widthM ?? 45),
            coords: combined,
          };
          working.splice(j, 1);
          mergedAny = true;
          break;
        }
      }
      if (mergedAny) break;
    }
  }

  if (working.length > 0) {
    // 2. Keep exact OSM runway coordinates (100% aligned with OSM taxiways/aprons/basemap)
    //    and enrich missing designator refs or widths from AIP data.
    const usedAip = new Set<number>();
    for (const osm of working) {
      const oA = osm.coords[0];
      const oB = osm.coords[osm.coords.length - 1];
      const oMidLat = (oA[0] + oB[0]) * 0.5;
      const oMidLon = (oA[1] + oB[1]) * 0.5;
      const oBrg = bearingDeg(oA, oB);

      let bestIdx = -1;
      let bestDist = Infinity;
      for (let k = 0; k < aipRunways.length; k++) {
        const aip = aipRunways[k];
        const aMidLat = (aip.leLat + aip.heLat) * 0.5;
        const aMidLon = (aip.leLon + aip.heLon) * 0.5;
        const aBrg = bearingDeg([aip.leLat, aip.leLon], [aip.heLat, aip.heLon]);
        if (axisDiffDeg(oBrg, aBrg) > 12) continue;
        const d = Math.hypot(oMidLat - aMidLat, oMidLon - aMidLon);
        if (d < 0.0055 && d < bestDist) {
          bestDist = d;
          bestIdx = k;
        }
      }

      if (bestIdx >= 0) {
        usedAip.add(bestIdx);
        const match = aipRunways[bestIdx];
        if ((!osm.ref || !osm.ref.includes('/')) && match.ref) {
          osm.ref = match.ref;
        }
        if (!osm.widthM || osm.widthM === 45) {
          osm.widthM = match.widthM;
        }
      }
    }

    // 3. Append any AIP runway not covered by OSM (e.g., crosswind or brand-new runway)
    aipRunways.forEach((aip, idx) => {
      if (usedAip.has(idx)) return;
      const aMidLat = (aip.leLat + aip.heLat) * 0.5;
      const aMidLon = (aip.leLon + aip.heLon) * 0.5;
      const covered = working.some((osm) => {
        const oA = osm.coords[0];
        const oB = osm.coords[osm.coords.length - 1];
        const oMidLat = (oA[0] + oB[0]) * 0.5;
        const oMidLon = (oA[1] + oB[1]) * 0.5;
        return Math.hypot(oMidLat - aMidLat, oMidLon - aMidLon) < 0.0038;
      });
      if (!covered) {
        working.push({
          id: `aip-rwy-${idx}`,
          kind: 'runway',
          ref: aip.ref,
          widthM: aip.widthM,
          coords: [
            [aip.leLat, aip.leLon],
            [aip.heLat, aip.heLon],
          ],
        });
      }
    });

    return working;
  }

  return aipRunways.map((r, idx) => ({
    id: `aip-rwy-${idx}`,
    kind: 'runway' as const,
    ref: r.ref,
    widthM: r.widthM,
    coords: [
      [r.leLat, r.leLon],
      [r.heLat, r.heLon],
    ],
  }));
}

export function parseOverpassAirfieldElements(elements: OverpassElement[]): {
  osmRunways: TaxiwaySegment[];
  taxiways: TaxiwaySegment[];
  aprons: Array<Array<[number, number]>>;
  labeledAprons: AirfieldPolygonFeature[];
  terminals: AirfieldPolygonFeature[];
  stands: AirfieldStandFeature[];
  holdingPositions: AirfieldHoldingPosition[];
  gates: AirfieldSurfaceGate[];
} {
  const osmRunways: TaxiwaySegment[] = [];
  const taxiways: TaxiwaySegment[] = [];
  const aprons: Array<Array<[number, number]>> = [];
  const labeledAprons: AirfieldPolygonFeature[] = [];
  const terminals: AirfieldPolygonFeature[] = [];
  const stands: AirfieldStandFeature[] = [];
  const holdingPositions: AirfieldHoldingPosition[] = [];
  const standDedupe = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const aw = tags.aeroway;
    const bld = tags.building;

    if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      if (aw === 'holding_position') {
        holdingPositions.push({
          id: `hold-node-${el.id}`,
          lat: el.lat!,
          lon: el.lon!,
          ref: (tags.ref || tags.name || '').trim() || undefined,
        });
      } else if (aw === 'gate' || aw === 'parking_position') {
        const ref = (tags.ref || tags.name || '').trim();
        if (ref) {
          const key = `${ref}-${Math.round(el.lat! * 2500)}-${Math.round(el.lon! * 2500)}`;
          if (!standDedupe.has(key)) {
            standDedupe.add(key);
            stands.push({
              id: `stand-${el.id}`,
              ref,
              kind: aw === 'parking_position' ? 'parking_position' : 'gate',
              lat: el.lat!,
              lon: el.lon!,
            });
          }
        }
      } else if (aw === 'terminal') {
        const name = (tags.name || tags.ref || '').trim();
        if (name) {
          // Small diamond point for terminal node when polygon is absent; filtered if covered below
          const d = 0.00028;
          terminals.push({
            id: `term-node-${el.id}`,
            name,
            ref: tags.ref,
            coords: [
              [el.lat! - d, el.lon!],
              [el.lat!, el.lon! + d],
              [el.lat! + d, el.lon!],
              [el.lat!, el.lon! - d],
            ],
            center: [el.lat!, el.lon!],
          });
        }
      }
      continue;
    }

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const coords: Array<[number, number]> = el.geometry
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lat, p.lon]);
      if (coords.length < 2) continue;

      if (aw === 'runway') {
        const widthM = Number.parseFloat(tags.width ?? '45') || 45;
        osmRunways.push({
          id: `rwy-${el.id}`,
          kind: 'runway',
          ref: tags.ref,
          widthM,
          coords,
        });
      } else if (aw === 'taxiway' || aw === 'taxilane') {
        const widthM = Number.parseFloat(tags.width ?? (aw === 'taxilane' ? '14' : '22')) || 22;
        taxiways.push({
          id: `twy-${el.id}`,
          kind: aw === 'taxilane' ? 'taxilane' : 'taxiway',
          ref: cleanTaxiwayRef(tags.ref || tags.name),
          widthM,
          coords,
        });
      } else if (aw === 'parking_position') {
        const ref = (tags.ref || tags.name || '').trim();
        const mid = coords[Math.floor(coords.length / 2)];
        if (ref) {
          const key = `${ref}-${Math.round(mid[0] * 2500)}-${Math.round(mid[1] * 2500)}`;
          standDedupe.add(key);
        }
        stands.push({
          id: `stand-way-${el.id}`,
          ref,
          kind: 'parking_position',
          lat: mid[0],
          lon: mid[1],
          coords,
        });
      } else if (aw === 'holding_position') {
        const mid = coords[Math.floor(coords.length / 2)];
        holdingPositions.push({
          id: `hold-way-${el.id}`,
          lat: mid[0],
          lon: mid[1],
          ref: (tags.ref || tags.name || '').trim() || undefined,
          coords,
        });
      } else if (aw === 'apron' && coords.length >= 3) {
        aprons.push(coords);
        labeledAprons.push({
          id: `apron-${el.id}`,
          ref: tags.ref?.trim() || undefined,
          name: tags.name?.trim() || undefined,
          coords,
          center: polygonCentroid(coords),
        });
      } else if ((aw === 'terminal' || bld === 'terminal') && coords.length >= 3) {
        terminals.push({
          id: `term-${el.id}`,
          ref: tags.ref?.trim() || undefined,
          name: (tags.name || tags.ref || '').trim() || undefined,
          coords,
          center: polygonCentroid(coords),
        });
      }
      continue;
    }

    if (el.type === 'relation' && Array.isArray(el.members)) {
      const rings = stitchOuterRings(el.members);
      if (rings.length === 0) continue;
      if (aw === 'apron') {
        rings.forEach((ring, idx) => {
          aprons.push(ring);
          labeledAprons.push({
            id: `apron-rel-${el.id}-${idx}`,
            ref: tags.ref?.trim() || undefined,
            name: tags.name?.trim() || undefined,
            coords: ring,
            center: polygonCentroid(ring),
          });
        });
      } else if (aw === 'terminal' || bld === 'terminal') {
        rings.forEach((ring, idx) => {
          terminals.push({
            id: `term-rel-${el.id}-${idx}`,
            ref: tags.ref?.trim() || undefined,
            name: (tags.name || tags.ref || '').trim() || undefined,
            coords: ring,
            center: polygonCentroid(ring),
          });
        });
      }
    }
  }

  // Drop synthetic node terminals if an actual terminal polygon exists nearby
  const polyTerminals = terminals.filter((t) => !t.id.startsWith('term-node-'));
  const finalTerminals =
    polyTerminals.length > 0
      ? [
          ...polyTerminals,
          ...terminals.filter(
            (t) =>
              t.id.startsWith('term-node-') &&
              !polyTerminals.some(
                (p) => Math.hypot(p.center[0] - t.center[0], p.center[1] - t.center[1]) < 0.003,
              ),
          ),
        ]
      : terminals;

  const gates: AirfieldSurfaceGate[] = stands
    .filter((s) => Boolean(s.ref))
    .slice(0, 260)
    .map((s) => ({id: s.id, ref: s.ref, lat: s.lat, lon: s.lon}));

  return {
    osmRunways,
    taxiways,
    aprons,
    labeledAprons,
    terminals: finalTerminals,
    stands,
    holdingPositions,
    gates,
  };
}
