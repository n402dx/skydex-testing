import * as THREE from 'three';
import type {AircraftGeometrySpec, AirlineLivery} from '../data/aviationCatalog';
import type {SpecialLiverySpec} from '../types/aviation';
import {createAirlineLiveryTexture, createTailFinTexture} from './avionicsTextures';

export interface AircraftModelRefs {
  group: THREE.Group;
  gearGroup: THREE.Group;
  fanBlades: THREE.Mesh[];
  strobeLight: THREE.Mesh;
  beaconLight: THREE.Mesh;
  groundContactOffsetY: number;
  dispose: () => void;
}

export function buildProceduralAircraft(
  spec: AircraftGeometrySpec,
  livery: AirlineLivery,
  registration: string,
  maxAnisotropy: number,
  gearExtended: boolean,
  specialLivery: SpecialLiverySpec | null = null,
): AircraftModelRefs {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const fuselageTex = createAirlineLiveryTexture(
    livery,
    registration,
    spec,
    specialLivery,
    maxAnisotropy,
  );
  const tailTex = createTailFinTexture(livery, specialLivery, maxAnisotropy);
  disposables.push(fuselageTex, tailTex);

  const r = spec.fuselageRadius;
  const len = 6.2 * spec.lengthScale;
  const span = 5.8 * spec.wingspanScale;
  const subtype = spec.subtype ?? (spec.tTail ? 'tTail' : spec.category === 'widebody' ? 'b777' : 'a320');
  const isFighter = subtype === 'fighter';
  const isTurboprop = subtype === 'turboprop';
  const isMilCargo = subtype === 'milcargo';
  const isHighWing = isTurboprop || isMilCargo;
  const isRearEngines = subtype === 'tTail' || subtype === 'bizjet';

  const baseFuselageColor = isFighter
    ? '#475569'
    : isMilCargo
      ? '#64748B'
      : specialLivery?.theme === 'turtle'
        ? specialLivery.primaryHex
        : livery.fuselageHex;

  const baseTailColor = isFighter
    ? '#334155'
    : isMilCargo
      ? '#475569'
      : specialLivery?.primaryHex || livery.tailHex;

  // Materials with crisp PBR roughness contrast
  const fuselageMat = new THREE.MeshPhysicalMaterial({
    map: isFighter || isMilCargo ? null : fuselageTex,
    color: isFighter || isMilCargo ? baseFuselageColor : '#FFFFFF',
    roughness: isFighter ? 0.55 : 0.26,
    metalness: isFighter ? 0.42 : 0.16,
    clearcoat: isFighter ? 0.15 : 0.86,
    clearcoatRoughness: 0.14,
  });
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: baseFuselageColor,
    roughness: 0.25,
    metalness: 0.14,
    clearcoat: 0.85,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: isFighter ? '#475569' : isMilCargo ? '#64748B' : '#E2E8F0',
    roughness: 0.46,
    metalness: 0.26,
  });
  const tailMat = new THREE.MeshPhysicalMaterial({
    color: baseTailColor,
    roughness: 0.3,
    metalness: 0.14,
    clearcoat: 0.8,
  });
  const tailDecalMat = new THREE.MeshPhysicalMaterial({
    map: tailTex,
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 0.85,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: '#94A3B8',
    roughness: 0.22,
    metalness: 0.88,
  });
  const intakeDarkMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.8,
    metalness: 0.2,
  });
  const darkTireMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.88,
    metalness: 0.04,
  });
  const cockpitGlassMat = new THREE.MeshPhysicalMaterial({
    color: subtype === 'a350' ? '#020617' : '#0F172A',
    roughness: 0.08,
    metalness: 0.22,
    clearcoat: 1.0,
  });
  disposables.push(
    fuselageMat,
    noseMat,
    wingMat,
    tailMat,
    tailDecalMat,
    metalMat,
    intakeDarkMat,
    darkTireMat,
    cockpitGlassMat,
  );

  // 1. Main Fuselage Cylinder (Z-aligned, Nose = -Z, Tail = +Z)
  const cylLen = len * (isFighter ? 0.56 : 0.66);
  const cylGeo = new THREE.CylinderGeometry(r, r * (isMilCargo ? 0.99 : 0.96), cylLen, 32);
  cylGeo.rotateX(Math.PI / 2);
  const fuselageMesh = new THREE.Mesh(cylGeo, fuselageMat);
  fuselageMesh.castShadow = true;
  fuselageMesh.receiveShadow = true;
  group.add(fuselageMesh);
  disposables.push(cylGeo);

  // Airframe-specific Dorsal Deck Extensions
  if (subtype === 'a380') {
    // Full-length double-decker oval crown
    const upperGeo = new THREE.CylinderGeometry(r * 0.78, r * 0.74, cylLen * 0.94, 24);
    upperGeo.rotateX(Math.PI / 2);
    const upperMesh = new THREE.Mesh(upperGeo, fuselageMat);
    upperMesh.position.y = r * 0.36;
    upperMesh.castShadow = true;
    group.add(upperMesh);
    disposables.push(upperGeo);
  } else if (subtype === 'b747') {
    // Signature Boeing 747 upper-deck forward hump
    const humpLen = cylLen * 0.38;
    const humpGeo = new THREE.CapsuleGeometry(r * 0.68, humpLen, 10, 18);
    humpGeo.rotateX(Math.PI / 2);
    const humpMesh = new THREE.Mesh(humpGeo, noseMat);
    humpMesh.position.set(0, r * 0.36, -cylLen * 0.28);
    humpMesh.castShadow = true;
    group.add(humpMesh);
    disposables.push(humpGeo);
  }

  // 2. Nose Cone (Lathe or Chined Fighter Nose)
  const nosePts: THREE.Vector2[] = [];
  const noseLen = len * (isFighter ? 0.3 : 0.19);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const prof = isFighter ? Math.pow(1 - t, 0.85) : Math.sin((1 - t) * (Math.PI / 2));
    nosePts.push(new THREE.Vector2(prof * r, t * noseLen));
  }
  const noseGeo = new THREE.LatheGeometry(nosePts, 24);
  noseGeo.rotateX(-Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeo, noseMat);
  noseMesh.position.z = -cylLen * 0.5;
  noseMesh.castShadow = true;
  group.add(noseMesh);
  disposables.push(noseGeo);

  // Cockpit Windshield Band / Bubble Canopy / A350 Raccoon Mask
  if (isFighter) {
    const canopyGeo = new THREE.CapsuleGeometry(r * 0.58, len * 0.18, 10, 14);
    canopyGeo.rotateX(Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeo, cockpitGlassMat);
    canopy.position.set(0, r * 0.62, -cylLen * 0.38);
    group.add(canopy);
    disposables.push(canopyGeo);
  } else {
    const windGeo = new THREE.CylinderGeometry(
      r * 0.72,
      r * 0.94,
      len * 0.065,
      20,
      1,
      false,
      -Math.PI * (subtype === 'a350' ? 0.44 : 0.36),
      Math.PI * (subtype === 'a350' ? 0.88 : 0.72),
    );
    windGeo.rotateX(-Math.PI / 2);
    const windMesh = new THREE.Mesh(windGeo, cockpitGlassMat);
    windMesh.position.set(0, r * 0.25, -cylLen * 0.5 - noseLen * 0.32);
    group.add(windMesh);
    disposables.push(windGeo);
  }

  // 3. Tail Cone (Upswept cargo ramp on milcargo)
  const tailConeGeo = new THREE.ConeGeometry(r * 0.96, len * 0.23, 24);
  tailConeGeo.rotateX(Math.PI / 2);
  const tailConeMesh = new THREE.Mesh(
    tailConeGeo,
    new THREE.MeshPhysicalMaterial({color: baseTailColor, roughness: 0.32, clearcoat: 0.7}),
  );
  tailConeMesh.position.set(0, isMilCargo ? r * 0.14 : 0, cylLen * 0.5 + len * 0.11);
  if (isMilCargo) tailConeMesh.rotation.x = 0.16;
  tailConeMesh.castShadow = true;
  group.add(tailConeMesh);
  disposables.push(tailConeGeo, tailConeMesh.material);

  // 4. Swept / Delta / High Main Wings
  const wingShape = new THREE.Shape();
  if (isFighter) {
    wingShape.moveTo(0, -0.75);
    wingShape.lineTo(span * 0.5, 0.55);
    wingShape.lineTo(span * 0.5, 0.92);
    wingShape.lineTo(0, 1.05);
  } else if (isTurboprop) {
    wingShape.moveTo(0, -0.34);
    wingShape.lineTo(span * 0.5, -0.1);
    wingShape.lineTo(span * 0.5, 0.22);
    wingShape.lineTo(0, 0.38);
  } else {
    wingShape.moveTo(0, -0.58);
    wingShape.lineTo(span * 0.5, subtype === 'b787' ? 1.02 : 0.86);
    wingShape.lineTo(span * 0.5, subtype === 'b787' ? 1.24 : 1.16);
    wingShape.lineTo(0, 0.78);
  }
  wingShape.closePath();

  const wingExtrude = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  wingExtrude.rotateX(Math.PI / 2);

  const wingY = isHighWing ? r * 0.72 : -r * 0.24;
  const dihedral = isHighWing ? -0.02 : 0.055;
  const rightWing = new THREE.Mesh(wingExtrude, wingMat);
  rightWing.position.set(r * 0.35, wingY, -0.2);
  rightWing.rotation.z = dihedral;
  rightWing.castShadow = true;
  rightWing.receiveShadow = true;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  leftWing.position.x = -r * 0.35;
  leftWing.rotation.z = -dihedral;
  group.add(leftWing);
  disposables.push(wingExtrude);

  // Raked Wingtips (B787/B777) or Upturned Sharklets (A350/A320/C919/B737)
  if (spec.winglets && !isFighter) {
    const isRaked = subtype === 'b787' || subtype === 'b777';
    const wlGeo = isRaked
      ? new THREE.BoxGeometry(0.32, 0.04, 0.34)
      : new THREE.BoxGeometry(0.045, 0.38 * spec.wingspanScale, 0.32);
    const tipZ = subtype === 'b787' ? 0.96 : 0.82;
    const tipY = wingY + span * 0.5 * Math.sin(dihedral) + (isRaked ? 0.05 : 0.18);
    const wlR = new THREE.Mesh(wlGeo, tailMat);
    wlR.position.set(r * 0.35 + span * 0.5, tipY, tipZ);
    wlR.rotation.z = isRaked ? 0.18 : -0.22;
    wlR.rotation.x = 0.25;
    group.add(wlR);

    const wlL = wlR.clone();
    wlL.position.x = -(r * 0.35 + span * 0.5);
    wlL.rotation.z = isRaked ? -0.18 : 0.22;
    group.add(wlL);
    disposables.push(wlGeo);
  }

  // 5. Vertical Stabilizer(s) + Textured Fin Decal Panels
  const finHeight = (isFighter ? 0.85 : isMilCargo ? 1.52 : 1.32) * spec.lengthScale;
  const vTailShape = new THREE.Shape();
  vTailShape.moveTo(0, 0);
  vTailShape.lineTo(0.85 * spec.lengthScale, finHeight);
  vTailShape.lineTo(1.38 * spec.lengthScale, finHeight);
  vTailShape.lineTo(1.15 * spec.lengthScale, 0);
  vTailShape.closePath();

  const vTailGeo = new THREE.ExtrudeGeometry(vTailShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
  });
  vTailGeo.rotateY(-Math.PI / 2);

  if (isFighter) {
    // Twin canted vertical tails on fighter
    const vtL = new THREE.Mesh(vTailGeo, tailMat);
    vtL.position.set(-r * 0.45, r * 0.45, len * 0.22);
    vtL.rotation.z = 0.28;
    const vtR = new THREE.Mesh(vTailGeo, tailMat);
    vtR.position.set(r * 0.45, r * 0.45, len * 0.22);
    vtR.rotation.z = -0.28;
    group.add(vtL, vtR);
  } else {
    const vTail = new THREE.Mesh(vTailGeo, tailMat);
    vTail.position.set(0.03, r * 0.55, len * 0.24);
    vTail.castShadow = true;
    group.add(vTail);

    // Carrier Fin Artwork Emblem Decals (Port & Starboard surfaces of fin)
    const finDecalGeo = new THREE.PlaneGeometry(0.75 * spec.lengthScale, finHeight * 0.65);
    const decalR = new THREE.Mesh(finDecalGeo, tailDecalMat);
    decalR.position.set(0.045, r * 0.55 + finHeight * 0.52, len * 0.24 + 0.96 * spec.lengthScale);
    decalR.rotation.y = Math.PI / 2;
    const decalL = new THREE.Mesh(finDecalGeo, tailDecalMat);
    decalL.position.set(-0.045, r * 0.55 + finHeight * 0.52, len * 0.24 + 0.96 * spec.lengthScale);
    decalL.rotation.y = -Math.PI / 2;
    group.add(decalR, decalL);
    disposables.push(finDecalGeo);
  }
  disposables.push(vTailGeo);

  // 6. Horizontal Stabilizers
  const hShape = new THREE.Shape();
  hShape.moveTo(0, -0.2);
  hShape.lineTo(span * 0.22, 0.35);
  hShape.lineTo(span * 0.22, 0.55);
  hShape.lineTo(0, 0.34);
  hShape.closePath();
  const hGeo = new THREE.ExtrudeGeometry(hShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
  });
  hGeo.rotateX(Math.PI / 2);
  const hY = spec.tTail ? r * 0.55 + finHeight * 0.94 : r * 0.16;
  const hZ = spec.tTail ? len * 0.42 : len * 0.38;
  const hR = new THREE.Mesh(hGeo, wingMat);
  hR.position.set(0.08, hY, hZ);
  hR.castShadow = true;
  group.add(hR);
  const hL = hR.clone();
  hL.scale.x = -1;
  hL.position.x = -0.08;
  group.add(hL);
  disposables.push(hGeo);

  // 7. Engines (Wing-Mounted Turbofans, Turboprop Nacelles + Props, Rear-Mounted T-Tail, or Twin Afterburners)
  const fanBlades: THREE.Mesh[] = [];
  const engOffsets = isFighter
    ? [
        {x: r * 0.42, y: 0, z: cylLen * 0.54},
        {x: -r * 0.42, y: 0, z: cylLen * 0.54},
      ]
    : isRearEngines
      ? [
          {x: r * 1.15, y: r * 0.22, z: len * 0.25},
          {x: -r * 1.15, y: r * 0.22, z: len * 0.25},
        ]
      : spec.engines === 4
        ? [
            {x: span * 0.19, y: wingY - r * 0.34, z: -0.22},
            {x: -span * 0.19, y: wingY - r * 0.34, z: -0.22},
            {x: span * 0.34, y: wingY - r * 0.24, z: 0.25},
            {x: -span * 0.34, y: wingY - r * 0.24, z: 0.25},
          ]
        : [
            {x: span * 0.21, y: wingY - (isHighWing ? 0.06 : r * 0.32), z: -0.22},
            {x: -span * 0.21, y: wingY - (isHighWing ? 0.06 : r * 0.32), z: -0.22},
          ];

  const cowlR = isTurboprop ? r * 0.42 : isFighter ? r * 0.42 : r * 0.58;
  const cowlLen = isTurboprop ? 0.85 : isFighter ? 0.72 : 0.98 * spec.lengthScale;
  const nacelleGeo = new THREE.CylinderGeometry(cowlR, cowlR * 0.88, cowlLen, 22, 1, true);
  nacelleGeo.rotateX(Math.PI / 2);
  const intakeGeo = new THREE.CylinderGeometry(cowlR * 0.9, cowlR * 0.78, cowlLen * 0.86, 18);
  intakeGeo.rotateX(Math.PI / 2);
  const coreGeo = new THREE.ConeGeometry(cowlR * 0.58, 0.44, 16);
  coreGeo.rotateX(Math.PI / 2);
  const fanGeo = new THREE.CylinderGeometry(cowlR * 0.82, cowlR * 0.82, 0.05, 14);
  fanGeo.rotateX(Math.PI / 2);
  const spinnerGeo = new THREE.ConeGeometry(cowlR * 0.28, 0.2, 12);
  spinnerGeo.rotateX(-Math.PI / 2);
  const pylonGeo = new THREE.BoxGeometry(0.06, 0.28, 0.58);
  const chevronGeo = new THREE.CylinderGeometry(cowlR * 0.84, cowlR * 0.72, 0.16, 10, 1, true);
  chevronGeo.rotateX(Math.PI / 2);
  const propBladeGeo = new THREE.BoxGeometry(0.055, cowlR * 2.9, 0.02);
  disposables.push(nacelleGeo, intakeGeo, coreGeo, fanGeo, spinnerGeo, pylonGeo, chevronGeo, propBladeGeo);

  for (const pos of engOffsets) {
    const engGroup = new THREE.Group();
    engGroup.position.set(pos.x, pos.y, pos.z);
    const cowl = new THREE.Mesh(nacelleGeo, isRearEngines || isFighter ? tailMat : noseMat);
    const intake = new THREE.Mesh(intakeGeo, intakeDarkMat);
    const core = new THREE.Mesh(coreGeo, intakeDarkMat);
    core.position.z = cowlLen * 0.56;
    const fan = new THREE.Mesh(fanGeo, metalMat);
    fan.position.z = -cowlLen * 0.34;
    const spinner = new THREE.Mesh(spinnerGeo, noseMat);
    spinner.position.z = -cowlLen * 0.44;
    engGroup.add(cowl, intake, core, fan, spinner);

    if (subtype === 'b787') {
      const chev = new THREE.Mesh(chevronGeo, intakeDarkMat);
      chev.position.z = cowlLen * 0.5;
      engGroup.add(chev);
    }

    if (isTurboprop) {
      const propGroup = new THREE.Mesh(propBladeGeo, intakeDarkMat);
      propGroup.position.z = -cowlLen * 0.52;
      const blade2 = new THREE.Mesh(propBladeGeo, intakeDarkMat);
      blade2.rotation.z = Math.PI / 3;
      const blade3 = new THREE.Mesh(propBladeGeo, intakeDarkMat);
      blade3.rotation.z = -Math.PI / 3;
      propGroup.add(blade2, blade3);
      engGroup.add(propGroup);
      fanBlades.push(propGroup);
    } else if (!isFighter && !isRearEngines) {
      const pylon = new THREE.Mesh(pylonGeo, wingMat);
      pylon.position.set(0, cowlR * 0.65, 0.05);
      engGroup.add(pylon);
    }

    fanBlades.push(fan);
    group.add(engGroup);
  }

  // 8. Retractable Landing Gear (Dual narrowbody vs 4-wheel widebody bogies + Exact Ground Offset)
  const gearGroup = new THREE.Group();
  const gearDrop = isFighter ? 0.3 : 0.42;
  const tireR = spec.category === 'widebody' ? 0.12 : 0.10;
  const strutGeo = new THREE.CylinderGeometry(0.036, 0.036, gearDrop, 10);
  const tireGeo = new THREE.CylinderGeometry(tireR, tireR, 0.085, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const bogieBeamGeo = new THREE.BoxGeometry(0.05, 0.05, 0.32);
  disposables.push(strutGeo, tireGeo, bogieBeamGeo);

  const wheelCenterY = -r - gearDrop + 0.04;
  const groundContactOffsetY = wheelCenterY - tireR;
  const isQuadBogie = spec.category === 'widebody' && !isMilCargo;

  const gearSpots = [
    {x: 0, z: -len * 0.28, isNose: true},
    {x: span * 0.125, z: 0.28, isNose: false},
    {x: -span * 0.125, z: 0.28, isNose: false},
  ];
  for (const gp of gearSpots) {
    const strut = new THREE.Mesh(strutGeo, metalMat);
    strut.position.set(gp.x, -r - gearDrop * 0.45, gp.z);
    gearGroup.add(strut);

    if (isQuadBogie && !gp.isNose) {
      const beam = new THREE.Mesh(bogieBeamGeo, metalMat);
      beam.position.set(gp.x, wheelCenterY, gp.z);
      gearGroup.add(beam);
      for (const dz of [-0.12, 0.12]) {
        const tireL = new THREE.Mesh(tireGeo, darkTireMat);
        tireL.position.set(gp.x - 0.075, wheelCenterY, gp.z + dz);
        const tireR = new THREE.Mesh(tireGeo, darkTireMat);
        tireR.position.set(gp.x + 0.075, wheelCenterY, gp.z + dz);
        gearGroup.add(tireL, tireR);
      }
    } else {
      const tireL = new THREE.Mesh(tireGeo, darkTireMat);
      tireL.position.set(gp.x - 0.06, wheelCenterY, gp.z);
      const tireR = new THREE.Mesh(tireGeo, darkTireMat);
      tireR.position.set(gp.x + 0.06, wheelCenterY, gp.z);
      gearGroup.add(tireL, tireR);
    }
  }
  gearGroup.visible = gearExtended;
  group.add(gearGroup);

  // 9. Navigation & Anti-Collision Beacons
  const beaconGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const redMat = new THREE.MeshBasicMaterial({color: '#EF4444'});
  const greenMat = new THREE.MeshBasicMaterial({color: '#22C55E'});
  const whiteStrobeMat = new THREE.MeshBasicMaterial({color: '#FFFFFF'});
  disposables.push(beaconGeo, redMat, greenMat, whiteStrobeMat);

  const navLeft = new THREE.Mesh(beaconGeo, redMat);
  navLeft.position.set(-(r * 0.35 + span * 0.5), wingY, 0.85);
  const navRight = new THREE.Mesh(beaconGeo, greenMat);
  navRight.position.set(r * 0.35 + span * 0.5, wingY, 0.85);
  const beaconLight = new THREE.Mesh(beaconGeo, redMat);
  beaconLight.position.set(0, r + (subtype === 'a380' ? r * 0.42 : 0.04), 0);
  const strobeLight = new THREE.Mesh(beaconGeo, whiteStrobeMat);
  strobeLight.position.set(0, r * 0.55 + finHeight, len * 0.39);
  group.add(navLeft, navRight, beaconLight, strobeLight);

  return {
    group,
    gearGroup,
    fanBlades,
    strobeLight,
    beaconLight,
    groundContactOffsetY,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
