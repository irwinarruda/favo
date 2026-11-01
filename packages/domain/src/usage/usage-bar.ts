import type { ValueOf } from '#domain/shared/value-of';
import { paceTickOf, readingAgeOf, remainingPercentOf, resetLabelOf, UsagePaceArrows } from '#domain/usage/seat-usage';
import type { UsagePoolMember, UsagePoolWindow } from '#domain/usage/usage-pool';

const MinimumTickWidth = 6;
const PercentWidth = 4;
const LabelWidth = 7;
const LabelGap = '    ';

export const UsageBarPart = {
  left: 'left',
  refill: 'refill',
  track: 'track',
  tick: 'tick',
} as const;
export type UsageBarPart = ValueOf<typeof UsageBarPart>;

const Glyphs: Record<UsageBarPart, string> = { left: '▄', refill: '▂', track: '▁', tick: '█' };

export function usageBarOf(input: {
  remainingPercent: number;
  refillPercent: number;
  tickPercent?: number;
  width: number;
}) {
  const { remainingPercent, refillPercent, tickPercent, width } = input;
  const left = Math.min(cellsOf(remainingPercent, width), remainingPercent < 100 ? width - 1 : width);
  const refill = Math.min(cellsOf(Math.min(100 - remainingPercent, refillPercent), width), width - left);
  const cells = Array.from<unknown, UsageBarPart>({ length: width }, (_, index) => {
    if (index < left) return UsageBarPart.left;
    return index >= width - refill ? UsageBarPart.refill : UsageBarPart.track;
  });
  if (tickPercent !== undefined && width >= MinimumTickWidth) {
    cells[Math.min(Math.round((tickPercent / 100) * width), width - 1)] = UsageBarPart.tick;
  }
  return runsOf(cells);
}

export function usageRowOf(member: UsagePoolMember, width: number, now: number) {
  const { seat, window, refillPercent } = member;
  const remainingPercent = remainingPercentOf(window);
  const bar = usageBarOf({ remainingPercent, refillPercent, tickPercent: paceTickOf(window, now), width });
  const age = seat.usage.unavailable ? readingAgeOf(seat.usage.checkedAt, now) : undefined;
  const facts = [resetLabelOf(window, now), age].filter(Boolean).join(' · ');
  return { bar, percent: `${remainingPercent}%`.padStart(PercentWidth), facts };
}

export function usageHeadlineOf({ label, remainingPercent, pace, restoresPercent }: UsagePoolWindow) {
  const arrow = pace ? `  ${UsagePaceArrows[pace]}` : '';
  const refill = restoresPercent ? `   ↻ +${restoresPercent}%` : '';
  return {
    label: `${label.padEnd(LabelWidth)}${LabelGap}`,
    remaining: `${remainingPercent}% left`,
    facts: `${arrow}${refill}`,
  };
}

function cellsOf(percent: number, width: number) {
  return percent <= 0 ? 0 : Math.max(1, Math.round((percent / 100) * width));
}

function runsOf(cells: UsageBarPart[]) {
  const runs: { offset: number; part: UsageBarPart; text: string }[] = [];
  for (const [offset, part] of cells.entries()) {
    const last = runs.at(-1);
    if (last?.part === part) last.text += Glyphs[part];
    else runs.push({ offset, part, text: Glyphs[part] });
  }
  return runs;
}
