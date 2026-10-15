import { describe, expect, it } from 'vitest';
import { groupByProject, latestEntries, parseEntry } from './parse';

const md = (date: string, extra = '', placeholder = false) => `---
date: ${date}
title: T ${date}
project: p
placeholder: ${placeholder}
---
One.

Two
lines.${extra}
`;

describe('journal parsing', () => {
  it('parses frontmatter and paragraphs', () => {
    const e = parseEntry('/x/2026-01-02-a.md', md('2026-01-02'));
    expect(e).toMatchObject({ id: '2026-01-02-a', date: '2026-01-02', title: 'T 2026-01-02', project: 'p', placeholder: false });
    expect(e?.paragraphs).toEqual(['One.', 'Two lines.']);
  });
  it('rejects malformed files', () => {
    expect(parseEntry('/x/a.md', 'no frontmatter')).toBeNull();
    expect(parseEntry('/x/a.md', '---\ndate: nope\ntitle: x\n---\nbody')).toBeNull();
  });
  it('sorts newest first and caps the count', () => {
    const files: Record<string, string> = {};
    for (let d = 1; d <= 9; d++) files[`/j/2026-01-0${d}-s.md`] = md(`2026-01-0${d}`);
    files['/j/bad.md'] = 'junk';
    const out = latestEntries(files, 7);
    expect(out).toHaveLength(7);
    expect(out.map((e) => e.date)).toEqual(['2026-01-09', '2026-01-08', '2026-01-07', '2026-01-06', '2026-01-05', '2026-01-04', '2026-01-03']);
  });
  it('never lists placeholder entries', () => {
    const out = latestEntries({ '/j/2026-01-01-a.md': md('2026-01-01'), '/j/2026-01-02-b.md': md('2026-01-02', '', true) });
    expect(out.map((e) => e.id)).toEqual(['2026-01-01-a']);
    expect(parseEntry('/j/2026-01-02-b.md', md('2026-01-02', '', true))?.placeholder).toBe(true); // still parsed, just not listed
  });
  it('real entries load, and none of them is a placeholder', async () => {
    const files = import.meta.glob('../../../../content/journal/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const out = latestEntries(files);
    expect(out.map((e) => e.id)).toEqual(['2026-10-03-portfolio-phase-0', '2026-09-28-bubblychef-agent-loop']);
    expect(out.every((e) => !e.placeholder)).toBe(true);
  });
});

describe('journal grouping', () => {
  it('tabs ordered by newest entry, entries newest first', () => {
    const f = (d: string, p: string) => `---\ndate: ${d}\ntitle: t\nproject: ${p}\n---\nx\n`;
    const out = groupByProject(
      latestEntries({ '/j/2026-01-01-a.md': f('2026-01-01', 'a'), '/j/2026-01-05-b.md': f('2026-01-05', 'b'), '/j/2026-01-03-a.md': f('2026-01-03', 'a') }, 50),
    );
    expect(out.map((t) => t.project)).toEqual(['b', 'a']);
    expect(out[1]?.entries.map((e) => e.date)).toEqual(['2026-01-03', '2026-01-01']);
  });
});
