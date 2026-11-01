import {
  clampPercent,
  type SeatUsage,
  sortUsageWindows,
  UsageUnavailableReason,
  type UsageWindow,
  UsageWindowKind,
  unavailableUsage,
} from '@favo/domain/usage/seat-usage';

const SessionMins = 5 * 60;
const WeekMins = 7 * 24 * 60;
const MonthMins = 30 * 24 * 60;
const MonthlyPlans = ['free', 'go'];

type CodexWindow = { usedPercent?: unknown; resetsAt?: unknown; windowDurationMins?: unknown } | null;
type CodexSnapshot = {
  limitId?: unknown;
  planType?: unknown;
  primary?: CodexWindow;
  secondary?: CodexWindow;
  individualLimit?: { remainingPercent?: unknown; resetsAt?: unknown } | null;
} | null;

export type CodexRateLimits = {
  rateLimits?: CodexSnapshot;
  rateLimitsByLimitId?: Record<string, CodexSnapshot> | null;
};

export function codexUsageOf(limits: CodexRateLimits | undefined, checkedAt: string): SeatUsage {
  const snapshot = limits?.rateLimitsByLimitId?.codex ?? limits?.rateLimits;
  if (typeof snapshot !== 'object' || snapshot === null) {
    return unavailableUsage(checkedAt, UsageUnavailableReason.probeFailed);
  }
  return { checkedAt, windows: sortUsageWindows(windowsOf(snapshot)) };
}

function windowsOf(snapshot: NonNullable<CodexSnapshot>) {
  if (snapshot.limitId && snapshot.limitId !== 'codex') return [];
  const firstMins = MonthlyPlans.includes(String(snapshot.planType)) ? MonthMins : SessionMins;
  const individual = individualWindowOf(snapshot);
  const positions = [
    positionOf('primary', snapshot.primary, firstMins),
    positionOf('secondary', snapshot.secondary, WeekMins),
  ];
  return [...positions, individual].filter((window) => window !== undefined);
}

function positionOf(id: string, window: CodexWindow | undefined, fallbackMins: number): UsageWindow | undefined {
  if (typeof window?.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) return undefined;
  const windowDurationMins = typeof window.windowDurationMins === 'number' ? window.windowDurationMins : fallbackMins;
  const { kind, label } = kindOf(windowDurationMins);
  const usedPercent = clampPercent(window.usedPercent);
  return { id, kind, label, usedPercent, windowDurationMins, resetsAt: isoOf(window.resetsAt) };
}

function kindOf(mins: number) {
  if (mins >= MonthMins) return { kind: UsageWindowKind.monthly, label: 'Monthly' };
  if (mins >= WeekMins) return { kind: UsageWindowKind.weekly, label: 'Weekly' };
  return { kind: UsageWindowKind.session, label: 'Session' };
}

function individualWindowOf({ individualLimit }: NonNullable<CodexSnapshot>): UsageWindow | undefined {
  const remaining = individualLimit?.remainingPercent;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return undefined;
  return {
    id: 'individual',
    kind: UsageWindowKind.monthly,
    label: 'Monthly credit limit',
    usedPercent: clampPercent(100 - remaining),
    resetsAt: isoOf(individualLimit?.resetsAt),
  };
}

function isoOf(seconds: unknown) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}
