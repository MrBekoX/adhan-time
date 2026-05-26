import { getInitialRoute } from '../index';

describe('index route guard', () => {
  it('does not enter home when onboarding is marked complete but no location exists', () => {
    expect(getInitialRoute(true, null)).toBe('/onboarding');
  });

  it('enters home only when onboarding is complete and a location is selected', () => {
    expect(getInitialRoute(true, { districtId: '9541' })).toBe('/(tabs)/home');
  });
});
