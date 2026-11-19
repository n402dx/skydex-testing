export type FeedSource =
  | 'fr24-web'
  | 'airnav-web'
  | 'variflight-web'
  | 'adsb.lol'
  | 'adsb.fi'
  | 'opensky';

export interface TrailPoint {
  lat: number;
  lon: number;
  altFt: number;
  speedKts: number;
  trackDeg: number;
  ts: number;
}

export interface LiveFlight {
  id: string;
  fr24Id?: string;
  icao24: string;
  callsign: string;
  flightNumber: string;
  registration: string;
  airlineIcao: string;
  airlineName: string;
  aircraftType: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  groundSpeedKts: number;
  trueTrackDeg: number;
  verticalRateFpm: number;
  onGround: boolean;
  squawk: string;
  origin: string;
  destination: string;
  lastContactEpoch: number;
  source: FeedSource;
  isEstimated: boolean;
  uncertaintyNm: number;
  trail?: TrailPoint[];
  dbFlags?: number;
  isLadd?: boolean;
  isMilitary?: boolean;
  isPia?: boolean;
  ownerOperator?: string;
}

export type TrafficFlagFilter = 'all' | 'ladd' | 'military' | 'pia' | 'emergency';

export interface AircraftPhoto {
  url: string;
  thumbUrl?: string;
  photographer: string;
  link: string;
  source: 'planespotters.net' | 'wikimedia' | 'airport-data';
  width?: number;
  height?: number;
}

export interface FlightDetail {
  id: string;
  callsign: string;
  flightNumber: string;
  registration: string;
  squawk?: string;
  aircraftModel: string;
  aircraftCode: string;
  manufacturer?: string;
  registeredOwner?: string;
  aircraftAge?: string;
  airlineName: string;
  airlineIcao: string;
  airlineLogo?: string;
  originIata: string;
  originIcao: string;
  originName: string;
  originTerminal?: string;
  originGate?: string;
  destinationIata: string;
  destinationIcao: string;
  destinationName: string;
  destTerminal?: string;
  destGate?: string;
  destBaggage?: string;
  scheduledDep?: number;
  actualDep?: number;
  scheduledArr?: number;
  estimatedArr?: number;
  statusText?: string;
  photo?: AircraftPhoto | null;
  trail: TrailPoint[];
  source: string;
}

export interface ProviderStatus {
  provider: string;
  ok: boolean;
  count: number;
  latencyMs: number;
  note?: string;
}

export interface FlightsResponse {
  flights: LiveFlight[];
  providers: ProviderStatus[];
  fetchedAt: number;
  bounds: {
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
  };
  fromServerCache?: boolean;
}

export interface AcarsMessage {
  id: string;
  timestamp: string;
  epochMs: number;
  flightNumber: string;
  callsign: string;
  tail: string;
  airlineIcao: string;
  label: string;
  labelName: string;
  frequencyMhz: string;
  stationId?: string;
  rawText: string;
  decodedSummary: string;
  category: 'OOOI' | 'POS' | 'WX' | 'ATC' | 'MAINT' | 'OTHER';
  source: string;
}

export interface RunwayCondition {
  ident: string;
  headingDeg: number;
  lengthFt: number;
  surface: 'DRY' | 'WET' | 'CONTAMINATED';
  brakingAction: 'GOOD' | 'MEDIUM' | 'POOR';
  headwindKts: number;
  crosswindKts: number;
  crosswindDir: 'L' | 'R' | 'CALM';
  favored: boolean;
}

export interface AirportWeather {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  rawMetar: string;
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNK';
  windDirDeg: number | null;
  windSpeedKts: number;
  windGustKts: number | null;
  visibilitySm: number | null;
  ceilingFt: number | null;
  tempC: number | null;
  dewpointC: number | null;
  altimeterHpa: number | null;
  wxString: string;
  tafRaw: string;
  observedAt: string;
  runways: RunwayCondition[];
}

export type HazardCategory = 'turbulence' | 'icing' | 'advisory';

export interface SigmetHazard {
  id: string;
  hazard: string;
  qualifier: string;
  category?: HazardCategory;
  validFrom: string;
  validTo: string;
  baseFt: number | null;
  topFt: number | null;
  rawText: string;
  coords: Array<[number, number]>;
  source: string;
}

export interface RainViewerMeta {
  host: string;
  frames: Array<{
    time: number;
    path: string;
  }>;
}

export interface AirportDisruption {
  id: string;
  icao: string;
  iata: string;
  airportName: string;
  type: 'GDP' | 'GS' | 'DELAY' | 'CLOSURE' | 'WX-OPS';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  avgDelayMinutes: number | null;
  trend: string;
  updatedAt: string;
  source: string;
}

export interface TaxiwaySegment {
  id: string;
  kind: 'runway' | 'taxiway' | 'taxilane' | 'apron';
  ref?: string;
  widthM?: number;
  coords: Array<[number, number]>;
}

export interface AirfieldSurfaceGate {
  id: string;
  ref: string;
  lat: number;
  lon: number;
}

export interface AirfieldPolygonFeature {
  id: string;
  ref?: string;
  name?: string;
  coords: Array<[number, number]>;
  center: [number, number];
}

export interface AirfieldStandFeature {
  id: string;
  ref: string;
  kind: 'parking_position' | 'gate';
  lat: number;
  lon: number;
  coords?: Array<[number, number]>;
}

export interface AirfieldHoldingPosition {
  id: string;
  lat: number;
  lon: number;
  ref?: string;
  coords?: Array<[number, number]>;
}

export interface AirfieldSurfaceData {
  icao: string;
  iata: string;
  lat: number;
  lon: number;
  aprons: Array<Array<[number, number]>>;
  labeledAprons?: AirfieldPolygonFeature[];
  terminals?: AirfieldPolygonFeature[];
  stands?: AirfieldStandFeature[];
  holdingPositions?: AirfieldHoldingPosition[];
  runways: TaxiwaySegment[];
  taxiways: TaxiwaySegment[];
  gates: AirfieldSurfaceGate[];
  source: 'osm-overpass' | 'catalog';
}

export interface SavedFlightPlan {
  id: string;
  name: string;
  originIcao: string;
  destinationIcao: string;
  alternateIcao: string;
  aircraftType: string;
  cruiseAltFt: number;
  distanceNm: number;
  eteMinutes: number;
  savedAt: number;
  originWeather?: AirportWeather;
  destinationWeather?: AirportWeather;
  intersectingSigmets: SigmetHazard[];
  disruptions: AirportDisruption[];
}

export interface AirportBoardFlight {
  id: string;
  callsign: string;
  flightNumber: string;
  airlineName: string;
  airlineIcao: string;
  originIata: string;
  originIcao: string;
  originName: string;
  destinationIata: string;
  destinationIcao: string;
  destinationName: string;
  aircraftCode: string;
  aircraftModel: string;
  registration: string;
  icao24: string;
  terminal?: string;
  gate?: string;
  baggage?: string;
  scheduledTime?: number;
  estimatedTime?: number;
  actualTime?: number;
  statusText: string;
  statusColor: 'green' | 'amber' | 'red' | 'gray';
  isDelayed: boolean;
  isCancelled?: boolean;
  isLive: boolean;
}

export interface AirportDelaySummary {
  arrivalsIndex: number | null;
  arrivalsDelayAvgMin: number | null;
  arrivalsDelayedPct: number | null;
  arrivalsOnTimeCount?: number;
  arrivalsDelayedCount?: number;
  arrivalsCanceledCount?: number;
  arrivalsTrend?: string;
  departuresIndex: number | null;
  departuresDelayAvgMin: number | null;
  departuresDelayedPct: number | null;
  departuresOnTimeCount?: number;
  departuresDelayedCount?: number;
  departuresCanceledCount?: number;
  departuresTrend?: string;
}

export interface AirportMarker {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tier: 1 | 2 | 3;
}

export interface AirportBoardResponse {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezoneName?: string;
  utcOffsetSec?: number;
  timezoneAbbr?: string;
  delayIndex: AirportDelaySummary;
  arrivals: AirportBoardFlight[];
  departures: AirportBoardFlight[];
  fetchedAt: number;
  source: string;
}

export interface SafetyRecordItem {
  date: string;
  type: string;
  operator: string;
  fatalities: string;
  location: string;
  damage: string;
  href: string;
}

export interface SafetyRecordResponse {
  registration: string;
  items: SafetyRecordItem[];
  searchUrl: string;
  source: string;
  fetchedAt: number;
  note?: string;
}

export interface PastFlightRecord {
  id: string;
  flightNumber: string;
  callsign: string;
  registration: string;
  originIata: string;
  originIcao: string;
  originName: string;
  destinationIata: string;
  destinationIcao: string;
  destinationName: string;
  scheduledDep?: number;
  actualDep?: number;
  scheduledArr?: number;
  actualArr?: number;
  statusText: string;
  aircraftCode: string;
  source: string;
}

export interface LiveFlightUpdateItem {
  id: string;
  kind: 'emergency' | 'delay' | 'gate-change' | 'diversion';
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
  severity: 'high' | 'medium' | 'info';
  ts: number;
  icao24?: string;
  airportIata?: string;
}

export interface SpecialLiverySpec {
  registration: string;
  airlineIcao: string;
  airlineName: string;
  aircraftType: string;
  liveryName: string;
  theme:
    | 'un-sdg'
    | 'retro'
    | 'floral'
    | 'cartoon'
    | 'turtle'
    | 'dreaming'
    | 'expo'
    | 'panda'
    | 'aurora'
    | 'allblacks'
    | 'staralliance'
    | 'skyteam'
    | 'oneworld';
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  bellyHex: string;
  titleText: string;
  subtitleText: string;
  badgeText: string;
  notes: string;
}

export interface ApproachProcedureSpec {
  runwayIdent: string;
  ilsFreqMhz: string;
  courseDeg: number;
  glideslopeDeg: number;
  fafFix: string;
  fafDistNm: number;
  fafAltFt: number;
  ifFix: string;
  ifDistNm: number;
  ifAltFt: number;
  iafFix: string;
  iafAltFt: number;
  daFt: number;
  missedAltFt: number;
  missedHeadingDeg: number;
  papiAngleDeg: number;
  lightingSystem: string;
}

export interface AirportDataSheet {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  elevationFt: number;
  lat: number;
  lon: number;
  transitionAltFt: number;
  magneticVarDeg: number;
  atisFreq: string;
  clearanceFreq: string;
  groundFreq: string;
  towerFreq: string;
  approachFreq: string;
  eaipUrl: string;
  chartFoxUrl: string;
  skyVectorUrl: string;
  approaches: ApproachProcedureSpec[];
}

export interface RadarSettings {
  planeSize: number;
  basemapStyle: 'auto' | 'light' | 'dark' | 'osm' | 'satellite';
  flightPathMode: 'all' | 'selected' | 'off';
  locateMeEnabled: boolean;
  timeDisplayMode: 'airport' | 'local' | 'utc';
  showPlaneLabels: boolean;
  showMetarDots: boolean;
  showSigmets: boolean;
  showTurbHazards: boolean;
  showIceHazards: boolean;
  showAdvisoryHazards: boolean;
  showRadar: boolean;
  radarOpacity: number;
  showGroundTraffic: boolean;
  showDrRings: boolean;
  preferNoWorkerMode?: boolean;
  cfWorkerUrl?: string;
  apiBaseUrl?: string;
}

export type AppView = 'radar' | 'deck' | 'taxi' | 'planner';
export type LayoutMode = 'split' | 'radar' | 'deck';
export type ThreeViewMode = 'cockpit' | 'exterior' | 'taxi' | 'pan';
export type CockpitCameraPreset = 'captain' | 'hud' | 'overhead' | 'pedestal';
