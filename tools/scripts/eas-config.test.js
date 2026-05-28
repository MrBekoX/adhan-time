const fs = require('fs');
const path = require('path');

describe('eas.json build environments', () => {
  it('pins every build profile to the matching EAS environment', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'eas.json'), 'utf8'));

    expect(eas.build.development.environment).toBe('development');
    expect(eas.build.preview.environment).toBe('preview');
    expect(eas.build.production.environment).toBe('production');
  });
});
