import { NextRequest } from 'next/server';

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  city: string;
  region?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  JP: 'Japan',
  FR: 'France',
  CA: 'Canada',
  AU: 'Australia',
  IN: 'India',
  SG: 'Singapore',
  BR: 'Brazil',
  NL: 'Netherlands',
  SE: 'Sweden',
  KR: 'South Korea',
  ES: 'Spain',
  IT: 'Italy',
  CH: 'Switzerland',
  AE: 'United Arab Emirates',
  ID: 'Indonesia',
  MX: 'Mexico',
  PH: 'Philippines',
  MY: 'Malaysia',
  TH: 'Thailand',
  VN: 'Vietnam',
  ZA: 'South Africa',
  NG: 'Nigeria',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  SA: 'Saudi Arabia',
  TR: 'Turkey',
  PL: 'Poland',
  IE: 'Ireland',
  NZ: 'New Zealand',
};

const CITY_COORDINATES: Record<string, [number, number]> = {
  // India
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  'new delhi': [28.6139, 77.209],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  surat: [21.1702, 72.8311],
  lucknow: [26.8467, 80.9462],
  navi_mumbai: [19.033, 73.0297],
  'navi mumbai': [19.033, 73.0297],
  thane: [19.2183, 72.9781],
  // North America
  'san francisco': [37.7749, -122.4194],
  'new york': [40.7128, -74.006],
  los_angeles: [34.0522, -118.2437],
  'los angeles': [34.0522, -118.2437],
  chicago: [41.8781, -87.6298],
  seattle: [47.6062, -122.3321],
  austin: [30.2672, -97.7431],
  miami: [25.7617, -80.1918],
  ashburn: [39.0438, -77.4874],
  toronto: [43.6532, -79.3832],
  vancouver: [49.2827, -123.1207],
  montreal: [45.5017, -73.5673],
  'mexico city': [19.4326, -99.1332],
  // Europe
  london: [51.5072, -0.1276],
  manchester: [53.4808, -2.2426],
  berlin: [52.52, 13.405],
  frankfurt: [50.1109, 8.6821],
  munich: [48.1351, 11.582],
  paris: [48.8566, 2.3522],
  amsterdam: [52.3676, 4.9041],
  dublin: [53.3498, -6.2603],
  madrid: [40.4168, -3.7038],
  rome: [41.9028, 12.4964],
  zurich: [47.3769, 8.5417],
  stockholm: [59.3293, 18.0686],
  warsaw: [52.2297, 21.0122],
  // Asia Pacific & Middle East
  tokyo: [35.6762, 139.6503],
  osaka: [34.6937, 135.5023],
  singapore: [1.3521, 103.8198],
  seoul: [37.5665, 126.978],
  sydney: [-33.8688, 151.2093],
  melbourne: [-37.8136, 144.9631],
  dubai: [25.2048, 55.2708],
  jakarta: [-6.2088, 106.8456],
  manila: [14.5995, 120.9842],
  bangkok: [13.7563, 100.5018],
  'kuala lumpur': [3.139, 101.6869],
  karachi: [24.8607, 67.0011],
  dhaka: [23.8103, 90.4125],
  riyadh: [24.7136, 46.6753],
  // South America & Africa
  'são paulo': [-23.5505, -46.6333],
  'sao paulo': [-23.5505, -46.6333],
  'rio de janeiro': [-22.9068, -43.1729],
  johannesburg: [-26.2041, 28.0473],
  lagos: [6.5244, 3.3792],
};

const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  GB: [54.0, -2.5],
  DE: [51.1657, 10.4515],
  JP: [36.2048, 138.2529],
  FR: [46.2276, 2.2137],
  CA: [56.1304, -106.3468],
  AU: [-25.2744, 133.7751],
  IN: [20.5937, 78.9629],
  SG: [1.3521, 103.8198],
  BR: [-14.235, -51.9253],
  NL: [52.1326, 5.2913],
  SE: [60.1282, 18.6435],
  KR: [35.9078, 127.7669],
  ES: [40.4637, -3.7492],
  IT: [41.8719, 12.5674],
  CH: [46.8182, 8.2275],
  AE: [23.4241, 53.8478],
  ID: [-0.7893, 113.9213],
  MX: [23.6345, -102.5528],
  PH: [12.8797, 121.774],
  MY: [4.2105, 101.9758],
  TH: [15.87, 100.9925],
  VN: [14.0583, 108.2772],
  ZA: [-30.5595, 22.9375],
  NG: [9.082, 8.6753],
  PK: [30.3753, 69.3451],
  BD: [23.685, 90.3563],
  SA: [23.8859, 45.0792],
  TR: [38.9637, 35.2433],
  PL: [51.9194, 19.1451],
  IE: [53.4129, -8.2439],
  NZ: [-40.9006, 174.886],
};

function parseCoord(raw: string | null, min: number, max: number): number | undefined {
  if (!raw) return undefined;
  const num = Number(raw.trim());
  if (!Number.isFinite(num) || num < min || num > max) return undefined;
  return Math.round(num * 10000) / 10000;
}

/**
 * Resolve approximate [latitude, longitude] from a city name or ISO country code
 * for IP-geolocated clicks that do not carry exact coordinate headers.
 */
export function resolveApproxCoordinates(
  city?: string,
  countryCode?: string
): { latitude: number; longitude: number } | null {
  const cleanCity = (city || '').trim().toLowerCase();
  if (cleanCity && CITY_COORDINATES[cleanCity]) {
    const [latitude, longitude] = CITY_COORDINATES[cleanCity];
    return { latitude, longitude };
  }

  const cleanCountry = (countryCode || '').trim().toUpperCase();
  if (cleanCountry && COUNTRY_COORDINATES[cleanCountry]) {
    const [latitude, longitude] = COUNTRY_COORDINATES[cleanCountry];
    return { latitude, longitude };
  }

  return null;
}

/**
 * Extract Geographic data safely from standard proxy / Vercel / Cloudflare headers
 */
export function extractGeoData(req: NextRequest): GeoLocation {
  const headers = req.headers;

  const countryHeader =
    headers.get('cf-ipcountry') ||
    headers.get('x-client-geo-country') ||
    headers.get('x-country-code') ||
    headers.get('x-vercel-ip-country');

  const cityHeader =
    headers.get('x-client-geo-city') ||
    headers.get('x-vercel-ip-city') ||
    headers.get('cf-ipcity');

  const regionHeader =
    headers.get('x-vercel-ip-country-region') || headers.get('cf-region');

  const timezoneHeader =
    headers.get('x-vercel-ip-timezone') || headers.get('cf-timezone');

  const headerLat = parseCoord(
    headers.get('x-vercel-ip-latitude') || headers.get('cf-iplatitude'),
    -90,
    90
  );
  const headerLng = parseCoord(
    headers.get('x-vercel-ip-longitude') || headers.get('cf-iplongitude'),
    -180,
    180
  );

  if (countryHeader && countryHeader.length === 2) {
    const code = countryHeader.toUpperCase();
    let city = 'Metropolitan Area';
    if (cityHeader) {
      try {
        city = decodeURIComponent(cityHeader);
      } catch {
        city = cityHeader;
      }
    }
    const approx =
      headerLat !== undefined && headerLng !== undefined
        ? { latitude: headerLat, longitude: headerLng }
        : resolveApproxCoordinates(city, code);

    return {
      countryCode: code,
      countryName: COUNTRY_NAMES[code] || code,
      city,
      region: regionHeader ? regionHeader.trim().slice(0, 64) : undefined,
      timezone: timezoneHeader ? timezoneHeader.trim().slice(0, 64) : undefined,
      latitude: approx?.latitude,
      longitude: approx?.longitude,
    };
  }

  const acceptLang = headers.get('accept-language') || '';
  if (acceptLang.includes('ja'))
    return { countryCode: 'JP', countryName: 'Japan', city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 };
  if (acceptLang.includes('de'))
    return { countryCode: 'DE', countryName: 'Germany', city: 'Berlin', latitude: 52.52, longitude: 13.405 };
  if (acceptLang.includes('fr'))
    return { countryCode: 'FR', countryName: 'France', city: 'Paris', latitude: 48.8566, longitude: 2.3522 };
  if (acceptLang.includes('en-GB'))
    return { countryCode: 'GB', countryName: 'United Kingdom', city: 'London', latitude: 51.5072, longitude: -0.1276 };
  if (acceptLang.includes('en-CA'))
    return { countryCode: 'CA', countryName: 'Canada', city: 'Toronto', latitude: 43.6532, longitude: -79.3832 };
  if (acceptLang.includes('en-AU'))
    return { countryCode: 'AU', countryName: 'Australia', city: 'Sydney', latitude: -33.8688, longitude: 151.2093 };
  if (acceptLang.includes('hi') || acceptLang.includes('en-IN'))
    return { countryCode: 'IN', countryName: 'India', city: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 };
  if (acceptLang.includes('pt'))
    return { countryCode: 'BR', countryName: 'Brazil', city: 'São Paulo', latitude: -23.5505, longitude: -46.6333 };

  return {
    countryCode: 'US',
    countryName: 'United States',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
  };
}
