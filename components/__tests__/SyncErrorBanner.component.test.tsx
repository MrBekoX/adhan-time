/**
 * Issue #9 follow-up: the locale-parity test in SyncErrorBanner.test.ts
 * verifies the banner can resolve every code, but the component itself has
 * three branching behaviors that were unverified — null-error, missing
 * onRetry, and dismiss. The dismiss path is the highest-value: a regression
 * there leaves banners stuck on Home indefinitely.
 */
import * as React from 'react';
import { Text } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';

import { SyncErrorBanner } from '../SyncErrorBanner';

import { useUiStore } from '@/store/uiStore';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string | string[]) => (Array.isArray(key) ? key[0] : key),
    i18n: { language: 'tr' },
  }),
}));

function findPressableByLabel(root: ReactTestInstance, label: string): ReactTestInstance | null {
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

describe('SyncErrorBanner — component branch behavior', () => {
  beforeEach(() => {
    useUiStore.setState({ lastError: null });
  });

  it('renders nothing when lastError is null', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    expect(t.toJSON()).toBeNull();

    TestRenderer.act(() => t.unmount());
  });

  it('renders the banner with translated message when lastError is set', () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(
      expect.arrayContaining([expect.stringContaining('errors.banner.sync-failed')]),
    );

    TestRenderer.act(() => t.unmount());
  });

  it('hides the retry button when no onRetry prop is provided', () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    expect(findPressableByLabel(t.root, 'common.tryAgain')).toBeNull();
    // dismiss is always present
    expect(findPressableByLabel(t.root, 'common.dismiss')).not.toBeNull();

    TestRenderer.act(() => t.unmount());
  });

  it('renders the retry button and fires onRetry when provided', () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    const onRetry = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner onRetry={onRetry} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const retry = findPressableByLabel(t.root, 'common.tryAgain');
    expect(retry).not.toBeNull();
    TestRenderer.act(() => {
      retry!.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => t.unmount());
  });

  it('clears useUiStore.lastError when the dismiss button is tapped', () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const dismiss = findPressableByLabel(t.root, 'common.dismiss');
    expect(dismiss).not.toBeNull();
    TestRenderer.act(() => {
      dismiss!.props.onPress();
    });
    expect(useUiStore.getState().lastError).toBeNull();

    TestRenderer.act(() => t.unmount());
  });
});
