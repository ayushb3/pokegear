// Compiles resume/resume.typ with the pinned npm typst compiler (no Typst CLI needed).
// Prerendered: `astro build` emits dist/resume.pdf; `astro dev` compiles it on request.
import type { APIRoute } from 'astro';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

export const prerender = true;

export const GET: APIRoute = () => {
  const compiler = NodeCompiler.create({ workspace: process.cwd() });
  const pdf = compiler.pdf({ mainFilePath: 'resume/resume.typ' });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } });
};
