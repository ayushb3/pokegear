import resume from '../content/resume.json';

/** Recruiter fast path: plain, real links above the DS unit. Its height is taken out of the layout (see `--bar-h` in app.css). */
export default function QuickLinks() {
  return (
    <nav className="quick-links" aria-label="Quick links">
      <a href="/resume">Résumé</a>
      <span aria-hidden="true">·</span>
      <a href="/about">Plain site</a>
      <span aria-hidden="true">·</span>
      <a href={`mailto:${resume.email}`}>Email</a>
    </nav>
  );
}
