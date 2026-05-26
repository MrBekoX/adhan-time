import TestRenderer from 'react-test-renderer';

import { BrandRow } from '../BrandRow';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'screens.home.monthsShort') {
        return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      }
      return key;
    },
  }),
}));

describe('BrandRow', () => {
  it('renders the selected city date when dateIso is provided', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<BrandRow dateIso="2026-12-31" />);
    });
    const tree = renderer.toJSON();

    expect(JSON.stringify(tree)).toContain('31');
    expect(JSON.stringify(tree)).toContain('DEC');
    expect(JSON.stringify(tree)).toContain('2026');
    TestRenderer.act(() => renderer.unmount());
  });
});
