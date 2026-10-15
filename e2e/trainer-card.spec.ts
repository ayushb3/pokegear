import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { load, tile } from './helpers';

test('Start -> Trainer Card -> flip -> B closes', async ({ page }) => {
  await load(page);
  const before = await tile(page);
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  // Menu order: Pokédex (0), Radio (1), Trainer Card (2) — ArrowDown twice then Space
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  const card = page.locator('[data-testid=trainer-card]');
  await expect(card).toContainText('Ayush Basu');
  await expect(page.locator('[data-testid=card-front]')).toBeVisible();
  for (let i = 0; i < 9 && !(await page.locator('[data-testid=card-back]').count()); i++) await page.keyboard.press('Space'); // A flips
  await expect(page.locator('[data-testid=card-back]')).toBeVisible();
  await expect(page.locator('[data-testid=card-github]')).toHaveAttribute('href', 'https://github.com/ayushb3');
  await expect(page.locator('[data-testid=card-linkedin]')).toHaveAttribute('href', /linkedin\.com\/in\//);
  if (!(await page.locator('[data-testid=card-email]').count())) await page.keyboard.press('Space'); // phone box: links are split two per page; desktop shows all four
  await expect(page.locator('[data-testid=card-email]')).toHaveAttribute('href', /^mailto:/);
  await expect(page.locator('[data-testid=card-resume]')).toHaveAttribute('href', '/resume.pdf');
  await page.keyboard.press('Space'); // wraps back to the front
  await expect(page.locator('[data-testid=card-front]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await tile(page)).toEqual(before);
});

test('/?open=card opens the Trainer Card over the room', async ({ page }) => {
  await load(page, '&open=card');
  await expect(page.locator('[data-testid=trainer-card]')).toContainText('Ayush Basu');
  expect(new URL(page.url()).search).toContain('open=card');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(new URL(page.url()).search).not.toContain('open=');
});

test.describe('plain resume page', () => {
  test.use({ javaScriptEnabled: false });
  test('renders with JS disabled and embeds the PDF', async ({ page }) => {
    await page.goto('/resume');
    await expect(page.locator('h1')).toHaveText('Ayush Basu');
    await expect(page.locator('body')).toContainText('Applied AI Engineer');
    await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', '/resume.pdf');
    await expect(page.locator('object[data="/resume.pdf"]')).toHaveCount(1);
  });

  test('on a phone the download button is the primary element and the embed is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/resume');
    const btn = page.getByRole('link', { name: 'Download PDF' });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('href', '/resume.pdf');
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThan(812); // above the fold
    await expect(page.locator('object')).toBeHidden();
  });

  test('on a wide screen the PDF is embedded below the button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/resume');
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible();
    await expect(page.locator('object')).toBeVisible();
  });
});

test('resume.pdf is served as a PDF', async ({ request }) => {
  const res = await request.get('/resume.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
});

test('pitch page: every pitch line is fully inside the box at some page; A says Next then Flip', async ({ page }) => {
  await load(page, '&open=card');
  await page.keyboard.press('Space'); // front (who) -> pitch page
  await expect(page.locator('[data-testid=trainer-card]')).toHaveAttribute('data-page', '1');
  const box = page.locator('[data-testid=trainer-card]');
  const lines: string[] = JSON.parse(readFileSync('src/content/trainer-card.json', 'utf8')).pitch.lines;
  const tp = page.locator('[data-testid=text-pages]');
  const a = page.locator('[data-testid=btn-a]');
  const seen = new Set<string>(); // "line#rect" of every client rect that was fully inside the view
  const total: Record<number, number> = {};
  await page.waitForTimeout(400); // let TextPages measure after fonts settle
  const pages = Number(await tp.getAttribute('data-pages'));
  for (let p = 1; p <= pages; p++) {
    await expect(tp).toHaveAttribute('data-page', String(p));
    const r = await page.evaluate((texts) => {
      const view = document.querySelector('.tp-view')!.getBoundingClientRect();
      const ov = document.querySelector('[data-testid=trainer-card]')!.getBoundingClientRect();
      const out: { i: number; k: number; ok: boolean }[] = [];
      document.querySelectorAll('.tp-text').forEach((el, i) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        Array.from(rg.getClientRects()).forEach((q, k) => {
          const inView = q.top >= view.top - 1 && q.bottom <= view.bottom + 1 && q.left >= view.left - 1 && q.right <= view.right + 1;
          const inBox = q.top >= ov.top - 1 && q.bottom <= ov.bottom + 1 && q.left >= ov.left - 1 && q.right <= ov.right + 1;
          out.push({ i, k, ok: inView && inBox });
        });
      });
      return { out, n: texts.length };
    }, lines);
    for (const q of r.out) {
      total[q.i] = Math.max(total[q.i] ?? 0, q.k + 1);
      if (q.ok) seen.add(`${q.i}#${q.k}`);
    }
    if (p < pages) {
      await expect(a).toHaveAttribute('aria-label', /Next/);
      await page.keyboard.press('Space');
    }
  }
  await expect(a).toHaveAttribute('aria-label', /Flip/);
  lines.forEach((_, i) => {
    expect(total[i], `line ${i} rendered`).toBeGreaterThan(0);
    for (let k = 0; k < total[i]!; k++) expect(seen.has(`${i}#${k}`), `line ${i} row ${k} visible`).toBe(true);
  });
  await page.keyboard.press('Space'); // last pitch page + A flips the card
  await expect(box).toHaveAttribute('data-page', '2');
});

test('every card link is visible inside the box on some page', async ({ page }) => {
  await load(page, '&open=card');
  const box = page.locator('[data-testid=trainer-card]');
  const seen = new Set<string>();
  for (let i = 0; i < 12 && seen.size < 4; i++) {
    const ids = await page.evaluate(() => {
      const ov = document.querySelector('[data-testid=trainer-card]')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>('[data-testid^=card-]'))
        .filter((el) => ['github', 'linkedin', 'email', 'resume'].includes(el.dataset.testid!.slice(5)))
        .filter((el) => {
          const q = el.getBoundingClientRect();
          return q.height > 0 && q.top >= ov.top - 1 && q.bottom <= ov.bottom + 1 && q.left >= ov.left - 1 && q.right <= ov.right + 1;
        })
        .map((el) => el.dataset.testid!.slice(5));
    });
    ids.forEach((id) => seen.add(id));
    await page.locator('[data-testid=card-flip]').dispatchEvent('pointerdown');
  }
  expect([...seen].sort()).toEqual(['email', 'github', 'linkedin', 'resume']);
  await expect(box).toBeVisible();
});

test('tc-body never overflows its clientHeight on any card page at 375x812', async ({ page }) => {
  // This test is meaningful on the phone viewport only (the tight 48px content area).
  // On desktop the box is taller and overflow is not a risk.
  const vp = page.viewportSize();
  if (!vp || vp.width !== 375) return; // desktop project: skip

  await load(page, '&open=card');
  const card = page.locator('[data-testid=trainer-card]');
  await expect(card).toBeVisible();

  // Wait for ResizeObserver measurements to settle (chips/links layout decisions).
  await page.waitForTimeout(200);

  // Flip through every page once and assert no overflow.
  const totalPages = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=trainer-card]')!;
    return parseInt(el.getAttribute('data-page') || '0', 10); // current page; we'll use group count
  });
  // We don't know the total page count directly, so we flip until we wrap back to page 0.
  const overflows: string[] = [];
  let startPage = -1;
  for (let i = 0; i < 12; i++) {
    const { curPage, scrollH, clientH } = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid=trainer-card]')!;
      const body = overlay.querySelector('.tc-body')! as HTMLElement;
      return {
        curPage: parseInt(overlay.getAttribute('data-page') || '0', 10),
        scrollH: body.scrollHeight,
        clientH: body.clientHeight,
      };
    });
    if (i === 0) startPage = curPage;
    else if (curPage === startPage) break; // wrapped back to start

    if (scrollH > clientH + 1) {
      overflows.push(`page ${curPage}: scrollHeight ${scrollH} > clientHeight ${clientH}`);
    }
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
  }
  expect(overflows, 'card pages overflow their container').toEqual([]);
});

test('no pitch sub-page is a single short line', async ({ page }) => {
  await load(page, '&open=card');
  await page.keyboard.press('Space'); // pitch page
  const tp = page.locator('[data-testid=text-pages]');
  // wait for pagination to settle: data-pages unchanged across consecutive frames
  let last = '';
  await expect
    .poll(async () => {
      const v = (await tp.getAttribute('data-pages')) ?? '';
      const stable = v !== '' && v === last;
      last = v;
      return stable;
    }, { intervals: [100, 100, 100, 100, 200, 200] })
    .toBe(true);
  const pages = Number(await tp.getAttribute('data-pages'));
  for (let p = 1; p <= pages; p++) {
    await expect(tp).toHaveAttribute('data-page', String(p));
    const lines = await page.evaluate(() => {
      const v = document.querySelector('.tp-view')!;
      return Math.round(v.getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.tp-flow')!).lineHeight));
    });
    if (pages > 1) expect(lines, `pitch sub-page ${p}/${pages} line count`).toBeGreaterThanOrEqual(2);
    if (p < pages) await page.keyboard.press('Space');
  }
});
