import * as React from 'react';
import TestRenderer from 'react-test-renderer';

import { PrayerNowBanner } from '../PrayerNowBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('PrayerNowBanner', () => {
  it('renders nothing when no alert is active', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(PrayerNowBanner, { alert: null, onDismiss: () => undefined }),
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it('renders an adhan alert and fires onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(PrayerNowBanner, {
          alert: { key: 'aksam', kind: 'adhan', minutes: 0 },
          onDismiss,
        }),
      );
    });
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('prayer.aksam.title');
    expect(json).toContain('prayer.aksam.body');

    const btn = tree!.root.findByProps({ testID: 'prayer-now-dismiss' });
    TestRenderer.act(() => {
      btn.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a reminder alert with the reminder strings (not the adhan body)', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(PrayerNowBanner, {
          alert: { key: 'aksam', kind: 'reminder', minutes: 10 },
          onDismiss: () => undefined,
        }),
      );
    });
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('prayer.reminder.title');
    expect(json).toContain('prayer.reminder.body');
    expect(json).not.toContain('prayer.aksam.body');
  });
});
