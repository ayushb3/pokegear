import raw from './pokedex.json';

/** One Pokédex entry. Single source for the in-room Pokédex AND the plain `/projects/<slug>` pages.
 *  `draft` marks copy fields Ayush has not signed off yet (content pass later); flip a key to false/remove it when done. */
export interface DexEntry {
  slug: string;
  /** dex number: 0 is Rotom (the method), 1.. are the projects */
  no: number;
  name: string;
  /** plain-page title (name is the Pokémon) */
  title: string;
  /** one short line for the bottom-screen info line ("No. 001 BubblyChef: <summary>") */
  summary: string;
  category: string;
  /** assets.json slot (sprite.dex.*) */
  sprite: string;
  /** 2-3 chips, styled like HGSS type labels */
  types: string[];
  /** two lines in place of height / weight */
  stats: { k: string; v: string }[];
  /** exactly two lines */
  flavour: [string, string];
  ribbon: { icon: 'rotom' | 'lock'; text: string };
  what: string;
  how: string;
  impact: string;
  /** projects built with this method (Rotom's entry) */
  builtWith?: string[];
  /** what was learned: 2-3 items; unknowns are written as "Placeholder: ..." and flagged draft */
  learned: { title: string; text: string }[];
  /** the process, three beats */
  built: { title: string; text: string }[];
  /** `url` = external, `entry` = another dex entry; the plain page is always added */
  links: { label: string; url?: string; entry?: string }[];
  draft: Partial<Record<'category' | 'stats' | 'flavour' | 'ribbon' | 'what' | 'how' | 'impact' | 'built' | 'learned', boolean>>;
}

export const DEX = raw as unknown as DexEntry[];
export const dexNo = (e: DexEntry) => `No. ${String(e.no).padStart(3, '0')}`;
/** The bottom-screen info line for the selected entry. */
export const dexInfo = (e: DexEntry) => `${dexNo(e)} ${e.name}: ${e.summary}`;
export const plainPath = (e: DexEntry) => `/projects/${e.slug}`;
export const findEntry = (slug: string | null | undefined) => DEX.find((e) => e.slug === slug);
export const dexIndex = (slug: string | null | undefined) => DEX.findIndex((e) => e.slug === slug);

export type DexLink = { label: string; href: string; external: boolean; entry?: string };
/** Buttons on the Links page: the entry's own links, then its plain page. */
export function linksFor(e: DexEntry): DexLink[] {
  const own: DexLink[] = e.links.map((l) =>
    l.entry ? { label: l.label, href: `/?open=projects/${l.entry}`, external: false, entry: l.entry } : { label: l.label, href: l.url as string, external: true },
  );
  return [...own, { label: 'Plain page', href: plainPath(e), external: false }];
}
