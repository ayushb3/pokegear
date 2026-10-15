import data from './trainer-card.json';
import resumeMeta from './resume.json';

/**
 * The card is assembled from pure JSON — no node:fs at runtime.
 * role.employer and role.since are literal data in trainer-card.json;
 * tests in trainer-card.test.ts read resume.typ and assert they match
 * (via about.ts's EMPLOYER and earliestNonInternYear).
 */
export const card = {
  ...data,
  role: {
    /** Headline title — line 1 on the card front. */
    text: resumeMeta.title,
    /** Employer name — first part of line 2. Literal value guarded by test. */
    employer: data.role.employer,
    /** Start year of the earliest non-intern role. Literal value guarded by test. */
    since: data.role.since,
    placeholder: data.role.placeholder,
  },
};

export interface CardLink {
  id: string;
  label: string;
  kind: string;
  /** For kind 'mailto' this is the bare address. null while a placeholder. */
  url: string | null;
  placeholder: boolean;
}

/** href for a link, or null when it is still a placeholder (render a disabled button). */
export function hrefOf(l: CardLink): string | null {
  if (l.placeholder || !l.url) return null;
  return l.kind === 'mailto' ? `mailto:${l.url}` : l.url;
}

/** Button label: real -> "GitHub" ("Résumé »"), placeholder -> "LinkedIn (soon)". Emails are never printed. */
export function labelOf(l: CardLink): string {
  if (!hrefOf(l)) return `${l.label} (soon)`;
  return l.id === 'resume' ? `${l.label} »` : l.label;
}

/** Line 1 of the role block: the current job title. */
export function roleTitleLine(role: typeof card.role): string {
  return role.text;
}

/** Line 2 of the role block: "Employer · since YYYY" (omits "· since YYYY" when since is falsy). */
export function roleEmployerLine(role: typeof card.role): string {
  const since = role.since ? ` · since ${role.since}` : '';
  return `${role.employer}${since}`;
}
