/**
 * SPEC-K8: the compass subtree must render with `direction: 'ltr'` so an RTL
 * locale (Arabic) does not mirror absolutely-positioned cardinals and the
 * Kaaba marker. We assert the structural invariant on the style tree.
 */

import * as React from 'react';
import * as Reanimated from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';

import { CompassRose } from '../CompassRose';
import { QiblaCompass } from '../QiblaCompass';

jest.mock('react-native-reanimated', () => {
  const ReanimatedMock = jest.requireActual('react-native-reanimated/mock');
  return {
    ...ReanimatedMock,
    withTiming: jest.fn(
      (toValue: unknown, _config?: unknown, callback?: (finished?: boolean) => void) => {
        callback?.(true);
        return toValue;
      },
    ),
  };
});

type StyleObject = Record<string, unknown>;

function flattenStyle(style: unknown): StyleObject {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<StyleObject>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style as StyleObject;
}

function rootStyleOf(tree: TestRenderer.ReactTestRenderer): StyleObject {
  const json = tree.toJSON();
  if (!json || Array.isArray(json)) throw new Error('expected single root');
  return flattenStyle((json as { props: { style?: unknown } }).props.style);
}

describe('QiblaCompass — RTL geometry lock (K8)', () => {
  beforeEach(() => {
    (Reanimated.withTiming as jest.Mock).mockClear();
  });

  it('pins the compass root to LTR direction', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <QiblaCompass
          size={260}
          deviceHeading={0}
          qiblaBearing={151}
          aligned={false}
          unreliable={false}
        />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const style = rootStyleOf(t);
    expect(style.direction).toBe('ltr');
    expect(style.writingDirection).toBe('ltr');

    TestRenderer.act(() => {
      t.unmount();
    });
  });

  it('does not render the aligned Kaaba ring when heading is unreliable', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <QiblaCompass
          size={260}
          deviceHeading={0}
          qiblaBearing={151}
          aligned
          unreliable
        />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const ringNodes = t.root.findAll((n) => {
      const style = flattenStyle(n.props?.style);
      return style.borderRadius === 4 && style.borderWidth === 1.5;
    });
    expect(ringNodes).toHaveLength(0);

    TestRenderer.act(() => {
      t.unmount();
    });
  });

  it('uses low-latency linear rose timing for a large heading turn', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <QiblaCompass
          size={260}
          deviceHeading={0}
          qiblaBearing={151}
          aligned={false}
          unreliable={false}
        />,
      );
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;
    (Reanimated.withTiming as jest.Mock).mockClear();

    TestRenderer.act(() => {
      t.update(
        <QiblaCompass
          size={260}
          deviceHeading={90}
          qiblaBearing={151}
          aligned={false}
          unreliable={false}
        />,
      );
    });

    const roseCall = (Reanimated.withTiming as jest.Mock).mock.calls.find(
      ([toValue]) => toValue === -90,
    );
    expect(roseCall).toBeDefined();
    const config = roseCall?.[1] as { duration?: number; easing?: unknown };
    // A large (90°) turn stays responsive (shorter than the small-delta glide of 300ms),
    // while small per-sensor-step deltas use the longer continuous-glide duration.
    expect(config.duration).toBeLessThanOrEqual(180);
    expect(config.easing).toBe(Reanimated.Easing.linear);

    TestRenderer.act(() => {
      t.unmount();
    });
  });
});

describe('CompassRose — RTL geometry lock (K8)', () => {
  it('pins the rose root to LTR direction so cardinals stay in physical N/E/S/W', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CompassRose size={260} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    const style = rootStyleOf(t);
    expect(style.direction).toBe('ltr');
    expect(style.writingDirection).toBe('ltr');

    TestRenderer.act(() => {
      t.unmount();
    });
  });
});
