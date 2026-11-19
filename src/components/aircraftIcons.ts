export type Fr24ModelClass =
  | 'a380'
  | 'heavy4'
  | 'widebody'
  | 'narrowbody'
  | 'rearjet'
  | 'bizjet'
  | 'turboprop'
  | 'lightprop'
  | 'heli'
  | 'fighter'
  | 'milcargo';

export interface EmergencySquawkMeta {
  code: '7500' | '7600' | '7700';
  shortLabel: string;
  title: string;
  description: string;
}

export function getEmergencySquawkMeta(squawk?: string): EmergencySquawkMeta | null {
  const code = (squawk ?? '').trim();
  if (code === '7700') {
    return {
      code: '7700',
      shortLabel: 'EMERG 7700',
      title: 'General Emergency (Squawk 7700)',
      description: 'Aircraft transponder is broadcasting emergency / distress code 7700.',
    };
  }
  if (code === '7600') {
    return {
      code: '7600',
      shortLabel: 'COMMS 7600',
      title: 'Radio / Lost Comms Failure (Squawk 7600)',
      description: 'Aircraft transponder indicates loss of two-way radio communications.',
    };
  }
  if (code === '7500') {
    return {
      code: '7500',
      shortLabel: 'HIJACK 7500',
      title: 'Unlawful Interference Alert (Squawk 7500)',
      description: 'Aircraft transponder is broadcasting unlawful interference code 7500.',
    };
  }
  return null;
}

export interface DbFlagMeta {
  kind: 'LADD' | 'MIL' | 'PIA';
  shortLabel: string;
  title: string;
  description: string;
  accentHex: string;
}

export function getDbFlagMeta(flight: {
  isLadd?: boolean;
  isMilitary?: boolean;
  isPia?: boolean;
  dbFlags?: number;
}): DbFlagMeta | null {
  const flags = Number(flight.dbFlags ?? 0) || 0;
  if (flight.isLadd || (flags & 8) !== 0) {
    return {
      kind: 'LADD',
      shortLabel: 'LADD',
      title: 'FAA LADD (Limiting Aircraft Data Displayed)',
      description: 'Privacy-blocked on mainstream trackers; surfaced live via adsb.lol DB flags.',
      accentHex: '#A855F7',
    };
  }
  if (flight.isMilitary || (flags & 1) !== 0) {
    return {
      kind: 'MIL',
      shortLabel: 'MIL',
      title: 'Military / State Aircraft',
      description: 'Flagged as military or state-operated airframe in ADS-B database.',
      accentHex: '#10B981',
    };
  }
  if (flight.isPia || (flags & 4) !== 0) {
    return {
      kind: 'PIA',
      shortLabel: 'PIA',
      title: 'Privacy ICAO Address (PIA)',
      description: 'Operating with a temporary randomized FAA Privacy ICAO hex.',
      accentHex: '#06B6D4',
    };
  }
  return null;
}

export function resolveFr24ModelClass(aircraftType?: string, callsign?: string): Fr24ModelClass {
  const t = (aircraftType ?? '').trim().toUpperCase();
  const cs = (callsign ?? '').trim().toUpperCase();

  // Super 4-engine double-decker
  if (/^A38[08]?$/.test(t) || t === 'A388') return 'a380';

  // 4-engine Heavies (B747 / A340 / AN124 / C5 / IL96 / AN225)
  if (/^(B74|A34|AN124|A124|A225|IL96)/.test(t)) return 'heavy4';

  // Helicopters / Tiltrotors
  if (
    /^(EC\d|H1\d|H2\d|AS3|AS5|AW1|B06|B212|B407|B412|B429|B505|R22|R44|R66|S76|S92|UH\d|CH\d|AH\d|MI\d|KA\d|MD5|MD6|EN28|BK17)/.test(
      t,
    ) ||
    t === 'HELI'
  ) {
    return 'heli';
  }

  // Military Fighters / Fast Trainers / Attack
  if (
    /^(F14|F15|F16|F18|FA18|F22|F35|F117|EUFI|EF2|RFAL|GRIP|JAS39|T38|T45|T50|T6|HAWK|M346|AJET|J10|J11|J15|J16|J20|SU2|SU3|SU5|MIG|MRF)/.test(
      t,
    )
  ) {
    return 'fighter';
  }

  // Military Cargo / Tankers / Maritime Patrol / Bombers / AWACS
  if (
    /^(C130|C30J|C17|C5M|C2|A400|Y20|IL76|K35R|K35E|KC46|KC10|KC30|E3CF|E3TF|E2|E6|E8|P8|P3|B52|B1B|B2|V22|CN35|C295|ATLA|MRTT)/.test(
      t,
    ) ||
    /^(RCH|REACH|CNV|DUKE|NATO|HKY|PAT|SPAR|SAM|AF1|AF2|PLF|QID|LAGR|NCHO|BART|ASCOT|RRR|GAF|FAF|IAM|MMF|CHJ)/.test(
      cs,
    )
  ) {
    return 'milcargo';
  }

  // Widebody Twinjets (and Trijet MD11/DC10)
  if (/^(B77|B78|A35|A33|B76|MD11|DC10|B77L|B77W|B772|B773|B788|B789|B78X|A359|A35K|A332|A333|A338|A339|B763|B764)/.test(t)) {
    return 'widebody';
  }

  // Turboprops
  if (
    /^(AT4|AT7|DH8|DHC|SF34|J328|E120|B190|BE20|BE30|BE9L|SW4|PC12|C208|C402|C414|AN24|AN26|MA60|Y12|P180|TBM)/.test(t)
  ) {
    return 'turboprop';
  }

  // Light Single-Engine GA Piston / Trainers
  if (/^(C15|C17|C18|C20|C21|P28|PA2|PA3|PA4|SR2|DA2|DA4|DA6|BE3|BE5|M20|RV|DR4|AC11|GLID)/.test(t)) {
    return 'lightprop';
  }

  // Business Jets
  if (
    /^(GLF|G15|G28|G55|G65|GLEX|GL5|GL6|GL7|CL3|CL6|C50|C51|C52|C55|C56|C65|C68|C70|C75|FA1|FA2|FA5|FA7|FA8|E50P|E55P|HDJT|LJ|BE40|H25B|GALX|PC24)/.test(
      t,
    )
  ) {
    return 'bizjet';
  }

  // Rear-engine / T-tail Regional & Narrowbody Jets
  if (/^(CRJ|E13|E14|E17|E19|ERJ|MD8|MD9|B712|DC9|C909|ARJ21|F70|F100|BAE|RJ85|RJ1H)/.test(t)) {
    return 'rearjet';
  }

  // Commercial Narrowbodies (A320, B737, C919, B757, A220)
  return 'narrowbody';
}

export function getFr24OperatorLogoUrl(airlineIcao?: string): string {
  const clean = (airlineIcao ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean.length < 2) return '';
  return `https://images.flightradar24.com/assets/airlines/logotypes/${clean}.png`;
}

/**
 * Flightradar24-inspired top-down vector aircraft silhouettes.
 * Returns raw SVG markup without touching or adding any external asset files.
 */
export function buildFr24AircraftSvg(
  model: Fr24ModelClass,
  size: number,
  fill: string,
  stroke: string,
): string {
  const sw = size >= 24 ? '1.35' : '1.5';

  switch (model) {
    case 'a380':
      // Massive double-deck widebody, 4 engine pods, very broad wingspan
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 1.5C17.2 1.5 18.2 3.8 18.2 7.2V11.2L30 17.5V19.6L18.2 17.2V24.6L22.5 27.8V29.6L16 28.2L9.5 29.6V27.8L13.8 24.6V17.2L2 19.6V17.5L13.8 11.2V7.2C13.8 3.8 14.8 1.5 16 1.5Z"/>
        <ellipse cx="9" cy="14.2" rx="1" ry="1.8" fill="${stroke}" stroke="none"/>
        <ellipse cx="5.4" cy="16" rx="0.9" ry="1.6" fill="${stroke}" stroke="none"/>
        <ellipse cx="23" cy="14.2" rx="1" ry="1.8" fill="${stroke}" stroke="none"/>
        <ellipse cx="26.6" cy="16" rx="0.9" ry="1.6" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'heavy4':
      // Long sleek 4-engine quadjet (B747 / A340)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 1.2L17.6 5.5V11.6L29.5 18.8V20.8L17.6 17.4V25.2L21.8 28.4V30L16 28.6L10.2 30V28.4L14.4 25.2V17.4L2.5 20.8V18.8L14.4 11.6V5.5L16 1.2Z"/>
        <rect x="8.8" y="13.8" width="1.6" height="3" rx="0.6" fill="${stroke}" stroke="none"/>
        <rect x="5" y="16" width="1.4" height="2.6" rx="0.6" fill="${stroke}" stroke="none"/>
        <rect x="21.6" y="13.8" width="1.6" height="3" rx="0.6" fill="${stroke}" stroke="none"/>
        <rect x="25.6" y="16" width="1.4" height="2.6" rx="0.6" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'widebody':
      // Large twin-engine widebody (B777 / B787 / A350 / A330)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 1.4C17.1 1.4 17.8 3.6 17.8 6.8V11.8L29.4 18.2V20.2L17.8 17.1V25L21.8 28.2V29.8L16 28.5L10.2 29.8V28.2L14.2 25V17.1L2.6 20.2V18.2L14.2 11.8V6.8C14.2 3.6 14.9 1.4 16 1.4Z"/>
        <ellipse cx="10.2" cy="14.1" rx="1.15" ry="2.1" fill="${stroke}" stroke="none"/>
        <ellipse cx="21.8" cy="14.1" rx="1.15" ry="2.1" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'rearjet':
      // Rear-mounted twinjet with swept T-tail (CRJ / ERJ / MD80 / C909)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 2.5C16.9 2.5 17.4 4.4 17.4 7V13.4L27.4 18.6V20.4L17.4 17.8V22.8L20 23.4V25.2L17.4 25.1V26.4L21 29.1V30.4L16 29.4L11 30.4V29.1L14.6 26.4V25.1L12 25.2V23.4L14.6 22.8V17.8L4.6 20.4V18.6L14.6 13.4V7C14.6 4.4 15.1 2.5 16 2.5Z"/>
      </svg>`;

    case 'bizjet':
      // Sleek pointed business jet with sharp wingtips & rear nacelles
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 2.2L17.2 6.8V14.2L26.5 19.2V20.7L17.2 18.1V22.8L19.4 23.5V25L17.2 24.9V26.8L20.4 29.4V30.5L16 29.4L11.6 30.5V29.4L14.8 26.8V24.9L12.6 25V23.5L14.8 22.8V18.1L5.5 20.7V19.2L14.8 14.2V6.8L16 2.2Z"/>
      </svg>`;

    case 'turboprop':
      // High-aspect straight wing twin turboprop with nacelles (ATR / Dash 8 / MA60)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 2.8C16.9 2.8 17.5 4.8 17.5 7.5V12.2L29.5 13.4V15.8L17.5 16.4V25.4L21.8 28.4V29.8L16 28.7L10.2 29.8V28.4L14.5 25.4V16.4L2.5 15.8V13.4L14.5 12.2V7.5C14.5 4.8 15.1 2.8 16 2.8Z"/>
        <rect x="9.6" y="10.6" width="1.7" height="3.2" rx="0.6" fill="${stroke}" stroke="none"/>
        <rect x="20.7" y="10.6" width="1.7" height="3.2" rx="0.6" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'lightprop':
      // Classic single-engine Cessna/Piper light aircraft with straight high wing & nose prop
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <line x1="12" y1="3.4" x2="20" y2="3.4" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M16 4.2L17.2 7.4V11.2L29 12V15.4L17.2 15.6L16.8 25.2L20.5 27.6V29.2L16 28.4L11.5 29.2V27.6L15.2 25.2L14.8 15.6L3 15.4V12L14.8 11.2V7.4L16 4.2Z"/>
      </svg>`;

    case 'heli':
      // Helicopter fuselage + tailboom + 4-blade X rotor disc
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 6.5C18.4 6.5 19.6 9 19.6 12.5C19.6 15.6 18.2 17.5 17 18.2V26.5L19.5 28V29.5H12.5V28L15 26.5V18.2C13.8 17.5 12.4 15.6 12.4 12.5C12.4 9 13.6 6.5 16 6.5Z"/>
        <line x1="5.5" y1="4.5" x2="26.5" y2="21.5" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
        <line x1="26.5" y1="4.5" x2="5.5" y2="21.5" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="13" r="2.2" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'fighter':
      // Delta / swept supersonic fighter silhouette (F16 / F35 / J20 / Eurofighter)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 1.5L17.8 8.5L27.8 18.5V21.5L18.4 19.5L18 24L22.2 28.2V30L17 28L16 29.5L15 28L9.8 30V28.2L14 24L13.6 19.5L4.2 21.5V18.5L14.2 8.5L16 1.5Z"/>
      </svg>`;

    case 'milcargo':
      // Broad high-wing heavy military cargo / tanker (C17 / C130 / Y20 / KC135)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 2.2C17.6 2.2 18.6 4.8 18.6 8.2V11.2L30.2 15.8V18.6L18.6 17.2V25.2L23.2 28.2V30L16 28.8L8.8 30V28.2L13.4 25.2V17.2L1.8 18.6V15.8L13.4 11.2V8.2C13.4 4.8 14.4 2.2 16 2.2Z"/>
        <rect x="8.4" y="12.2" width="1.6" height="2.8" rx="0.5" fill="${stroke}" stroke="none"/>
        <rect x="5" y="13.5" width="1.5" height="2.5" rx="0.5" fill="${stroke}" stroke="none"/>
        <rect x="22" y="12.2" width="1.6" height="2.8" rx="0.5" fill="${stroke}" stroke="none"/>
        <rect x="25.5" y="13.5" width="1.5" height="2.5" rx="0.5" fill="${stroke}" stroke="none"/>
      </svg>`;

    case 'narrowbody':
    default:
      // Classic FR24 narrowbody jetliner (A320 / B737 / C919 / B757)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
        <path d="M16 2C16.9 2 17.5 4.2 17.5 7.4V12.2L28 17.8V19.7L17.5 16.9V24.8L21 27.6V29.3L16 28.1L11 29.3V27.6L14.5 24.8V16.9L4 19.7V17.8L14.5 12.2V7.4C14.5 4.2 15.1 2 16 2Z"/>
      </svg>`;
  }
}
