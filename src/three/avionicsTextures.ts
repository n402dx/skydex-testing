import * as THREE from 'three';
import type {
  AircraftGeometrySpec,
  AirlineLivery,
} from '../data/aviationCatalog';
import type {AirportWeather, LiveFlight, SpecialLiverySpec} from '../types/aviation';

export interface AvionicsTextureBundle {
  pfdCanvas: HTMLCanvasElement;
  pfdTexture: THREE.CanvasTexture;
  ndCanvas: HTMLCanvasElement;
  ndTexture: THREE.CanvasTexture;
  eicasCanvas: HTMLCanvasElement;
  eicasTexture: THREE.CanvasTexture;
  mcpCanvas: HTMLCanvasElement;
  mcpTexture: THREE.CanvasTexture;
  fmcLeftCanvas: HTMLCanvasElement;
  fmcLeftTexture: THREE.CanvasTexture;
  fmcRightCanvas: HTMLCanvasElement;
  fmcRightTexture: THREE.CanvasTexture;
  overheadCanvas: HTMLCanvasElement;
  overheadTexture: THREE.CanvasTexture;
  dispose: () => void;
}

const SDG_WHEEL_COLORS = [
  '#E5243B',
  '#DDA63A',
  '#4C9F38',
  '#C5192D',
  '#FF3A21',
  '#26BDE2',
  '#FCC30B',
  '#A21942',
  '#FD6925',
  '#DD1367',
  '#FD9D24',
  '#BF8B2E',
  '#3F7E44',
  '#0A97D9',
  '#56C02B',
  '#00689D',
  '#19486A',
];

function createOverheadCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#182230';
  ctx.fillRect(0, 0, 512, 512);

  // Panel dividers
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  for (const x of [170, 342]) {
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, 504);
    ctx.stroke();
  }
  for (const y of [125, 250, 375]) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(504, y);
    ctx.stroke();
  }

  const sections = [
    {x: 85, y: 26, title: 'ADIRU'},
    {x: 256, y: 26, title: 'ELEC / APU'},
    {x: 427, y: 26, title: 'HYDRAULIC'},
    {x: 85, y: 150, title: 'FUEL PUMPS'},
    {x: 256, y: 150, title: 'AIR / PACKS'},
    {x: 427, y: 150, title: 'ANTI-ICE'},
    {x: 85, y: 275, title: 'EXT LTS'},
    {x: 256, y: 275, title: 'CABIN PRESS'},
    {x: 427, y: 275, title: 'CARGO FIRE'},
    {x: 85, y: 400, title: 'EMER LTS'},
    {x: 256, y: 400, title: 'SIGNS / OXY'},
    {x: 427, y: 400, title: 'WIPERS'},
  ];

  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  for (const sec of sections) {
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(sec.title, sec.x, sec.y);

    // Korry pushbuttons
    for (let col = -1; col <= 1; col++) {
      const bx = sec.x + col * 42 - 14;
      const by = sec.y + 18;
      ctx.fillStyle = '#090D16';
      ctx.fillRect(bx, by, 28, 28);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, 28, 28);
      const isLit = (sec.x + col + sec.y) % 4 === 0;
      ctx.fillStyle = isLit ? '#38BDF8' : '#22C55E';
      ctx.fillRect(bx + 5, by + 18, 18, 4);
    }

    // Rotary selector dial
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(sec.x, sec.y + 72, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sec.x, sec.y + 72);
    ctx.lineTo(sec.x + 8, sec.y + 64);
    ctx.stroke();
  }

  return canvas;
}

export function createAvionicsTextures(maxAnisotropy: number): AvionicsTextureBundle {
  const mk = (w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return {canvas, texture};
  };

  const pfd = mk(512, 512);
  const nd = mk(512, 512);
  const eicas = mk(512, 512);
  const mcp = mk(512, 128);
  const fmcL = mk(256, 320);
  const fmcR = mk(256, 320);

  const overheadCanvas = createOverheadCanvas();
  const overheadTexture = new THREE.CanvasTexture(overheadCanvas);
  overheadTexture.colorSpace = THREE.SRGBColorSpace;
  overheadTexture.anisotropy = maxAnisotropy;

  return {
    pfdCanvas: pfd.canvas,
    pfdTexture: pfd.texture,
    ndCanvas: nd.canvas,
    ndTexture: nd.texture,
    eicasCanvas: eicas.canvas,
    eicasTexture: eicas.texture,
    mcpCanvas: mcp.canvas,
    mcpTexture: mcp.texture,
    fmcLeftCanvas: fmcL.canvas,
    fmcLeftTexture: fmcL.texture,
    fmcRightCanvas: fmcR.canvas,
    fmcRightTexture: fmcR.texture,
    overheadCanvas,
    overheadTexture,
    dispose: () => {
      pfd.texture.dispose();
      nd.texture.dispose();
      eicas.texture.dispose();
      mcp.texture.dispose();
      fmcL.texture.dispose();
      fmcR.texture.dispose();
      overheadTexture.dispose();
    },
  };
}

export function drawPfd(
  bundle: AvionicsTextureBundle,
  flight: LiveFlight,
  bankDeg: number,
  weather?: AirportWeather,
) {
  const ctx = bundle.pfdCanvas.getContext('2d');
  if (!ctx) return;
  const W = 512;
  const H = 512;
  ctx.fillStyle = '#05080F';
  ctx.fillRect(0, 0, W, H);

  // FMA Top Bar
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(16, 12, W - 32, 42);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 12, W - 32, 42);

  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#22C55E';
  ctx.fillText(flight.onGround ? 'TAXI' : 'THR REF', 98, 39);
  ctx.fillText(flight.onGround ? 'HDG' : 'LNAV', 256, 39);
  ctx.fillText(flight.onGround ? 'ALT' : 'VNAV PTH', 414, 39);

  // Artificial Horizon Clip Region
  const cx = 248;
  const cy = 245;
  const hw = 220;
  const hh = 220;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - hw / 2, cy - hh / 2, hw, hh, 16);
  ctx.clip();

  const pitchDeg = THREE.MathUtils.clamp(flight.verticalRateFpm / 220, -14, 14);
  const pitchPx = pitchDeg * 4.5;
  const rollRad = THREE.MathUtils.degToRad(-bankDeg);

  ctx.translate(cx, cy);
  ctx.rotate(rollRad);

  // Sky & Ground
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-300, -300 + pitchPx, 600, 300);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-300, pitchPx, 600, 300);

  // Horizon line
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-250, pitchPx);
  ctx.lineTo(250, pitchPx);
  ctx.stroke();

  // Pitch ladder
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '12px "JetBrains Mono", monospace';
  for (let p = -15; p <= 15; p += 5) {
    if (p === 0) continue;
    const py = pitchPx - p * 4.5;
    const half = p % 10 === 0 ? 34 : 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-half, py);
    ctx.lineTo(half, py);
    ctx.stroke();
    if (p % 10 === 0) {
      ctx.fillText(String(Math.abs(p)), -half - 16, py + 4);
      ctx.fillText(String(Math.abs(p)), half + 16, py + 4);
    }
  }
  ctx.restore();

  // Fixed Aircraft Reference Symbol
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 42, cy);
  ctx.lineTo(cx - 14, cy);
  ctx.lineTo(cx - 14, cy + 10);
  ctx.moveTo(cx + 42, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.lineTo(cx + 14, cy + 10);
  ctx.stroke();
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(cx - 4, cy - 4, 8, 8);

  // Airspeed Tape (Left)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(16, 110, 88, 270);
  ctx.strokeStyle = '#475569';
  ctx.strokeRect(16, 110, 88, 270);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(flight.groundSpeedKts)}`, 94, 253);
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#38BDF8';
  ctx.fillText('GS KT', 94, 130);

  // Altitude Tape (Right)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(386, 110, 110, 270);
  ctx.strokeStyle = '#475569';
  ctx.strokeRect(386, 110, 110, 270);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 21px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${flight.altitudeFt.toLocaleString()}`, 488, 253);
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#22C55E';
  ctx.fillText(`${flight.verticalRateFpm >= 0 ? '+' : ''}${flight.verticalRateFpm} FPM`, 488, 132);
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(weather?.altimeterHpa ? `QNH ${Math.round(weather.altimeterHpa)}` : 'STD 1013', 488, 370);

  // Heading Compass Tape (Bottom)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(128, 412, 240, 68);
  ctx.strokeStyle = '#475569';
  ctx.strokeRect(128, 412, 240, 68);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(flight.trueTrackDeg)).padStart(3, '0')}°`, 248, 456);
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#D946EF';
  ctx.fillText(`${flight.callsign} · ${flight.aircraftType}`, 248, 496);

  bundle.pfdTexture.needsUpdate = true;
}

export function drawNd(
  bundle: AvionicsTextureBundle,
  flight: LiveFlight,
  nearbyFlights: LiveFlight[],
) {
  const ctx = bundle.ndCanvas.getContext('2d');
  if (!ctx) return;
  const W = 512;
  const H = 512;
  ctx.fillStyle = '#04070D';
  ctx.fillRect(0, 0, W, H);

  const cx = 256;
  const cy = 310;
  const radius = 210;

  ctx.fillStyle = '#22C55E';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`GS ${flight.groundSpeedKts} KT`, 22, 34);
  ctx.fillStyle = '#D946EF';
  ctx.textAlign = 'right';
  ctx.fillText(
    flight.origin && flight.destination ? `${flight.origin} → ${flight.destination}` : flight.callsign,
    W - 22,
    34,
  );

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
  ctx.lineWidth = 1.5;
  for (const frac of [0.35, 0.68, 1.0]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * frac, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  const trkRad = THREE.MathUtils.degToRad(-flight.trueTrackDeg);
  for (let deg = 0; deg < 360; deg += 15) {
    const a = THREE.MathUtils.degToRad(deg) + trkRad - Math.PI / 2;
    const x1 = Math.cos(a) * (radius - 10);
    const y1 = Math.sin(a) * (radius - 10);
    const x2 = Math.cos(a) * radius;
    const y2 = Math.sin(a) * radius;
    if (y2 < 45) {
      ctx.strokeStyle = '#94A3B8';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (deg % 30 === 0) {
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          String(deg / 10).padStart(2, '0'),
          Math.cos(a) * (radius - 26),
          Math.sin(a) * (radius - 26) + 5,
        );
      }
    }
  }

  ctx.strokeStyle = '#D946EF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -radius * 0.85);
  ctx.stroke();

  for (const other of nearbyFlights.slice(0, 20)) {
    if (other.id === flight.id) continue;
    const dLat = (other.lat - flight.lat) * 60;
    const dLon = (other.lon - flight.lon) * 60 * Math.cos(THREE.MathUtils.degToRad(flight.lat));
    const scale = radius / 60;
    const wx = dLon * scale;
    const wy = -dLat * scale;
    const rx = wx * Math.cos(trkRad) - wy * Math.sin(trkRad);
    const ry = wx * Math.sin(trkRad) + wy * Math.cos(trkRad);
    if (Math.hypot(rx, ry) < radius - 14 && ry < 40) {
      const altDiff = Math.round((other.altitudeFt - flight.altitudeFt) / 100);
      ctx.strokeStyle = Math.abs(altDiff) < 20 ? '#F59E0B' : '#38BDF8';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx - 5, ry - 5, 10, 10);
      ctx.fillStyle = Math.abs(altDiff) < 20 ? '#F59E0B' : '#38BDF8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${altDiff >= 0 ? '+' : ''}${altDiff}`, rx + 8, ry + 4);
    }
  }
  ctx.restore();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx - 10, cy + 10);
  ctx.lineTo(cx + 10, cy + 10);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = flight.isEstimated ? '#F59E0B' : '#38BDF8';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    flight.isEstimated ? `DR-EST ±${flight.uncertaintyNm} NM` : `SRC ${flight.source.toUpperCase()}`,
    22,
    H - 22,
  );

  bundle.ndTexture.needsUpdate = true;
}

export function drawEicas(bundle: AvionicsTextureBundle, flight: LiveFlight) {
  const ctx = bundle.eicasCanvas.getContext('2d');
  if (!ctx) return;
  const W = 512;
  const H = 512;
  ctx.fillStyle = '#05080F';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('EICAS / SYSTEMS', 24, 38);
  ctx.fillStyle = '#94A3B8';
  ctx.textAlign = 'right';
  ctx.fillText(flight.registration || flight.icao24, W - 24, 38);

  const n1Pct = flight.onGround
    ? flight.groundSpeedKts > 5
      ? 34.2
      : 21.8
    : THREE.MathUtils.clamp(68 + flight.groundSpeedKts / 22, 72, 94.5);
  const egt = flight.onGround ? 415 : Math.round(585 + n1Pct * 1.4);

  const drawGauge = (cx: number, cy: number, label: string, val: string, pct: number, color: string) => {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, Math.PI * 0.75, Math.PI * 2.15);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, Math.PI * 0.75, Math.PI * (0.75 + 1.4 * Math.min(1, pct / 100)));
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(val, cx, cy + 8);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText(label, cx, cy + 36);
  };

  drawGauge(138, 155, 'N1 ENG 1', `${n1Pct.toFixed(1)}%`, n1Pct, '#22C55E');
  drawGauge(374, 155, 'N1 ENG 2', `${(n1Pct - 0.3).toFixed(1)}%`, n1Pct - 0.3, '#22C55E');

  const gearDown = flight.onGround || flight.altitudeFt < 2600;
  const flaps = flight.onGround ? 'FLAPS 1+F' : flight.altitudeFt < 5000 ? 'FLAPS 1' : 'FLAPS UP';

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(24, 270, W - 48, 210);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 270, W - 48, 210);

  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(`EGT: ${egt}°C / ${egt - 4}°C`, 44, 312);
  ctx.fillText(`SQUAWK: ${flight.squawk || '2000'}`, 44, 350);
  ctx.fillStyle = gearDown ? '#22C55E' : '#38BDF8';
  ctx.fillText(`GEAR: ${gearDown ? 'DOWN (3 GREEN)' : 'UP & LOCKED'}`, 44, 390);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`CONFIG: ${flaps}`, 44, 430);
  ctx.fillStyle = flight.isEstimated ? '#F59E0B' : '#22C55E';
  ctx.fillText(`DATALINK: ${flight.isEstimated ? 'DEAD-RECKON EST' : 'LIVE ADS-B LOCK'}`, 44, 464);

  bundle.eicasTexture.needsUpdate = true;
}

export function drawMcp(bundle: AvionicsTextureBundle, flight: LiveFlight) {
  const ctx = bundle.mcpCanvas.getContext('2d');
  if (!ctx) return;
  const W = 512;
  const H = 128;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  const fields = [
    {label: 'IAS/MACH', val: String(Math.round(flight.groundSpeedKts)).padStart(3, '0')},
    {label: 'HDG/TRK', val: String(Math.round(flight.trueTrackDeg)).padStart(3, '0')},
    {label: 'ALTITUDE', val: String(Math.round(flight.altitudeFt / 100) * 100).padStart(5, '0')},
    {label: 'VERT SPD', val: `${flight.verticalRateFpm >= 0 ? '+' : ''}${flight.verticalRateFpm}`},
  ];

  fields.forEach((f, idx) => {
    const x = 18 + idx * 124;
    ctx.fillStyle = '#030712';
    ctx.fillRect(x, 36, 112, 64);
    ctx.strokeStyle = '#1F2937';
    ctx.strokeRect(x, 36, 112, 64);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(f.label, x + 56, 24);
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.fillText(f.val, x + 56, 76);
  });

  bundle.mcpTexture.needsUpdate = true;
}

export function drawFmcCdu(
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  flight: LiveFlight,
  isCaptain: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = 256;
  const H = 320;
  ctx.fillStyle = '#0B111C';
  ctx.fillRect(0, 0, W, H);

  // CRT Bezel
  ctx.fillStyle = '#030712';
  ctx.fillRect(14, 14, W - 28, 168);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, 168);

  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#22C55E';
  ctx.textAlign = 'center';
  ctx.fillText(isCaptain ? 'ACT RTE 1 LEGS' : 'PERF / INIT REF', W / 2, 34);

  ctx.textAlign = 'left';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`FLT: ${flight.callsign}`, 24, 58);
  ctx.fillText(`RTE: ${flight.origin || 'ZZZZ'} -> ${flight.destination || 'ZZZZ'}`, 24, 80);
  ctx.fillStyle = '#D946EF';
  ctx.fillText(`CRZ FL${Math.round(flight.altitudeFt / 100)}`, 24, 104);
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(`GS ${flight.groundSpeedKts}KT  HDG ${String(Math.round(flight.trueTrackDeg)).padStart(3, '0')}`, 24, 126);
  ctx.fillStyle = '#FACC15';
  ctx.fillText(`REG ${flight.registration || flight.icao24}`, 24, 148);
  ctx.fillStyle = '#22C55E';
  ctx.fillText(`SQK ${flight.squawk || '2000'} · ADSB LOCK`, 24, 170);

  // Alphanumeric CDU Keypad Grid
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(18 + col * 37, 196 + row * 28, 31, 22);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(18 + col * 37, 196 + row * 28, 31, 22);
    }
  }

  texture.needsUpdate = true;
}

function drawSdgWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number) {
  const seg = (Math.PI * 2) / SDG_WHEEL_COLORS.length;
  for (let i = 0; i < SDG_WHEEL_COLORS.length; i++) {
    const a0 = i * seg - Math.PI / 2;
    const a1 = (i + 1) * seg - Math.PI / 2 - 0.02;
    ctx.fillStyle = SDG_WHEEL_COLORS[i];
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1);
    ctx.arc(cx, cy, innerR, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Generates high-resolution 1024x1024 fuselage UV texture aligned to Three.js rotated cylinder:
 * u=0.25 -> Starboard (+X), u=0.50 -> Crown (+Y), u=0.75 -> Port (-X), u=0/1 -> Belly (-Y).
 * canvasY = H -> Nose (-Z), canvasY = 0 -> Tail (+Z).
 */
export function createAirlineLiveryTexture(
  livery: AirlineLivery,
  registration: string,
  spec: AircraftGeometrySpec,
  specialLivery: SpecialLiverySpec | null,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const isFullDarkBase =
    specialLivery?.theme === 'turtle' ||
    specialLivery?.theme === 'allblacks' ||
    specialLivery?.theme === 'aurora';
  const baseColor = isFullDarkBase
    ? specialLivery!.primaryHex
    : specialLivery?.theme === 'skyteam'
      ? '#CBD5E1'
      : livery.fuselageHex;
  const bellyColor = specialLivery?.bellyHex || livery.bellyHex;
  const accentColor = specialLivery?.accentHex || livery.accentHex;
  const titleText = (specialLivery?.titleText || livery.name).toUpperCase();
  const subtitleText = specialLivery?.subtitleText || '';

  // Base Fuselage Crown + Side fill
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);

  // Belly strips (centered on u=0 -> x=0..115 and u=1 -> x=909..1024)
  ctx.fillStyle = bellyColor;
  ctx.fillRect(0, 0, 128, H);
  ctx.fillRect(W - 128, 0, 128, H);

  // Cheatlines along u=0.14 (Starboard lower) and u=0.86 (Port lower)
  ctx.fillStyle = accentColor;
  ctx.fillRect(128, 0, 26, H);
  ctx.fillRect(W - 154, 0, 26, H);

  const drawSideProfile = (isStarboard: boolean) => {
    ctx.save();
    if (isStarboard) {
      // Starboard: center at u=0.25 (x=256), +lx goes Tail (-480) -> Nose (+480), +ly goes Crown -> Belly
      ctx.translate(256, 512);
      ctx.rotate(Math.PI / 2);
    } else {
      // Port: center at u=0.75 (x=768), +lx goes Nose (-480) -> Tail (+480), +ly goes Crown -> Belly
      ctx.translate(768, 512);
      ctx.rotate(-Math.PI / 2);
    }

    const dir = isStarboard ? -1 : 1; // forward (-dir*x) vs aft (+dir*x)

    // Bespoke Special Livery Artwork
    if (specialLivery) {
      if (specialLivery.theme === 'un-sdg') {
        // B-1356 United Dream UN SDGs flowing cerulean ribbon waves
        const grad = ctx.createLinearGradient(-480, -30, 480, 95);
        grad.addColorStop(0, '#0284C7');
        grad.addColorStop(0.55, '#0EA5E9');
        grad.addColorStop(1, '#0369A1');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-480, 24);
        ctx.bezierCurveTo(-180, -18, 120, 48, 480, 10);
        ctx.lineTo(480, 118);
        ctx.lineTo(-480, 118);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-480, 32);
        ctx.bezierCurveTo(-180, -10, 120, 54, 480, 18);
        ctx.stroke();

        drawSdgWheel(ctx, dir * 135, 36, 46, 20);
      } else if (specialLivery.theme === 'turtle') {
        // ANA JA381A/JA382A/JA383A Flying Honu turquoise/emerald/sunset sea waves & turtle motif
        ctx.fillStyle = specialLivery.secondaryHex;
        ctx.beginPath();
        ctx.moveTo(-480, -40);
        ctx.bezierCurveTo(-140, 25, 160, -35, 480, 15);
        ctx.lineTo(480, 120);
        ctx.lineTo(-480, 120);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = specialLivery.accentHex;
        ctx.beginPath();
        ctx.ellipse(dir * 120, 8, 52, 34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = specialLivery.primaryHex;
        ctx.beginPath();
        ctx.ellipse(dir * 120, 8, 38, 24, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (specialLivery.theme === 'retro') {
        // Classic Speedbird / China Eastern C919 / Lufthansa / TWA / Team USA heritage cheatline
        ctx.fillStyle = specialLivery.primaryHex;
        ctx.fillRect(-480, -4, 960, 26);
        ctx.fillStyle = specialLivery.secondaryHex;
        ctx.fillRect(-480, 22, 960, 9);
      } else if (specialLivery.theme === 'cartoon') {
        // R2-D2 / BB-8 / Disney / Sanrio themed bold fuselage panels
        ctx.fillStyle = specialLivery.primaryHex;
        ctx.fillRect(-380, -68, 90, 145);
        ctx.fillRect(220, -68, 120, 145);
        ctx.fillStyle = specialLivery.accentHex;
        ctx.fillRect(-240, 18, 420, 20);
      } else if (specialLivery.theme === 'panda') {
        // Sichuan Panda Route / Hainan Kung Fu Panda bamboo & stylized panda face medallion
        ctx.fillStyle = specialLivery.accentHex;
        ctx.fillRect(-480, 28, 960, 18);
        const px = dir * 130;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, 14, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(px - 24, -12, 11, 0, Math.PI * 2);
        ctx.arc(px + 24, -12, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px - 11, 10, 8, 10, -0.2, 0, Math.PI * 2);
        ctx.ellipse(px + 11, 10, 8, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (specialLivery.theme === 'aurora') {
        // Icelandair Hekla Aurora glowing Borealis waves across deep midnight fuselage
        const aurGrad = ctx.createLinearGradient(-420, -60, 420, 60);
        aurGrad.addColorStop(0, '#0EA5E9');
        aurGrad.addColorStop(0.5, '#4ADE80');
        aurGrad.addColorStop(1, '#38BDF8');
        ctx.fillStyle = aurGrad;
        ctx.beginPath();
        ctx.moveTo(-480, 12);
        ctx.bezierCurveTo(-160, -58, 160, 44, 480, -28);
        ctx.lineTo(480, 52);
        ctx.bezierCurveTo(160, 84, -160, -18, -480, 48);
        ctx.closePath();
        ctx.fill();
      } else if (specialLivery.theme === 'allblacks') {
        // Air New Zealand silver fern & charcoal sash
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(dir * 60, 60);
        ctx.quadraticCurveTo(dir * 180, 0, dir * 320, -45);
        ctx.stroke();
        for (let f = 0; f < 10; f++) {
          const fx = dir * (85 + f * 22);
          const fy = 44 - f * 9;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + dir * 12, fy - 14);
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx - dir * 6, fy + 12);
          ctx.stroke();
        }
      } else if (specialLivery.theme === 'expo' || specialLivery.theme === 'oneworld' || specialLivery.theme === 'skyteam') {
        // Flowing ribbon arc + alliance/expo emblem
        ctx.fillStyle = specialLivery.secondaryHex;
        ctx.beginPath();
        ctx.moveTo(-480, 26);
        ctx.bezierCurveTo(-140, -12, 140, 44, 480, 12);
        ctx.lineTo(480, 68);
        ctx.lineTo(-480, 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = specialLivery.accentHex;
        ctx.beginPath();
        ctx.arc(dir * 140, 24, 32, 0, Math.PI * 2);
        ctx.fill();
      } else if (specialLivery.theme === 'dreaming' || specialLivery.theme === 'floral') {
        // Qantas Yam Dreaming / Juneyao Chinese Peony / Air China Smiling China ribbon & petals
        const dotPalette = [specialLivery.primaryHex, specialLivery.secondaryHex, specialLivery.accentHex, '#38BDF8'];
        for (let i = 0; i < 42; i++) {
          ctx.fillStyle = dotPalette[i % dotPalette.length];
          ctx.beginPath();
          ctx.arc(-360 + i * 18, Math.sin(i * 0.65) * 42 + 12, 8 + (i % 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Passenger Cabin Window Rows (Lower deck + Upper deck for A380/B747)
    const isDarkSide = isFullDarkBase;
    ctx.fillStyle = isDarkSide ? '#E0F2FE' : '#0F172A';
    const winStep = spec.category === 'widebody' ? 18 : 22;
    for (let wx = -390; wx <= 390; wx += winStep) {
      // Skip door frames
      if (Math.abs(wx - -360) < 20 || Math.abs(wx - 350) < 20 || Math.abs(wx) < 16) continue;
      ctx.beginPath();
      ctx.roundRect(wx - 4, -22, 8, 13, 3);
      ctx.fill();
    }

    // Double-deck upper windows on A380 & forward hump windows on B747
    if (spec.subtype === 'a380') {
      for (let wx = -340; wx <= 320; wx += 20) {
        ctx.beginPath();
        ctx.roundRect(wx - 4, -72, 7, 11, 3);
        ctx.fill();
      }
    } else if (spec.subtype === 'b747') {
      const startHump = isStarboard ? 80 : -360;
      const endHump = isStarboard ? 360 : -80;
      for (let wx = startHump; wx <= endHump; wx += 22) {
        ctx.beginPath();
        ctx.roundRect(wx - 4, -70, 7, 11, 3);
        ctx.fill();
      }
    }

    // Passenger Boarding Doors (Forward & Aft L1/L4/R1/R4)
    ctx.strokeStyle = isDarkSide ? '#FFFFFF' : '#475569';
    ctx.lineWidth = 2.5;
    for (const dx of [-360, 350]) {
      ctx.strokeRect(dx - 11, -28, 22, 54);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(dx - 4, -20, 8, 12);
    }

    // Main Airline / Special Livery Titles (Centered cleanly above forward window belt)
    ctx.fillStyle = isDarkSide ? '#FFFFFF' : livery.titleColor;
    ctx.font = 'bold 34px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleText, -dir * 165, -54);

    if (subtitleText) {
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillStyle =
        specialLivery?.theme === 'un-sdg' || isDarkSide ? '#FFFFFF' : '#475569';
      ctx.fillText(subtitleText, -dir * 165, 58);
    }

    // Aft Aircraft Tail Registration Stencil
    if (registration) {
      ctx.fillStyle =
        specialLivery?.theme === 'un-sdg' || isDarkSide ? '#FFFFFF' : '#334155';
      ctx.font = 'bold 20px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(registration.toUpperCase(), dir * 285, 22);
    }

    ctx.restore();
  };

  drawSideProfile(true);
  drawSideProfile(false);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * High-detail 512x512 Vertical Stabilizer Texture for carrier tail emblems & Special Livery crests
 */
export function createTailFinTexture(
  livery: AirlineLivery,
  specialLivery: SpecialLiverySpec | null,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const finBg = specialLivery?.primaryHex || livery.tailHex;
  const finAccent = specialLivery?.accentHex || livery.accentHex;

  ctx.fillStyle = finBg;
  ctx.fillRect(0, 0, 512, 512);

  // Diagonal swept stripe motif
  ctx.fillStyle = finAccent;
  ctx.beginPath();
  ctx.moveTo(0, 380);
  ctx.lineTo(512, 110);
  ctx.lineTo(512, 185);
  ctx.lineTo(0, 455);
  ctx.closePath();
  ctx.fill();

  if (specialLivery?.theme === 'un-sdg') {
    // UN Laurel Emblem + 17-segment SDG circle on XiamenAir United Dream fin
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 236, 98, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    drawSdgWheel(ctx, 256, 236, 76, 36);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('UN SDGs', 256, 392);
  } else if (specialLivery?.theme === 'panda') {
    // Giant Panda Emblem on vertical tail
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(256, 244, 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(192, 178, 26, 0, Math.PI * 2);
    ctx.arc(320, 178, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(226, 235, 20, 26, -0.2, 0, Math.PI * 2);
    ctx.ellipse(286, 235, 20, 26, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (specialLivery?.theme === 'allblacks') {
    // Crisp White Koru / Silver Fern Emblem
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 256, 76, 0.2, Math.PI * 1.6);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(256, 256, 26, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Crisp IATA Carrier / Livery Fin Monogram
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(256, 240, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = finBg;
    ctx.font = 'bold 82px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((livery.iata || livery.icao.slice(0, 2)).toUpperCase(), 256, 246);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createApronRunwayTextures(maxAnisotropy: number): {
  apronMap: THREE.CanvasTexture;
  runwayMap: THREE.CanvasTexture;
} {
  // 1. Concrete / Tarmac Apron Aggregate Grid
  const apCanvas = document.createElement('canvas');
  apCanvas.width = 512;
  apCanvas.height = 512;
  const apCtx = apCanvas.getContext('2d')!;
  apCtx.fillStyle = '#1E2530';
  apCtx.fillRect(0, 0, 512, 512);
  apCtx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  apCtx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    apCtx.beginPath();
    apCtx.moveTo(i, 0);
    apCtx.lineTo(i, 512);
    apCtx.stroke();
    apCtx.beginPath();
    apCtx.moveTo(0, i);
    apCtx.lineTo(512, i);
    apCtx.stroke();
  }
  const apronMap = new THREE.CanvasTexture(apCanvas);
  apronMap.colorSpace = THREE.SRGBColorSpace;
  apronMap.wrapS = THREE.RepeatWrapping;
  apronMap.wrapT = THREE.RepeatWrapping;
  apronMap.repeat.set(18, 18);
  apronMap.anisotropy = maxAnisotropy;

  // 2. Grooved Runway Asphalt + Tire Skid Marks
  const rwCanvas = document.createElement('canvas');
  rwCanvas.width = 512;
  rwCanvas.height = 512;
  const rwCtx = rwCanvas.getContext('2d')!;
  rwCtx.fillStyle = '#0F172A';
  rwCtx.fillRect(0, 0, 512, 512);
  // Subtle rubber touchdown streaks
  for (let s = 0; s < 26; s++) {
    const sx = 120 + (s * 11) % 272;
    rwCtx.fillStyle = s % 2 === 0 ? 'rgba(2, 6, 23, 0.55)' : 'rgba(51, 65, 85, 0.25)';
    rwCtx.fillRect(sx, 0, 5, 512);
  }
  // Runway edge lines
  rwCtx.fillStyle = '#E2E8F0';
  rwCtx.fillRect(18, 0, 12, 512);
  rwCtx.fillRect(482, 0, 12, 512);

  const runwayMap = new THREE.CanvasTexture(rwCanvas);
  runwayMap.colorSpace = THREE.SRGBColorSpace;
  runwayMap.wrapS = THREE.ClampToEdgeWrapping;
  runwayMap.wrapT = THREE.RepeatWrapping;
  runwayMap.repeat.set(1, 10);
  runwayMap.anisotropy = maxAnisotropy;

  return {apronMap, runwayMap};
}
