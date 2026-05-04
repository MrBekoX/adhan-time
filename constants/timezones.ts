/**
 * Country/state → IANA timezone mapping.
 *
 * Source data: docs/audit-fixes-2026-05-03/data/countries.json
 * (ezanvakti API /api/locations/countries dump on 2026-05-03, 209 countries).
 *
 * Country IDs not present here cause `resolveTimezone` to throw — see
 * services/timezoneResolver.ts. This is intentional: a wrong fallback would
 * deliver prayer notifications at the wrong local time, which we treat as a
 * religious-accuracy failure (CLAUDE.md auto-memory: "religious accuracy first").
 *
 * Multi-tz layout:
 *  - USA (33) and Canada (52) ship state/province IDs in the API; mappings
 *    populated under `states` (V6.2 / V6.3).
 *  - Australia (59), Indonesia (117), Brazil (146), Russia (207) only return
 *    one synthetic "state" entry, so the user must pick a zone manually via
 *    the select-timezone onboarding screen (V6.4). Until then `default` is
 *    used as the fallback.
 */

type StateMap = Record<string, string>;
type CountryEntry = string | { default: string; states?: StateMap };

export const COUNTRY_TZ: Record<string, CountryEntry> = {
  '1': 'Europe/Istanbul', // KUZEY KIBRIS
  '2': 'Europe/Istanbul', // TÜRKİYE
  '3': 'Europe/Monaco',
  '4': 'Europe/Amsterdam', // HOLLANDA
  '5': 'Asia/Baku', // AZERBAYCAN
  '6': 'Europe/Tallinn', // ESTONYA
  '7': 'Europe/Budapest', // MACARISTAN
  '8': 'Europe/Rome', // ITALYA
  '9': 'Europe/Sarajevo', // BOSNA HERSEK
  '10': 'Europe/Vatican', // VATIKAN
  '11': 'Europe/Brussels', // BELCIKA
  '12': 'Europe/Stockholm', // ISVEC
  '13': 'Europe/Berlin', // ALMANYA
  '14': 'Europe/Bratislava', // SLOVAKYA
  '15': 'Europe/London', // INGILTERE
  '16': 'Europe/Prague', // CEK CUMHURIYETI
  '17': 'Europe/Andorra',
  '18': 'Europe/Belgrade', // KOSOVA — no IANA zone, uses Belgrade time
  '19': 'Europe/Ljubljana', // SLOVENYA
  '20': 'Europe/Riga', // LETONYA
  '21': 'Europe/Paris', // FRANSA
  '22': 'Europe/Athens', // YUNANISTAN
  '23': 'Europe/Madrid', // ISPANYA
  '24': 'Europe/Malta',
  '25': 'Europe/Tirane', // ARNAVUTLUK
  '26': 'Europe/Copenhagen', // DANIMARKA
  '27': 'Europe/Belgrade', // SIRBISTAN
  '28': 'Europe/Skopje', // MAKEDONYA
  '29': 'Europe/Simferopol', // UKRAYNA-KIRIM
  '30': 'Europe/Zagreb', // HIRVATISTAN
  '31': 'Europe/Luxembourg', // LUKSEMBURG
  '32': 'Europe/Dublin', // IRLANDA
  '33': {
    // ABD — state list from data/states-usa-33.json (51 entries)
    default: 'America/New_York',
    states: {
      '581': 'America/Chicago', // ALABAMA
      '582': 'America/Anchorage', // ALASKA
      '583': 'America/Phoenix', // ARIZONA — no DST
      '584': 'America/Chicago', // ARKANSAS
      '585': 'America/Los_Angeles', // CALIFORNIA
      '587': 'America/Denver', // COLORADO
      '588': 'America/New_York', // CONNECTICUT
      '589': 'America/New_York', // D.C
      '590': 'America/New_York', // DELAWARE
      '591': 'America/New_York', // FLORIDA — most populous (Miami, Orlando, Tampa)
      '592': 'America/New_York', // GEORGIA
      '593': 'Pacific/Honolulu', // HAVAI ADALARI
      '594': 'America/Boise', // IDAHO — Mountain time bulk; northern panhandle is Pacific
      '595': 'America/Chicago', // ILLINOIS
      '596': 'America/Indiana/Indianapolis', // INDIANA
      '597': 'America/Chicago', // IOWA
      '598': 'America/Chicago', // KANSAS
      '599': 'America/Kentucky/Louisville', // KENTUCKY
      '600': 'America/Chicago', // LOUISIANA
      '601': 'America/New_York', // MAINE
      '602': 'America/New_York', // MARYLAND
      '603': 'America/New_York', // MASSACHUSETTS
      '604': 'America/Detroit', // MICHIGAN
      '605': 'America/Chicago', // MINNESOTA
      '606': 'America/Chicago', // MISSISSIPPI
      '607': 'America/Chicago', // MISSOURI
      '608': 'America/Denver', // MONTANA
      '609': 'America/Chicago', // NEBRASKA — Central bulk; western panhandle is Mountain
      '610': 'America/Los_Angeles', // NEVADA
      '611': 'America/New_York', // NEW HAMPSHIRE
      '612': 'America/New_York', // NEW JERSEY
      '613': 'America/Denver', // NEW MEXICO
      '614': 'America/New_York', // NEW YORK
      '615': 'America/New_York', // NORTH CAROLINA
      '616': 'America/Chicago', // NORTH DAKOTA — Central bulk; western counties Mountain
      '617': 'America/New_York', // OHIO
      '618': 'America/Chicago', // OKLAHOMA
      '619': 'America/Los_Angeles', // OREGON
      '620': 'America/New_York', // PENNSYLVANIA
      '621': 'America/New_York', // RHODE ISLAND
      '622': 'America/New_York', // SOUTH CAROLINA
      '623': 'America/Chicago', // SOUTH DAKOTA — Central bulk; western half Mountain
      '624': 'America/Chicago', // TENNESSEE — Central bulk (Nashville/Memphis); east is Eastern
      '625': 'America/Chicago', // TEXAS — Central bulk; far-west El Paso is Mountain
      '626': 'America/Denver', // UTAH
      '627': 'America/New_York', // VERMONT
      '628': 'America/New_York', // VIRGINIA
      '629': 'America/Los_Angeles', // WASHINGTON
      '630': 'America/New_York', // WEST VIRGINIA
      '631': 'America/Chicago', // WISCONSIN
      '632': 'America/Denver', // WYOMING
    },
  },
  '34': 'Europe/Podgorica', // KARADAG
  '35': 'Europe/Vienna', // AVUSTURYA
  '36': 'Europe/Oslo', // NORVEC
  '37': 'Europe/Bucharest', // ROMANYA
  '38': 'Europe/Vaduz', // LIECHTENSTEIN
  '39': 'Europe/Warsaw', // POLONYA
  '40': 'Europe/Kyiv', // UKRAYNA
  '41': 'Europe/Helsinki', // FINLANDIYA
  '42': 'Asia/Beirut', // LUBNAN
  '43': 'Europe/Moscow', // CECENISTAN — part of Russia
  '44': 'Europe/Sofia', // BULGARISTAN
  '45': 'Europe/Lisbon', // PORTEKIZ
  '46': 'Europe/Chisinau', // MOLDAVYA
  '47': 'Europe/Vilnius', // LITVANYA
  '48': 'America/Nuuk', // GRONLAND
  '49': 'Europe/Zurich', // ISVICRE
  '51': 'Atlantic/Bermuda',
  '52': {
    // KANADA — provinces from data/states-canada-52.json (12 entries)
    default: 'America/Toronto',
    states: {
      '633': 'America/Edmonton', // ALBERTA
      '634': 'America/Vancouver', // BRITISH COLOMBIA
      '635': 'America/Winnipeg', // MANITOBA
      '636': 'America/St_Johns', // N.A.L. (Newfoundland and Labrador)
      '637': 'America/Moncton', // NEW BRUNSWICK
      '1875': 'America/Edmonton', // NORTHWEST TERRITORIES (Yellowknife aliased to Edmonton in tzdb)
      '638': 'America/Halifax', // NOVA SCOTIA
      '639': 'America/Iqaluit', // NUNAVUT — most populous zone
      '640': 'America/Toronto', // ONTORIO (Ontario)
      '641': 'America/Halifax', // P.E.I. — Atlantic time, no separate IANA entry
      '642': 'America/Toronto', // QUEBEC — Eastern bulk
      '643': 'America/Regina', // SASKATCHEWAN — no DST year-round
    },
  },
  '53': 'America/Mexico_City', // MEKSIKA
  '54': 'America/Nassau', // BAHAMALAR
  '55': 'Africa/Blantyre', // MALAVI
  '56': 'Pacific/Efate', // VANUATU
  '57': 'America/Bogota', // KOLOMBIYA
  '58': 'America/Grenada',
  '59': { default: 'Australia/Sydney' }, // AVUSTRALYA — V6.4 user-picked tz
  '60': 'Asia/Ulaanbaatar', // MOGOLISTAN
  '61': 'Asia/Shanghai', // CIN
  '62': 'Asia/Tbilisi', // GURCISTAN
  '63': 'Africa/Malabo', // EKVATOR GINESI
  '64': 'Asia/Riyadh', // S. ARABISTAN
  '65': 'Africa/Bujumbura', // BURUNDI
  '66': 'America/Curacao', // HOLLANDA ANTILLERI
  '67': 'Africa/Johannesburg', // GUNEY AFRIKA
  '68': 'America/Puerto_Rico', // PORTO RIKO
  '69': 'America/Lima', // PERU
  '70': 'America/Port-au-Prince', // HAITI
  '71': 'Africa/Lome', // TOGO
  '72': 'America/Santo_Domingo', // DOMINIK CUMHURIYETI
  '73': 'Africa/Monrovia', // LIBERYA
  '74': 'Asia/Colombo', // SRI LANKA
  '75': 'Africa/Kampala', // UGANDA
  '76': 'Asia/Kathmandu', // NEPAL
  '77': 'Asia/Karachi', // PAKISTAN
  '79': 'Africa/Libreville', // GABON
  '80': 'Africa/Bangui', // ORTA AFRIKA CUMHURIYETI
  '81': 'Africa/Kigali', // RUANDA
  '82': 'America/Guyana',
  '83': 'America/La_Paz', // BOLIVYA
  '84': 'Africa/Niamey', // NIJER
  '85': 'Pacific/Pohnpei', // MIKRONEZYA
  '86': 'Africa/Algiers', // CEZAYIR
  '87': 'America/Martinique', // MARTINIK
  '88': 'Indian/Comoro', // KOMORLAR
  '89': 'America/Panama',
  '90': 'America/Antigua', // ANTIGUA VE BARBUDA
  '91': 'Africa/Ouagadougou', // BURKINA FASO
  '92': 'Asia/Almaty', // KAZAKISTAN
  '93': 'Asia/Dubai', // BIRLESIK ARAP EMIRLIGI
  '94': 'Asia/Qatar', // KATAR
  '95': 'Africa/Addis_Ababa', // ETYOPYA
  '96': 'America/Port_of_Spain', // TRINIDAT VE TOBAGO
  '97': 'Asia/Brunei',
  '98': 'Indian/Antananarivo', // MADAGASKAR
  '99': 'America/Guatemala',
  '100': 'Asia/Macau', // MAKAO
  '101': 'Asia/Dushanbe', // TACIKISTAN
  '102': 'Africa/Dakar', // SENEGAL
  '103': 'Indian/Maldives', // MALDIVLER
  '104': 'Asia/Yerevan', // ERMENISTAN
  '105': 'America/Tegucigalpa', // HONDURAS
  '106': 'Africa/Nouakchott', // MORITANYA
  '107': 'Asia/Kuala_Lumpur', // MALEZYA
  '108': 'Asia/Taipei', // TAYVAN
  '109': 'Africa/Banjul', // GAMBIYA
  '110': 'Africa/Dar_es_Salaam', // TANZANYA
  '111': 'Africa/Conakry', // GINE
  '112': 'Indian/Reunion',
  '113': 'Asia/Hong_Kong',
  '114': 'Africa/Nairobi', // KENYA
  '115': 'Pacific/Noumea', // YENI KALEDONYA
  '116': 'Asia/Tokyo', // JAPONYA
  '117': { default: 'Asia/Jakarta' }, // ENDONEZYA — V6.4 user-picked tz
  '118': 'Africa/Tunis', // TUNUS
  '119': 'America/Jamaica', // JAMAIKA
  '120': 'Africa/Abidjan', // FILDISI SAHILI
  '122': 'Atlantic/Reykjavik', // IZLANDA
  '123': 'America/Dominica',
  '124': 'Asia/Baghdad', // IRAK
  '125': 'America/Anguilla',
  '126': 'Asia/Manila', // FILIPINLER
  '127': 'Africa/Lagos', // NIJERYA
  '128': 'Asia/Seoul', // GUNEY KORE
  '129': 'Africa/Khartoum', // SUDAN
  '130': 'Pacific/Tongatapu', // TONGA
  '131': 'Asia/Tashkent', // OZBEKISTAN
  '132': 'Asia/Bahrain', // BAHREYN
  '133': 'Asia/Kuwait', // KUVEYT
  '134': 'Asia/Vientiane', // LAOS
  '135': 'Asia/Ho_Chi_Minh', // VIETNAM
  '136': 'America/St_Lucia',
  '137': 'Asia/Bangkok', // TAYLAND
  '138': 'Indian/Mahe', // SEYSEL ADALARI
  '139': 'America/Guayaquil', // EKVATOR
  '140': 'Africa/Luanda', // ANGOLA
  '141': 'America/Managua', // NIKARAGUA
  '142': 'Asia/Pyongyang', // KUZEY KORE
  '143': 'Africa/Accra', // GANA
  '144': 'Atlantic/Cape_Verde', // YESIL BURUN
  '145': 'Africa/Casablanca', // FAS
  '146': { default: 'America/Sao_Paulo' }, // BREZILYA — V6.4 user-picked tz
  '147': 'America/Montserrat',
  '148': 'Asia/Aden', // YEMEN
  '149': 'Pacific/Palau',
  '150': 'Africa/Mogadishu', // SOMALI
  '151': 'Africa/Maputo', // MOZAMBIK
  '152': 'Africa/Bamako', // MALI
  '153': 'America/Aruba',
  '154': 'Asia/Yangon', // MYANMAR
  '155': 'Asia/Thimphu', // BUTAN
  '156': 'Africa/Ndjamena', // CAD
  '157': 'Indian/Mayotte',
  '158': 'Africa/Lusaka', // ZAMBIYA
  '159': 'Asia/Ashgabat', // TURKMENISTAN
  '160': 'Africa/Djibouti', // CIBUTI
  '161': 'Asia/Phnom_Penh', // KAMBOCYA
  '162': 'America/Costa_Rica', // KOSTARIKA
  '163': 'Arctic/Longyearbyen', // SVALBARD
  '164': 'Indian/Mauritius',
  '165': 'America/El_Salvador',
  '166': 'Asia/Kabul', // AFGANISTAN
  '167': 'Africa/Gaborone', // BOTSVANA
  '168': 'Asia/Bishkek', // KIRGIZISTAN
  '169': 'Pacific/Guam',
  '170': 'Africa/Mbabane', // ESWATINI
  '171': 'America/Guadeloupe',
  '172': 'America/Paramaribo', // SURINAM
  '173': 'Asia/Muscat', // UMMAN
  '174': 'Africa/Maseru', // LESOTO
  '175': 'Africa/Asmara', // ERITRE
  '176': 'Asia/Dili', // DOGU TIMOR
  '177': 'Asia/Dhaka', // BANGLADES
  '178': 'Pacific/Niue',
  '179': 'Asia/Singapore', // SINGAPUR
  '180': 'Africa/Kinshasa', // DEMOKRATIK KONGO CUMHURIYETI
  '181': 'Africa/Porto-Novo', // BENIN
  '182': 'America/Belize',
  '183': 'Pacific/Pitcairn',
  '184': 'Africa/Douala', // KAMERUN
  '185': 'Pacific/Port_Moresby', // PAPUA YENI GINE
  '186': 'America/Caracas', // VENEZUELA
  '187': 'Asia/Kolkata', // HINDISTAN
  '188': 'America/Barbados',
  '189': 'Africa/Cairo', // MISIR
  '191': 'Asia/Damascus', // SURIYE
  '192': 'Asia/Amman', // URDUN
  '193': 'Pacific/Auckland', // YENI ZELANDA
  '194': 'America/Asuncion', // PARAGUAY
  '196': 'Africa/Windhoek', // NAMIBYA
  '197': 'Pacific/Fiji',
  '198': 'Pacific/Apia', // SAMOA
  '199': 'America/Argentina/Buenos_Aires', // ARJANTIN
  '200': 'America/Santiago', // SILI
  '201': 'America/Montevideo', // URUGUAY
  '202': 'Asia/Tehran', // IRAN
  '203': 'Africa/Tripoli', // LIBYA
  '204': 'Asia/Hebron', // FILISTIN
  '206': 'Asia/Jerusalem', // KUDUS
  '207': { default: 'Europe/Moscow' }, // RUSYA — V6.4 user-picked tz
  '208': 'Europe/Minsk', // BELARUS
  '209': 'America/Havana', // KUBA
  '210': 'Africa/Freetown', // SIERRA LEONE
  '212': 'Europe/Isle_of_Man', // MAN ADASI
  '213': 'Atlantic/St_Helena', // ASCENSION
  '214': 'Africa/Juba', // GUNEY SUDAN
  '216': 'Africa/Harare', // ZIMBABVE
};

/**
 * Countries that span many IANA zones but expose only one synthetic "state"
 * via the ezanvakti API. The user must pick a timezone manually via the
 * select-timezone onboarding screen — see app/onboarding/select-timezone.tsx.
 */
export const COUNTRIES_REQUIRING_TZ_SELECTION: ReadonlySet<string> = new Set([
  '59', // AVUSTRALYA
  '117', // ENDONEZYA
  '146', // BREZILYA
  '207', // RUSYA
]);

export type TimezoneOption = {
  /** IANA name, e.g. "Australia/Sydney". */
  tz: string;
  /** i18n key under `screens.onboarding.selectTimezone.options`. */
  labelKey: string;
};

/**
 * Curated zone list per country. Order is deliberate (population / political
 * weight first) so the most likely choice surfaces near the top.
 */
export const COUNTRY_TZ_OPTIONS: Record<string, readonly TimezoneOption[]> = {
  '59': [
    { tz: 'Australia/Sydney', labelKey: 'sydney' },
    { tz: 'Australia/Brisbane', labelKey: 'brisbane' },
    { tz: 'Australia/Adelaide', labelKey: 'adelaide' },
    { tz: 'Australia/Perth', labelKey: 'perth' },
    { tz: 'Australia/Darwin', labelKey: 'darwin' },
  ],
  '117': [
    { tz: 'Asia/Jakarta', labelKey: 'jakarta' },
    { tz: 'Asia/Makassar', labelKey: 'makassar' },
    { tz: 'Asia/Jayapura', labelKey: 'jayapura' },
  ],
  '146': [
    { tz: 'America/Sao_Paulo', labelKey: 'saoPaulo' },
    { tz: 'America/Manaus', labelKey: 'manaus' },
    { tz: 'America/Rio_Branco', labelKey: 'rioBranco' },
    { tz: 'America/Noronha', labelKey: 'noronha' },
  ],
  '207': [
    { tz: 'Europe/Kaliningrad', labelKey: 'kaliningrad' },
    { tz: 'Europe/Moscow', labelKey: 'moscow' },
    { tz: 'Europe/Samara', labelKey: 'samara' },
    { tz: 'Asia/Yekaterinburg', labelKey: 'yekaterinburg' },
    { tz: 'Asia/Omsk', labelKey: 'omsk' },
    { tz: 'Asia/Krasnoyarsk', labelKey: 'krasnoyarsk' },
    { tz: 'Asia/Irkutsk', labelKey: 'irkutsk' },
    { tz: 'Asia/Yakutsk', labelKey: 'yakutsk' },
    { tz: 'Asia/Vladivostok', labelKey: 'vladivostok' },
    { tz: 'Asia/Magadan', labelKey: 'magadan' },
    { tz: 'Asia/Kamchatka', labelKey: 'kamchatka' },
  ],
};
