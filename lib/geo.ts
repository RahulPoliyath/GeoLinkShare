import { NextRequest } from 'next/server';

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  city: string;
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
};

/**
 * Extract Geographic data safely from standard proxy headers
 */
export function extractGeoData(req: NextRequest): GeoLocation {
  const headers = req.headers;

  // Cloudflare, GCP Cloud Run, Vercel headers
  const countryHeader =
    headers.get('cf-ipcountry') ||
    headers.get('x-client-geo-country') ||
    headers.get('x-country-code') ||
    headers.get('x-vercel-ip-country');

  const cityHeader =
    headers.get('x-client-geo-city') ||
    headers.get('x-vercel-ip-city') ||
    headers.get('cf-ipcity');

  if (countryHeader && countryHeader.length === 2) {
    const code = countryHeader.toUpperCase();
    return {
      countryCode: code,
      countryName: COUNTRY_NAMES[code] || code,
      city: cityHeader ? decodeURIComponent(cityHeader) : 'Metropolitan Area',
    };
  }

  // Fallback heuristic based on Accept-Language
  const acceptLang = headers.get('accept-language') || '';
  if (acceptLang.includes('ja')) return { countryCode: 'JP', countryName: 'Japan', city: 'Tokyo' };
  if (acceptLang.includes('de')) return { countryCode: 'DE', countryName: 'Germany', city: 'Berlin' };
  if (acceptLang.includes('fr')) return { countryCode: 'FR', countryName: 'France', city: 'Paris' };
  if (acceptLang.includes('en-GB')) return { countryCode: 'GB', countryName: 'United Kingdom', city: 'London' };
  if (acceptLang.includes('en-CA')) return { countryCode: 'CA', countryName: 'Canada', city: 'Toronto' };
  if (acceptLang.includes('en-AU')) return { countryCode: 'AU', countryName: 'Australia', city: 'Sydney' };
  if (acceptLang.includes('hi') || acceptLang.includes('en-IN')) return { countryCode: 'IN', countryName: 'India', city: 'Bengaluru' };
  if (acceptLang.includes('pt')) return { countryCode: 'BR', countryName: 'Brazil', city: 'São Paulo' };

  // Default to US
  return {
    countryCode: 'US',
    countryName: 'United States',
    city: 'San Francisco',
  };
}
