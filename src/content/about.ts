import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copy for the plain /about page. The experience bullets are taken from resume/resume.typ (the single source):
 * `text` is verbatim or a trimmed prefix, so `about.test.ts` can check it appears in the Typst.
 * Where the résumé names an internal team or feature, `generic` replaces it for the public page and
 * `text` holds the part of the bullet that is still verbatim.
 */
export interface Bullet {
  text: string;
  /** public wording that replaces an internal name; when set, `text` is a verbatim substring of the résumé */
  generic?: string;
}
export interface Role {
  title: string;
  dates: string;
  bullets: Bullet[];
  /** true when the title contains "intern" (case-insensitive) */
  intern?: boolean;
}

/**
 * Parse every `#role[Title][Team][Mon YYYY – ...]` AND `#role([Title], none, [Mon YYYY – ...])`
 * call from the Work Experience section of resume.typ.
 * Returns `{ title, startYear, intern }` for each. Used by tests to check trainer-card facts.
 */
export interface ParsedRole {
  title: string;
  startYear: number;
  intern: boolean;
}

export function rolesFromTypst(typ: string): ParsedRole[] {
  const section = typ.split(/#section\[Work Experience\]/)[1]?.split(/#section\[/)[0] ?? '';
  const results: ParsedRole[] = [];
  // Bracket form: #role[Title][Team][Mon YYYY – ...]
  for (const m of section.matchAll(/^#role\[([^\]]+)\]\[[^\]]*\]\[(\w+ \d{4})\s*[–-]/gm)) {
    const title = m[1] ?? '';
    const year = parseInt((m[2] ?? '').match(/\d{4}/)?.[0] ?? '0', 10);
    results.push({ title, startYear: year, intern: /intern/i.test(title) });
  }
  // Paren form: #role([Title], none, [Mon YYYY – ...])
  for (const m of section.matchAll(/^#role\(\[([^\]]+)\],\s*none,\s*\[(\w+ \d{4})\s*[–-]/gm)) {
    const title = m[1] ?? '';
    const year = parseInt((m[2] ?? '').match(/\d{4}/)?.[0] ?? '0', 10);
    results.push({ title, startYear: year, intern: /intern/i.test(title) });
  }
  return results;
}

/** Earliest start year across all non-intern roles parsed from resume.typ. */
export function earliestNonInternYear(roles: ParsedRole[]): number | null {
  const years = roles.filter((r) => !r.intern).map((r) => r.startYear);
  return years.length > 0 ? Math.min(...years) : null;
}

export const EMPLOYER = 'SAP';

export const ROLES: Role[] = [
  {
    title: 'Machine Learning Engineering Specialist',
    dates: 'Aug 2026 – Present',
    bullets: [
      { text: "Building the team's first automated eval pipeline: a Docker image and GitHub Actions build, with Kubernetes jobs running scheduled Langfuse LLM-as-judge evals against a 28-query golden dataset" },
      { text: 'Traced a production retrieval agent in Langfuse with two engineers, identifying context bloat that caused redundant retrieval calls and missing search-mode routing that sent 60–70% of queries down the slow path' },
      { text: "Partnering with the lead engineer on the agent's architecture rework: splitting an overloaded planning node into focused nodes, adding an explicit stop decision, and validating plans before retrieval" },
    ],
  },
  {
    title: 'Software Developer, SAP Academy Rotational Program',
    dates: 'Jan 2026 – Aug 2026',
    bullets: [
      { text: 'Designed and built the reasoning interface for a multi-agent research feature end to end: a typed server-to-UI event contract that simplified front-end parsing, and a subagent view with live reasoning streaming that made multi-agent research legible to users' },
      { text: 'Co-designed the multi-agent research architecture: separate research and writing phases, a shared virtual file system as memory across sub-researchers, and bounded rounds and timeouts' },
      {
        text: 'a human-in-the-loop step where agents pause for users to review and approve their plan before executing: wrote the technical spec and guided interns through implementation',
        generic: 'Designed and led a human-in-the-loop step where agents pause for users to review and approve their plan before executing: wrote the technical spec and guided interns through implementation',
      },
    ],
  },
  {
    title: 'Software Developer, SAP Academy Rotational Program',
    dates: 'Jul 2025 – Jan 2026',
    bullets: [{ text: 'Prototyped an on-device ML model for automated manager approvals, using request context and historical behavior to cut a 5-minute manual workflow to under 1 minute' }],
  },
  {
    title: 'Software Engineering Intern (Part-time)',
    dates: 'Jun 2023 – Jun 2025',
    bullets: [{ text: 'Sole developer of a customer-facing 3-way merge editor with intelligent auto-merge, speeding customer upgrades to newer SAP versions and reducing upgrade-related support debt; multi-year project still releasing' }],
  },
];

export const bulletText = (b: Bullet) => b.generic ?? b.text;

export interface SkillGroup {
  label: string;
  items: string;
}

/** Skills come straight from the "Technical Skills" section of resume.typ (lines like `- *Languages:* Python, Go`). */
export function skillsFromTypst(typ: string): SkillGroup[] {
  const section = typ.split(/#section\[Technical Skills\]/)[1] ?? '';
  return [...section.matchAll(/^- \*([^*]+?):\*\s*(.+)$/gm)].map((m) => ({ label: m[1] ?? '', items: (m[2] ?? '').trim() }));
}

export const readResumeTypst = () => readFileSync(join(process.cwd(), 'resume', 'resume.typ'), 'utf8');
