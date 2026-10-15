export interface JournalEntry {
  /** from the file name: YYYY-MM-DD-<slug> */
  id: string;
  date: string;
  title: string;
  project: string;
  /** true = sample copy, not Ayush's real words */
  placeholder: boolean;
  paragraphs: string[];
}

/** Minimal frontmatter + markdown-paragraph parser (no deps). Returns null for a malformed file. */
export function parseEntry(path: string, raw: string): JournalEntry | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim());
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of (m[1] as string).split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const id = (path.split('/').pop() as string).replace(/\.md$/, '');
  const date = fm.date ?? id.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !fm.title) return null;
  return {
    id,
    date,
    title: fm.title,
    project: fm.project ?? '',
    placeholder: fm.placeholder === 'true',
    paragraphs: (m[2] as string).split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s*\r?\n\s*/g, ' ').trim()).filter(Boolean),
  };
}

/** Newest first (ties by id), capped at `limit`. Entries still flagged `placeholder: true` are kept in the repo but never listed. */
export function latestEntries(files: Record<string, string>, limit = 7): JournalEntry[] {
  return Object.entries(files)
    .map(([p, raw]) => parseEntry(p, raw))
    .filter((e): e is JournalEntry => e !== null && !e.placeholder)
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
    .slice(0, limit);
}

export interface ProjectTab {
  /** project tag from the frontmatter ('' = untagged) */
  project: string;
  /** that project's entries, newest first */
  entries: JournalEntry[];
}

/** One tab per project, ordered by each project's newest entry (so tab 0 is the project with the newest entry).
 *  Entries inside a tab stay newest first. */
export function groupByProject(entries: JournalEntry[]): ProjectTab[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) map.set(e.project, [...(map.get(e.project) ?? []), e]);
  return [...map].map(([project, list]) => ({ project, entries: list }));
}
