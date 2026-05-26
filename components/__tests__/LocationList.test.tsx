/**
 * F5: when an onboarding fetch fails, LocationList renders an inline error
 * panel with a "Try again" button instead of leaving the screen empty. The
 * fetch logic itself stays in each select-* screen — this test only pins the
 * presentational contract.
 */
import * as React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';

import { LocationList } from '../LocationList';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'tr' },
  }),
}));

function findPressableByLabel(root: ReactTestInstance, label: string): ReactTestInstance | null {
  // Pressable renders down to a host component that exposes onPress on its
  // props, so we walk all instances rather than rely on the React class type
  // (which differs between RN versions and breaks findAllByType).
  const candidates = root.findAll(
    (n) => typeof n.props?.onPress === 'function',
    { deep: true },
  );
  for (const p of candidates) {
    const texts = p.findAllByType(Text).map((t) => t.props.children);
    if (texts.some((c) => c === label || (Array.isArray(c) && c.includes(label)))) return p;
  }
  return null;
}

describe('LocationList — F5 error+retry surface', () => {
  it('renders an inline error message and a retry button when error is true', () => {
    const onRetry = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LocationList items={[]} loading={false} error onRetry={onRetry} onSelect={() => {}} />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining([expect.stringMatching(/errors\.api\.network/)]));
    expect(texts).toEqual(expect.arrayContaining([expect.stringMatching(/common\.tryAgain/)]));

    const retryBtn = findPressableByLabel(t.root, 'common.tryAgain');
    expect(retryBtn).not.toBeNull();

    TestRenderer.act(() => {
      retryBtn!.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => t.unmount());
  });

  it('does NOT render the error UI when error is false (regression: spinner path)', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LocationList items={[]} loading={true} onSelect={() => {}} />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).not.toEqual(expect.arrayContaining(['common.tryAgain']));

    TestRenderer.act(() => t.unmount());
  });

  it('marks unsupported country rows before the user selects them (V7)', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LocationList
          items={[
            { id: '1216', name: 'Atlantik Okyanusu', nameEn: 'Atlantic Ocean', experimental: true },
          ]}
          loading={false}
          onSelect={() => {}}
        />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(
      expect.arrayContaining([expect.stringMatching(/screens\.onboarding\.unsupportedCountry/)]),
    );

    TestRenderer.act(() => t.unmount());
  });

  it('matches accented city names with unaccented search input', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <LocationList
          items={[
            { id: 'sao-paulo', name: 'São Paulo', nameEn: 'Sao Paulo' },
            { id: 'paris', name: 'Paris', nameEn: 'Paris' },
          ]}
          loading={false}
          onSelect={() => {}}
        />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    TestRenderer.act(() => {
      t.root.findByType(TextInput).props.onChangeText('sao');
    });

    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['São Paulo']));
    expect(texts).not.toEqual(expect.arrayContaining(['Paris']));

    TestRenderer.act(() => t.unmount());
  });
});
