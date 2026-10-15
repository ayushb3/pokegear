# Résumé

`resume.typ` is the source of truth. The site serves `/resume.pdf` from the Astro endpoint `src/pages/resume.pdf.ts` (`dist/resume.pdf` after `npm run build`; compiled on request under `astro dev`; never committed).

## Edit and re-render

1. Edit `resume/resume.typ` in any text editor. Bullets are lines starting with `- `.
2. Render: `npm run build` or `astro dev` then open `/resume.pdf` (`src/pages/resume.pdf.ts`, using the pinned `@myriaddreamin/typst-ts-node-compiler`; no Typst CLI needed).
3. Open `dist/resume.pdf` and check it's still one page.

## Typst gotchas

| Write this | Not this | Why |
|---|---|---|
| `\~70%` | `~70%` | `~` is a non-breaking space in Typst; it silently disappears |
| `\@` | `@` | `@` starts a reference (the email is already escaped) |
| `\#`, `\$`, `\*`, `\_` | `#`, `$`, `*`, `_` | markup characters: function call, math, bold, italic |
| `*bold*`, `_italic_` | `**bold**` | Typst markup, not Markdown |

## Structure (helpers at the top of the file)

- `#section[Title]`: section heading with a rule under it.
- `#entry[Name][detail][dates]`: bold name | italic detail, dates right-aligned (projects, education).
- `#role[Title][Team][dates]`: one SAP sub-role. Use `#role([Title], none, [dates])` when there's no team.
- Page margins, font and spacing are the `#set` lines at the top.

## ATS rules this layout follows

One column, real selectable text, contact info in the body (not a page header), standard section names, one date format (`Mon YYYY – Mon YYYY`), no icons or tables around content. To check how a parser sees it, extract the text: `python -c "import pymupdf;print(pymupdf.open('dist/resume.pdf')[0].get_text())"`.
