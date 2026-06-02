import { nextAdhanPermissionPrompt } from '../androidAdhanPermissions';

describe('nextAdhanPermissionPrompt', () => {
  it('returns null on non-Android (iOS clip path has no exact-alarm/battery gate)', () => {
    expect(
      nextAdhanPermissionPrompt({
        isAndroid: false,
        canScheduleExact: false,
        ignoringBatteryOptimizations: false,
      }),
    ).toBeNull();
  });

  it('prompts for exact-alarm first when it is missing', () => {
    expect(
      nextAdhanPermissionPrompt({
        isAndroid: true,
        canScheduleExact: false,
        ignoringBatteryOptimizations: false,
      }),
    ).toBe('exact-alarm');
  });

  it('prompts for the battery-opt exemption once exact-alarm is granted', () => {
    expect(
      nextAdhanPermissionPrompt({
        isAndroid: true,
        canScheduleExact: true,
        ignoringBatteryOptimizations: false,
      }),
    ).toBe('battery-opt');
  });

  it('prompts for nothing when both are already granted', () => {
    expect(
      nextAdhanPermissionPrompt({
        isAndroid: true,
        canScheduleExact: true,
        ignoringBatteryOptimizations: true,
      }),
    ).toBeNull();
  });
});
