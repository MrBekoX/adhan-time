/**
 * Country/state → IANA timezone mapping.
 *
 * District-level timezone yok; ezanvakti API timezone field döndürmüyor.
 * Kapsam: en yaygın 40+ ülke. Çok-tz'li ülkelerde state bazlı override.
 * Kapsamayan kayıtlar için fallback olarak `cihaz tz` kullanılır (`timezoneResolver`).
 */

type StateMap = Record<string, string>;
type CountryEntry = string | { default: string; states?: StateMap };

export const COUNTRY_TZ: Record<string, CountryEntry> = {
  // Türkiye
  '2': 'Europe/Istanbul',
  // Avrupa
  '13': 'Europe/Berlin', // Almanya
  '11': 'Europe/Paris', // Fransa
  '14': 'Europe/Vienna', // Avusturya
  '15': 'Europe/London', // İngiltere
  '17': 'Europe/Amsterdam', // Hollanda
  '18': 'Europe/Brussels', // Belçika
  '20': 'Europe/Zurich', // İsviçre
  '21': 'Europe/Stockholm', // İsveç
  '22': 'Europe/Oslo', // Norveç
  '23': 'Europe/Copenhagen', // Danimarka
  '24': 'Europe/Helsinki', // Finlandiya
  '25': 'Europe/Madrid', // İspanya
  '26': 'Europe/Lisbon', // Portekiz
  '27': 'Europe/Rome', // İtalya
  '28': 'Europe/Athens', // Yunanistan
  '30': 'Europe/Bucharest', // Romanya
  '31': 'Europe/Sofia', // Bulgaristan
  '32': 'Europe/Warsaw', // Polonya
  '33': 'Europe/Prague', // Çekya
  '34': 'Europe/Budapest', // Macaristan
  '35': 'Europe/Sarajevo', // Bosna
  '36': 'Europe/Belgrade', // Sırbistan
  '37': 'Europe/Tirane', // Arnavutluk
  '38': 'Europe/Skopje', // Makedonya
  '39': 'Europe/Dublin', // İrlanda
  // Orta Doğu / Körfez
  '40': 'Asia/Riyadh', // Suudi Arabistan
  '41': 'Asia/Dubai', // BAE
  '42': 'Asia/Qatar', // Katar
  '43': 'Asia/Kuwait', // Kuveyt
  '44': 'Asia/Bahrain', // Bahreyn
  '45': 'Asia/Muscat', // Umman
  '46': 'Asia/Jerusalem', // İsrail / Filistin
  '47': 'Asia/Amman', // Ürdün
  '48': 'Asia/Beirut', // Lübnan
  '49': 'Asia/Damascus', // Suriye
  '50': 'Asia/Baghdad', // Irak
  '51': 'Asia/Tehran', // İran
  '52': 'Asia/Yerevan', // Ermenistan
  '53': 'Asia/Tbilisi', // Gürcistan
  '54': 'Asia/Baku', // Azerbaycan
  // Kuzey Afrika
  '60': 'Africa/Cairo', // Mısır
  '61': 'Africa/Tunis', // Tunus
  '62': 'Africa/Algiers', // Cezayir
  '63': 'Africa/Casablanca', // Fas
  '64': 'Africa/Tripoli', // Libya
  // Asya
  '70': 'Asia/Karachi', // Pakistan
  '71': 'Asia/Dhaka', // Bangladeş
  '187': 'Asia/Kolkata', // Hindistan
  '72': 'Asia/Kabul', // Afganistan
  '73': 'Asia/Tashkent', // Özbekistan
  '74': 'Asia/Bishkek', // Kırgızistan
  '75': 'Asia/Almaty', // Kazakistan
  '76': 'Asia/Dushanbe', // Tacikistan
  '77': 'Asia/Ashgabat', // Türkmenistan
  '78': 'Asia/Bangkok', // Tayland
  '79': 'Asia/Singapore', // Singapur
  '80': 'Asia/Kuala_Lumpur', // Malezya
  '81': {
    default: 'Asia/Jakarta',
    states: {}, // ileride WIB/WITA/WIT detayı eklenebilir
  },
  '82': 'Asia/Manila', // Filipinler
  '83': 'Asia/Tokyo', // Japonya
  '84': 'Asia/Seoul', // Güney Kore
  '85': 'Asia/Shanghai', // Çin
  // Amerika
  '100': {
    default: 'America/New_York', // ABD — state bazlı override gerekir
  },
  '101': {
    default: 'America/Toronto',
  },
  '102': 'America/Mexico_City',
  '103': 'America/Sao_Paulo',
  '104': 'America/Argentina/Buenos_Aires',
  // Okyanusya
  '110': {
    default: 'Australia/Sydney',
  },
  '111': 'Pacific/Auckland',
};
