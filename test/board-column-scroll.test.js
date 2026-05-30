import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');
const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.jsx'), 'utf8');

describe('board column scrolling', () => {
  it('keeps the app shell fixed to the viewport instead of scrolling the whole page', () => {
    expect(styles).toMatch(/body\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  });

  it('lets the board fill the remaining height and each task list scroll internally', () => {
    expect(styles).toMatch(/\.board\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.column\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.task-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  });

  it('makes each task list an explicitly focusable scroll region', () => {
    expect(mainSource).toContain('tabIndex={0}');
    expect(mainSource).toContain('aria-label={`${status.label}任务列表`}');
    expect(styles).toMatch(/\.task-list\s*\{[^}]*overscroll-behavior:\s*contain;/s);
    expect(styles).toMatch(/\.task-list:focus-visible\s*\{[^}]*outline:/s);
  });
});
