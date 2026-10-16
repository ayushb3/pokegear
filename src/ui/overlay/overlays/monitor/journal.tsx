import { useRef, useState } from 'react';
import sample from '../../../../content/trading/sample-october.json';
import {
  FLAT_R,
  MONTHS,
  WEEKDAYS,
  fmtR,
  summarize,
  weekdayCells,
  type Cell,
  type LogDay,
  type TradingLog,
} from '../../../../content/trading/summary';
import OverlayFrame from '../../OverlayFrame';
import TextPages, { type TextPagesHandle } from '../../TextPages';
import { useOverlayInput } from '../../context';
import { Glyph } from './glyphs';
import type { PageProps } from './market';

/**
 * Monitor, Journal page: the month's trade log as a bar chart (Mon-Fri only).
 * Stats are always visible as a row of 4 tiles below the chart.
 * Navigation: left/right step through bars; down goes to the TradeDesk link row; up goes back.
 * A on a bar = day detail TextPages; A on link = TradeDesk. B: sub-view -> chart -> close.
 */
const log = sample as TradingLog;
const [YEAR, MONTH] = log.month.split('-').map(Number) as [number, number];
const wdCells = weekdayCells(log.month, log.days);
const BAR_COUNT = wdCells.length;
const stats = summarize(log.days);

const maxAbsR = Math.max(
  0.1,
  ...wdCells.map((c) => (c.entry && c.entry.r !== null ? Math.abs(c.entry.r) : 0)),
);

type Pos = number | 'link'; // number = 0-based bar index
type View = 'chart' | 'day';

const weekdayOf = (day: number) =>
  WEEKDAYS[new Date(Date.UTC(YEAR, MONTH - 1, day)).getUTCDay()] as string;
const label = (day: number) => `${weekdayOf(day)} ${day}`;

function brokenNames(d: LogDay, key: 'name' | 'short') {
  return d.broken.map((k) => log.rules[k]?.[key] ?? k);
}

function DayLine({ idx }: { idx: number }) {
  const c = wdCells[idx] as Cell & { day: number };
  const e = c.entry;
  const lbl = label(c.day);
  if (!e) return <>{lbl} Not logged</>;
  if (e.r === null) return <>{lbl} No trade</>;
  return (
    <>
      {lbl} {fmtR(e.r)}{' '}
      {e.broken.length ? (
        <>
          <Glyph g="cross" /> {brokenNames(e, 'short').join(', ')}
        </>
      ) : (
        <>
          <Glyph g="tick" /> Kept
        </>
      )}
    </>
  );
}

/** the readout line as plain text (its title, for when the ellipsis shortens it) */
function plainDay(idx: number): string {
  const c = wdCells[idx] as Cell & { day: number };
  const e = c.entry;
  if (!e) return `${label(c.day)} Not logged`;
  if (e.r === null) return `${label(c.day)} No trade`;
  return `${label(c.day)} ${fmtR(e.r)} ${e.broken.length ? brokenNames(e, 'short').join(', ') : 'Kept'}`;
}

function dayBlocks(idx: number) {
  const c = wdCells[idx] as Cell & { day: number };
  const e = c.entry;
  const head = { label: e && e.r !== null ? `${label(c.day)}  ${fmtR(e.r)}` : label(c.day) };
  if (!e) return [head, { text: 'Not logged' }];
  if (e.r === null) return [head, { text: 'No trade taken' }];
  if (e.broken.length === 0) return [head, { text: 'All rules kept' }];
  return [head, ...brokenNames(e, 'name').map((n) => ({ text: `Broke: ${n}` }))];
}

// ── Bar column ──────────────────────────────────────────────────────────────

/**
 * HALF_U=12: chart column height = 2*12+1 = 25u (sized so the 18u page tab bar, the chart and the stat tiles fill
 * the 90u box exactly, see styles.ts).
 * Zero line is at y=HALF_U (12u from top) across the full chart (.chart-zero).
 * All bar fills and markers are position:absolute, top measured from HALF_U:
 *   gain  → top = HALF_U+1 - barH  (grows up from just above the line)
 *   loss  → top = HALF_U+1         (grows down from just below the line)
 *   flat  → top = HALF_U-1         (2u stub centred on line)
 *   none  → top = HALF_U-3         (6u hollow box, 2u outline, centred on line)
 * Every mark is >= 2 texels thick: bars >= 2u, the rule-break mark is a 6u X with 2u strokes.
 */
const HALF_U = 12;
const MARK = 6; // rule-break mark: 3x3 cells at 2u
const CONTENT_U = 226; // overlay content width in native units (256 - 16 screen frame - 2 border - 12 padding)

function barHeightUnits(r: number): number {
  const maxH = HALF_U - MARK - 1; // room for the 6u mark + 1u gap inside the half
  return Math.max(2, Math.round((maxH * Math.abs(r)) / maxAbsR));
}

/** Largest even column width (8, 6, 4, 2) whose chart fits the content width with 2u gaps; whole-unit offset. */
const GAP = 2;
const COL_W = [8, 6, 4, 2].find((w) => BAR_COUNT * (w + GAP) - GAP <= CONTENT_U) ?? 2;
const CHART_W = BAR_COUNT * (COL_W + GAP) - GAP;
const CHART_X = Math.floor((CONTENT_U - CHART_W) / 2);

interface BarColProps {
  cell: Cell;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}

function BarCol({ cell, selected, onSelect, onActivate }: BarColProps) {
  const e = cell.entry;
  const r = e ? e.r : undefined;
  const hasBroken = !!(e && e.broken.length > 0);

  const isGain = r !== null && r !== undefined && r > FLAT_R;
  const isLoss = r !== null && r !== undefined && r < -FLAT_R;
  const isFlat = r !== null && r !== undefined && Math.abs(r) < FLAT_R;
  const noTrade = e !== undefined && r === null;

  const barH = isGain || isLoss ? barHeightUnits(r as number) : 0;
  const gainTop = HALF_U + 1 - barH;
  const lossTop = HALF_U + 1;
  const flatTop = HALF_U - 1;
  const noTradeTop = HALF_U - 3;
  const crossAboveTop = gainTop - MARK - 1;
  const crossBelowTop = lossTop + barH + 1;
  const colourClass = isGain ? 'bar-g' : isLoss ? 'bar-r' : 'bar-f';

  return (
    <div
      className={`bar-col${selected ? ' sel' : ''}`}
      style={{ width: `calc(var(--u)*${COL_W})` }}
      data-testid={cell.day !== null ? `monitor-day-${cell.day}` : undefined}
      onPointerDown={(ev) => {
        ev.preventDefault();
        if (selected) onActivate();
        else onSelect();
      }}
    >
      {isGain && (
        <div
          className={`bar-abs ${colourClass}`}
          style={{ top: `calc(var(--u)*${gainTop})`, height: `calc(var(--u)*${barH})` }}
        />
      )}
      {isLoss && (
        <div
          className={`bar-abs ${colourClass}`}
          style={{ top: `calc(var(--u)*${lossTop})`, height: `calc(var(--u)*${barH})` }}
        />
      )}
      {isFlat && (
        <div
          className={`bar-abs bar-flat-stub ${colourClass}`}
          style={{ top: `calc(var(--u)*${flatTop})` }}
        />
      )}
      {/* no-trade: dashed box centred on zero line, top computed inline */}
      {noTrade && (
        <div className="bar-none" style={{ top: `calc(var(--u)*${noTradeTop})` }} />
      )}
      {isGain && hasBroken && (
        <div className="bar-cross-pos" style={{ top: `calc(var(--u)*${crossAboveTop})` }}>
          <Glyph g="mark" cell={2} />
        </div>
      )}
      {isLoss && hasBroken && (
        <div className="bar-cross-pos" style={{ top: `calc(var(--u)*${crossBelowTop})` }}>
          <Glyph g="mark" cell={2} />
        </div>
      )}
    </div>
  );
}

// ── Stat tiles ───────────────────────────────────────────────────────────────

function StatTiles() {
  const avg = stats.avgTradeMinutes;
  return (
    <div className="stat-row">
      <div className="stat-tile" data-testid="monitor-stat-month">
        <span className="stat-val">{fmtR(stats.totalR)}</span>
        <span className="stat-lbl">Month</span>
      </div>
      <div className="stat-tile" data-testid="monitor-stat-days">
        <span className="stat-val">
          <span className="stat-g">{stats.green}</span>
          <span>/</span>
          <span className="stat-r">{stats.red}</span>
        </span>
        <span className="stat-lbl">Days</span>
      </div>
      <div className="stat-tile" data-testid="monitor-stat-trades">
        <span className="stat-val">
          <span className="stat-g">{stats.greenTrades}</span>
          <span>/</span>
          <span className="stat-r">{stats.redTrades}</span>
        </span>
        <span className="stat-lbl">Trades</span>
      </div>
      <div className="stat-tile" data-testid="monitor-stat-avg">
        <span className="stat-val">{avg !== null ? `${avg}m` : '--'}</span>
        <span className="stat-lbl">Avg</span>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function Journal({ ctx, tabs, onPage }: PageProps) {
  const [view, setView] = useState<View>('chart');
  const pages = useRef<TextPagesHandle>(null);

  const [pos, setPos] = useState<Pos>(() => {
    const lastDay = log.days[log.days.length - 1];
    if (!lastDay) return 0;
    const dayNum = Number(lastDay.date.slice(8));
    const idx = wdCells.findIndex((c) => c.day === dayNum);
    return idx >= 0 ? idx : BAR_COUNT - 1;
  });

  const barIdx = typeof pos === 'number' ? pos : BAR_COUNT - 1;
  const openTradeDesk = () => ctx.replace('pokedex', { slug: 'tradedesk' });

  const activate = () => {
    if (pos === 'link') openTradeDesk();
    else setView('day');
  };

  useOverlayInput({
    a: () => {
      if (view === 'chart') activate();
      else pages.current?.advance();
    },
    b: () => {
      if (view === 'chart') ctx.close();
      else setView('chart');
    },
    left: () => {
      if (view === 'day') setPos(Math.max(0, barIdx - 1));
      else if (view === 'chart' && typeof pos === 'number') setPos(Math.max(0, pos - 1));
    },
    right: () => {
      if (view === 'day') setPos(Math.min(BAR_COUNT - 1, barIdx + 1));
      else if (view === 'chart' && typeof pos === 'number') setPos(Math.min(BAR_COUNT - 1, pos + 1));
    },
    l: () => onPage(-1),
    r: () => onPage(1),
    up: () => {
      if (view === 'chart' && pos === 'link') setPos(BAR_COUNT - 1);
    },
    down: () => {
      if (view === 'chart' && typeof pos === 'number') setPos('link');
    },
    labels:
      view === 'chart'
        ? { a: pos === 'link' ? 'Open' : 'Look', b: 'Close' }
        : { a: 'Next', b: 'Back' },
  });

  // the title bar: the page tabs, then the month and the sample tag
  const aside = (
    <span className="mon-aside">
      <span data-testid="monitor-month">{MONTHS[MONTH - 1]} {YEAR}</span>
      {log.sample ? (
        <span className="mon-tag" data-testid="monitor-sample">
          Sample data
        </span>
      ) : null}
    </span>
  );

  // ── day detail view ──────────────────────────────────────────────────────
  if (view === 'day') {
    const c = wdCells[barIdx] as Cell & { day: number };
    return (
      <OverlayFrame className="mon" title={tabs} aside={aside} data-testid="monitor-day" data-page="journal">
        <TextPages
          key={c.day}
          ref={pages}
          blocks={dayBlocks(barIdx)}
          onDone={() => setView('chart')}
        />
      </OverlayFrame>
    );
  }

  // ── chart view ───────────────────────────────────────────────────────────
  const footer =
    pos === 'link' ? (
      <>TradeDesk <Glyph g="arrow" /></>
    ) : (
      <DayLine idx={pos} />
    );

  const readoutTitle = pos === 'link' ? 'TradeDesk' : plainDay(pos);

  return (
    <OverlayFrame className="mon" title={tabs} aside={aside} data-testid="monitor-chart" data-page="journal">
      <div
        className="chart"
        style={{ width: `calc(var(--u)*${CHART_W})`, marginLeft: `calc(var(--u)*${CHART_X})` }}
        role="img"
        aria-label={`${MONTHS[MONTH - 1]} ${YEAR} trading log`}
      >
        <div className="chart-zero" aria-hidden="true" />
        {wdCells.map((cell, i) => (
          <BarCol
            key={cell.day ?? i}
            cell={cell}
            selected={pos === i}
            onSelect={() => setPos(i)}
            onActivate={activate}
          />
        ))}
      </div>
      <StatTiles />
      <button
        type="button"
        tabIndex={-1}
        className={`foot${pos === 'link' ? ' sel' : ''}`}
        data-testid="monitor-readout"
        title={readoutTitle}
        onPointerDown={(e) => {
          e.preventDefault();
          activate();
        }}
      >
        {footer}
      </button>
    </OverlayFrame>
  );
}
