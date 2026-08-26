import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../src/SettingsModal.jsx';

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (predicate(node)) {
    return node;
  }

  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    if (Array.isArray(child)) {
      for (const nestedChild of child) {
        const match = findElement(nestedChild, predicate);
        if (match) return match;
      }
      continue;
    }
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

describe('settings modal', () => {
  it('shows the effective login item state and lets the user turn it off', () => {
    const onOpenAtLoginChange = vi.fn();
    const view = SettingsModal({
      openAtLogin: true,
      isLoading: false,
      isSaving: false,
      error: '',
      onOpenAtLoginChange,
      onClose: vi.fn()
    });
    const openAtLoginSwitch = findElement(
      view,
      (element) => element.props?.['aria-label'] === '开机自动启动'
    );

    expect(openAtLoginSwitch.props.checked).toBe(true);
    openAtLoginSwitch.props.onChange({ target: { checked: false } });
    expect(onOpenAtLoginChange).toHaveBeenCalledWith(false);
  });
});
