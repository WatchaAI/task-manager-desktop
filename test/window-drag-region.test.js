import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');

describe('window drag regions', () => {
  it('marks the custom topbar as a draggable Electron window region', () => {
    expect(styles).toMatch(/\.topbar\s*\{[^}]*-webkit-app-region:\s*drag;/s);
  });

  it('keeps interactive controls out of Electron window dragging', () => {
    expect(styles).toMatch(
      /button,\s*input,\s*select,\s*textarea,\s*\.drag-handle\s*\{[^}]*-webkit-app-region:\s*no-drag;/s
    );
  });
});
