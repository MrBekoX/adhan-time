/**
 * SPEC-K8: the compass subtree must render with `direction: 'ltr'` so an RTL
 * locale (Arabic) does not mirror absolutely-positioned cardinals and the
 * Kaaba marker. We assert the structural invariant on the style tree.
 */

import * as React from 'react';
import TestRenderer from 'react-test-renderer';

import { CompassRose } from '../CompassRose';
import { QiblaCompass } from '../QiblaCompass';

jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-reanimated/mock'),
);

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
