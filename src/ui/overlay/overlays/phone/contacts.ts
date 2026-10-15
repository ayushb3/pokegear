import resume from '../../../../content/resume.json';

/** Contact rows. Values come from `resume.json` (shared source of truth); the résumé is the site's own PDF. */
export interface Contact {
  key: string;
  label: string;
  href: string;
  /** the value as shown under the list (no scheme) */
  shown: string;
  /** opens in a new tab */
  external: boolean;
}

const bare = (url: string) => url.replace(/^https?:\/\//, '');

export const CONTACTS: Contact[] = [
  { key: 'email', label: 'Email', href: `mailto:${resume.email}`, shown: resume.email, external: false },
  { key: 'linkedin', label: 'LinkedIn', href: resume.linkedin, shown: bare(resume.linkedin), external: true },
  { key: 'github', label: 'GitHub', href: resume.github, shown: bare(resume.github), external: true },
  { key: 'resume', label: 'Résumé', href: '/resume.pdf', shown: '/resume.pdf', external: true },
];
