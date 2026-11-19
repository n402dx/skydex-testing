import * as THREE from 'three';
import {AIRPORT_CATALOG} from '../data/aviationCatalog';
import type {
  AirportDisruption,
  AirportWeather,
  LiveFlight,
  SigmetHazard,
} from '../types/aviation';

export interface PanSectorRefs {
  group: THREE.Group;
  cloudCount: number;
  precipCount: number;
  tfrVolumeCount: number;
  ceilingFt: number;
  hasPrecip: boolean;
  update: (dt: number) => void;
  dispose: () => void;
}

const NM_PER_UNIT = 2.0; // 1 scene unit = 2 NM horizontally
const FT_PER_UNIT = 1100; // 1 scene unit = 1,100 ft vertically

function latLonToLocalXZ(
  lat: number,
  lon: number,
  anchorLat: number,
  anchorLon: number,
): [number, number] {
  const cosLat = Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(anchorLat)));
  const northNm = (lat - anchorLat) * 60;
  const eastNm = (lon - anchorLon) * 60 * cosLat;
  return [eastNm / NM_PER_UNIT, -northNm / NM_PER_UNIT];
}

function inferMetarCloudState(wx?: AirportWeather): {
  coverage: number; // 0..1
  ceilingFt: number;
  hasRain: boolean;
  isSnow: boolean;
  hasThunder: boolean;
} {
  if (!wx) {
    return {coverage: 0.28, ceilingFt: 8500, hasRain: false, isSnow: false, hasThunder: false};
  }
  const raw = `${wx.rawMetar || ''} ${wx.wxString || ''}`.toUpperCase();
  const hasThunder = /\bTS|VCTS|CB\b/.test(raw);
  const isSnow = /\bSN|PL|GS|GR|SHSN|BLSN\b/.test(raw);
  const hasRain = hasThunder || /\bRA|DZ|SHRA|SH\b/.test(raw);

  let coverage = 0.22;
  if (/\bOVC\d{3}/.test(raw) || wx.flightCategory === 'LIFR') coverage = 0.88;
  else if (/\bBKN\d{3}/.test(raw) || wx.flightCategory === 'IFR') coverage = 0.68;
  else if (/\bSCT\d{3}/.test(raw) || wx.flightCategory === 'MVFR') coverage = 0.45;
  else if (/\bFEW\d{3}/.test(raw)) coverage = 0.2;
  else if (/\b(SKC|CLR|CAVOK|NCD)\b/.test(raw)) coverage = 0.08;

  let ceilingFt = wx.ceilingFt ?? 9000;
  if (wx.ceilingFt === null) {
    const m = raw.match(/\b(?:BKN|OVC|SCT|FEW)(\d{3})\b/);
    if (m) ceilingFt = parseInt(m[1], 10) * 100;
  }
  ceilingFt = THREE.MathUtils.clamp(ceilingFt, 900, 28000);

  return {coverage, ceilingFt, hasRain, isSnow, hasThunder};
}

function classifyHazardColor(sig: SigmetHazard): {hex: string; kind: 'turb' | 'ice' | 'conv'} {
  const txt = `${sig.hazard} ${sig.rawText}`.toUpperCase();
  if (sig.category === 'turbulence' || /TURB|LLWS|MTW|CAT/.test(txt)) {
    return {hex: '#F59E0B', kind: 'turb'};
  }
  if (sig.category === 'icing' || /ICE|ICG|FZRA|MIX/.test(txt)) {
    return {hex: '#0EA5E9', kind: 'ice'};
  }
  return {hex: '#EF4444', kind: 'conv'};
}

export function buildPanSectorGroup(params: {
  anchorLat: number;
  anchorLon: number;
  flight: LiveFlight | null;
  nearestWeather?: AirportWeather;
  airportsWeather?: AirportWeather[];
  sigmets?: SigmetHazard[];
  disruptions?: AirportDisruption[];
}): PanSectorRefs {
  const {
    anchorLat,
    anchorLon,
    flight,
    nearestWeather,
    airportsWeather = [],
    sigmets = [],
    disruptions = [],
  } = params;

  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  // 1. Tactical Ground Sector Plane, Coordinate Grid & Concentric Range Rings (50 / 100 / 150 NM)
  const sectorRadiusUnits = 115; // 230 NM radius
  const groundGeo = new THREE.PlaneGeometry(sectorRadiusUnits * 2.4, sectorRadiusUnits * 2.4);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#0A1322',
    roughness: 0.94,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.y = -0.05;
  group.add(groundMesh);
  disposables.push(groundGeo, groundMat);

  const grid = new THREE.GridHelper(220, 22, '#1E3A5F', '#122238');
  grid.position.y = 0;
  group.add(grid);
  disposables.push(grid.geometry, ...(Array.isArray(grid.material) ? grid.material : [grid.material]));

  const ringMat = new THREE.LineBasicMaterial({
    color: '#38BDF8',
    transparent: true,
    opacity: 0.34,
  });
  disposables.push(ringMat);
  for (const nm of [40, 80, 140]) {
    const r = nm / NM_PER_UNIT;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 64; s++) {
      const a = (s / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.08, Math.sin(a) * r));
    }
    const rGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const rLine = new THREE.Line(rGeo, ringMat);
    group.add(rLine);
    disposables.push(rGeo);
  }

  // Selected Flight Altitude Vertical Stem & Live Breadcrumb Ribbon
  if (flight) {
    const flY = THREE.MathUtils.clamp(flight.altitudeFt / FT_PER_UNIT, 0.8, 42);
    const stemGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, flY, 0),
    ]);
    const stemMat = new THREE.LineDashedMaterial({
      color: '#38BDF8',
      dashSize: 0.9,
      gapSize: 0.6,
      transparent: true,
      opacity: 0.72,
    });
    const stemLine = new THREE.Line(stemGeo, stemMat);
    stemLine.computeLineDistances();
    group.add(stemLine);
    disposables.push(stemGeo, stemMat);

    const trailPts = (flight.trail ?? []).slice(-32);
    if (trailPts.length >= 2) {
      const curvePts = trailPts.map((pt) => {
        const [x, z] = latLonToLocalXZ(pt.lat, pt.lon, anchorLat, anchorLon);
        const y = THREE.MathUtils.clamp((pt.altFt || flight.altitudeFt) / FT_PER_UNIT, 0.4, 42);
        return new THREE.Vector3(x, y, z);
      });
      curvePts.push(new THREE.Vector3(0, flY, 0));
      const trailGeo = new THREE.BufferGeometry().setFromPoints(curvePts);
      const trailMat = new THREE.LineBasicMaterial({color: '#22D3EE'});
      const trailLine = new THREE.Line(trailGeo, trailMat);
      group.add(trailLine);
      disposables.push(trailGeo, trailMat);
    }
  }

  // 2. 3D Extruded TFR & Restriction Outlines (SIGMETs + Airport Ground Stops / GDP / Closures)
  let tfrVolumeCount = 0;
  const maxRangeSq = (sectorRadiusUnits * 1.35) ** 2;

  for (const sig of sigmets.slice(0, 48)) {
    if (!sig.coords || sig.coords.length < 3) continue;
    const localPts: Array<[number, number]> = [];
    let cx = 0;
    let cz = 0;
    for (const [lat, lon] of sig.coords) {
      const [lx, lz] = latLonToLocalXZ(lat, lon, anchorLat, anchorLon);
      localPts.push([lx, lz]);
      cx += lx;
      cz += lz;
    }
    cx /= localPts.length;
    cz /= localPts.length;
    if (cx * cx + cz * cz > maxRangeSq) continue;

    // ShapeGeometry / ExtrudeGeometry operates in XY plane -> rotateX(-Math.PI/2) puts (x, y) -> (x, -z)
    const shape = new THREE.Shape();
    localPts.forEach(([lx, lz], idx) => {
      if (idx === 0) shape.moveTo(lx, -lz);
      else shape.lineTo(lx, -lz);
    });
    shape.closePath();

    const baseFt = Math.max(1500, sig.baseFt ?? 4000);
    const topFt = Math.max(baseFt + 4000, sig.topFt ?? 26000);
    const baseY = baseFt / FT_PER_UNIT;
    const heightY = Math.max(2.2, (topFt - baseFt) / FT_PER_UNIT);

    const {hex} = classifyHazardColor(sig);
    const extGeo = new THREE.ExtrudeGeometry(shape, {
      depth: heightY,
      bevelEnabled: false,
      curveSegments: 2,
    });
    extGeo.rotateX(-Math.PI / 2);

    const volMat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const volMesh = new THREE.Mesh(extGeo, volMat);
    volMesh.position.y = baseY;
    group.add(volMesh);

    const edgeGeo = new THREE.EdgesGeometry(extGeo, 14);
    const edgeMat = new THREE.LineBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.88,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLines.position.y = baseY;
    group.add(edgeLines);

    disposables.push(extGeo, volMat, edgeGeo, edgeMat);
    tfrVolumeCount++;
  }

  for (const d of disruptions) {
    const wxMatch = airportsWeather.find(
      (a) => a.icao === d.icao || (d.iata && a.iata === d.iata),
    );
    const catMatch = AIRPORT_CATALOG.find(
      (a) => a.icao === d.icao || (d.iata && a.iata === d.iata),
    );
    const ap = wxMatch ?? catMatch;
    if (!ap) continue;
    const [dx, dz] = latLonToLocalXZ(ap.lat, ap.lon, anchorLat, anchorLon);
    if (dx * dx + dz * dz > maxRangeSq) continue;

    const cylRadius = (d.severity === 'HIGH' ? 16 : 11) / NM_PER_UNIT;
    const cylHeight = 14;
    const cylColor =
      d.type === 'GS' || d.type === 'CLOSURE'
        ? '#EF4444'
        : d.type === 'GDP'
          ? '#F59E0B'
          : '#0EA5E9';

    const cylGeo = new THREE.CylinderGeometry(cylRadius, cylRadius, cylHeight, 28, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: cylColor,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cylMesh = new THREE.Mesh(cylGeo, cylMat);
    cylMesh.position.set(dx, cylHeight * 0.5, dz);
    group.add(cylMesh);

    const wireGeo = new THREE.EdgesGeometry(cylGeo, 12);
    const wireMat = new THREE.LineBasicMaterial({
      color: cylColor,
      transparent: true,
      opacity: 0.92,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    wire.position.set(dx, cylHeight * 0.5, dz);
    group.add(wire);

    disposables.push(cylGeo, cylMat, wireGeo, wireMat);
    tfrVolumeCount++;
  }

  // 3. Real METAR-Driven 3D Clouds & Precipitation (InstancedMesh for crisp 60fps performance)
  const metarState = inferMetarCloudState(nearestWeather);
  const wxStations = airportsWeather
    .map((w) => {
      const [wxX, wxZ] = latLonToLocalXZ(w.lat, w.lon, anchorLat, anchorLon);
      return {wx: w, x: wxX, z: wxZ, state: inferMetarCloudState(w)};
    })
    .filter((s) => s.x * s.x + s.z * s.z <= maxRangeSq)
    .slice(0, 12);

  interface CloudSpec {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    storm: boolean;
  }
  const cloudSpecs: CloudSpec[] = [];
  const precipSeeds: Array<{x: number; z: number; topY: number; snow: boolean}> = [];

  const pushCluster = (
    cx: number,
    cz: number,
    ceilingFt: number,
    coverage: number,
    storm: boolean,
    snow: boolean,
    rain: boolean,
    spreadUnits: number,
    seedBase: number,
  ) => {
    const baseY = THREE.MathUtils.clamp(ceilingFt / FT_PER_UNIT, 1.4, 26);
    const count = Math.max(4, Math.round(coverage * 22));
    for (let i = 0; i < count; i++) {
      const h1 = Math.abs(Math.sin((seedBase + i * 13.7) * 1.91));
      const h2 = Math.abs(Math.cos((seedBase + i * 7.3) * 2.43));
      const angle = ((i * 137.5 + seedBase * 19) % 360) * (Math.PI / 180);
      const rad = (0.15 + h1 * 0.85) * spreadUnits;
      const px = cx + Math.cos(angle) * rad;
      const pz = cz + Math.sin(angle) * rad;
      const py = baseY + (h2 - 0.35) * (storm ? 4.2 : 1.5);
      const sBase = storm ? 3.8 + h1 * 4.5 : 2.6 + h1 * 3.4;
      cloudSpecs.push({
        x: px,
        y: py,
        z: pz,
        sx: sBase * 1.45,
        sy: storm ? sBase * 0.72 : sBase * 0.36,
        sz: sBase * 1.15,
        storm,
      });

      if (rain || snow || storm) {
        const dropsPerPuff = storm ? 12 : 6;
        for (let d = 0; d < dropsPerPuff; d++) {
          const da = ((d * 61 + i * 29) % 360) * (Math.PI / 180);
          const dr = ((d + 1) / (dropsPerPuff + 1)) * sBase * 0.9;
          precipSeeds.push({
            x: px + Math.cos(da) * dr,
            z: pz + Math.sin(da) * dr,
            topY: Math.max(1.2, py - 0.6),
            snow,
          });
        }
      }
    }
  };

  if (wxStations.length > 0) {
    wxStations.forEach((st, idx) => {
      pushCluster(
        st.x,
        st.z,
        st.state.ceilingFt,
        st.state.coverage,
        st.state.hasThunder,
        st.state.isSnow,
        st.state.hasRain,
        24,
        idx + 1,
      );
    });
  } else {
    pushCluster(
      0,
      0,
      metarState.ceilingFt,
      metarState.coverage,
      metarState.hasThunder,
      metarState.isSnow,
      metarState.hasRain,
      48,
      7,
    );
  }

  // Add storm anvil cloud clusters at convective SIGMET centers inside sector
  sigmets.slice(0, 12).forEach((sig, idx) => {
    const {kind} = classifyHazardColor(sig);
    if (kind !== 'conv' || !sig.coords || sig.coords.length < 3) return;
    let cx = 0;
    let cz = 0;
    for (const [lat, lon] of sig.coords) {
      const [lx, lz] = latLonToLocalXZ(lat, lon, anchorLat, anchorLon);
      cx += lx;
      cz += lz;
    }
    cx /= sig.coords.length;
    cz /= sig.coords.length;
    if (cx * cx + cz * cz > maxRangeSq) return;
    pushCluster(cx, cz, sig.baseFt ?? 7500, 0.72, true, false, true, 16, 100 + idx);
  });

  const maxClouds = Math.min(cloudSpecs.length, 320);
  const cloudGeo = new THREE.DodecahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, Math.max(1, maxClouds));
  cloudInst.count = maxClouds;
  const dummy = new THREE.Object3D();
  const stormColor = new THREE.Color('#64748B');
  const fairColor = new THREE.Color('#F1F5F9');

  for (let i = 0; i < maxClouds; i++) {
    const c = cloudSpecs[i];
    dummy.position.set(c.x, c.y, c.z);
    dummy.scale.set(c.sx, c.sy, c.sz);
    dummy.rotation.set(0, (i * 0.73) % (Math.PI * 2), 0);
    dummy.updateMatrix();
    cloudInst.setMatrixAt(i, dummy.matrix);
    cloudInst.setColorAt(i, c.storm ? stormColor : fairColor);
  }
  cloudInst.instanceMatrix.needsUpdate = true;
  if (cloudInst.instanceColor) cloudInst.instanceColor.needsUpdate = true;
  if (maxClouds > 0) group.add(cloudInst);
  disposables.push(cloudGeo, cloudMat);

  // Instanced Precipitation Shafts (strictly rendered when METAR/SIGMET reports rain/TS/snow)
  const maxPrecip = Math.min(precipSeeds.length, 640);
  const precipGeo = new THREE.BoxGeometry(0.11, 1.35, 0.11);
  const precipMat = new THREE.MeshBasicMaterial({
    color: metarState.isSnow ? '#E0F2FE' : '#38BDF8',
    transparent: true,
    opacity: 0.62,
  });
  const precipInst = new THREE.InstancedMesh(precipGeo, precipMat, Math.max(1, maxPrecip));
  precipInst.count = maxPrecip;
  const precipYOffsets = new Float32Array(Math.max(1, maxPrecip));

  for (let i = 0; i < maxPrecip; i++) {
    const p = precipSeeds[i];
    precipYOffsets[i] = ((i * 0.37) % 1) * p.topY;
    dummy.position.set(p.x, precipYOffsets[i], p.z);
    dummy.scale.set(1, p.snow ? 0.45 : 1.0, 1);
    dummy.rotation.set(0, 0, p.snow ? 0 : 0.14);
    dummy.updateMatrix();
    precipInst.setMatrixAt(i, dummy.matrix);
  }
  precipInst.instanceMatrix.needsUpdate = true;
  if (maxPrecip > 0) group.add(precipInst);
  disposables.push(precipGeo, precipMat);

  let driftPhase = 0;
  const update = (dt: number) => {
    const safeDt = Math.min(dt, 0.05);
    driftPhase += safeDt;

    if (maxClouds > 0) {
      cloudInst.position.x = Math.sin(driftPhase * 0.12) * 1.4;
      cloudInst.position.z = Math.cos(driftPhase * 0.09) * 1.1;
    }

    if (maxPrecip > 0) {
      const fallRate = metarState.isSnow ? 2.4 : 8.5;
      for (let i = 0; i < maxPrecip; i++) {
        const seed = precipSeeds[i];
        let curY = precipYOffsets[i] - fallRate * safeDt;
        if (curY < 0.2) curY = seed.topY;
        precipYOffsets[i] = curY;
        dummy.position.set(seed.x, curY, seed.z);
        dummy.scale.set(1, seed.snow ? 0.45 : 1.0, 1);
        dummy.rotation.set(0, 0, seed.snow ? 0 : 0.14);
        dummy.updateMatrix();
        precipInst.setMatrixAt(i, dummy.matrix);
      }
      precipInst.instanceMatrix.needsUpdate = true;
    }
  };

  return {
    group,
    cloudCount: maxClouds,
    precipCount: maxPrecip,
    tfrVolumeCount,
    ceilingFt: metarState.ceilingFt,
    hasPrecip: maxPrecip > 0,
    update,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
