import { describe, expect, it } from 'vitest';
import assets from '../assets/assets.json';
import raw from './photos.json';
import { PLACES } from './places';
import { PHOTOS, captionOf, countryOf, groupByPlace, photoPath, type Photo } from './photos';

describe('photos.json', () => {
  it('has photos and no sample flag', () => {
    expect(PHOTOS.length).toBeGreaterThan(0);
    expect('sample' in raw).toBe(false);
  });

  it('ids are unique', () => {
    const ids = PHOTOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every place exists in places.json and every where is non-empty', () => {
    const placeIds = new Set(PLACES.map((p) => p.id));
    for (const p of PHOTOS) {
      expect(placeIds.has(p.place), `${p.id}.place`).toBe(true);
      expect(p.where.length, `${p.id}.where`).toBeGreaterThan(0);
    }
  });

  it('every slot exists in assets.json with a real path and positive integer w/h', () => {
    for (const p of PHOTOS) {
      expect(p.slot, p.id).toMatch(/^photo\./);
      const a = (assets as Record<string, { path?: string; placeholder?: boolean; w?: number; h?: number }>)[p.slot];
      expect(a, p.slot).toBeDefined();
      expect(a!.placeholder, `${p.slot} placeholder`).toBeFalsy();
      expect(a!.path, `${p.slot} path`).toMatch(/^\/assets\/photos\/.+\.jpg$/);
      expect(Number.isInteger(a!.w) && a!.w! > 0, `${p.slot} w`).toBe(true);
      expect(Number.isInteger(a!.h) && a!.h! > 0, `${p.slot} h`).toBe(true);
    }
  });

  it('no "Sample" strings anywhere', () => {
    expect(JSON.stringify(raw)).not.toMatch(/sample/i);
  });

  it('exactly 3 wall photos (the corkboard art)', () => {
    expect(PHOTOS.filter((p) => p.wall)).toHaveLength(3);
  });

  it('photos of one place are contiguous (the board groups by place)', () => {
    const order: string[] = [];
    for (const p of PHOTOS) if (order[order.length - 1] !== p.place) order.push(p.place);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('captions and groups', () => {
  const p = (over: Partial<Photo>): Photo => ({ id: 'x', place: 'japan', where: 'Kyoto', slot: 'photo.japan-1', ...over });

  it('where plus the country when it differs', () => {
    expect(countryOf(p({}))).toBe('Japan');
    expect(captionOf(p({}))).toBe('Kyoto, Japan');
  });

  it('just the label when it equals the country', () => {
    expect(captionOf(p({ where: 'Japan' }))).toBe('Japan');
  });

  it('caption overrides where', () => {
    expect(captionOf(p({ caption: 'Fushimi Inari' }))).toBe('Fushimi Inari, Japan');
  });

  it('photoPath reads the slot', () => {
    expect(photoPath(PHOTOS[0]!)).toMatch(/^\/assets\/photos\//);
    expect(photoPath(p({ slot: 'photo.nope' }))).toBeNull();
  });

  it('groupByPlace keeps photos.json order and counts every photo', () => {
    const groups = groupByPlace();
    expect(groups.reduce((n, g) => n + g.photos.length, 0)).toBe(PHOTOS.length);
    expect(groups[0]!.place).toBe(PHOTOS[0]!.place);
  });
});
