import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import r from './resume.json';

const typ = readFileSync(new URL('../../resume/resume.typ', import.meta.url), 'utf8');

// Client names that must never appear in the public résumé (the employer, SAP, may be named).
// The source named no clients, so nothing was replaced; this guards against ones slipping in later.
// When you replace a client with a generic phrase, add its name here.
const FORBIDDEN: string[] = ['JPMorgan', 'Goldman', 'Citibank', 'Wells Fargo', 'Bank of America', 'Pfizer', 'Novartis', 'Merck', 'Roche'];

describe('resume source', () => {
  it('resume.json has the required fields', () => {
    for (const k of ['name', 'title', 'email', 'linkedin', 'github'] as const) expect(r[k], k).toBeTruthy();
    expect(r.title).toBe('Applied AI Engineer');
    expect(r.email).toMatch(/^[^\s@]+@[^\s@]+$/);
    expect(r.linkedin).toMatch(/^https:\/\/\S+$/);
    expect(r.github).toMatch(/^https:\/\/\S+$/);
  });
  it('resume.typ reads the shared fields instead of copying them', () => {
    expect(typ).toContain('json("/src/content/resume.json")');
    expect(typ).not.toContain(r.title);
    expect(typ).not.toContain(r.email.replace('@', '\@'));
  });
  it('names no clients and carries no phone number or vault scaffolding', () => {
    for (const n of FORBIDDEN) expect(typ.toLowerCase(), n).not.toContain(n.toLowerCase());
    expect(typ).not.toMatch(/\d{3}-\d{3}-\d{4}|\[\[|cut last|revise after/i);
  });
});
