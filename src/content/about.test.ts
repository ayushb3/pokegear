import { describe, expect, it } from 'vitest';
import { DEX } from './pokedex';
import { ROLES, bulletText, readResumeTypst, skillsFromTypst } from './about';

const typ = readResumeTypst();
// internal team / feature names that must not appear on the public page (see the PR's "ask Ayush" list)
const INTERNAL = ['Experience Generation', 'Application AI', 'Plan Mode', 'SuccessFactors'];

describe('/about copy', () => {
  it('every experience bullet is verbatim from resume.typ (or a trimmed part of it)', () => {
    for (const r of ROLES) for (const b of r.bullets) expect(typ, b.text).toContain(b.text);
  });
  it('shows no internal names and no $ figures or cost talk', () => {
    const shown = [...ROLES.flatMap((r) => [r.title, ...r.bullets.map(bulletText)]), ...DEX.flatMap((e) => [e.what, e.how, e.impact])].join('\n');
    for (const n of INTERNAL) expect(shown, n).not.toContain(n);
    expect(shown).not.toMatch(/\$\d|\bcost\b/i);
  });
  it('reads the skill groups from the résumé', () => {
    const groups = skillsFromTypst(typ);
    expect(groups.map((g) => g.label)).toEqual(['Languages', 'Agentic & evals', 'Frameworks', 'Infra & tools']);
    expect(groups[0]?.items).toContain('Python');
  });
});
