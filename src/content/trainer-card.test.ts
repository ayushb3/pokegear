import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { card, hrefOf, labelOf, roleTitleLine, roleEmployerLine, type CardLink } from './trainer-card';
import resumeMeta from './resume.json';
import projects from './pokedex.json';
import { EMPLOYER, rolesFromTypst, earliestNonInternYear } from './about';

const links = card.links as CardLink[];

/** Read resume.typ once in test (node:fs is fine in tests; it must NOT be used in the card module itself). */
const resumeTyp = readFileSync(new URL('../../resume/resume.typ', import.meta.url), 'utf8');

describe('trainer card content', () => {
  it('has a name and a 2-line pitch', () => {
    expect(card.name).toBe('Ayush Basu');
    expect(card.pitch.lines).toHaveLength(2);
  });
  it('flags invented-or-unknown fields as placeholders', () => {
    expect(card.pitch.placeholder).toBe(false);
  });
  it('role comes from the resume title; the resume link is the built PDF', () => {
    expect(card.role.text).toBe(resumeMeta.title);
    expect(card.role.placeholder).toBe(false);
    const l = links.find((x) => x.id === 'resume');
    expect(l?.url).toBe('/resume.pdf');
    expect(l?.placeholder).toBe(false);
  });
  it('no empty links: real links have a url, placeholders have none', () => {
    for (const l of links) {
      if (l.placeholder) expect(l.url, l.id).toBeNull();
      else if (l.kind === 'mailto') expect(l.url, l.id).toMatch(/^[^\s@]+@[^\s@]+$/);
      else expect(l.url, l.id).toMatch(/^(https:\/\/\S+|\/resume\.pdf)$/);
    }
  });
  it('placeholder links render disabled with a (soon) label; real ones link out', () => {
    for (const l of links) {
      expect(hrefOf(l) === null, l.id).toBe(l.placeholder);
      expect(labelOf(l).endsWith('(soon)'), l.id).toBe(l.placeholder);
    }
  });
  it('an email is a mailto href and never appears as printed text', () => {
    const real: CardLink = { id: 'email', label: 'Email', kind: 'mailto', url: 'a@example.com', placeholder: false };
    expect(hrefOf(real)).toBe('mailto:a@example.com');
    expect(labelOf(real)).toBe('Email');
  });
  it('has 3-4 stack chips and 3 projects that exist in pokedex.json', () => {
    expect(card.stack.length).toBeGreaterThanOrEqual(3);
    expect(card.stack.length).toBeLessThanOrEqual(4);
    for (const p of card.projects) expect(projects.some((q) => q.slug === p.slug), p.slug).toBe(true);
  });

  // ── Facts-match-résumé guards ─────────────────────────────────────────────
  // These read resume.typ at TEST time via about.ts helpers.
  // The card module itself is pure JSON + resume.json — no fs at runtime.

  it('every stack chip is a whole item (split on , and /) in the Technical Skills section of resume.typ, bounded by the next #section[', () => {
    // Bound the skills section at the next #section[ to avoid false matches elsewhere.
    const afterSkills = resumeTyp.split(/#section\[Technical Skills\]/)[1] ?? '';
    const skillsSection = afterSkills.split(/#section\[/)[0] ?? afterSkills;
    // Collect all individual items by splitting each skill line on ", " and "/"
    const allItems = new Set<string>();
    for (const m of skillsSection.matchAll(/^- \*[^*]+:\*\s*(.+)$/gm)) {
      for (const raw of (m[1] ?? '').split(/,\s*|\//).map((s) => s.trim())) {
        if (raw) allItems.add(raw);
      }
    }
    for (const chip of card.stack) {
      expect(allItems.has(chip), `stack chip "${chip}" is not a whole item in the Technical Skills section of resume.typ`).toBe(true);
    }
  });

  it('role.employer matches EMPLOYER from about.ts (single source)', () => {
    expect(card.role.employer).toBe(EMPLOYER);
  });

  it('role.since equals the earliest non-intern start year parsed from resume.typ Work Experience (via about.ts rolesFromTypst)', () => {
    const parsed = rolesFromTypst(resumeTyp);

    // Parity guard: parsed role count must equal the number of #role( / #role[ calls in Work Experience.
    const expSection = resumeTyp.split(/#section\[Work Experience\]/)[1]?.split(/#section\[/)[0] ?? '';
    const rawRoleCount = (expSection.match(/^#role[\[({]/gm) ?? []).length;
    expect(parsed.length, `rolesFromTypst parsed ${parsed.length} roles but resume.typ has ${rawRoleCount} #role calls in Work Experience`).toBe(rawRoleCount);

    const earliest = earliestNonInternYear(parsed);
    expect(earliest, 'no non-intern roles found in resume.typ').not.toBeNull();
    expect(card.role.since, `role.since should be ${earliest} (earliest non-intern start year)`).toBe(earliest);
  });

  it('roleTitleLine returns the job title', () => {
    expect(roleTitleLine(card.role)).toBe(card.role.text);
  });

  it('roleEmployerLine returns "Employer · since YYYY"', () => {
    expect(roleEmployerLine(card.role)).toBe(`${card.role.employer} · since ${card.role.since}`);
  });

  it('roleEmployerLine omits · since when role.since is falsy', () => {
    const noSince = { ...card.role, since: 0 };
    expect(roleEmployerLine(noSince)).toBe(card.role.employer);
  });
});
