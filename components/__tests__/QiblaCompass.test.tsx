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
    // The bundled mock leaves useFrameCallback unimplemented ("ADD ME IF NEEDED"). The rose now
    // drives its per-frame follow through it; stub it (the worklet itself is device-verified).
    useFrameCallback: jest.fn(() => ({ setActive: jest.fn(), isActive: false, callbackId: 0 })),
    withTiming: jest.fn(
      (toValue: unknown, _config?: unknown, callback?: (finished?: boolean) => void) => {
        callback?.(true);
        return toValue;
      },
    ),
    // Spy so we can assert the rose spring is overshoot-clamped + non-oscillating (A2 regression fix).
    withSpring: jest.fn((toValue: unknown) => toValue),
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
});

describe('QiblaCompass — rose animation driver (A2 regression fix: overshoot-clamped spring)', () => {
  beforeEach(() => {
    (Reanimated.withSpring as jest.Mock).mockClear();
    (Reanimated.withTiming as jest.Mock).mockClear();
  });

  // Qibla bug A2 + its regression: the rose target is re-assigned at sensor rate. Re-targeting a
  // running reanimated spring inherits its velocity, so a bouncy spring coasts/overshoots when the
  // stream stalls (a GC pause) — "döndürmeyi bıraktım hâlâ döndü". A2 swapped in a momentum-free
  // withTiming, but on a low-end device whose native 50Hz churn makes the cadence irregular that
  // "stepped"/froze between late samples (the reported regression). The fix is an overdamped,
  // overshoot-clamped spring (roseSpringConfig): smooth cadence, no coast.
  //
  // COVERAGE LIMIT: the reanimated mock does NOT execute useAnimatedReaction, so the PRIMARY
  // (headingShared worklet) path is not run here — only the fallback useEffect (active when no
  // headingShared prop is given). Both paths share the SAME config (roseSpringConfig), so this
  // asserts the structural no-overshoot invariant; the worklet body is verified on-device.
  it('drives the fallback rose via an overshoot-clamped, non-oscillating spring (no coast)', () => {
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
    (Reanimated.withSpring as jest.Mock).mockClear();

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

    const roseCall = (Reanimated.withSpring as jest.Mock).mock.calls.find(
      ([toValue]) => toValue === -90,
    );
    expect(roseCall).toBeDefined();
    const config = roseCall?.[1] as {
      overshootClamping?: boolean;
      mass: number;
      stiffness: number;
      damping: number;
    };
    expect(config.overshootClamping).toBe(true);
    // zeta = damping / (2·√(stiffness·mass)) must be >= 1 (no oscillation/overshoot).
    const zeta = config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
    expect(zeta).toBeGreaterThanOrEqual(1);

    TestRenderer.act(() => {
      t.unmount();
    });
  });
});

describe('CompassRose — single <Svg> dial (perf rebuild) + LTR lock (K8)', () => {
  it('renders the dial as ONE <Svg> node (not a ~40-View tree), LTR-locked', () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CompassRose size={260} />);
    });
    if (!tree) throw new Error('renderer not created');
    const t = tree as TestRenderer.ReactTestRenderer;

    // The dial collapses to a single Svg HOST view — the per-frame rotation now transforms
    // one node instead of ~40 Views (root cause of the A30 jank). (`findAll` also matches the
    // react-native-svg component wrappers that forward the testID, so we count host nodes only.)
    const tagged = t.root.findAll((n) => n.props?.testID === 'qibla-compass-dial');
    const dialHosts = tagged.filter((n) => typeof n.type === 'string');
    expect(dialHosts).toHaveLength(1);

    // SPEC-K8: LTR invariant preserved on the dial so east stays on the right under RTL.
    const ltrLocked = tagged.some((n) => {
      const style = flattenStyle(n.props?.style);
      return style.direction === 'ltr' && style.writingDirection === 'ltr';
    });
    expect(ltrLocked).toBe(true);

    TestRenderer.act(() => {
      t.unmount();
    });
  });
});

describe('QiblaCompass — lean rotating group (single dial node)', () => {
  it('renders exactly one <Svg> dial inside the compass', () => {
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

    const dialHosts = t.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.testID === 'qibla-compass-dial',
    );
    expect(dialHosts).toHaveLength(1);

    TestRenderer.act(() => {
      t.unmount();
    });
  });
});
