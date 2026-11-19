/**
 * SkyDeck Cloudflare Worker CORS Proxy
 * -----------------------------------
 * Deploy at https://dash.cloudflare.com -> Workers & Pages -> Create Worker -> Paste & Deploy
 * Then paste your https://<worker-name>.<subdomain>.workers.dev URL into SkyDeck Settings.
 */

const ALLOWED_HOSTS = new Set([
  'data-cloud.flightradar24.com',
  'api.flightradar24.com',
  'www.flightradar24.com',
  'api.adsb.lol',
  'opendata.adsb.fi',
  'opensky-network.org',
  'aviationweather.gov',
  'api.rainviewer.com',
  'overpass-api.de',
  'lz4.overpass-api.de',
  'z.overpass-api.de',
  'overpass.openstreetmap.fr',
  'overpass.kumi.systems',
  'overpass.private.coffee',
  'maps.mail.ru',
  'api.planespotters.net',
  'hexdb.io',
  'api.adsbdb.com',
  'api.airframes.io',
  'nasstatus.faa.gov',
  'ipwho.is',
  'davidmegginson.github.io',
  'commons.wikimedia.org',
  'aviation-safety.net',
  'asn.flightsafety.org',
]);

const FR24_MOBILE_UA = 'FlightradarFree/2024090501 CFNetwork/1496.0.7 Darwin/23.5.0';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Type, X-SkyDeck-Proxy',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: corsHeaders()});
    }

    const reqUrl = new URL(request.url);
    const targetParam = reqUrl.searchParams.get('url');

    if (!targetParam) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'SkyDeck Cloudflare Worker CORS Proxy',
          usage: `${reqUrl.origin}/?url=https%3A%2F%2Fdata-cloud.flightradar24.com%2F...`,
        }),
        {
          status: 200,
          headers: corsHeaders({'Content-Type': 'application/json; charset=utf-8'}),
        },
      );
    }

    let target;
    try {
      target = new URL(targetParam);
    } catch {
      return new Response(JSON.stringify({error: 'Invalid target URL'}), {
        status: 400,
        headers: corsHeaders({'Content-Type': 'application/json; charset=utf-8'}),
      });
    }

    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
      return new Response(JSON.stringify({error: `Host not allowed: ${target.hostname}`}), {
        status: 403,
        headers: corsHeaders({'Content-Type': 'application/json; charset=utf-8'}),
      });
    }

    const headers = new Headers();
    const host = target.hostname.toLowerCase();

    if (host === 'api.flightradar24.com') {
      headers.set('User-Agent', FR24_MOBILE_UA);
      headers.set('Accept', 'application/json, text/plain, */*');
    } else if (host.endsWith('flightradar24.com')) {
      headers.set('User-Agent', DESKTOP_UA);
      headers.set('Accept', 'application/json, text/plain, */*');
      headers.set('Origin', 'https://www.flightradar24.com');
      headers.set('Referer', 'https://www.flightradar24.com/');
    } else {
      headers.set('User-Agent', DESKTOP_UA);
      headers.set('Accept', request.headers.get('Accept') || 'application/json, text/plain, */*');
    }

    let body = undefined;
    if (request.method === 'POST') {
      const contentType = request.headers.get('Content-Type');
      if (contentType) headers.set('Content-Type', contentType);
      body = await request.arrayBuffer();
    }

    const isStaticCsv = host === 'davidmegginson.github.io';
    const isOverpass = host.includes('overpass');

    try {
      const upstream = await fetch(target.toString(), {
        method: request.method === 'POST' ? 'POST' : 'GET',
        headers,
        body,
        cf: {
          cacheEverything: request.method === 'GET',
          cacheTtl: isStaticCsv ? 3600 : isOverpass ? 600 : 3,
        },
      });

      const respHeaders = new Headers(corsHeaders({
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'X-SkyDeck-Proxy': 'cloudflare-worker',
        'Cache-Control': isStaticCsv ? 'public, max-age=3600' : 'public, max-age=3',
      }));

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({error: err instanceof Error ? err.message : 'Upstream fetch failed'}),
        {
          status: 502,
          headers: corsHeaders({'Content-Type': 'application/json; charset=utf-8'}),
        },
      );
    }
  },
};
