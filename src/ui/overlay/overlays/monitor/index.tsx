import { useState } from 'react';
import { useOverlay, type OverlayComponentProps } from '../../context';
import Journal from './journal';
import Market, { useSimClock } from './market';
import { MONITOR_CSS } from './styles';
import { PAGES, PageTabs, stepPage, type PageId } from './tabs';

/**
 * Trading monitor overlay: two pages behind a tab row in the title bar.
 *  - Market (opens here, `market.tsx`): the SIMULATED ticker board; A = candle chart on the top screen.
 *  - Journal (`journal.tsx`): the October trade log (sample data); A on a bar = that day's detail, the TradeDesk row.
 * Switch: tap a tab, or L / R (Q / E, PageUp / PageDown). The d-pad stays with the page. B: sub-view -> page -> close.
 * The simulated clock lives here, so it keeps running while the Journal is shown.
 */
export default function Monitor({ ctx }: OverlayComponentProps) {
  const { announce } = useOverlay();
  const minute = useSimClock();
  const [page, setPage] = useState<PageId>('market');
  const go = (p: PageId) => {
    if (p === page) return;
    setPage(p);
    announce(`${PAGES.find((x) => x.id === p)!.label} page`);
  };
  const onPage = (step: number) => go(stepPage(page, step));
  const tabs = <PageTabs page={page} onPick={go} />;
  return (
    <>
      <style>{MONITOR_CSS}</style>
      {page === 'market' ? (
        <Market ctx={ctx} minute={minute} tabs={tabs} onPage={onPage} />
      ) : (
        <Journal ctx={ctx} tabs={tabs} onPage={onPage} />
      )}
    </>
  );
}
