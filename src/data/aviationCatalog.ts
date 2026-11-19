import type {AirportDataSheet, ApproachProcedureSpec, SpecialLiverySpec} from '../types/aviation';

export interface AirportSpec {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevationFt: number;
  runways: Array<{
    ident: string;
    headingDeg: number;
    lengthFt: number;
  }>;
}

export interface RegionPreset {
  id: string;
  label: string;
  subtitle: string;
  center: [number, number];
  zoom: number;
  bounds: {
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
  };
}

export interface AirlineLivery {
  icao: string;
  iata: string;
  name: string;
  fuselageHex: string;
  tailHex: string;
  accentHex: string;
  bellyHex: string;
  titleColor: string;
}

export type AircraftAirframeSubtype =
  | 'a380'
  | 'b747'
  | 'b787'
  | 'a350'
  | 'b777'
  | 'a330'
  | 'a320'
  | 'b737'
  | 'c919'
  | 'tTail'
  | 'bizjet'
  | 'turboprop'
  | 'fighter'
  | 'milcargo';

export interface AircraftGeometrySpec {
  code: string;
  name: string;
  category: 'widebody' | 'narrowbody' | 'regional';
  subtype?: AircraftAirframeSubtype;
  isAirbus?: boolean;
  lengthScale: number;
  wingspanScale: number;
  fuselageRadius: number;
  engines: 2 | 4;
  winglets: boolean;
  tTail?: boolean;
}

export const REGION_PRESETS: RegionPreset[] = [
  {
    id: 'global',
    label: 'Global Live Radar',
    subtitle: 'Worldwide · North America · Europe · Asia-Pacific',
    center: [24.0, 15.0],
    zoom: 2,
    bounds: {lamin: -60.0, lomin: -179.9, lamax: 75.0, lomax: 179.9},
  },
  {
    id: 'china-east',
    label: 'China & East Asia',
    subtitle: 'Beijing · Shanghai · Guangzhou · Chengdu · Hong Kong',
    center: [31.2, 114.5],
    zoom: 5,
    bounds: {lamin: 18.0, lomin: 98.0, lamax: 43.0, lomax: 126.0},
  },
  {
    id: 'zbaa-hub',
    label: 'Beijing (ZBAA / ZBAD)',
    subtitle: 'Capital & Daxing Approach + Surface Taxi',
    center: [39.92, 116.52],
    zoom: 10,
    bounds: {lamin: 39.35, lomin: 115.85, lamax: 40.45, lomax: 117.15},
  },
  {
    id: 'zspd-hub',
    label: 'Shanghai (ZSPD / ZSSS)',
    subtitle: 'Pudong & Hongqiao Yangtze Corridor',
    center: [31.16, 121.62],
    zoom: 10,
    bounds: {lamin: 30.75, lomin: 120.95, lamax: 31.65, lomax: 122.25},
  },
  {
    id: 'zggg-hub',
    label: 'Greater Bay (ZGGG / VHHH)',
    subtitle: 'Guangzhou · Shenzhen · Hong Kong TMA',
    center: [22.88, 113.65],
    zoom: 9,
    bounds: {lamin: 21.95, lomin: 112.75, lamax: 23.85, lomax: 114.65},
  },
  {
    id: 'na-east',
    label: 'North America East',
    subtitle: 'New York · Atlanta · Chicago · FAA NAS',
    center: [39.5, -78.5],
    zoom: 5,
    bounds: {lamin: 25.0, lomin: -95.0, lamax: 46.0, lomax: -68.0},
  },
  {
    id: 'europe',
    label: 'Europe Core',
    subtitle: 'London · Frankfurt · Paris · Amsterdam',
    center: [49.8, 6.2],
    zoom: 5,
    bounds: {lamin: 42.0, lomin: -6.0, lamax: 56.0, lomax: 18.0},
  },
];

export const AIRPORT_CATALOG: AirportSpec[] = [
  {
    icao: 'ZBAA',
    iata: 'PEK',
    name: 'Beijing Capital International',
    city: 'Beijing',
    country: 'CN',
    lat: 40.0799,
    lon: 116.6031,
    elevationFt: 116,
    runways: [
      {ident: '36R/18L', headingDeg: 359, lengthFt: 12467},
      {ident: '36L/18R', headingDeg: 359, lengthFt: 10499},
      {ident: '01/19', headingDeg: 359, lengthFt: 12467},
    ],
  },
  {
    icao: 'ZBAD',
    iata: 'PKX',
    name: 'Beijing Daxing International',
    city: 'Beijing',
    country: 'CN',
    lat: 39.5092,
    lon: 116.4106,
    elevationFt: 98,
    runways: [
      {ident: '35R/17L', headingDeg: 350, lengthFt: 12467},
      {ident: '35L/17R', headingDeg: 350, lengthFt: 12467},
      {ident: '01L/19R', headingDeg: 10, lengthFt: 11155},
    ],
  },
  {
    icao: 'ZSPD',
    iata: 'PVG',
    name: 'Shanghai Pudong International',
    city: 'Shanghai',
    country: 'CN',
    lat: 31.1443,
    lon: 121.8083,
    elevationFt: 13,
    runways: [
      {ident: '34L/16R', headingDeg: 342, lengthFt: 13123},
      {ident: '34R/16L', headingDeg: 342, lengthFt: 12467},
      {ident: '35L/17R', headingDeg: 342, lengthFt: 12467},
      {ident: '35R/17L', headingDeg: 342, lengthFt: 11155},
    ],
  },
  {
    icao: 'ZSSS',
    iata: 'SHA',
    name: 'Shanghai Hongqiao International',
    city: 'Shanghai',
    country: 'CN',
    lat: 31.1979,
    lon: 121.3363,
    elevationFt: 10,
    runways: [
      {ident: '36L/18R', headingDeg: 356, lengthFt: 10827},
      {ident: '36R/18L', headingDeg: 356, lengthFt: 11155},
    ],
  },
  {
    icao: 'ZGGG',
    iata: 'CAN',
    name: 'Guangzhou Baiyun International',
    city: 'Guangzhou',
    country: 'CN',
    lat: 23.3924,
    lon: 113.2988,
    elevationFt: 50,
    runways: [
      {ident: '02L/20R', headingDeg: 18, lengthFt: 12467},
      {ident: '02R/20L', headingDeg: 18, lengthFt: 12467},
      {ident: '01/19', headingDeg: 18, lengthFt: 11811},
    ],
  },
  {
    icao: 'ZGSZ',
    iata: 'SZX',
    name: 'Shenzhen Bao’an International',
    city: 'Shenzhen',
    country: 'CN',
    lat: 22.6393,
    lon: 113.8107,
    elevationFt: 13,
    runways: [
      {ident: '15/33', headingDeg: 152, lengthFt: 11155},
      {ident: '16/34', headingDeg: 152, lengthFt: 12467},
    ],
  },
  {
    icao: 'ZUUU',
    iata: 'CTU',
    name: 'Chengdu Shuangliu International',
    city: 'Chengdu',
    country: 'CN',
    lat: 30.5785,
    lon: 103.9471,
    elevationFt: 1625,
    runways: [
      {ident: '02L/20R', headingDeg: 22, lengthFt: 11811},
      {ident: '02R/20L', headingDeg: 22, lengthFt: 11811},
    ],
  },
  {
    icao: 'ZPPP',
    iata: 'KMG',
    name: 'Kunming Changshui International',
    city: 'Kunming',
    country: 'CN',
    lat: 25.1019,
    lon: 102.9292,
    elevationFt: 6900,
    runways: [
      {ident: '03/21', headingDeg: 32, lengthFt: 13123},
      {ident: '04/22', headingDeg: 32, lengthFt: 14764},
    ],
  },
  {
    icao: 'ZLXY',
    iata: 'XIY',
    name: 'Xi’an Xianyang International',
    city: 'Xi’an',
    country: 'CN',
    lat: 34.4471,
    lon: 108.7516,
    elevationFt: 1572,
    runways: [
      {ident: '05L/23R', headingDeg: 47, lengthFt: 9843},
      {ident: '05R/23L', headingDeg: 47, lengthFt: 12467},
    ],
  },
  {
    icao: 'VHHH',
    iata: 'HKG',
    name: 'Hong Kong International',
    city: 'Hong Kong',
    country: 'HK',
    lat: 22.308,
    lon: 113.9185,
    elevationFt: 28,
    runways: [
      {ident: '07L/25R', headingDeg: 74, lengthFt: 12467},
      {ident: '07C/25C', headingDeg: 74, lengthFt: 12467},
      {ident: '07R/25L', headingDeg: 74, lengthFt: 12467},
    ],
  },
  {
    icao: 'RJTT',
    iata: 'HND',
    name: 'Tokyo Haneda Airport',
    city: 'Tokyo',
    country: 'JP',
    lat: 35.5494,
    lon: 139.7798,
    elevationFt: 21,
    runways: [
      {ident: '34L/16R', headingDeg: 337, lengthFt: 9843},
      {ident: '34R/16L', headingDeg: 337, lengthFt: 9843},
      {ident: '04/22', headingDeg: 38, lengthFt: 8202},
    ],
  },
  {
    icao: 'RKSI',
    iata: 'ICN',
    name: 'Seoul Incheon International',
    city: 'Seoul',
    country: 'KR',
    lat: 37.4602,
    lon: 126.4407,
    elevationFt: 23,
    runways: [
      {ident: '33L/15R', headingDeg: 332, lengthFt: 12303},
      {ident: '34/16', headingDeg: 332, lengthFt: 13123},
    ],
  },
  {
    icao: 'KJFK',
    iata: 'JFK',
    name: 'John F. Kennedy International',
    city: 'New York',
    country: 'US',
    lat: 40.6413,
    lon: -73.7781,
    elevationFt: 13,
    runways: [
      {ident: '04R/22L', headingDeg: 31, lengthFt: 8400},
      {ident: '13R/31L', headingDeg: 121, lengthFt: 14511},
      {ident: '04L/22R', headingDeg: 31, lengthFt: 12079},
    ],
  },
  {
    icao: 'KLAX',
    iata: 'LAX',
    name: 'Los Angeles International',
    city: 'Los Angeles',
    country: 'US',
    lat: 33.9416,
    lon: -118.4085,
    elevationFt: 128,
    runways: [
      {ident: '24R/06L', headingDeg: 251, lengthFt: 8926},
      {ident: '25L/07R', headingDeg: 251, lengthFt: 11095},
    ],
  },
  {
    icao: 'KORD',
    iata: 'ORD',
    name: 'Chicago O’Hare International',
    city: 'Chicago',
    country: 'US',
    lat: 41.9742,
    lon: -87.9073,
    elevationFt: 680,
    runways: [
      {ident: '28C/10C', headingDeg: 273, lengthFt: 10801},
      {ident: '27L/09R', headingDeg: 273, lengthFt: 11260},
    ],
  },
  {
    icao: 'EGLL',
    iata: 'LHR',
    name: 'London Heathrow Airport',
    city: 'London',
    country: 'GB',
    lat: 51.47,
    lon: -0.4543,
    elevationFt: 83,
    runways: [
      {ident: '27R/09L', headingDeg: 270, lengthFt: 12799},
      {ident: '27L/09R', headingDeg: 270, lengthFt: 12008},
    ],
  },
  {
    icao: 'EDDF',
    iata: 'FRA',
    name: 'Frankfurt Airport',
    city: 'Frankfurt',
    country: 'DE',
    lat: 50.0379,
    lon: 8.5622,
    elevationFt: 364,
    runways: [
      {ident: '25C/07C', headingDeg: 248, lengthFt: 13123},
      {ident: '25L/07R', headingDeg: 248, lengthFt: 13123},
      {ident: '18/36', headingDeg: 179, lengthFt: 13123},
    ],
  },
  {
    icao: 'LFPG',
    iata: 'CDG',
    name: 'Paris Charles de Gaulle',
    city: 'Paris',
    country: 'FR',
    lat: 49.0097,
    lon: 2.5479,
    elevationFt: 392,
    runways: [
      {ident: '26R/08L', headingDeg: 266, lengthFt: 13829},
      {ident: '27L/09R', headingDeg: 266, lengthFt: 13780},
    ],
  },
  {
    icao: 'RCTP',
    iata: 'TPE',
    name: 'Taiwan Taoyuan International',
    city: 'Taipei',
    country: 'TW',
    lat: 25.0777,
    lon: 121.2328,
    elevationFt: 108,
    runways: [
      {ident: '05L/23R', headingDeg: 51, lengthFt: 12008},
      {ident: '05R/23L', headingDeg: 51, lengthFt: 12467},
    ],
  },
  {
    icao: 'RCSS',
    iata: 'TSA',
    name: 'Taipei Songshan Airport',
    city: 'Taipei',
    country: 'TW',
    lat: 25.0694,
    lon: 121.5525,
    elevationFt: 18,
    runways: [{ident: '10/28', headingDeg: 95, lengthFt: 8547}],
  },
  {
    icao: 'RJAA',
    iata: 'NRT',
    name: 'Tokyo Narita International',
    city: 'Tokyo',
    country: 'JP',
    lat: 35.7647,
    lon: 140.3864,
    elevationFt: 141,
    runways: [
      {ident: '34L/16R', headingDeg: 335, lengthFt: 13123},
      {ident: '34R/16L', headingDeg: 335, lengthFt: 8202},
    ],
  },
  {
    icao: 'WSSS',
    iata: 'SIN',
    name: 'Singapore Changi Airport',
    city: 'Singapore',
    country: 'SG',
    lat: 1.3644,
    lon: 103.9915,
    elevationFt: 22,
    runways: [
      {ident: '02L/20R', headingDeg: 23, lengthFt: 13123},
      {ident: '02C/20C', headingDeg: 23, lengthFt: 13123},
    ],
  },
  {
    icao: 'ZSHC',
    iata: 'HGH',
    name: 'Hangzhou Xiaoshan International',
    city: 'Hangzhou',
    country: 'CN',
    lat: 30.2295,
    lon: 120.4344,
    elevationFt: 23,
    runways: [
      {ident: '06/24', headingDeg: 58, lengthFt: 11811},
      {ident: '07/25', headingDeg: 58, lengthFt: 11155},
    ],
  },
  {
    icao: 'ZUCK',
    iata: 'CKG',
    name: 'Chongqing Jiangbei International',
    city: 'Chongqing',
    country: 'CN',
    lat: 29.7192,
    lon: 106.6417,
    elevationFt: 1365,
    runways: [
      {ident: '02L/20R', headingDeg: 22, lengthFt: 11811},
      {ident: '03/21', headingDeg: 22, lengthFt: 12467},
    ],
  },
  {
    icao: 'OMDB',
    iata: 'DXB',
    name: 'Dubai International',
    city: 'Dubai',
    country: 'AE',
    lat: 25.2528,
    lon: 55.3644,
    elevationFt: 62,
    runways: [
      {ident: '12L/30R', headingDeg: 120, lengthFt: 13123},
      {ident: '12R/30L', headingDeg: 120, lengthFt: 14600},
    ],
  },
  {
    icao: 'EHAM',
    iata: 'AMS',
    name: 'Amsterdam Airport Schiphol',
    city: 'Amsterdam',
    country: 'NL',
    lat: 52.3086,
    lon: 4.7639,
    elevationFt: -11,
    runways: [
      {ident: '18R/36L', headingDeg: 183, lengthFt: 12467},
      {ident: '06/24', headingDeg: 58, lengthFt: 11483},
    ],
  },
  {
    icao: 'KATL',
    iata: 'ATL',
    name: 'Hartsfield-Jackson Atlanta',
    city: 'Atlanta',
    country: 'US',
    lat: 33.6407,
    lon: -84.4277,
    elevationFt: 1026,
    runways: [
      {ident: '08L/26R', headingDeg: 95, lengthFt: 9000},
      {ident: '09L/27R', headingDeg: 95, lengthFt: 12390},
    ],
  },
];

const EXTRA_AIRPORT_COORDS: Record<string, {lat: number; lon: number; name: string}> = {
  KHH: {lat: 22.5771, lon: 120.35, name: 'Kaohsiung International'},
  RMQ: {lat: 24.2647, lon: 120.621, name: 'Taichung International'},
  MFM: {lat: 22.1496, lon: 113.592, name: 'Macau International'},
  XMN: {lat: 24.544, lon: 118.128, name: 'Xiamen Gaoqi'},
  FOC: {lat: 25.9351, lon: 119.663, name: 'Fuzhou Changle'},
  NKG: {lat: 31.742, lon: 118.862, name: 'Nanjing Lukou'},
  WUH: {lat: 30.7838, lon: 114.208, name: 'Wuhan Tianhe'},
  CSX: {lat: 28.1892, lon: 113.22, name: 'Changsha Huanghua'},
  CGO: {lat: 34.5197, lon: 113.841, name: 'Zhengzhou Xinzheng'},
  TAO: {lat: 36.2661, lon: 120.374, name: 'Qingdao Jiaodong'},
  DLC: {lat: 38.9657, lon: 121.539, name: 'Dalian Zhoushuizi'},
  SHE: {lat: 41.6398, lon: 123.483, name: 'Shenyang Taoxian'},
  HRB: {lat: 45.6234, lon: 126.25, name: 'Harbin Taiping'},
  URC: {lat: 43.9071, lon: 87.4742, name: 'Urumqi Diwopu'},
  SYX: {lat: 18.3029, lon: 109.412, name: 'Sanya Phoenix'},
  HAK: {lat: 19.9349, lon: 110.459, name: 'Haikou Meilan'},
  KIX: {lat: 34.4273, lon: 135.244, name: 'Osaka Kansai'},
  FUK: {lat: 33.5859, lon: 130.451, name: 'Fukuoka Airport'},
  CTS: {lat: 42.7752, lon: 141.692, name: 'Sapporo New Chitose'},
  OKA: {lat: 26.1958, lon: 127.646, name: 'Okinawa Naha'},
  GMP: {lat: 37.5583, lon: 126.791, name: 'Seoul Gimpo'},
  PUS: {lat: 35.1795, lon: 128.938, name: 'Busan Gimhae'},
  MNL: {lat: 14.5086, lon: 121.019, name: 'Manila Ninoy Aquino'},
  BKK: {lat: 13.6811, lon: 100.747, name: 'Bangkok Suvarnabhumi'},
  DMK: {lat: 13.9126, lon: 100.607, name: 'Bangkok Don Mueang'},
  CNX: {lat: 18.7668, lon: 98.9626, name: 'Chiang Mai'},
  KUL: {lat: 2.7456, lon: 101.7099, name: 'Kuala Lumpur'},
  CGK: {lat: -6.1256, lon: 106.6558, name: 'Jakarta Soekarno-Hatta'},
  SGN: {lat: 10.8188, lon: 106.652, name: 'Ho Chi Minh City'},
  HAN: {lat: 21.2212, lon: 105.807, name: 'Hanoi Noi Bai'},
  DAD: {lat: 16.0439, lon: 108.199, name: 'Da Nang'},
  DEL: {lat: 28.5665, lon: 77.1031, name: 'Delhi Indira Gandhi'},
  BOM: {lat: 19.0887, lon: 72.8679, name: 'Mumbai Chhatrapati Shivaji'},
  DOH: {lat: 25.2731, lon: 51.6081, name: 'Doha Hamad'},
  IST: {lat: 41.2753, lon: 28.7519, name: 'Istanbul Airport'},
  ZRH: {lat: 47.4647, lon: 8.5492, name: 'Zurich Airport'},
  MUC: {lat: 48.3538, lon: 11.7861, name: 'Munich Airport'},
  MAD: {lat: 40.4719, lon: -3.5626, name: 'Madrid Barajas'},
  FCO: {lat: 41.8003, lon: 12.2389, name: 'Rome Fiumicino'},
  LGW: {lat: 51.1481, lon: -0.1903, name: 'London Gatwick'},
  SFO: {lat: 37.6213, lon: -122.379, name: 'San Francisco'},
  SEA: {lat: 47.4502, lon: -122.309, name: 'Seattle-Tacoma'},
  DFW: {lat: 32.8998, lon: -97.0403, name: 'Dallas/Fort Worth'},
  MIA: {lat: 25.7959, lon: -80.287, name: 'Miami International'},
  BOS: {lat: 42.3656, lon: -71.0096, name: 'Boston Logan'},
  EWR: {lat: 40.6895, lon: -74.1745, name: 'Newark Liberty'},
  YYZ: {lat: 43.6777, lon: -79.6248, name: 'Toronto Pearson'},
  YVR: {lat: 49.1967, lon: -123.182, name: 'Vancouver International'},
  SYD: {lat: -33.9461, lon: 151.177, name: 'Sydney Kingsford Smith'},
  MEL: {lat: -37.6733, lon: 144.843, name: 'Melbourne Airport'},
  AKL: {lat: -37.0082, lon: 174.785, name: 'Auckland Airport'},
  YIW: {lat: 29.3447, lon: 120.032, name: 'Yiwu Airport'},
};

export function resolveAirportCoords(code: string): {lat: number; lon: number; name: string} | null {
  const c = (code || '').trim().toUpperCase();
  if (!c) return null;
  const cat = AIRPORT_CATALOG.find((a) => a.iata === c || a.icao === c);
  if (cat) return {lat: cat.lat, lon: cat.lon, name: cat.name};
  return EXTRA_AIRPORT_COORDS[c] ?? null;
}

export const AIRLINE_LIVERIES: Record<string, AirlineLivery> = {
  // Mainland China, Hong Kong, Macau & Taiwan
  CCA: {icao: 'CCA', iata: 'CA', name: 'Air China', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#2563EB', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  CES: {icao: 'CES', iata: 'MU', name: 'China Eastern', fuselageHex: '#F8FAFC', tailHex: '#1D4ED8', accentHex: '#EF4444', bellyHex: '#E2E8F0', titleColor: '#0F172A'},
  CSN: {icao: 'CSN', iata: 'CZ', name: 'China Southern', fuselageHex: '#F8FAFC', tailHex: '#0284C7', accentHex: '#EF4444', bellyHex: '#CBD5E1', titleColor: '#0369A1'},
  CHH: {icao: 'CHH', iata: 'HU', name: 'Hainan Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#F59E0B', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  CXA: {icao: 'CXA', iata: 'MF', name: 'XiamenAir', fuselageHex: '#F8FAFC', tailHex: '#0369A1', accentHex: '#38BDF8', bellyHex: '#E2E8F0', titleColor: '#075985'},
  CSC: {icao: 'CSC', iata: '3U', name: 'Sichuan Airlines', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#1E293B', bellyHex: '#CBD5E1', titleColor: '#B91C1C'},
  DKH: {icao: 'DKH', iata: 'HO', name: 'Juneyao Air', fuselageHex: '#F8FAFC', tailHex: '#9F1239', accentHex: '#D97706', bellyHex: '#E2E8F0', titleColor: '#881337'},
  CQH: {icao: 'CQH', iata: '9C', name: 'Spring Airlines', fuselageHex: '#F8FAFC', tailHex: '#15803D', accentHex: '#22C55E', bellyHex: '#E2E8F0', titleColor: '#166534'},
  CSZ: {icao: 'CSZ', iata: 'ZH', name: 'Shenzhen Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#1D4ED8', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  CSH: {icao: 'CSH', iata: 'FM', name: 'Shanghai Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  CDG: {icao: 'CDG', iata: 'SC', name: 'Shandong Airlines', fuselageHex: '#F8FAFC', tailHex: '#1D4ED8', accentHex: '#F59E0B', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  CBJ: {icao: 'CBJ', iata: 'JD', name: 'Beijing Capital Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#F59E0B', bellyHex: '#CBD5E1', titleColor: '#991B1B'},
  GCR: {icao: 'GCR', iata: 'GS', name: 'Tianjin Airlines', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#F59E0B', bellyHex: '#CBD5E1', titleColor: '#B91C1C'},
  LKE: {icao: 'LKE', iata: '8L', name: 'Lucky Air', fuselageHex: '#F8FAFC', tailHex: '#EA580C', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#C2410C'},
  HXA: {icao: 'HXA', iata: 'G5', name: 'China Express', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#0284C7', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  HBH: {icao: 'HBH', iata: 'NS', name: 'Hebei Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#0EA5E9', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  JYH: {icao: 'JYH', iata: 'AQ', name: '9 Air', fuselageHex: '#F8FAFC', tailHex: '#EA580C', accentHex: '#F97316', bellyHex: '#E2E8F0', titleColor: '#C2410C'},
  CSS: {icao: 'CSS', iata: 'O3', name: 'SF Airlines', fuselageHex: '#0F172A', tailHex: '#0F172A', accentHex: '#EF4444', bellyHex: '#1E293B', titleColor: '#F8FAFC'},
  CKK: {icao: 'CKK', iata: 'CK', name: 'China Cargo Airlines', fuselageHex: '#F8FAFC', tailHex: '#1D4ED8', accentHex: '#EF4444', bellyHex: '#CBD5E1', titleColor: '#0F172A'},
  CYZ: {icao: 'CYZ', iata: 'CF', name: 'China Postal Airlines', fuselageHex: '#F8FAFC', tailHex: '#15803D', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#166534'},
  CPA: {icao: 'CPA', iata: 'CX', name: 'Cathay Pacific', fuselageHex: '#F8FAFC', tailHex: '#006564', accentHex: '#84CC16', bellyHex: '#CBD5E1', titleColor: '#006564'},
  CRK: {icao: 'CRK', iata: 'HX', name: 'Hong Kong Airlines', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#A855F7', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  HKE: {icao: 'HKE', iata: 'UO', name: 'HK Express', fuselageHex: '#F8FAFC', tailHex: '#6D28D9', accentHex: '#EC4899', bellyHex: '#E2E8F0', titleColor: '#5B21B6'},
  AMU: {icao: 'AMU', iata: 'NX', name: 'Air Macau', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#15803D', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  EVA: {icao: 'EVA', iata: 'BR', name: 'EVA Air', fuselageHex: '#F8FAFC', tailHex: '#15803D', accentHex: '#EA580C', bellyHex: '#E2E8F0', titleColor: '#14532D'},
  CAL: {icao: 'CAL', iata: 'CI', name: 'China Airlines', fuselageHex: '#F8FAFC', tailHex: '#DB2777', accentHex: '#2563EB', bellyHex: '#E2E8F0', titleColor: '#1E3A8A'},
  SJX: {icao: 'SJX', iata: 'JX', name: 'STARLUX Airlines', fuselageHex: '#F8FAFC', tailHex: '#27272A', accentHex: '#C59B5F', bellyHex: '#A1A1AA', titleColor: '#27272A'},
  // East, South & Southeast Asia / Oceania
  ANA: {icao: 'ANA', iata: 'NH', name: 'All Nippon Airways', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#0EA5E9', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  JAL: {icao: 'JAL', iata: 'JL', name: 'Japan Airlines', fuselageHex: '#FFFFFF', tailHex: '#DC2626', accentHex: '#1E293B', bellyHex: '#E2E8F0', titleColor: '#0F172A'},
  APJ: {icao: 'APJ', iata: 'MM', name: 'Peach Aviation', fuselageHex: '#F8FAFC', tailHex: '#D946EF', accentHex: '#EC4899', bellyHex: '#E2E8F0', titleColor: '#A21CAF'},
  SKY: {icao: 'SKY', iata: 'BC', name: 'Skymark Airlines', fuselageHex: '#F8FAFC', tailHex: '#1D4ED8', accentHex: '#FACC15', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  KAL: {icao: 'KAL', iata: 'KE', name: 'Korean Air', fuselageHex: '#38BDF8', tailHex: '#0284C7', accentHex: '#DC2626', bellyHex: '#F1F5F9', titleColor: '#0F172A'},
  AAR: {icao: 'AAR', iata: 'OZ', name: 'Asiana Airlines', fuselageHex: '#F8FAFC', tailHex: '#334155', accentHex: '#EF4444', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  JNA: {icao: 'JNA', iata: 'LJ', name: 'Jin Air', fuselageHex: '#F8FAFC', tailHex: '#84CC16', accentHex: '#1E3A8A', bellyHex: '#E2E8F0', titleColor: '#1E3A8A'},
  SIA: {icao: 'SIA', iata: 'SQ', name: 'Singapore Airlines', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#F59E0B', bellyHex: '#E2E8F0', titleColor: '#1E3A8A'},
  SLK: {icao: 'SLK', iata: 'MI', name: 'Scoot / SilkAir', fuselageHex: '#F8FAFC', tailHex: '#FACC15', accentHex: '#0F172A', bellyHex: '#CBD5E1', titleColor: '#0F172A'},
  TGW: {icao: 'TGW', iata: 'TR', name: 'Scoot', fuselageHex: '#F8FAFC', tailHex: '#EAB308', accentHex: '#18181B', bellyHex: '#E2E8F0', titleColor: '#18181B'},
  MAS: {icao: 'MAS', iata: 'MH', name: 'Malaysia Airlines', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  AXM: {icao: 'AXM', iata: 'AK', name: 'AirAsia', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#EF4444', bellyHex: '#CBD5E1', titleColor: '#B91C1C'},
  THA: {icao: 'THA', iata: 'TG', name: 'Thai Airways', fuselageHex: '#F8FAFC', tailHex: '#6D28D9', accentHex: '#EC4899', bellyHex: '#E2E8F0', titleColor: '#5B21B6'},
  HVN: {icao: 'HVN', iata: 'VN', name: 'Vietnam Airlines', fuselageHex: '#0C4A6E', tailHex: '#0369A1', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#FACC15'},
  VJC: {icao: 'VJC', iata: 'VJ', name: 'VietJet Air', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#B91C1C'},
  GIA: {icao: 'GIA', iata: 'GA', name: 'Garuda Indonesia', fuselageHex: '#F8FAFC', tailHex: '#0284C7', accentHex: '#14B8A6', bellyHex: '#CBD5E1', titleColor: '#0369A1'},
  PAL: {icao: 'PAL', iata: 'PR', name: 'Philippine Airlines', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  CEB: {icao: 'CEB', iata: '5J', name: 'Cebu Pacific', fuselageHex: '#FACC15', tailHex: '#0284C7', accentHex: '#16A34A', bellyHex: '#E2E8F0', titleColor: '#0369A1'},
  AIC: {icao: 'AIC', iata: 'AI', name: 'Air India', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#7C3AED', bellyHex: '#CBD5E1', titleColor: '#991B1B'},
  IGO: {icao: 'IGO', iata: '6E', name: 'IndiGo', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#0284C7', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  QFA: {icao: 'QFA', iata: 'QF', name: 'Qantas', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#E2E8F0', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  VOZ: {icao: 'VOZ', iata: 'VA', name: 'Virgin Australia', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#7C3AED', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  JST: {icao: 'JST', iata: 'JQ', name: 'Jetstar', fuselageHex: '#E2E8F0', tailHex: '#EA580C', accentHex: '#F97316', bellyHex: '#94A3B8', titleColor: '#1E293B'},
  ANZ: {icao: 'ANZ', iata: 'NZ', name: 'Air New Zealand', fuselageHex: '#F8FAFC', tailHex: '#0F172A', accentHex: '#14B8A6', bellyHex: '#0F172A', titleColor: '#0F172A'},
  // Middle East & Africa
  UAE: {icao: 'UAE', iata: 'EK', name: 'Emirates', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#16A34A', bellyHex: '#E2E8F0', titleColor: '#B45309'},
  QTR: {icao: 'QTR', iata: 'QR', name: 'Qatar Airways', fuselageHex: '#F1F5F9', tailHex: '#7F1D1D', accentHex: '#9F1239', bellyHex: '#CBD5E1', titleColor: '#7F1D1D'},
  ETD: {icao: 'ETD', iata: 'EY', name: 'Etihad Airways', fuselageHex: '#F5EFE6', tailHex: '#B45309', accentHex: '#D97706', bellyHex: '#D6D3D1', titleColor: '#78350F'},
  SVA: {icao: 'SVA', iata: 'SV', name: 'Saudia', fuselageHex: '#F5F5F4', tailHex: '#15803D', accentHex: '#0284C7', bellyHex: '#D6D3D1', titleColor: '#14532D'},
  ETH: {icao: 'ETH', iata: 'ET', name: 'Ethiopian Airlines', fuselageHex: '#F8FAFC', tailHex: '#16A34A', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#15803D'},
  MSR: {icao: 'MSR', iata: 'MS', name: 'EgyptAir', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#F59E0B', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  RAM: {icao: 'RAM', iata: 'AT', name: 'Royal Air Maroc', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#15803D', bellyHex: '#E2E8F0', titleColor: '#991B1B'},
  // North & South America
  UAL: {icao: 'UAL', iata: 'UA', name: 'United Airlines', fuselageHex: '#F8FAFC', tailHex: '#1D4ED8', accentHex: '#38BDF8', bellyHex: '#94A3B8', titleColor: '#1E3A8A'},
  DAL: {icao: 'DAL', iata: 'DL', name: 'Delta Air Lines', fuselageHex: '#F8FAFC', tailHex: '#1E293B', accentHex: '#DC2626', bellyHex: '#1E293B', titleColor: '#0F172A'},
  AAL: {icao: 'AAL', iata: 'AA', name: 'American Airlines', fuselageHex: '#CBD5E1', tailHex: '#DC2626', accentHex: '#1D4ED8', bellyHex: '#94A3B8', titleColor: '#1E293B'},
  SWA: {icao: 'SWA', iata: 'WN', name: 'Southwest Airlines', fuselageHex: '#1D4ED8', tailHex: '#DC2626', accentHex: '#FACC15', bellyHex: '#0F172A', titleColor: '#FFFFFF'},
  JBU: {icao: 'JBU', iata: 'B6', name: 'JetBlue', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#0EA5E9', bellyHex: '#1E3A8A', titleColor: '#1E3A8A'},
  ASA: {icao: 'ASA', iata: 'AS', name: 'Alaska Airlines', fuselageHex: '#F8FAFC', tailHex: '#0F172A', accentHex: '#0EA5E9', bellyHex: '#CBD5E1', titleColor: '#0F172A'},
  NKS: {icao: 'NKS', iata: 'NK', name: 'Spirit Airlines', fuselageHex: '#FACC15', tailHex: '#FACC15', accentHex: '#0F172A', bellyHex: '#FACC15', titleColor: '#0F172A'},
  FFT: {icao: 'FFT', iata: 'F9', name: 'Frontier Airlines', fuselageHex: '#F8FAFC', tailHex: '#15803D', accentHex: '#22C55E', bellyHex: '#E2E8F0', titleColor: '#166534'},
  HAL: {icao: 'HAL', iata: 'HA', name: 'Hawaiian Airlines', fuselageHex: '#F8FAFC', tailHex: '#7E22CE', accentHex: '#EC4899', bellyHex: '#E2E8F0', titleColor: '#6B21A8'},
  ACA: {icao: 'ACA', iata: 'AC', name: 'Air Canada', fuselageHex: '#F8FAFC', tailHex: '#0F172A', accentHex: '#DC2626', bellyHex: '#0F172A', titleColor: '#0F172A'},
  WJA: {icao: 'WJA', iata: 'WS', name: 'WestJet', fuselageHex: '#F8FAFC', tailHex: '#0369A1', accentHex: '#14B8A6', bellyHex: '#CBD5E1', titleColor: '#0369A1'},
  AMX: {icao: 'AMX', iata: 'AM', name: 'Aeromexico', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  LAN: {icao: 'LAN', iata: 'LA', name: 'LATAM Airlines', fuselageHex: '#F8FAFC', tailHex: '#1E1B4B', accentHex: '#EF4444', bellyHex: '#CBD5E1', titleColor: '#1E1B4B'},
  AVA: {icao: 'AVA', iata: 'AV', name: 'Avianca', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#EF4444', bellyHex: '#E2E8F0', titleColor: '#B91C1C'},
  // Europe
  BAW: {icao: 'BAW', iata: 'BA', name: 'British Airways', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#1E293B', titleColor: '#1E3A8A'},
  VIR: {icao: 'VIR', iata: 'VS', name: 'Virgin Atlantic', fuselageHex: '#F8FAFC', tailHex: '#B91C1C', accentHex: '#A21CAF', bellyHex: '#CBD5E1', titleColor: '#991B1B'},
  DLH: {icao: 'DLH', iata: 'LH', name: 'Lufthansa', fuselageHex: '#F8FAFC', tailHex: '#0F172A', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#0F172A'},
  AFR: {icao: 'AFR', iata: 'AF', name: 'Air France', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#E2E8F0', titleColor: '#1E3A8A'},
  KLM: {icao: 'KLM', iata: 'KL', name: 'KLM Royal Dutch', fuselageHex: '#F8FAFC', tailHex: '#0EA5E9', accentHex: '#0284C7', bellyHex: '#CBD5E1', titleColor: '#0369A1'},
  IBE: {icao: 'IBE', iata: 'IB', name: 'Iberia', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#FACC15', bellyHex: '#E2E8F0', titleColor: '#B91C1C'},
  ITY: {icao: 'ITY', iata: 'AZ', name: 'ITA Airways', fuselageHex: '#0284C7', tailHex: '#15803D', accentHex: '#DC2626', bellyHex: '#0369A1', titleColor: '#FFFFFF'},
  SWR: {icao: 'SWR', iata: 'LX', name: 'SWISS', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#FFFFFF', bellyHex: '#CBD5E1', titleColor: '#0F172A'},
  AUA: {icao: 'AUA', iata: 'OS', name: 'Austrian Airlines', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#0EA5E9', bellyHex: '#E2E8F0', titleColor: '#B91C1C'},
  SAS: {icao: 'SAS', iata: 'SK', name: 'SAS Scandinavian', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#0EA5E9', bellyHex: '#94A3B8', titleColor: '#1E3A8A'},
  FIN: {icao: 'FIN', iata: 'AY', name: 'Finnair', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#38BDF8', bellyHex: '#E2E8F0', titleColor: '#1E3A8A'},
  ICE: {icao: 'ICE', iata: 'FI', name: 'Icelandair', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#FACC15', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  EIN: {icao: 'EIN', iata: 'EI', name: 'Aer Lingus', fuselageHex: '#F8FAFC', tailHex: '#0D9488', accentHex: '#16A34A', bellyHex: '#0D9488', titleColor: '#115E59'},
  TAP: {icao: 'TAP', iata: 'TP', name: 'TAP Air Portugal', fuselageHex: '#F8FAFC', tailHex: '#15803D', accentHex: '#DC2626', bellyHex: '#E2E8F0', titleColor: '#15803D'},
  LOT: {icao: 'LOT', iata: 'LO', name: 'LOT Polish Airlines', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#DC2626', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
  THY: {icao: 'THY', iata: 'TK', name: 'Turkish Airlines', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#1E293B', bellyHex: '#CBD5E1', titleColor: '#0F172A'},
  RYR: {icao: 'RYR', iata: 'FR', name: 'Ryanair', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#FACC15', bellyHex: '#1E3A8A', titleColor: '#1E3A8A'},
  EZY: {icao: 'EZY', iata: 'U2', name: 'easyJet', fuselageHex: '#F8FAFC', tailHex: '#EA580C', accentHex: '#F97316', bellyHex: '#EA580C', titleColor: '#EA580C'},
  // Global Express Cargo
  FDX: {icao: 'FDX', iata: 'FX', name: 'FedEx Express', fuselageHex: '#F8FAFC', tailHex: '#4C1D95', accentHex: '#EA580C', bellyHex: '#CBD5E1', titleColor: '#4C1D95'},
  UPS: {icao: 'UPS', iata: '5X', name: 'UPS Airlines', fuselageHex: '#F8FAFC', tailHex: '#451A03', accentHex: '#F59E0B', bellyHex: '#78350F', titleColor: '#451A03'},
  CLX: {icao: 'CLX', iata: 'CV', name: 'Cargolux', fuselageHex: '#F8FAFC', tailHex: '#DC2626', accentHex: '#0284C7', bellyHex: '#CBD5E1', titleColor: '#1E293B'},
  GTI: {icao: 'GTI', iata: '5Y', name: 'Atlas Air', fuselageHex: '#F8FAFC', tailHex: '#1E3A8A', accentHex: '#F59E0B', bellyHex: '#CBD5E1', titleColor: '#1E3A8A'},
};

export const SPECIAL_LIVERIES: Record<string, SpecialLiverySpec> = {
  'B-1356': {
    registration: 'B-1356',
    airlineIcao: 'CXA',
    airlineName: 'XiamenAir',
    aircraftType: 'B789',
    liveryName: 'United Dream · UN SDGs Special',
    theme: 'un-sdg',
    primaryHex: '#0284C7',
    secondaryHex: '#0369A1',
    accentHex: '#38BDF8',
    bellyHex: '#E0F2FE',
    titleText: 'UNITED DREAM',
    subtitleText: 'XIAMENAIR · SUSTAINABLE DEVELOPMENT GOALS',
    badgeText: 'UN SDGs',
    notes: 'Boeing 787-9 Dreamliner in United Nations Sustainable Development Goals blue wave & 17-color emblem scheme.',
  },
  'B-1566': {
    registration: 'B-1566',
    airlineIcao: 'CXA',
    airlineName: 'XiamenAir',
    aircraftType: 'B788',
    liveryName: 'United We Dream · UN',
    theme: 'un-sdg',
    primaryHex: '#0EA5E9',
    secondaryHex: '#0369A1',
    accentHex: '#FACC15',
    bellyHex: '#E2E8F0',
    titleText: 'UNITED WE DREAM',
    subtitleText: 'XIAMENAIR · UN PARTNERSHIP',
    badgeText: 'UN',
    notes: 'XiamenAir Boeing 787-8 commemorative UN cooperation scheme.',
  },
  'B-919A': {
    registration: 'B-919A',
    airlineIcao: 'CES',
    airlineName: 'China Eastern',
    aircraftType: 'C919',
    liveryName: 'World First C919 Launch',
    theme: 'retro',
    primaryHex: '#1D4ED8',
    secondaryHex: '#DC2626',
    accentHex: '#F59E0B',
    bellyHex: '#F1F5F9',
    titleText: 'CHINA EASTERN',
    subtitleText: 'WORLD FIRST C919 · B-919A',
    badgeText: 'FIRST C919',
    notes: 'Inaugural COMAC C919 delivery airframe with commemorative C919 emblem forward of wings.',
  },
  'B-650E': {
    registration: 'B-650E',
    airlineIcao: 'CES',
    airlineName: 'China Eastern',
    aircraftType: 'A333',
    liveryName: 'Disney Toy Story Express',
    theme: 'cartoon',
    primaryHex: '#0284C7',
    secondaryHex: '#F59E0B',
    accentHex: '#EF4444',
    bellyHex: '#BAE6FD',
    titleText: 'CHINA EASTERN',
    subtitleText: 'SHANGHAI DISNEY RESORT',
    badgeText: 'TOY STORY',
    notes: 'China Eastern Airbus A330 special resort theme airframe.',
  },
  'B-8968': {
    registration: 'B-8968',
    airlineIcao: 'CES',
    airlineName: 'China Eastern',
    aircraftType: 'A333',
    liveryName: 'Disney Mickey & Minnie Express',
    theme: 'cartoon',
    primaryHex: '#B91C1C',
    secondaryHex: '#0F172A',
    accentHex: '#FACC15',
    bellyHex: '#F1F5F9',
    titleText: 'CHINA EASTERN',
    subtitleText: 'DISNEY FANTASIA EDITION',
    badgeText: 'DISNEY A330',
    notes: 'China Eastern Airbus A330-300 Shanghai Disney Resort celebration scheme.',
  },
  'B-2001': {
    registration: 'B-2001',
    airlineIcao: 'CES',
    airlineName: 'China Eastern',
    aircraftType: 'B77W',
    liveryName: 'CIIE Jinbao International Expo',
    theme: 'expo',
    primaryHex: '#1D4ED8',
    secondaryHex: '#0EA5E9',
    accentHex: '#FACC15',
    bellyHex: '#E0F2FE',
    titleText: 'CHINA EASTERN',
    subtitleText: 'CIIE SHANGHAI EXPO',
    badgeText: 'CIIE B77W',
    notes: 'China Eastern Boeing 777-300ER China International Import Expo flagship jet.',
  },
  'B-1083': {
    registration: 'B-1083',
    airlineIcao: 'CCA',
    airlineName: 'Air China',
    aircraftType: 'B789',
    liveryName: 'Smiling China · Red & Gold Floral',
    theme: 'floral',
    primaryHex: '#DC2626',
    secondaryHex: '#F59E0B',
    accentHex: '#FDE047',
    bellyHex: '#F1F5F9',
    titleText: 'AIR CHINA',
    subtitleText: 'SMILING CHINA EDITION',
    badgeText: 'SMILING CN',
    notes: 'Air China Boeing 787-9 commemorative red-gold floral ribbon scheme.',
  },
  'B-2006': {
    registration: 'B-2006',
    airlineIcao: 'CCA',
    airlineName: 'Air China',
    aircraftType: 'B77W',
    liveryName: 'Love China Crimson Banner',
    theme: 'retro',
    primaryHex: '#DC2626',
    secondaryHex: '#B91C1C',
    accentHex: '#FACC15',
    bellyHex: '#E2E8F0',
    titleText: 'AIR CHINA',
    subtitleText: 'LOVE CHINA · B777-300ER',
    badgeText: 'LOVE CHINA',
    notes: 'Air China Boeing 777-300ER Love China heritage livery.',
  },
  'B-8870': {
    registration: 'B-8870',
    airlineIcao: 'CSC',
    airlineName: 'Sichuan Airlines',
    aircraftType: 'A359',
    liveryName: 'Panda Route · Chengdu Special',
    theme: 'panda',
    primaryHex: '#0F172A',
    secondaryHex: '#DC2626',
    accentHex: '#22C55E',
    bellyHex: '#F1F5F9',
    titleText: 'SICHUAN AIRLINES',
    subtitleText: 'PANDA ROUTE · CHENGDU',
    badgeText: 'PANDA A350',
    notes: 'Sichuan Airlines Airbus A350-900 Giant Panda cultural scheme.',
  },
  'B-306N': {
    registration: 'B-306N',
    airlineIcao: 'CSC',
    airlineName: 'Sichuan Airlines',
    aircraftType: 'A359',
    liveryName: 'Panda Express · World University Games',
    theme: 'panda',
    primaryHex: '#0F172A',
    secondaryHex: '#16A34A',
    accentHex: '#F59E0B',
    bellyHex: '#E2E8F0',
    titleText: 'SICHUAN AIRLINES',
    subtitleText: 'GIANT PANDA SPECIAL',
    badgeText: 'PANDA',
    notes: 'Sichuan Airlines A350-900 Chengdu Panda motif airframe.',
  },
  'B-1020': {
    registration: 'B-1020',
    airlineIcao: 'CHH',
    airlineName: 'Hainan Airlines',
    aircraftType: 'B789',
    liveryName: 'Kung Fu Panda · Dreamliner',
    theme: 'panda',
    primaryHex: '#B91C1C',
    secondaryHex: '#F59E0B',
    accentHex: '#FDE047',
    bellyHex: '#F1F5F9',
    titleText: 'HAINAN AIRLINES',
    subtitleText: 'KUNG FU PANDA · B787-9',
    badgeText: 'PANDA 789',
    notes: 'Hainan Airlines Boeing 787-9 Kung Fu Panda special livery.',
  },
  'B-208J': {
    registration: 'B-208J',
    airlineIcao: 'DKH',
    airlineName: 'Juneyao Air',
    aircraftType: 'B789',
    liveryName: 'Chinese Peony Silk Ribbon',
    theme: 'floral',
    primaryHex: '#9F1239',
    secondaryHex: '#EC4899',
    accentHex: '#F59E0B',
    bellyHex: '#FFF1F2',
    titleText: 'JUNEYAO AIR',
    subtitleText: 'CHINESE PEONY DREAMLINER',
    badgeText: 'PEONY 789',
    notes: 'Juneyao Air Boeing 787-9 crimson & gold Chinese Peony silk ribbon livery.',
  },
  'B-209R': {
    registration: 'B-209R',
    airlineIcao: 'DKH',
    airlineName: 'Juneyao Air',
    aircraftType: 'B789',
    liveryName: 'Colorful Petals · Splendid China',
    theme: 'floral',
    primaryHex: '#BE123C',
    secondaryHex: '#FB7185',
    accentHex: '#FACC15',
    bellyHex: '#FFE4E6',
    titleText: 'JUNEYAO AIR',
    subtitleText: 'COLORFUL PETALS',
    badgeText: 'PETALS 789',
    notes: 'Juneyao Air 787-9 Vibrant Petals ceremonial livery.',
  },
  'B-6057': {
    registration: 'B-6057',
    airlineIcao: 'CSN',
    airlineName: 'China Southern',
    aircraftType: 'A332',
    liveryName: 'SkyTeam Alliance Silver-Blue',
    theme: 'skyteam',
    primaryHex: '#0F172A',
    secondaryHex: '#CBD5E1',
    accentHex: '#0284C7',
    bellyHex: '#1E293B',
    titleText: 'SKYTEAM',
    subtitleText: 'CHINA SOUTHERN',
    badgeText: 'SKYTEAM',
    notes: 'China Southern Airlines metallic silver SkyTeam alliance special scheme.',
  },
  'B-16703': {
    registration: 'B-16703',
    airlineIcao: 'EVA',
    airlineName: 'EVA Air',
    aircraftType: 'B77W',
    liveryName: 'Sanrio Characters Shining Star',
    theme: 'cartoon',
    primaryHex: '#EC4899',
    secondaryHex: '#38BDF8',
    accentHex: '#FACC15',
    bellyHex: '#F8FAFC',
    titleText: 'EVA AIR',
    subtitleText: 'SANRIO HELLO KITTY JET',
    badgeText: 'SANRIO',
    notes: 'EVA Air Boeing 777-300ER Hello Kitty & Sanrio Friends special jet.',
  },
  'B-18908': {
    registration: 'B-18908',
    airlineIcao: 'CAL',
    airlineName: 'China Airlines',
    aircraftType: 'A359',
    liveryName: 'Mikado Pheasant · Taiwan Wildlife',
    theme: 'floral',
    primaryHex: '#1D4ED8',
    secondaryHex: '#DB2777',
    accentHex: '#F59E0B',
    bellyHex: '#E2E8F0',
    titleText: 'CHINA AIRLINES',
    subtitleText: 'MIKADO PHEASANT A350',
    badgeText: 'PHEASANT',
    notes: 'China Airlines Airbus A350-900 endemic Taiwan Mikado Pheasant livery.',
  },
  'B-18007': {
    registration: 'B-18007',
    airlineIcao: 'CAL',
    airlineName: 'China Airlines',
    aircraftType: 'B77W',
    liveryName: 'Boeing House Carbon-Weave',
    theme: 'retro',
    primaryHex: '#0F172A',
    secondaryHex: '#0284C7',
    accentHex: '#38BDF8',
    bellyHex: '#1E293B',
    titleText: 'CHINA AIRLINES',
    subtitleText: 'BOEING CARBON HYBRID',
    badgeText: 'CARBON 77W',
    notes: 'China Airlines 777-300ER dark blue Boeing carbon tail hybrid.',
  },
  JA381A: {
    registration: 'JA381A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'A388',
    liveryName: 'FLYING HONU · Lani Sky Blue',
    theme: 'turtle',
    primaryHex: '#0284C7',
    secondaryHex: '#0EA5E9',
    accentHex: '#E0F2FE',
    bellyHex: '#F8FAFC',
    titleText: 'FLYING HONU',
    subtitleText: 'ANA · HONOLULU SKY TURTLE',
    badgeText: 'LANI A380',
    notes: 'ANA Airbus A380 Hawaiian green sea turtle Lani ANA Blue scheme.',
  },
  JA382A: {
    registration: 'JA382A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'A388',
    liveryName: 'FLYING HONU · Kai Emerald',
    theme: 'turtle',
    primaryHex: '#0D9488',
    secondaryHex: '#14B8A6',
    accentHex: '#CCFBF1',
    bellyHex: '#F8FAFC',
    titleText: 'FLYING HONU',
    subtitleText: 'ANA · KAI EMERALD OCEAN',
    badgeText: 'KAI A380',
    notes: 'ANA Airbus A380 Kai Emerald Green Hawaiian Sea Turtle livery.',
  },
  JA383A: {
    registration: 'JA383A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'A388',
    liveryName: 'FLYING HONU · Ka La Sunset',
    theme: 'turtle',
    primaryHex: '#EA580C',
    secondaryHex: '#F59E0B',
    accentHex: '#FEF3C7',
    bellyHex: '#F8FAFC',
    titleText: 'FLYING HONU',
    subtitleText: 'ANA · KA LA SUNSET ORANGE',
    badgeText: 'KALA A380',
    notes: 'ANA Airbus A380 Ka La Hawaiian Sunset Orange Sea Turtle livery.',
  },
  JA873A: {
    registration: 'JA873A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'B789',
    liveryName: 'STAR WARS · R2-D2 Jet',
    theme: 'cartoon',
    primaryHex: '#1D4ED8',
    secondaryHex: '#1E293B',
    accentHex: '#38BDF8',
    bellyHex: '#E2E8F0',
    titleText: 'STAR WARS',
    subtitleText: 'ANA · R2-D2 SPECIAL',
    badgeText: 'R2-D2',
    notes: 'ANA Boeing 787-9 R2-D2 Star Wars blue-and-silver fuselage panels.',
  },
  JA789A: {
    registration: 'JA789A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'B77W',
    liveryName: 'STAR WARS · BB-8 Jet',
    theme: 'cartoon',
    primaryHex: '#EA580C',
    secondaryHex: '#334155',
    accentHex: '#F59E0B',
    bellyHex: '#F1F5F9',
    titleText: 'STAR WARS',
    subtitleText: 'ANA · BB-8 EDITION',
    badgeText: 'BB-8',
    notes: 'ANA Boeing 777-300ER BB-8 Star Wars orange-silver panel scheme.',
  },
  JA874A: {
    registration: 'JA874A',
    airlineIcao: 'ANA',
    airlineName: 'All Nippon Airways',
    aircraftType: 'B788',
    liveryName: 'ANA Future Promise · Green Jet',
    theme: 'expo',
    primaryHex: '#16A34A',
    secondaryHex: '#0D9488',
    accentHex: '#4ADE80',
    bellyHex: '#F0FDF4',
    titleText: 'ANA GREEN JET',
    subtitleText: 'ANA FUTURE PROMISE',
    badgeText: 'GREEN JET',
    notes: 'ANA Boeing 787 SAF sustainability water-leaf emerald livery.',
  },
  HL7644: {
    registration: 'HL7644',
    airlineIcao: 'KAL',
    airlineName: 'Korean Air',
    aircraftType: 'B77W',
    liveryName: 'Busan World Expo 2030',
    theme: 'expo',
    primaryHex: '#0284C7',
    secondaryHex: '#EC4899',
    accentHex: '#38BDF8',
    bellyHex: '#F1F5F9',
    titleText: 'KOREAN AIR',
    subtitleText: 'WORLD EXPO BUSAN',
    badgeText: 'EXPO 77W',
    notes: 'Korean Air Boeing 777-300ER World Expo special artwork jet.',
  },
  'B-16722': {
    registration: 'B-16722',
    airlineIcao: 'EVA',
    airlineName: 'EVA Air',
    aircraftType: 'B77W',
    liveryName: 'Shining Star Special',
    theme: 'floral',
    primaryHex: '#15803D',
    secondaryHex: '#EC4899',
    accentHex: '#FDE047',
    bellyHex: '#F8FAFC',
    titleText: 'EVA AIR',
    subtitleText: 'SHINING STAR B777-300ER',
    badgeText: 'SHINING STAR',
    notes: 'EVA Air Boeing 777-300ER special starlight ribbon livery.',
  },
  'G-BYGC': {
    registration: 'G-BYGC',
    airlineIcao: 'BAW',
    airlineName: 'British Airways',
    aircraftType: 'B744',
    liveryName: 'BOAC Centenary Retro',
    theme: 'retro',
    primaryHex: '#1E3A8A',
    secondaryHex: '#F59E0B',
    accentHex: '#C2410C',
    bellyHex: '#CBD5E1',
    titleText: 'B·O·A·C',
    subtitleText: 'BRITISH OVERSEAS AIRWAYS',
    badgeText: 'BOAC RETRO',
    notes: 'British Airways Boeing 747-400 in classic BOAC gold Speedbird & navy cheatline.',
  },
  'G-BNLY': {
    registration: 'G-BNLY',
    airlineIcao: 'BAW',
    airlineName: 'British Airways',
    aircraftType: 'B744',
    liveryName: 'Landor Heritage Centenary',
    theme: 'retro',
    primaryHex: '#1E293B',
    secondaryHex: '#DC2626',
    accentHex: '#F59E0B',
    bellyHex: '#334155',
    titleText: 'BRITISH AIRWAYS',
    subtitleText: 'LANDOR HERITAGE',
    badgeText: 'LANDOR',
    notes: 'British Airways 1980s pearl-grey and midnight blue Landor centenary heritage jet.',
  },
  'D-ABYT': {
    registration: 'D-ABYT',
    airlineIcao: 'DLH',
    airlineName: 'Lufthansa',
    aircraftType: 'B748',
    liveryName: '1970s Crane Retrojet',
    theme: 'retro',
    primaryHex: '#0F172A',
    secondaryHex: '#FACC15',
    accentHex: '#1D4ED8',
    bellyHex: '#CBD5E1',
    titleText: 'Lufthansa',
    subtitleText: 'HERITAGE B747-8i',
    badgeText: 'RETRO 747-8',
    notes: 'Lufthansa Boeing 747-8i featuring bare-metal belly, blue cheatline, and vintage yellow parabola.',
  },
  'VH-ZNJ': {
    registration: 'VH-ZNJ',
    airlineIcao: 'QFA',
    airlineName: 'Qantas',
    aircraftType: 'B789',
    liveryName: 'Emily Kame Kngwarreye · Yam Dreaming',
    theme: 'dreaming',
    primaryHex: '#16A34A',
    secondaryHex: '#F59E0B',
    accentHex: '#FFFFFF',
    bellyHex: '#0F172A',
    titleText: 'QANTAS',
    subtitleText: 'FLYING ART SERIES',
    badgeText: 'YAM DREAMING',
    notes: 'Qantas Boeing 787-9 Indigenous Flying Art Dreamliner.',
  },
  'VH-OQA': {
    registration: 'VH-OQA',
    airlineIcao: 'QFA',
    airlineName: 'Qantas',
    aircraftType: 'A388',
    liveryName: 'Nancy-Bird Walton Flagship',
    theme: 'dreaming',
    primaryHex: '#DC2626',
    secondaryHex: '#F59E0B',
    accentHex: '#FFFFFF',
    bellyHex: '#CBD5E1',
    titleText: 'QANTAS',
    subtitleText: 'SPIRIT OF AUSTRALIA · A380',
    badgeText: 'FLAGSHIP A380',
    notes: 'Inaugural Qantas Airbus A380 flagship airframe.',
  },
  'TF-FIU': {
    registration: 'TF-FIU',
    airlineIcao: 'ICE',
    airlineName: 'Icelandair',
    aircraftType: 'B752',
    liveryName: 'Hekla Aurora · Northern Lights',
    theme: 'aurora',
    primaryHex: '#047857',
    secondaryHex: '#38BDF8',
    accentHex: '#4ADE80',
    bellyHex: '#0F172A',
    titleText: 'ICELANDAIR',
    subtitleText: 'HEKLA AURORA',
    badgeText: 'AURORA 757',
    notes: 'Icelandair Boeing 757-200 painted with glowing green-blue Borealis Northern Lights.',
  },
  'ZK-OKQ': {
    registration: 'ZK-OKQ',
    airlineIcao: 'ANZ',
    airlineName: 'Air New Zealand',
    aircraftType: 'B77W',
    liveryName: 'All Blacks · Midnight Fern',
    theme: 'allblacks',
    primaryHex: '#090D16',
    secondaryHex: '#334155',
    accentHex: '#E2E8F0',
    bellyHex: '#090D16',
    titleText: 'AIR NEW ZEALAND',
    subtitleText: 'ALL BLACKS EDITION',
    badgeText: 'ALL BLACKS',
    notes: 'Air New Zealand jet-black fuselage with silver fern tail motif.',
  },
  'A6-EEO': {
    registration: 'A6-EEO',
    airlineIcao: 'UAE',
    airlineName: 'Emirates',
    aircraftType: 'A388',
    liveryName: 'Dubai Expo / United for Wildlife',
    theme: 'expo',
    primaryHex: '#0284C7',
    secondaryHex: '#16A34A',
    accentHex: '#F59E0B',
    bellyHex: '#F8FAFC',
    titleText: 'EMIRATES',
    subtitleText: 'EXPO DUBAI FLAGSHIP A380',
    badgeText: 'EXPO A380',
    notes: 'Emirates Airbus A380 special commemorative global expo livery.',
  },
  'A7-BAP': {
    registration: 'A7-BAP',
    airlineIcao: 'QTR',
    airlineName: 'Qatar Airways',
    aircraftType: 'B77W',
    liveryName: 'oneworld Alliance Flagship',
    theme: 'oneworld',
    primaryHex: '#1E3A8A',
    secondaryHex: '#7F1D1D',
    accentHex: '#38BDF8',
    bellyHex: '#CBD5E1',
    titleText: 'oneworld',
    subtitleText: 'QATAR AIRWAYS',
    badgeText: 'ONEWORLD',
    notes: 'Qatar Airways Boeing 777-300ER oneworld Alliance global livery.',
  },
  N37277: {
    registration: 'N37277',
    airlineIcao: 'UAL',
    airlineName: 'United Airlines',
    aircraftType: 'B738',
    liveryName: 'Eco-Skies Sustainable Fuel Jet',
    theme: 'expo',
    primaryHex: '#15803D',
    secondaryHex: '#0284C7',
    accentHex: '#4ADE80',
    bellyHex: '#E0F2FE',
    titleText: 'UNITED',
    subtitleText: 'ECO-SKIES SPECIAL',
    badgeText: 'ECO-SKIES',
    notes: 'United Airlines Boeing 737-800 Eco-Skies green-blue sustainability scheme.',
  },
  N521DN: {
    registration: 'N521DN',
    airlineIcao: 'DAL',
    airlineName: 'Delta Air Lines',
    aircraftType: 'A359',
    liveryName: 'Team USA Flagship A350',
    theme: 'retro',
    primaryHex: '#1D4ED8',
    secondaryHex: '#DC2626',
    accentHex: '#FFFFFF',
    bellyHex: '#0F172A',
    titleText: 'TEAM USA',
    subtitleText: 'DELTA AIR LINES · A350-900',
    badgeText: 'TEAM USA',
    notes: 'Delta Air Lines Airbus A350-900 swept red-white-blue Team USA livery.',
  },
  N921NN: {
    registration: 'N921NN',
    airlineIcao: 'AAL',
    airlineName: 'American Airlines',
    aircraftType: 'B738',
    liveryName: 'TWA Heritage Retro',
    theme: 'retro',
    primaryHex: '#DC2626',
    secondaryHex: '#F59E0B',
    accentHex: '#B91C1C',
    bellyHex: '#CBD5E1',
    titleText: 'TWA',
    subtitleText: 'AMERICAN HERITAGE SERIES',
    badgeText: 'TWA RETRO',
    notes: 'American Airlines Boeing 737-800 in twin-globe red Trans World Airlines heritage stripes.',
  },
  N560AS: {
    registration: 'N560AS',
    airlineIcao: 'ASA',
    airlineName: 'Alaska Airlines',
    aircraftType: 'B739',
    liveryName: 'West Coast Wonders / Orca',
    theme: 'turtle',
    primaryHex: '#0F172A',
    secondaryHex: '#0EA5E9',
    accentHex: '#38BDF8',
    bellyHex: '#E0F2FE',
    titleText: 'ALASKA',
    subtitleText: 'WEST COAST WONDERS',
    badgeText: 'ORCA 739',
    notes: 'Alaska Airlines Boeing 737-900ER Pacific Northwest marine special livery.',
  },
};

export interface RegistrationCountryInfo {
  code: string;
  name: string;
}

const REG_PREFIX_COUNTRIES: Array<[RegExp, string, string]> = [
  [/^B-?(H|K|L)[A-Z0-9]{2}$/, 'HK', 'Hong Kong'],
  [/^B-?M[A-Z0-9]{2}$/, 'MO', 'Macau'],
  [/^B-?(16|18|50)[0-9]{2,3}$/, 'TW', 'Taiwan'],
  [/^B-?[0-9A-Z]{4,5}$/, 'CN', 'China'],
  [/^N[0-9]{1,5}[A-Z]{0,2}$/, 'US', 'United States'],
  [/^JA[0-9A-Z]+$/, 'JP', 'Japan'],
  [/^HL[0-9]{4}$/, 'KR', 'South Korea'],
  [/^G-[A-Z]{4}$/, 'GB', 'United Kingdom'],
  [/^D-[A-Z]{4}$/, 'DE', 'Germany'],
  [/^F-[A-Z]{4}$/, 'FR', 'France'],
  [/^VH-[A-Z]{3}$/, 'AU', 'Australia'],
  [/^C-[A-Z]{4}$/, 'CA', 'Canada'],
  [/^9V-[A-Z]{3}$/, 'SG', 'Singapore'],
  [/^A6-[A-Z]{3}$/, 'AE', 'United Arab Emirates'],
  [/^A7-[A-Z]{3}$/, 'QA', 'Qatar'],
  [/^TC-[A-Z]{3}$/, 'TR', 'Turkey'],
  [/^VT-[A-Z]{3}$/, 'IN', 'India'],
  [/^PK-[A-Z]{3}$/, 'ID', 'Indonesia'],
  [/^HS-[A-Z]{3}$/, 'TH', 'Thailand'],
  [/^9M-[A-Z]{3}$/, 'MY', 'Malaysia'],
  [/^VN-[A-Z0-9]{4,5}$/, 'VN', 'Vietnam'],
  [/^RP-C?[0-9]{4}$/, 'PH', 'Philippines'],
  [/^ZK-[A-Z]{3}$/, 'NZ', 'New Zealand'],
  [/^EI-[A-Z]{3}$/, 'IE', 'Ireland'],
  [/^HB-[A-Z]{3}$/, 'CH', 'Switzerland'],
  [/^OE-[A-Z]{3}$/, 'AT', 'Austria'],
  [/^PH-[A-Z]{3}$/, 'NL', 'Netherlands'],
  [/^EC-[A-Z]{3}$/, 'ES', 'Spain'],
  [/^I-[A-Z]{4}$/, 'IT', 'Italy'],
  [/^SE-[A-Z]{3}$/, 'SE', 'Sweden'],
  [/^LN-[A-Z]{3}$/, 'NO', 'Norway'],
  [/^OY-[A-Z]{3}$/, 'DK', 'Denmark'],
  [/^OH-[A-Z]{3}$/, 'FI', 'Finland'],
  [/^TF-[A-Z]{3}$/, 'IS', 'Iceland'],
  [/^SP-[A-Z]{3}$/, 'PL', 'Poland'],
  [/^CS-[A-Z]{3}$/, 'PT', 'Portugal'],
  [/^P[PRT]-[A-Z]{3}$/, 'BR', 'Brazil'],
  [/^X[ABC]-[A-Z]{3}$/, 'MX', 'Mexico'],
  [/^CC-[A-Z]{3}$/, 'CL', 'Chile'],
  [/^HZ-[A-Z0-9]{3,4}$/, 'SA', 'Saudi Arabia'],
  [/^ET-[A-Z]{3}$/, 'ET', 'Ethiopia'],
  [/^SU-[A-Z]{3}$/, 'EG', 'Egypt'],
  [/^CN-[A-Z]{3}$/, 'MA', 'Morocco'],
  [/^ZS-[A-Z]{3}$/, 'ZA', 'South Africa'],
  [/^4X-[A-Z]{3}$/, 'IL', 'Israel'],
  [/^RA-[0-9]{5}$/, 'RU', 'Russia'],
];

export function resolveCountryFromFlight(
  icao24: string,
  registration?: string,
): RegistrationCountryInfo {
  const reg = (registration || '').trim().toUpperCase();
  if (reg) {
    for (const [rx, code, name] of REG_PREFIX_COUNTRIES) {
      if (rx.test(reg)) return {code, name};
    }
  }
  const hex = parseInt((icao24 || '').trim(), 16);
  if (Number.isFinite(hex) && hex > 0) {
    if (hex >= 0xa00000 && hex <= 0xafffff) return {code: 'US', name: 'United States'};
    if (hex >= 0x780000 && hex <= 0x7bffff) return {code: 'CN', name: 'China'};
    if (hex >= 0x899000 && hex <= 0x8993ff) return {code: 'TW', name: 'Taiwan'};
    if (hex >= 0x840000 && hex <= 0x87ffff) return {code: 'JP', name: 'Japan'};
    if (hex >= 0x718000 && hex <= 0x71ffff) return {code: 'KR', name: 'South Korea'};
    if (hex >= 0x400000 && hex <= 0x43ffff) return {code: 'GB', name: 'United Kingdom'};
    if (hex >= 0x3c0000 && hex <= 0x3fffff) return {code: 'DE', name: 'Germany'};
    if (hex >= 0x380000 && hex <= 0x3bffff) return {code: 'FR', name: 'France'};
    if (hex >= 0x7c0000 && hex <= 0x7fffff) return {code: 'AU', name: 'Australia'};
    if (hex >= 0xc00000 && hex <= 0xc3ffff) return {code: 'CA', name: 'Canada'};
    if (hex >= 0x768000 && hex <= 0x76ffff) return {code: 'SG', name: 'Singapore'};
    if (hex >= 0x896000 && hex <= 0x896fff) return {code: 'AE', name: 'United Arab Emirates'};
    if (hex >= 0x06a000 && hex <= 0x06afff) return {code: 'QA', name: 'Qatar'};
    if (hex >= 0x4b8000 && hex <= 0x4bffff) return {code: 'TR', name: 'Turkey'};
    if (hex >= 0x800000 && hex <= 0x83ffff) return {code: 'IN', name: 'India'};
    if (hex >= 0x8a0000 && hex <= 0x8a7fff) return {code: 'ID', name: 'Indonesia'};
    if (hex >= 0x880000 && hex <= 0x887fff) return {code: 'TH', name: 'Thailand'};
    if (hex >= 0x750000 && hex <= 0x757fff) return {code: 'MY', name: 'Malaysia'};
    if (hex >= 0x888000 && hex <= 0x88ffff) return {code: 'VN', name: 'Vietnam'};
    if (hex >= 0x758000 && hex <= 0x75ffff) return {code: 'PH', name: 'Philippines'};
    if (hex >= 0xc80000 && hex <= 0xc87fff) return {code: 'NZ', name: 'New Zealand'};
    if (hex >= 0x4ca000 && hex <= 0x4cafff) return {code: 'IE', name: 'Ireland'};
    if (hex >= 0x4b0000 && hex <= 0x4b7fff) return {code: 'CH', name: 'Switzerland'};
    if (hex >= 0x440000 && hex <= 0x447fff) return {code: 'AT', name: 'Austria'};
    if (hex >= 0x480000 && hex <= 0x487fff) return {code: 'NL', name: 'Netherlands'};
    if (hex >= 0x340000 && hex <= 0x37ffff) return {code: 'ES', name: 'Spain'};
    if (hex >= 0x300000 && hex <= 0x33ffff) return {code: 'IT', name: 'Italy'};
    if (hex >= 0x4a8000 && hex <= 0x4affff) return {code: 'SE', name: 'Sweden'};
    if (hex >= 0x478000 && hex <= 0x47ffff) return {code: 'NO', name: 'Norway'};
    if (hex >= 0x458000 && hex <= 0x45ffff) return {code: 'DK', name: 'Denmark'};
    if (hex >= 0x460000 && hex <= 0x467fff) return {code: 'FI', name: 'Finland'};
    if (hex >= 0x4cc000 && hex <= 0x4ccfff) return {code: 'IS', name: 'Iceland'};
    if (hex >= 0x488000 && hex <= 0x48ffff) return {code: 'PL', name: 'Poland'};
    if (hex >= 0x490000 && hex <= 0x497fff) return {code: 'PT', name: 'Portugal'};
    if (hex >= 0xe40000 && hex <= 0xe7ffff) return {code: 'BR', name: 'Brazil'};
    if (hex >= 0x0d0000 && hex <= 0x0d7fff) return {code: 'MX', name: 'Mexico'};
    if (hex >= 0x710000 && hex <= 0x717fff) return {code: 'SA', name: 'Saudi Arabia'};
    if (hex >= 0x100000 && hex <= 0x1fffff) return {code: 'RU', name: 'Russia'};
  }
  return {code: 'INTL', name: 'Other / International'};
}

export function resolveSpecialLivery(registration?: string, callsign?: string): SpecialLiverySpec | null {
  const norm = (registration || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (norm && SPECIAL_LIVERIES[norm]) return SPECIAL_LIVERIES[norm];
  const noDash = norm.replace(/-/g, '');
  for (const [k, spec] of Object.entries(SPECIAL_LIVERIES)) {
    if (k.replace(/-/g, '') === noDash && noDash.length >= 4) return spec;
  }
  const cs = (callsign || '').trim().toUpperCase();
  if (cs && SPECIAL_LIVERIES[cs]) return SPECIAL_LIVERIES[cs];
  return null;
}

export function resolveAirlineLivery(airlineIcao: string, callsign?: string): AirlineLivery {
  const code = (airlineIcao || callsign?.slice(0, 3) || '').toUpperCase();
  if (AIRLINE_LIVERIES[code]) {
    return AIRLINE_LIVERIES[code];
  }
  return {
    icao: code || 'GEN',
    iata: code.slice(0, 2) || 'FL',
    name: code ? `${code} Operator` : 'Commercial Airliner',
    fuselageHex: '#F1F5F9',
    tailHex: '#0284C7',
    accentHex: '#F59E0B',
    bellyHex: '#94A3B8',
    titleColor: '#0F172A',
  };
}

export function resolveAircraftSpec(typeCode: string): AircraftGeometrySpec {
  const t = (typeCode || 'A320').toUpperCase();
  if (/^A38/.test(t)) {
    return {code: t, name: 'Airbus A380-800', category: 'widebody', subtype: 'a380', isAirbus: true, lengthScale: 1.42, wingspanScale: 1.46, fuselageRadius: 0.62, engines: 4, winglets: true};
  }
  if (/^B74/.test(t)) {
    return {code: t, name: 'Boeing 747', category: 'widebody', subtype: 'b747', isAirbus: false, lengthScale: 1.38, wingspanScale: 1.34, fuselageRadius: 0.54, engines: 4, winglets: true};
  }
  if (/^B78/.test(t)) {
    return {code: t, name: `Boeing ${t}`, category: 'widebody', subtype: 'b787', isAirbus: false, lengthScale: 1.24, wingspanScale: 1.3, fuselageRadius: 0.45, engines: 2, winglets: true};
  }
  if (/^A35/.test(t)) {
    return {code: t, name: `Airbus ${t}`, category: 'widebody', subtype: 'a350', isAirbus: true, lengthScale: 1.28, wingspanScale: 1.32, fuselageRadius: 0.47, engines: 2, winglets: true};
  }
  if (/^B77/.test(t)) {
    return {code: t, name: `Boeing ${t}`, category: 'widebody', subtype: 'b777', isAirbus: false, lengthScale: 1.3, wingspanScale: 1.32, fuselageRadius: 0.48, engines: 2, winglets: true};
  }
  if (/^(A33|A34|B76)/.test(t)) {
    const isAb = t.startsWith('A');
    return {code: t, name: t, category: 'widebody', subtype: 'a330', isAirbus: isAb, lengthScale: 1.2, wingspanScale: 1.24, fuselageRadius: 0.44, engines: t.startsWith('A34') ? 4 : 2, winglets: true};
  }
  if (/^C919/.test(t)) {
    return {code: t, name: 'COMAC C919', category: 'narrowbody', subtype: 'c919', isAirbus: true, lengthScale: 1.02, wingspanScale: 1.02, fuselageRadius: 0.35, engines: 2, winglets: true};
  }
  if (/^(A31|A32|A20|A21)/.test(t)) {
    return {code: t, name: `Airbus ${t}`, category: 'narrowbody', subtype: 'a320', isAirbus: true, lengthScale: 1.0, wingspanScale: 1.0, fuselageRadius: 0.34, engines: 2, winglets: true};
  }
  if (/^(B73|B38|B39|B75)/.test(t)) {
    return {code: t, name: `Boeing ${t}`, category: 'narrowbody', subtype: 'b737', isAirbus: false, lengthScale: 1.0, wingspanScale: 0.99, fuselageRadius: 0.33, engines: 2, winglets: true};
  }
  if (/^(AT4|AT7|DH8|DHC|MA60|SF34|PC12)/.test(t)) {
    return {code: t, name: t, category: 'regional', subtype: 'turboprop', isAirbus: false, lengthScale: 0.78, wingspanScale: 0.92, fuselageRadius: 0.25, engines: 2, winglets: false, tTail: /AT[47]|DH8/.test(t)};
  }
  if (/^(C17|C130|C30J|Y20|A400|IL76)/.test(t)) {
    return {code: t, name: t, category: 'widebody', subtype: 'milcargo', isAirbus: false, lengthScale: 1.18, wingspanScale: 1.26, fuselageRadius: 0.48, engines: 4, winglets: false, tTail: true};
  }
  if (/^(F16|F18|F22|F35|J20|EUFI)/.test(t)) {
    return {code: t, name: t, category: 'regional', subtype: 'fighter', isAirbus: false, lengthScale: 0.62, wingspanScale: 0.48, fuselageRadius: 0.19, engines: 2, winglets: false};
  }
  if (/^(GLF|G65|GLEX|CL6|FA7|C68|PC24)/.test(t)) {
    return {code: t, name: t, category: 'regional', subtype: 'bizjet', isAirbus: false, lengthScale: 0.76, wingspanScale: 0.78, fuselageRadius: 0.23, engines: 2, winglets: true, tTail: true};
  }
  if (/^(ARJ|C909|CRJ|E17|E19|ERJ|MD8|MD9)/.test(t)) {
    const tTail = /ARJ|C909|CRJ|MD/.test(t);
    return {code: t, name: t.startsWith('ARJ') || t.startsWith('C909') ? 'COMAC ARJ21' : t, category: 'regional', subtype: tTail ? 'tTail' : 'a320', isAirbus: false, lengthScale: 0.84, wingspanScale: 0.85, fuselageRadius: 0.27, engines: 2, winglets: true, tTail};
  }
  return {code: t, name: t, category: 'narrowbody', subtype: 'a320', isAirbus: true, lengthScale: 1.0, wingspanScale: 1.0, fuselageRadius: 0.34, engines: 2, winglets: true};
}

const KNOWN_COM_FREQS: Record<
  string,
  {atis: string; cld: string; gnd: string; twr: string; app: string; transAlt: number; magVar: number}
> = {
  ZBAA: {atis: '127.600', cld: '121.650', gnd: '121.750', twr: '118.100', app: '119.700', transAlt: 9840, magVar: -7.2},
  ZBAD: {atis: '128.850', cld: '121.850', gnd: '121.625', twr: '118.450', app: '124.550', transAlt: 9840, magVar: -7.1},
  ZSPD: {atis: '127.850', cld: '121.950', gnd: '121.650', twr: '118.800', app: '119.200', transAlt: 9840, magVar: -6.1},
  ZSSS: {atis: '126.250', cld: '121.750', gnd: '121.600', twr: '118.100', app: '120.300', transAlt: 9840, magVar: -6.0},
  ZGGG: {atis: '128.600', cld: '121.850', gnd: '121.700', twr: '118.150', app: '119.750', transAlt: 9840, magVar: -3.2},
  VHHH: {atis: '128.200', cld: '129.900', gnd: '121.600', twr: '118.200', app: '119.100', transAlt: 9000, magVar: -3.4},
  RJTT: {atis: '128.800', cld: '121.825', gnd: '121.700', twr: '118.100', app: '119.100', transAlt: 14000, magVar: -7.8},
  RKSI: {atis: '128.200', cld: '121.000', gnd: '121.400', twr: '118.200', app: '119.750', transAlt: 14000, magVar: -8.6},
  KJFK: {atis: '128.725', cld: '135.050', gnd: '121.900', twr: '119.100', app: '125.700', transAlt: 18000, magVar: -12.8},
  KLAX: {atis: '133.800', cld: '121.400', gnd: '121.650', twr: '133.900', app: '124.500', transAlt: 18000, magVar: 11.4},
  KORD: {atis: '135.400', cld: '121.600', gnd: '121.750', twr: '120.750', app: '125.000', transAlt: 18000, magVar: -4.2},
  EGLL: {atis: '128.080', cld: '121.980', gnd: '121.905', twr: '118.505', app: '119.730', transAlt: 6000, magVar: 0.4},
  EDDF: {atis: '118.030', cld: '121.855', gnd: '121.805', twr: '119.905', app: '120.805', transAlt: 5000, magVar: 3.1},
  LFPG: {atis: '127.125', cld: '121.725', gnd: '121.805', twr: '119.250', app: '118.150', transAlt: 5000, magVar: 1.8},
  WSSS: {atis: '128.600', cld: '121.650', gnd: '121.725', twr: '118.600', app: '120.300', transAlt: 11000, magVar: 0.4},
};

export function getAirportDataSheet(params: {
  icao: string;
  iata?: string;
  name?: string;
  city?: string;
  country?: string;
  lat: number;
  lon: number;
  runways?: Array<{ident: string; headingDeg: number; lengthFt: number}>;
}): AirportDataSheet {
  const icao = (params.icao || '').toUpperCase();
  const cat = AIRPORT_CATALOG.find((a) => a.icao === icao || (params.iata && a.iata === params.iata.toUpperCase()));
  const code = cat?.icao ?? icao;
  const iata = (params.iata || cat?.iata || code).toUpperCase();
  const elev = cat?.elevationFt ?? 45;
  const com = KNOWN_COM_FREQS[code];

  const transAlt =
    com?.transAlt ??
    (/^K|C|MM|RC/.test(code)
      ? 18000
      : /^RJ|RK/.test(code)
        ? 14000
        : /^Z/.test(code)
          ? 9840
          : /^EG/.test(code)
            ? 6000
            : 5000);

  const magVar = com?.magVar ?? Number((Math.sin((params.lon * Math.PI) / 180) * -9.5).toFixed(1));
  const seedHash = code.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const f = (base: number, step: number) => `${(base + ((seedHash * step) % 36) * 0.025).toFixed(3)}`;

  const rwys = params.runways && params.runways.length > 0 ? params.runways : cat?.runways ?? [
    {ident: '36/18', headingDeg: 360, lengthFt: 10500},
  ];

  const approaches: ApproachProcedureSpec[] = rwys.map((rw, idx) => {
    const ends = rw.ident.split('/');
    const primaryEnd = ends[0] || rw.ident;
    const hdg = Math.round(((rw.headingDeg % 360) + 360) % 360);
    const ilsFreq = (108.1 + ((seedHash + idx * 3) % 19) * 0.2).toFixed(2);
    const fixPrefix = (iata || code.slice(-3)).replace(/[^A-Z]/g, 'X').slice(0, 2);
    return {
      runwayIdent: `ILS Z RWY ${primaryEnd}`,
      ilsFreqMhz: ilsFreq,
      courseDeg: hdg,
      glideslopeDeg: 3.0,
      fafFix: `${fixPrefix}${primaryEnd.slice(0, 2)}F`,
      fafDistNm: 5.8,
      fafAltFt: Math.round((elev + 1850) / 100) * 100,
      ifFix: `${fixPrefix}${primaryEnd.slice(0, 2)}I`,
      ifDistNm: 10.4,
      ifAltFt: Math.round((elev + 3200) / 100) * 100,
      iafFix: `${fixPrefix}OM`,
      iafAltFt: Math.round((elev + 4600) / 100) * 100,
      daFt: elev + 200,
      missedAltFt: Math.round((elev + 3000) / 500) * 500,
      missedHeadingDeg: hdg,
      papiAngleDeg: 3.0,
      lightingSystem: 'ALSF-II / PAPI-L 3.0°',
    };
  });

  const eaipUrl = /^Z/.test(code)
    ? `https://www.eaipchina.cn/`
    : /^K/.test(code)
      ? `https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/`
      : /^E[GH]/.test(code)
        ? `https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/`
        : `https://chartfox.org/${encodeURIComponent(code)}`;

  return {
    icao: code,
    iata,
    name: params.name || cat?.name || `${code} International`,
    city: params.city || cat?.city || '',
    country: params.country || cat?.country || '',
    elevationFt: elev,
    lat: params.lat || cat?.lat || 0,
    lon: params.lon || cat?.lon || 0,
    transitionAltFt: transAlt,
    magneticVarDeg: magVar,
    atisFreq: com?.atis ?? f(126.2, 3),
    clearanceFreq: com?.cld ?? f(121.6, 5),
    groundFreq: com?.gnd ?? f(121.7, 7),
    towerFreq: com?.twr ?? f(118.1, 11),
    approachFreq: com?.app ?? f(119.1, 13),
    eaipUrl,
    chartFoxUrl: `https://chartfox.org/${encodeURIComponent(code)}`,
    skyVectorUrl: `https://skyvector.com/airport/${encodeURIComponent(code)}`,
    approaches,
  };
}
