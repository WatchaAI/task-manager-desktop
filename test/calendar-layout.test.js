import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');

describe('calendar layout', () => {
  it('keeps all six calendar weeks accessible at the minimum window height', () => {
    expect(styles).toMatch(
      /\.calendar-grid\s*\{[^}]*grid-template-rows:\s*32px repeat\(6, minmax\(0, 1fr\)\);/s
    );
    expect(styles).toMatch(/\.calendar-day-tasks\s*\{[^}]*overflow-y:\s*auto;/s);
  });
});
