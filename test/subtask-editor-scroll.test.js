import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');

describe('subtask editor scrolling', () => {
  it('keeps the task modal inside the viewport with vertical scrolling', () => {
    expect(styles).toMatch(/\.task-modal\s*\{[^}]*max-height:\s*calc\(100vh - 48px\);/s);
    expect(styles).toMatch(/\.task-modal\s*\{[^}]*overflow-y:\s*auto;/s);
  });

  it('gives long subtask lists their own scroll area', () => {
    expect(styles).toMatch(/\.subtask-editor-list\s*\{[^}]*max-height:\s*240px;/s);
    expect(styles).toMatch(/\.subtask-editor-list\s*\{[^}]*overflow-y:\s*auto;/s);
  });
});
