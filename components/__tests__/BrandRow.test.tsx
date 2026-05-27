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

    const text = JSON.stringify(tree);
    expect(text).toContain('31');
    expect(text).toContain('DEC');
    expect(text).toContain('2026');
    // must use the correct middle-dot separator, not mojibake (Â·)
    expect(text).toContain('31 · DEC · 2026');
    expect(text).not.toContain('Â');
    TestRenderer.act(() => renderer.unmount());
  });
});
