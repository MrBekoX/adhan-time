// Component-level branch tests. SyncErrorBanner is now fully presentational
// (rules/01): the owning screen reads uiStore and passes `error` + `onDismiss`
// as props, so these tests drive it purely through props. The dismiss path is
// the most regression-prone: breaking it leaves banners stuck on Home.
import * as React from 'react';
import { Text } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';

import { SyncErrorBanner } from '../SyncErrorBanner';

import type { UiError } from '@/store/uiStore';

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

const SYNC_FAILED: UiError = { code: 'sync-failed' };

describe('SyncErrorBanner — component branch behavior', () => {
  it('renders nothing when error is null', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner error={null} onDismiss={() => {}} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    expect(t.toJSON()).toBeNull();

    TestRenderer.act(() => t.unmount());
  });

  it('renders the banner with translated message when error is set', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner error={SYNC_FAILED} onDismiss={() => {}} />);
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
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner error={SYNC_FAILED} onDismiss={() => {}} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    expect(findPressableByLabel(t.root, 'common.tryAgain')).toBeNull();
    // dismiss is always present
    expect(findPressableByLabel(t.root, 'common.dismiss')).not.toBeNull();

    TestRenderer.act(() => t.unmount());
  });

  it('renders the retry button and fires onRetry when provided', () => {
    const onRetry = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SyncErrorBanner error={SYNC_FAILED} onRetry={onRetry} onDismiss={() => {}} />,
      );
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

  it('invokes onDismiss when the dismiss button is tapped', () => {
    const onDismiss = jest.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SyncErrorBanner error={SYNC_FAILED} onDismiss={onDismiss} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const dismiss = findPressableByLabel(t.root, 'common.dismiss');
    expect(dismiss).not.toBeNull();
    TestRenderer.act(() => {
      dismiss!.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    TestRenderer.act(() => t.unmount());
  });
});
