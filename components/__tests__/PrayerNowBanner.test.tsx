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
  it('renders nothing when no prayer is active', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(PrayerNowBanner, { prayerKey: null, onDismiss: () => undefined }),
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it('renders an alert for the active prayer and fires onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(PrayerNowBanner, { prayerKey: 'aksam', onDismiss }),
      );
    });
    expect(tree!.toJSON()).not.toBeNull();

    const btn = tree!.root.findByProps({ testID: 'prayer-now-dismiss' });
    TestRenderer.act(() => {
      btn.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
