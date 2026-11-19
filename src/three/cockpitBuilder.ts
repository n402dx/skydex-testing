import * as THREE from 'three';
import {
  createApronRunwayTextures,
  type AvionicsTextureBundle,
} from './avionicsTextures';

export interface CockpitRefs {
  group: THREE.Group;
  isAirbus: boolean;
  yokeLeft: THREE.Group;
  yokeRight: THREE.Group;
  throttleLeft: THREE.Mesh;
  throttleRight: THREE.Mesh;
  hudGlass: THREE.Mesh;
  outsideWorld: THREE.Group;
  cloudLayer: THREE.Group;
  dispose: () => void;
}

export interface ApronRefs {
  group: THREE.Group;
  radarDish: THREE.Group;
  dispose: () => void;
}

export function buildFlightDeckCockpit(
  textures: AvionicsTextureBundle,
  isAirbus = false,
): CockpitRefs {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const panelColor = isAirbus ? '#334155' : '#1E293B';
  const panelMat = new THREE.MeshStandardMaterial({color: panelColor, roughness: 0.62, metalness: 0.35});
  const glareMat = new THREE.MeshStandardMaterial({color: '#0F172A', roughness: 0.85, metalness: 0.1});
  const metalMat = new THREE.MeshStandardMaterial({color: '#64748B', roughness: 0.28, metalness: 0.82});
  const yokeMat = new THREE.MeshStandardMaterial({color: '#111827', roughness: 0.68, metalness: 0.16});
  const screenBezelMat = new THREE.MeshStandardMaterial({color: '#090D16', roughness: 0.4, metalness: 0.5});
  const windowFrameMat = new THREE.MeshStandardMaterial({color: '#1E293B', roughness: 0.55, metalness: 0.45});
  const sheepskinMat = new THREE.MeshStandardMaterial({color: '#64748B', roughness: 0.94, metalness: 0.02});
  const seatFrameMat = new THREE.MeshStandardMaterial({color: '#1E293B', roughness: 0.5, metalness: 0.35});
  disposables.push(
    panelMat,
    glareMat,
    metalMat,
    yokeMat,
    screenBezelMat,
    windowFrameMat,
    sheepskinMat,
    seatFrameMat,
  );

  // Main Instrument Panel Housing
  const mipGeo = new THREE.BoxGeometry(2.74, 0.74, 0.32);
  const mip = new THREE.Mesh(mipGeo, panelMat);
  mip.position.set(0, 0.85, -1.05);
  mip.rotation.x = -0.16;
  group.add(mip);
  disposables.push(mipGeo);

  // Glare Shield
  const glareGeo = new THREE.BoxGeometry(2.82, 0.09, 0.54);
  const glare = new THREE.Mesh(glareGeo, glareMat);
  glare.position.set(0, 1.24, -1.02);
  group.add(glare);
  disposables.push(glareGeo);

  // MCP / FCU Autopilot Faceplate
  const mcpGeo = new THREE.PlaneGeometry(1.18, 0.24);
  const mcpMat = new THREE.MeshBasicMaterial({map: textures.mcpTexture});
  const mcpMesh = new THREE.Mesh(mcpGeo, mcpMat);
  mcpMesh.position.set(0, 1.18, -0.745);
  mcpMesh.rotation.x = -0.25;
  group.add(mcpMesh);
  disposables.push(mcpGeo, mcpMat);

  // 5 EFIS Glass Displays (Captain PFD, Captain ND, Center EICAS, FO ND, FO PFD)
  const screenGeo = new THREE.PlaneGeometry(0.41, 0.41);
  const bezelGeo = new THREE.BoxGeometry(0.45, 0.45, 0.03);
  const pfdMat = new THREE.MeshBasicMaterial({map: textures.pfdTexture});
  const ndMat = new THREE.MeshBasicMaterial({map: textures.ndTexture});
  const eicasMat = new THREE.MeshBasicMaterial({map: textures.eicasTexture});
  disposables.push(screenGeo, bezelGeo, pfdMat, ndMat, eicasMat);

  const screenSlots = [
    {x: -1.02, mat: pfdMat},
    {x: -0.54, mat: ndMat},
    {x: 0.02, mat: eicasMat},
    {x: 0.54, mat: ndMat},
    {x: 1.02, mat: pfdMat},
  ];
  for (const s of screenSlots) {
    const bezel = new THREE.Mesh(bezelGeo, screenBezelMat);
    bezel.position.set(s.x, 0.85, -0.89);
    bezel.rotation.x = -0.16;
    const scr = new THREE.Mesh(screenGeo, s.mat);
    scr.position.set(s.x, 0.85, -0.872);
    scr.rotation.x = -0.16;
    group.add(bezel, scr);
  }

  // Standby Integrated Flight Instrument (ISI)
  const isiBezelGeo = new THREE.BoxGeometry(0.14, 0.14, 0.03);
  const isiFaceGeo = new THREE.PlaneGeometry(0.11, 0.11);
  const isiBezel = new THREE.Mesh(isiBezelGeo, screenBezelMat);
  isiBezel.position.set(-0.26, 0.96, -0.89);
  isiBezel.rotation.x = -0.16;
  const isiFace = new THREE.Mesh(isiFaceGeo, pfdMat);
  isiFace.position.set(-0.26, 0.96, -0.872);
  isiFace.rotation.x = -0.16;
  group.add(isiBezel, isiFace);
  disposables.push(isiBezelGeo, isiFaceGeo);

  // Collimated Glass HUD Combiner above Captain PFD
  const hudGeo = new THREE.PlaneGeometry(0.42, 0.3);
  const hudMat = new THREE.MeshBasicMaterial({
    map: textures.pfdTexture,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const hudGlass = new THREE.Mesh(hudGeo, hudMat);
  hudGlass.position.set(-0.62, 1.44, -0.86);
  hudGlass.rotation.x = 0.28;
  group.add(hudGlass);
  disposables.push(hudGeo, hudMat);

  // Center Pedestal, Dual FMC CDUs, Speedbrake & Flap Levers
  const pedGeo = new THREE.BoxGeometry(0.72, 0.72, 1.2);
  const pedestal = new THREE.Mesh(pedGeo, panelMat);
  pedestal.position.set(0, 0.36, -0.36);
  group.add(pedestal);
  disposables.push(pedGeo);

  const cduGeo = new THREE.PlaneGeometry(0.24, 0.3);
  const fmcLMat = new THREE.MeshBasicMaterial({map: textures.fmcLeftTexture});
  const fmcRMat = new THREE.MeshBasicMaterial({map: textures.fmcRightTexture});
  const cduL = new THREE.Mesh(cduGeo, fmcLMat);
  cduL.position.set(-0.18, 0.725, -0.78);
  cduL.rotation.x = -Math.PI / 2 + 0.32;
  const cduR = new THREE.Mesh(cduGeo, fmcRMat);
  cduR.position.set(0.18, 0.725, -0.78);
  cduR.rotation.x = -Math.PI / 2 + 0.32;
  group.add(cduL, cduR);
  disposables.push(cduGeo, fmcLMat, fmcRMat);

  const leverGeo = new THREE.BoxGeometry(0.052, 0.24, 0.052);
  const knobGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.09, 14);
  knobGeo.rotateX(Math.PI / 2);
  knobGeo.rotateY(Math.PI / 2);
  const flapShaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8);
  const flapTipGeo = new THREE.SphereGeometry(0.032, 10, 10);
  disposables.push(leverGeo, knobGeo, flapShaftGeo, flapTipGeo);

  const throttleLeft = new THREE.Mesh(leverGeo, metalMat);
  throttleLeft.position.set(-0.07, 0.8, -0.44);
  const knobL = new THREE.Mesh(knobGeo, yokeMat);
  knobL.position.set(0, 0.13, 0);
  throttleLeft.add(knobL);

  const throttleRight = new THREE.Mesh(leverGeo, metalMat);
  throttleRight.position.set(0.07, 0.8, -0.44);
  const knobR = new THREE.Mesh(knobGeo, yokeMat);
  knobR.position.set(0, 0.13, 0);
  throttleRight.add(knobR);

  const speedbrakeLever = new THREE.Mesh(flapShaftGeo, metalMat);
  speedbrakeLever.position.set(-0.22, 0.79, -0.44);
  const spTip = new THREE.Mesh(flapTipGeo, panelMat);
  spTip.position.y = 0.09;
  speedbrakeLever.add(spTip);

  const flapLever = new THREE.Mesh(flapShaftGeo, metalMat);
  flapLever.position.set(0.22, 0.79, -0.44);
  const flTip = new THREE.Mesh(flapTipGeo, sheepskinMat);
  flTip.position.y = 0.09;
  flapLever.add(flTip);

  group.add(throttleLeft, throttleRight, speedbrakeLever, flapLever);

  // Flight Controls: Airbus Outboard Sidesticks OR Boeing Dual Yoke Columns
  let yokeLeft: THREE.Group;
  let yokeRight: THREE.Group;
  if (isAirbus) {
    const mkSidestick = (x: number, armOffset: number) => {
      const sg = new THREE.Group();
      sg.position.set(x, 0.58, -0.44);
      const baseGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.08, 12);
      const base = new THREE.Mesh(baseGeo, yokeMat);
      const stickGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.22, 12);
      const stick = new THREE.Mesh(stickGeo, yokeMat);
      stick.position.y = 0.12;
      stick.rotation.z = armOffset * 0.08;
      const bootGeo = new THREE.BoxGeometry(0.16, 0.06, 0.28);
      const arm = new THREE.Mesh(bootGeo, sheepskinMat);
      arm.position.set(0, -0.02, 0.18);
      sg.add(base, stick, arm);
      disposables.push(baseGeo, stickGeo, bootGeo);
      return sg;
    };
    yokeLeft = mkSidestick(-1.24, -1);
    yokeRight = mkSidestick(1.24, 1);

    // Airbus Pull-out Sliding Tray Tables in front of pilots
    const trayGeo = new THREE.BoxGeometry(0.48, 0.03, 0.26);
    const trayL = new THREE.Mesh(trayGeo, panelMat);
    trayL.position.set(-0.62, 0.62, -0.68);
    const trayR = new THREE.Mesh(trayGeo, panelMat);
    trayR.position.set(0.62, 0.62, -0.68);
    group.add(trayL, trayR);
    disposables.push(trayGeo);
  } else {
    const mkYoke = (x: number) => {
      const yg = new THREE.Group();
      yg.position.set(x, 0.44, -0.56);
      const colGeo = new THREE.CylinderGeometry(0.034, 0.04, 0.44, 12);
      const col = new THREE.Mesh(colGeo, metalMat);
      col.position.y = 0.22;
      const barGeo = new THREE.BoxGeometry(0.32, 0.042, 0.045);
      const bar = new THREE.Mesh(barGeo, yokeMat);
      bar.position.y = 0.43;
      const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.17, 10);
      const gripL = new THREE.Mesh(gripGeo, yokeMat);
      gripL.position.set(-0.15, 0.5, 0);
      gripL.rotation.z = 0.12;
      const gripR = new THREE.Mesh(gripGeo, yokeMat);
      gripR.position.set(0.15, 0.5, 0);
      gripR.rotation.z = -0.12;
      const badgeGeo = new THREE.BoxGeometry(0.09, 0.06, 0.05);
      const centerBadge = new THREE.Mesh(badgeGeo, screenBezelMat);
      centerBadge.position.set(0, 0.43, 0.01);
      yg.add(col, bar, gripL, gripR, centerBadge);
      disposables.push(colGeo, barGeo, gripGeo, badgeGeo);
      return yg;
    };
    yokeLeft = mkYoke(-0.62);
    yokeRight = mkYoke(0.62);
  }
  group.add(yokeLeft, yokeRight);

  // Captain & FO Contoured Crew Seats (Sheepskin)
  const seatPanGeo = new THREE.BoxGeometry(0.46, 0.1, 0.48);
  const seatBackGeo = new THREE.BoxGeometry(0.44, 0.68, 0.1);
  const headrestGeo = new THREE.BoxGeometry(0.26, 0.22, 0.09);
  const seatPostGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.36, 10);
  disposables.push(seatPanGeo, seatBackGeo, headrestGeo, seatPostGeo);

  for (const sx of [-0.62, 0.62]) {
    const sg = new THREE.Group();
    sg.position.set(sx, 0.18, 0.1);
    const post = new THREE.Mesh(seatPostGeo, seatFrameMat);
    post.position.y = -0.02;
    const pan = new THREE.Mesh(seatPanGeo, sheepskinMat);
    pan.position.y = 0.16;
    const back = new THREE.Mesh(seatBackGeo, sheepskinMat);
    back.position.set(0, 0.52, 0.22);
    back.rotation.x = 0.1;
    const head = new THREE.Mesh(headrestGeo, sheepskinMat);
    head.position.set(0, 0.94, 0.26);
    sg.add(post, pan, back, head);
    group.add(sg);
  }

  // Windshield Canopy Pillars & Header Brow
  const pillarGeo = new THREE.BoxGeometry(0.08, 1.08, 0.12);
  const centerPillar = new THREE.Mesh(pillarGeo, windowFrameMat);
  centerPillar.position.set(0, 1.72, -1.04);
  centerPillar.rotation.x = 0.42;

  const leftPillar = new THREE.Mesh(pillarGeo, windowFrameMat);
  leftPillar.position.set(-1.34, 1.66, -0.82);
  leftPillar.rotation.set(0.36, 0.25, -0.18);

  const rightPillar = new THREE.Mesh(pillarGeo, windowFrameMat);
  rightPillar.position.set(1.34, 1.66, -0.82);
  rightPillar.rotation.set(0.36, -0.25, 0.18);

  const browGeo = new THREE.BoxGeometry(2.85, 0.08, 0.18);
  const brow = new THREE.Mesh(browGeo, windowFrameMat);
  brow.position.set(0, 2.1, -0.82);
  group.add(centerPillar, leftPillar, rightPillar, brow);
  disposables.push(pillarGeo, browGeo);

  // Textured Overhead Panel
  const ovhGeo = new THREE.BoxGeometry(1.18, 0.08, 0.98);
  const overhead = new THREE.Mesh(ovhGeo, panelMat);
  overhead.position.set(0, 2.08, -0.35);
  overhead.rotation.x = 0.26;
  const ovhFaceGeo = new THREE.PlaneGeometry(1.1, 0.9);
  const ovhFaceMat = new THREE.MeshBasicMaterial({map: textures.overheadTexture});
  const ovhFace = new THREE.Mesh(ovhFaceGeo, ovhFaceMat);
  ovhFace.rotation.x = Math.PI / 2;
  ovhFace.position.y = -0.042;
  overhead.add(ovhFace);
  group.add(overhead);
  disposables.push(ovhGeo, ovhFaceGeo, ovhFaceMat);

  // Floor & Side Consoles
  const floorGeo = new THREE.BoxGeometry(2.94, 0.08, 2.5);
  const floor = new THREE.Mesh(floorGeo, glareMat);
  floor.position.set(0, -0.04, -0.22);
  group.add(floor);
  disposables.push(floorGeo);

  const sideGeo = new THREE.BoxGeometry(0.34, 0.66, 1.9);
  const sideL = new THREE.Mesh(sideGeo, panelMat);
  sideL.position.set(-1.34, 0.33, -0.25);
  const sideR = new THREE.Mesh(sideGeo, panelMat);
  sideR.position.set(1.34, 0.33, -0.25);
  group.add(sideL, sideR);
  disposables.push(sideGeo);

  // Outside Horizon Terrain Grid & Altitude Cloud Deck visible through windshield
  const outsideWorld = new THREE.Group();
  const terrainGeo = new THREE.PlaneGeometry(420, 420);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = new THREE.MeshStandardMaterial({color: '#0D1B2A', roughness: 0.95});
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.set(0, -14, -140);
  const terrainGrid = new THREE.GridHelper(320, 32, '#1E3A5F', '#152538');
  terrainGrid.position.set(0, -13.9, -140);
  outsideWorld.add(terrain, terrainGrid);
  disposables.push(terrainGeo, terrainMat);

  const cloudLayer = new THREE.Group();
  const cloudGeo = new THREE.SphereGeometry(6, 12, 8);
  cloudGeo.scale(2.8, 0.38, 1.6);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    transparent: true,
    opacity: 0.42,
    roughness: 0.9,
  });
  disposables.push(cloudGeo, cloudMat);
  for (let i = 0; i < 14; i++) {
    const puff = new THREE.Mesh(cloudGeo, cloudMat);
    puff.position.set(((i % 5) - 2) * 34 + (i % 2) * 10, -4, -55 - i * 14);
    cloudLayer.add(puff);
  }
  outsideWorld.add(cloudLayer);
  group.add(outsideWorld);

  // Subtle cyan cockpit instrument floodlight
  const deckLight = new THREE.PointLight('#38BDF8', 0.95, 4.8);
  deckLight.position.set(0, 1.75, -0.4);
  group.add(deckLight);

  return {
    group,
    isAirbus,
    yokeLeft,
    yokeRight,
    throttleLeft,
    throttleRight,
    hudGlass,
    outsideWorld,
    cloudLayer,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function buildAirportApronGroup(maxAnisotropy = 1): ApronRefs {
  const group = new THREE.Group();
  const disposables: Array<{dispose: () => void}> = [];

  const {apronMap, runwayMap} = createApronRunwayTextures(maxAnisotropy);
  disposables.push(apronMap, runwayMap);

  // Textured Concrete Tarmac / Apron ground
  const apronGeo = new THREE.PlaneGeometry(340, 340);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({
    map: apronMap,
    roughness: 0.9,
    metalness: 0.06,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.receiveShadow = true;
  group.add(apron);
  disposables.push(apronGeo, apronMat);

  // Textured Grooved Runway Strip with Tire Skid Touchdown Zone
  const rwyGeo = new THREE.PlaneGeometry(18, 280);
  rwyGeo.rotateX(-Math.PI / 2);
  const rwyMat = new THREE.MeshStandardMaterial({
    map: runwayMap,
    roughness: 0.86,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const runway = new THREE.Mesh(rwyGeo, rwyMat);
  runway.position.set(0, 0.02, -30);
  runway.receiveShadow = true;
  group.add(runway);
  disposables.push(rwyGeo, rwyMat);

  // Yellow Taxiway Lead-in Line & White Runway Centerline + Piano-Key Threshold Bars
  const yellowMat = new THREE.MeshBasicMaterial({
    color: '#F59E0B',
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const whiteMat = new THREE.MeshBasicMaterial({
    color: '#F8FAFC',
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const dashGeo = new THREE.PlaneGeometry(0.45, 4.5);
  dashGeo.rotateX(-Math.PI / 2);
  const pianoGeo = new THREE.PlaneGeometry(0.75, 5.5);
  pianoGeo.rotateX(-Math.PI / 2);
  disposables.push(yellowMat, whiteMat, dashGeo, pianoGeo);

  for (let z = -140; z <= 90; z += 11) {
    const dash = new THREE.Mesh(dashGeo, whiteMat);
    dash.position.set(0, 0.03, z);
    group.add(dash);
  }
  for (let px = -6.5; px <= 6.5; px += 1.85) {
    if (Math.abs(px) < 0.8) continue;
    const bar = new THREE.Mesh(pianoGeo, whiteMat);
    bar.position.set(px, 0.035, 96);
    group.add(bar);
  }

  const taxiLineGeo = new THREE.PlaneGeometry(0.28, 120);
  taxiLineGeo.rotateX(-Math.PI / 2);
  const taxiLine = new THREE.Mesh(taxiLineGeo, yellowMat);
  taxiLine.position.set(14, 0.03, -20);
  group.add(taxiLine);
  disposables.push(taxiLineGeo);

  // 4-Unit 3D PAPI Precision Approach Path Indicator Boxes beside runway touchdown zone
  const papiBoxGeo = new THREE.BoxGeometry(0.6, 0.35, 0.4);
  const papiLensGeo = new THREE.SphereGeometry(0.11, 10, 10);
  const papiMat = new THREE.MeshStandardMaterial({color: '#FACC15', roughness: 0.5});
  const papiRed = new THREE.MeshBasicMaterial({color: '#EF4444'});
  const papiWhite = new THREE.MeshBasicMaterial({color: '#FFFFFF'});
  disposables.push(papiBoxGeo, papiLensGeo, papiMat, papiRed, papiWhite);

  for (let i = 0; i < 4; i++) {
    const px = -11.5 - i * 1.45;
    const box = new THREE.Mesh(papiBoxGeo, papiMat);
    box.position.set(px, 0.22, 24);
    const lens = new THREE.Mesh(papiLensGeo, i < 2 ? papiRed : papiWhite);
    lens.position.set(px, 0.24, 24.22);
    group.add(box, lens);
  }

  // Modular Glass Terminal Concourse + Telescoping Jetbridge Arm
  const termGeo = new THREE.BoxGeometry(72, 9.2, 16);
  const termMat = new THREE.MeshStandardMaterial({color: '#334155', roughness: 0.55, metalness: 0.35});
  const glassWallGeo = new THREE.PlaneGeometry(68, 5.2);
  const glassWallMat = new THREE.MeshPhysicalMaterial({
    color: '#0EA5E9',
    roughness: 0.12,
    metalness: 0.3,
    clearcoat: 1.0,
  });
  const terminal = new THREE.Mesh(termGeo, termMat);
  terminal.position.set(42, 4.6, -48);
  const glassWall = new THREE.Mesh(glassWallGeo, glassWallMat);
  glassWall.position.set(42, 4.5, -39.9);
  group.add(terminal, glassWall);

  const jetbridgeGeo = new THREE.BoxGeometry(16, 2.4, 2.2);
  const jetbridge = new THREE.Mesh(jetbridgeGeo, termMat);
  jetbridge.position.set(16, 4.1, -24);
  jetbridge.rotation.y = 0.24;
  group.add(jetbridge);
  disposables.push(termGeo, termMat, glassWallGeo, glassWallMat, jetbridgeGeo);

  // Yellow Airport Pushback Tug near Main Apron Stand
  const tugBodyGeo = new THREE.BoxGeometry(1.7, 0.95, 3.1);
  const tugCabGeo = new THREE.BoxGeometry(1.5, 0.75, 1.2);
  const tugMat = new THREE.MeshStandardMaterial({color: '#F59E0B', roughness: 0.42, metalness: 0.25});
  const tug = new THREE.Mesh(tugBodyGeo, tugMat);
  tug.position.set(-2.6, 0.55, -5.8);
  const tugCab = new THREE.Mesh(tugCabGeo, glassWallMat);
  tugCab.position.set(-2.6, 1.32, -5.3);
  group.add(tug, tugCab);
  disposables.push(tugBodyGeo, tugCabGeo, tugMat);

  // ATC Control Tower with Rotating Surveillance Radar Scanner
  const towerShaftGeo = new THREE.CylinderGeometry(1.8, 2.6, 28, 14);
  const towerCabGeo = new THREE.CylinderGeometry(4.4, 3.1, 4.6, 14);
  const towerShaft = new THREE.Mesh(towerShaftGeo, termMat);
  towerShaft.position.set(52, 14, -74);
  const towerCab = new THREE.Mesh(towerCabGeo, glassWallMat);
  towerCab.position.set(52, 29, -74);
  group.add(towerShaft, towerCab);

  const radarDish = new THREE.Group();
  radarDish.position.set(52, 32.8, -74);
  const radarBarGeo = new THREE.BoxGeometry(3.8, 0.6, 0.35);
  const radarBarMat = new THREE.MeshStandardMaterial({color: '#E2E8F0', roughness: 0.3, metalness: 0.7});
  const radarBar = new THREE.Mesh(radarBarGeo, radarBarMat);
  radarDish.add(radarBar);
  group.add(radarDish);
  disposables.push(towerShaftGeo, towerCabGeo, radarBarGeo, radarBarMat);

  return {
    group,
    radarDish,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
