// PrayerCard is now memoized and calls onToggle(prayerKey) — not the Switch
// boolean — so Home can pass one stable useCallback to all six cards. These
// tests pin that contract (the prerequisite for the memo to skip re-renders).
import * as React from 'react';
import { Switch } from 'react-native';
import TestRenderer from 'react-test-renderer';

import { PrayerCard } from '../PrayerCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'tr' },
  }),
}));

describe('PrayerCard', () => {
  it('calls onToggle with the prayer key (not the Switch boolean)', () => {
    const onToggle = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PrayerCard prayerKey="ogle" time="13:00" enabled onToggle={onToggle} />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const sw = t.root.findByType(Switch);
    TestRenderer.act(() => {
      sw.props.onValueChange(false);
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('ogle');

    TestRenderer.act(() => t.unmount());
  });

  it('is wrapped in React.memo', () => {
    // React.memo components expose a `$$typeof` of Symbol(react.memo).
    expect((PrayerCard as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
