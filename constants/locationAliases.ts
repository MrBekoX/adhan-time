import { normalizeSearchText } from '@/utils/textCase';

export const COUNTRY_SEARCH_ALIASES: Record<string, string[]> = {
  '2': ['Turkey', 'Turkiye', 'Türkiye'],
  '4': ['Netherlands', 'Holland'],
  '12': ['Sweden'],
  '13': ['Germany'],
  '15': ['United Kingdom', 'UK', 'England', 'Great Britain'],
  '21': ['France'],
  '33': ['United States', 'USA', 'US', 'America'],
  '36': ['Norway'],
  '41': ['Finland'],
  '52': ['Canada'],
  '59': ['Australia'],
  '64': ['Saudi Arabia', 'KSA'],
  '67': ['South Africa'],
  '77': ['Pakistan'],
  '93': ['United Arab Emirates', 'UAE', 'Emirates'],
  '94': ['Qatar'],
  '107': ['Malaysia'],
  '114': ['Kenya'],
  '116': ['Japan'],
  '117': ['Indonesia'],
  '122': ['Iceland'],
  '133': ['Kuwait'],
  '145': ['Morocco'],
  '146': ['Brazil', 'Brasil'],
  '179': ['Singapore'],
  '189': ['Egypt'],
  '193': ['New Zealand'],
  '199': ['Argentina'],
};

const LOCATION_NAME_ALIASES: Record<string, string[]> = {
  istanbul: ['İstanbul'],
  izmir: ['İzmir'],
  londra: ['London'],
  'new york': ['New York'],
  'los angeles': ['Los Angeles'],
  mekke: ['Mecca', 'Makkah'],
  medine: ['Medina'],
  riyad: ['Riyadh'],
  kuveyt: ['Kuwait City', 'Kuwait'],
  kahire: ['Cairo'],
  kazablanka: ['Casablanca'],
  'sao paulo': ['São Paulo', 'Sao Paulo'],
  'buenos aires': ['Buenos Aires'],
};

export function locationNameAliases(name: string, nameEn: string): string[] {
  const keys = [name, nameEn].map((value) => normalizeSearchText(value, 'en'));
  const aliases = new Set<string>();
  for (const key of keys) {
    for (const alias of LOCATION_NAME_ALIASES[key] ?? []) aliases.add(alias);
  }
  return Array.from(aliases);
}
