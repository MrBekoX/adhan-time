import { isCountrySupported, resolveTimezone } from '../timezoneResolver';

describe('resolveTimezone — single-tz countries', () => {
  it.each([
    ['1', 'Europe/Istanbul'], // Northern Cyprus uses Turkey time
    ['2', 'Europe/Istanbul'], // Türkiye
    ['3', 'Europe/Monaco'],
    ['4', 'Europe/Amsterdam'], // Netherlands
    ['5', 'Asia/Baku'], // Azerbaijan
    ['6', 'Europe/Tallinn'], // Estonia
    ['7', 'Europe/Budapest'], // Hungary
    ['8', 'Europe/Rome'], // Italy
    ['11', 'Europe/Brussels'], // Belgium
    ['12', 'Europe/Stockholm'], // Sweden
    ['13', 'Europe/Berlin'], // Germany
    ['14', 'Europe/Bratislava'], // Slovakia
    ['15', 'Europe/London'], // UK
    ['16', 'Europe/Prague'], // Czech Republic
    ['17', 'Europe/Andorra'],
    ['21', 'Europe/Paris'], // France
    ['22', 'Europe/Athens'], // Greece
    ['23', 'Europe/Madrid'], // Spain
    ['32', 'Europe/Dublin'], // Ireland
    ['35', 'Europe/Vienna'], // Austria
    ['39', 'Europe/Warsaw'], // Poland
    ['40', 'Europe/Kyiv'], // Ukraine
    ['41', 'Europe/Helsinki'], // Finland
    ['49', 'Europe/Zurich'], // Switzerland
    ['53', 'America/Mexico_City'], // Mexico
    ['57', 'America/Bogota'], // Colombia
    ['61', 'Asia/Shanghai'], // China
    ['64', 'Asia/Riyadh'], // Saudi Arabia
    ['67', 'Africa/Johannesburg'], // South Africa
    ['77', 'Asia/Karachi'], // Pakistan
    ['86', 'Africa/Algiers'], // Algeria
    ['92', 'Asia/Almaty'], // Kazakhstan
    ['93', 'Asia/Dubai'], // UAE
    ['94', 'Asia/Qatar'],
    ['107', 'Asia/Kuala_Lumpur'], // Malaysia
    ['108', 'Asia/Taipei'], // Taiwan
    ['114', 'Africa/Nairobi'], // Kenya
    ['116', 'Asia/Tokyo'], // Japan
    ['122', 'Atlantic/Reykjavik'], // Iceland
    ['124', 'Asia/Baghdad'], // Iraq
    ['126', 'Asia/Manila'], // Philippines
    ['127', 'Africa/Lagos'], // Nigeria
    ['128', 'Asia/Seoul'], // South Korea
    ['132', 'Asia/Bahrain'],
    ['133', 'Asia/Kuwait'],
    ['137', 'Asia/Bangkok'], // Thailand
    ['145', 'Africa/Casablanca'], // Morocco
    ['166', 'Asia/Kabul'], // Afghanistan
    ['173', 'Asia/Muscat'], // Oman
    ['177', 'Asia/Dhaka'], // Bangladesh
    ['179', 'Asia/Singapore'],
    ['187', 'Asia/Kolkata'], // India
    ['189', 'Africa/Cairo'], // Egypt
    ['192', 'Asia/Amman'], // Jordan
    ['193', 'Pacific/Auckland'], // New Zealand
    ['199', 'America/Argentina/Buenos_Aires'],
    ['202', 'Asia/Tehran'], // Iran
    ['204', 'Asia/Hebron'], // Palestine
    ['206', 'Asia/Jerusalem'], // KUDUS
  ])('country id %s resolves to %s', (countryId, expected) => {
    expect(resolveTimezone(countryId)).toBe(expected);
  });
});

describe('resolveTimezone — multi-tz countries default', () => {
  it('USA (33) defaults to America/New_York only when state is missing', () => {
    expect(resolveTimezone('33')).toBe('America/New_York');
    expect(() => resolveTimezone('33', 'unknown-state')).toThrow(/timezone/i);
  });

  it('Canada (52) defaults to America/Toronto', () => {
    expect(resolveTimezone('52')).toBe('America/Toronto');
    expect(() => resolveTimezone('52', 'unknown')).toThrow(/timezone/i);
  });

  it('Australia (59) defaults to Australia/Sydney', () => {
    expect(resolveTimezone('59')).toBe('Australia/Sydney');
  });

  it('Indonesia (117) defaults to Asia/Jakarta', () => {
    expect(resolveTimezone('117')).toBe('Asia/Jakarta');
  });

  it('Brazil (146) defaults to America/Sao_Paulo', () => {
    expect(resolveTimezone('146')).toBe('America/Sao_Paulo');
  });

  it('Russia (207) defaults to Europe/Moscow', () => {
    expect(resolveTimezone('207')).toBe('Europe/Moscow');
  });
});

describe('resolveTimezone — USA state-level mapping (V6.2)', () => {
  it.each([
    ['581', 'America/Chicago'], // Alabama (CT)
    ['582', 'America/Anchorage'], // Alaska
    ['583', 'America/Phoenix'], // Arizona — no DST
    ['584', 'America/Chicago'], // Arkansas
    ['585', 'America/Los_Angeles'], // California
    ['587', 'America/Denver'], // Colorado
    ['588', 'America/New_York'], // Connecticut
    ['589', 'America/New_York'], // D.C.
    ['590', 'America/New_York'], // Delaware
    ['591', 'America/New_York'], // Florida
    ['592', 'America/New_York'], // Georgia
    ['593', 'Pacific/Honolulu'], // Hawaii
    ['594', 'America/Boise'], // Idaho
    ['595', 'America/Chicago'], // Illinois
    ['596', 'America/Indiana/Indianapolis'], // Indiana
    ['597', 'America/Chicago'], // Iowa
    ['598', 'America/Chicago'], // Kansas
    ['599', 'America/Kentucky/Louisville'], // Kentucky
    ['600', 'America/Chicago'], // Louisiana
    ['601', 'America/New_York'], // Maine
    ['602', 'America/New_York'], // Maryland
    ['603', 'America/New_York'], // Massachusetts
    ['604', 'America/Detroit'], // Michigan
    ['605', 'America/Chicago'], // Minnesota
    ['606', 'America/Chicago'], // Mississippi
    ['607', 'America/Chicago'], // Missouri
    ['608', 'America/Denver'], // Montana
    ['609', 'America/Chicago'], // Nebraska
    ['610', 'America/Los_Angeles'], // Nevada
    ['611', 'America/New_York'], // New Hampshire
    ['612', 'America/New_York'], // New Jersey
    ['613', 'America/Denver'], // New Mexico
    ['614', 'America/New_York'], // New York
    ['615', 'America/New_York'], // North Carolina
    ['616', 'America/Chicago'], // North Dakota
    ['617', 'America/New_York'], // Ohio
    ['618', 'America/Chicago'], // Oklahoma
    ['619', 'America/Los_Angeles'], // Oregon
    ['620', 'America/New_York'], // Pennsylvania
    ['621', 'America/New_York'], // Rhode Island
    ['622', 'America/New_York'], // South Carolina
    ['623', 'America/Chicago'], // South Dakota
    ['624', 'America/Chicago'], // Tennessee
    ['625', 'America/Chicago'], // Texas
    ['626', 'America/Denver'], // Utah
    ['627', 'America/New_York'], // Vermont
    ['628', 'America/New_York'], // Virginia
    ['629', 'America/Los_Angeles'], // Washington
    ['630', 'America/New_York'], // West Virginia
    ['631', 'America/Chicago'], // Wisconsin
    ['632', 'America/Denver'], // Wyoming
  ])('USA state %s → %s', (stateId, expected) => {
    expect(resolveTimezone('33', stateId)).toBe(expected);
  });

  it('throws when USA state id is unknown', () => {
    expect(() => resolveTimezone('33', 'not-a-real-state-id')).toThrow(/timezone/i);
  });
});

describe('resolveTimezone — Canada province-level mapping (V6.3)', () => {
  it.each([
    ['633', 'America/Edmonton'], // Alberta (Mountain)
    ['634', 'America/Vancouver'], // British Columbia (Pacific)
    ['635', 'America/Winnipeg'], // Manitoba (Central)
    ['636', 'America/St_Johns'], // Newfoundland and Labrador
    ['637', 'America/Moncton'], // New Brunswick (Atlantic)
    ['1875', 'America/Edmonton'], // Northwest Territories (Mountain — Yellowknife aliased to Edmonton)
    ['638', 'America/Halifax'], // Nova Scotia (Atlantic)
    ['639', 'America/Iqaluit'], // Nunavut (most populous)
    ['640', 'America/Toronto'], // Ontario (Eastern)
    ['641', 'America/Halifax'], // Prince Edward Island (Atlantic)
    ['642', 'America/Toronto'], // Quebec (Eastern bulk)
    ['643', 'America/Regina'], // Saskatchewan (no DST)
  ])('Canada province %s → %s', (provinceId, expected) => {
    expect(resolveTimezone('52', provinceId)).toBe(expected);
  });

  it('throws when Canada province id is unknown', () => {
    expect(() => resolveTimezone('52', 'not-a-real-province-id')).toThrow(/timezone/i);
  });
});

describe('resolveTimezone — fallback throws on unknown country', () => {
  it('throws for non-existent country id', () => {
    expect(() => resolveTimezone('999999')).toThrow(/tz-resolver-unsupported-country/);
  });

  it('throws for empty country id', () => {
    expect(() => resolveTimezone('')).toThrow(/tz-resolver-unsupported-country/);
  });

  it('throws for "Atlantic Ocean" pseudo-country (id 1216)', () => {
    expect(() => resolveTimezone('1216')).toThrow(/tz-resolver-unsupported-country/);
  });

  it('error message includes the offending country id', () => {
    expect(() => resolveTimezone('abc-123')).toThrow(/abc-123/);
  });
});

describe('isCountrySupported', () => {
  it('returns true for Türkiye', () => {
    expect(isCountrySupported('2')).toBe(true);
  });

  it('returns true for USA', () => {
    expect(isCountrySupported('33')).toBe(true);
  });

  it('returns true for Australia', () => {
    expect(isCountrySupported('59')).toBe(true);
  });

  it('returns true for India', () => {
    expect(isCountrySupported('187')).toBe(true);
  });

  it('returns false for unknown country id', () => {
    expect(isCountrySupported('999999')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCountrySupported('')).toBe(false);
  });

  it('returns false for ATLANTİK OKYANUSU pseudo-country (1216)', () => {
    expect(isCountrySupported('1216')).toBe(false);
  });
});
