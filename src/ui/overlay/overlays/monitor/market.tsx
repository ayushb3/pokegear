import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dim } from '../../../../world/api';
import OverlayFrame from '../../OverlayFrame';
import { useOverlay, useOverlayInput, type OverlayCtx } from '../../context';
import {
  LAST_MINUTE,
  SYMBOLS,
  aggregate,
  changePct,
  clockLabel,
  fmtPct,
  sessionDate,
  simSession,
  rangeSoFar,
  sparkline,
  type Candle,
} from './sim';

/**
 * Monitor, Market page: a SIMULATED ticker board (fictional tickers, seeded random data, no network).
 * Board (bottom screen): one row per symbol with price, change % and a sparkline of the session so far.
 * A on a row: candle chart of that symbol on the TOP screen (DOM portal, world dimmed like the radio / Pokedex).
 * B: chart -> board -> close. The simulated clock (`useSimClock`, owned by index.tsx so it keeps running on the Journal
 * page) ticks one minute-candle per TICK_MS while the overlay is open.
 */
const TICK_MS = 400;
const START_MINUTE = 90; // 11:00: the open drive is already on the board when it opens
const SPARK_COLS = 40;
const SPARK_H = 12;
const CHART_W = 234;
const CHART_H = 124;
const CANDLE_MIN = 10; // minutes per chart candle: 39 candles x 6u pitch = 234u
const PITCH = 6;
const COPY = 'Simulated prices. Not real quotes.';

type View = 'board' | 'chart';

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Sym {
  symbol: string;
  name: string;
  candles: Candle[];
}

function Spark({ s, minute }: { s: Sym; minute: number }) {
  const cols = sparkline(s.candles, minute, SPARK_COLS);
  const lo = Math.min(...cols.map((c) => c.lo));
  const hi = Math.max(...cols.map((c) => c.hi));
  const span = Math.max(0.01, hi - lo);
  const up = s.candles[minute]!.c >= s.candles[0]!.o;
  const fill = up ? '#2f7d4a' : '#c0392b';
  return (
    <svg className="mon-spark" viewBox={`0 0 ${SPARK_COLS} ${SPARK_H}`} aria-hidden="true">
      {cols.map((c, i) => {
        const top = Math.round(((hi - c.hi) / span) * (SPARK_H - 1));
        const bot = Math.round(((hi - c.lo) / span) * (SPARK_H - 1));
        return <rect key={i} x={i} y={top} width={1} height={bot - top + 1} fill={fill} />;
      })}
    </svg>
  );
}

function Row({ s, minute, selected, onTap }: { s: Sym; minute: number; selected: boolean; onTap?: () => void }) {
  const c = s.candles[minute]!;
  const pct = changePct(s.candles, minute);
  return (
    <button
      type="button"
      className={`mon-row${selected ? ' sel' : ''}`}
      data-testid={`monitor-row-${s.symbol}`}
      aria-current={selected || undefined}
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault();
        onTap?.();
      }}
      onClick={(e) => {
        if (e.detail === 0) onTap?.();
      }}
    >
      <span className="mon-cur" aria-hidden="true">{selected ? '▶' : ''}</span>
      <span className="mon-sym">{s.symbol}</span>
      <span className="mon-px">{c.c.toFixed(2)}</span>
      <span className={`mon-pct ${pct >= 0 ? 'mon-up' : 'mon-down'}`}>{fmtPct(pct)}</span>
      <Spark s={s} minute={minute} />
    </button>
  );
}

/** Candle chart on the top screen. x = the whole session (09:30 left, 16:00 right edge); y = the range so far. */
function ChartTop({ s, minute, clock }: { s: Sym; minute: number; clock: string }) {
  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;
  useEffect(() => {
    dim(true);
    return () => dim(false);
  }, []);
  if (!topEl) return null;
  const cs = aggregate(s.candles, minute, CANDLE_MIN);
  const { hi, lo } = rangeSoFar(s.candles, minute);
  const span = Math.max(0.01, hi - lo);
  const y = (p: number) => Math.round(((hi - p) / span) * (CHART_H - 1));
  const openY = y(s.candles[0]!.o);
  const last = s.candles[minute]!.c;
  const pct = changePct(s.candles, minute);
  const dashes = [];
  for (let x = 0; x < CHART_W; x += 4) dashes.push(<rect key={x} x={x} y={openY} width={2} height={1} fill="#b4b4bc" />);
  return createPortal(
    <OverlayFrame
      placement="top"
      className="mon-top"
      data-testid="monitor-chart-top"
      data-symbol={s.symbol}
      title={s.symbol}
      aside={
        <span className="mon-aside">
          <span className="mon-tag">SIM</span>
          <span>{clock}</span>
        </span>
      }
    >
      <div className="mon-line">
        <span>HI {hi.toFixed(2)}</span>
        <span>LO {lo.toFixed(2)}</span>
      </div>
      <svg className="mon-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={`${s.symbol} simulated candle chart`}>
        {dashes}
        {cs.map((c, i) => {
          const up = c.c >= c.o;
          const col = up ? '#58b873' : '#e0524a';
          const x = i * PITCH;
          const yh = y(c.h);
          const yl = y(c.l);
          const a = y(Math.max(c.o, c.c));
          const b = y(Math.min(c.o, c.c));
          return (
            <g key={i} data-candle="">
              <rect x={x + 2} y={yh} width={1} height={yl - yh + 1} fill={col} />
              <rect x={x} y={a} width={5} height={b - a + 1} fill={col} />
            </g>
          );
        })}
      </svg>
      <div className="mon-line">
        <span>LAST {last.toFixed(2)}</span>
        <span className={pct >= 0 ? 'mon-up' : 'mon-down'}>{fmtPct(pct)}</span>
      </div>
    </OverlayFrame>,
    topEl,
  );
}

/** The simulated session clock: one minute-candle per TICK_MS while the overlay is open, paused in a hidden tab, stops at the
 *  close; static at the close under reduced motion. */
export function useSimClock(): number {
  const [minute, setMinute] = useState(() => (prefersReduced() ? LAST_MINUTE : START_MINUTE));
  useEffect(() => {
    if (prefersReduced()) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setMinute((m) => (m >= LAST_MINUTE ? m : m + 1));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);
  return minute;
}

export interface PageProps {
  ctx: OverlayCtx;
  /** the page tab row (the title bar's heading) */
  tabs: ReactNode;
  /** L / R: switch page (-1 / +1) */
  onPage: (step: number) => void;
}

export default function Market({ ctx, minute, tabs, onPage }: PageProps & { minute: number }) {
  const { announce } = useOverlay();
  const date = useMemo(() => sessionDate(typeof location !== 'undefined' ? location.search : ''), []);
  const syms = useMemo<Sym[]>(
    () =>
      SYMBOLS.map(({ symbol, name }) => ({ symbol, name, candles: simSession(symbol, date) })),
    [date],
  );
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<View>('board');
  const s = syms[sel]!;
  const clock = minute >= LAST_MINUTE ? 'CLOSE' : clockLabel(minute);

  // Announce on selection change only (never per tick): read the live numbers through a ref.
  const live = useRef({ minute, syms });
  live.current = { minute, syms };
  useEffect(() => {
    const { minute: m, syms: all } = live.current;
    const x = all[sel]!;
    const pct = changePct(x.candles, m);
    announce(`${x.symbol} ${x.candles[m]!.c.toFixed(2)} ${pct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(pct * 10) / 10)} percent, simulated`);
  }, [sel, announce]);

  const n = syms.length;
  const pick = (i: number) => setSel(((i % n) + n) % n);

  useOverlayInput(
    view === 'board'
      ? {
          up: () => pick(sel - 1),
          down: () => pick(sel + 1),
          a: () => setView('chart'),
          b: () => ctx.close(),
          l: () => onPage(-1),
          r: () => onPage(1),
          labels: { a: 'Chart', b: 'Close' },
        }
      : {
          up: () => pick(sel - 1),
          down: () => pick(sel + 1),
          a: () => pick(sel + 1),
          b: () => setView('board'),
          l: () => onPage(-1),
          r: () => onPage(1),
          labels: { a: 'Next', b: 'Back' },
        },
  );

  const aside = (
    <span className="mon-aside">
      <span className="mon-tag" data-testid="monitor-sim">SIM</span>
      <span className="mon-clock" data-testid="monitor-clock">{clock}</span>
    </span>
  );

  return (
    <>
      {view === 'chart' && <ChartTop s={s} minute={minute} clock={clock} />}
      <OverlayFrame className="mon" title={tabs} aside={aside} data-testid="monitor-board" data-page="market" data-view={view} data-minute={minute} data-selected={s.symbol}>
        {view === 'board' ? (
          <div className="mon-rows" aria-label="Simulated tickers">
            {syms.map((x, i) => (
              <Row
                key={x.symbol}
                s={x}
                minute={minute}
                selected={i === sel}
                onTap={() => (i === sel ? setView('chart') : setSel(i))}
              />
            ))}
          </div>
        ) : (
          <div className="mon-rows">
            <Row s={s} minute={minute} selected onTap={() => pick(sel + 1)} />
          </div>
        )}
        <p className="mon-copy">{COPY}</p>
      </OverlayFrame>
    </>
  );
}
