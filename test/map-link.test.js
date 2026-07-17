import { describe, expect, it } from 'vitest';
import mapUrlModule from '../electron/mapUrl.cjs';

const { createMapUrl } = mapUrlModule;

describe('map links', () => {
  it('builds an Apple Maps search URL for a task location', () => {
    expect(createMapUrl(' 杭州西站  ')).toBe(
      'https://maps.apple.com/?q=%E6%9D%AD%E5%B7%9E%E8%A5%BF%E7%AB%99'
    );
    expect(createMapUrl('')).toBe('');
  });
});
