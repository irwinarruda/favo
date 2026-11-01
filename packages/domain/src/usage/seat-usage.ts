import { z } from 'zod';
import type { ValueOf } from '#domain/shared/value-of';

const Minute = 60_000;
const Hour = 60 * Minute;
const Day = 24 * Hour;
const PaceTolerance = 5;

export const UsageFreshForMs = 5 * Minute;
export const NoSubscriptionLimitsMessage = 'This account has no subscription limits.';

export const UsageWindowKind = {
  session: 'session',
  weekly: 'weekly',
  monthly: 'monthly',
  other: 'other',
} as const;
export type UsageWindowKind = ValueOf<typeof UsageWindowKind>;

export const UsageUnavailableReason = {
  unsupported: 'unsupported',
  probeFailed: 'probeFailed',
} as const;
export type UsageUnavailableReason = ValueOf<typeof UsageUnavailableReason>;

export const UsagePace = {
  ahead: 'ahead',
  on: 'on',
  under: 'under',
} as const;
export type UsagePace = ValueOf<typeof UsagePace>;

export const UsagePaceArrows: Record<UsagePace, string> = { ahead: '↗', on: '→', under: '↘' };

export const UsageWindow = z.strictObject({
  id: z.string(),
  kind: z.enum(UsageWindowKind),
  label: z.string(),
  usedPercent: z.number().min(0).max(100),
  resetsAt: z.iso.datetime().optional(),
  windowDurationMins: z.number().optional(),
});
export type UsageWindow = z.infer<typeof UsageWindow>;

export const SeatUsage = z.strictObject({
  checkedAt: z.iso.datetime(),
  windows: z.array(UsageWindow),
  unavailable: z.strictObject({ reason: z.enum(UsageUnavailableReason), message: z.string().optional() }).optional(),
});
export type SeatUsage = z.infer<typeof SeatUsage>;

const KindOrder: Record<UsageWindowKind, number> = { session: 0, weekly: 1, monthly: 2, other: 3 };

export function compareUsageKinds(left: { kind: UsageWindowKind }, right: { kind: UsageWindowKind }) {
  return KindOrder[left.kind] - KindOrder[right.kind];
}

export function sortUsageWindows(windows: UsageWindow[]) {
  return windows.toSorted(compareUsageKinds);
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function unavailableUsage(checkedAt: string, reason: UsageUnavailableReason, message?: string): SeatUsage {
  return { checkedAt, windows: [], unavailable: { reason, message } };
}

export function keepLastGoodUsage(previous: SeatUsage | undefined, next: SeatUsage): SeatUsage {
  const isFailure = next.unavailable?.reason === UsageUnavailableReason.probeFailed;
  if (!isFailure || !previous || previous.windows.length === 0) return next;
  return { ...previous, unavailable: next.unavailable };
}

export function isOldUsage(usage: SeatUsage, now: number) {
  if (usage.unavailable?.reason === UsageUnavailableReason.probeFailed) return true;
  return now - Date.parse(usage.checkedAt) >= UsageFreshForMs;
}

export function usageNoticeOf({ unavailable, windows }: SeatUsage) {
  if (unavailable?.reason === UsageUnavailableReason.unsupported) return unavailable.message ?? 'no limits available';
  if (windows.length > 0) return undefined;
  if (unavailable?.reason === UsageUnavailableReason.probeFailed)
    return unavailable.message ?? 'Could not read limits.';
  return 'No limits reported.';
}

export function remainingPercentOf(window: UsageWindow) {
  return Math.round(100 - clampPercent(window.usedPercent));
}

export function resetMillisOf(window: UsageWindow) {
  if (window.resetsAt === undefined) return undefined;
  const at = Date.parse(window.resetsAt);
  return Number.isFinite(at) ? at : undefined;
}

export function elapsedShareOf(window: UsageWindow, now: number) {
  const resetsAt = resetMillisOf(window);
  if (resetsAt === undefined || window.windowDurationMins === undefined) return undefined;
  const length = window.windowDurationMins * Minute;
  if (length <= 0) return undefined;
  return Math.max(0, Math.min(1, (length - (resetsAt - now)) / length));
}

export function paceOfShares(usedPercent: number, elapsed: number) {
  const gap = usedPercent - elapsed * 100;
  if (gap > PaceTolerance) return UsagePace.ahead;
  if (gap < -PaceTolerance) return UsagePace.under;
  return UsagePace.on;
}

export function paceTickOf(window: UsageWindow, now: number) {
  const elapsed = elapsedShareOf(window, now);
  return elapsed === undefined ? undefined : Math.round((1 - elapsed) * 100);
}

export function formatDuration(ms: number) {
  const remaining = Math.max(0, ms);
  const days = Math.floor(remaining / Day);
  const hours = Math.floor((remaining % Day) / Hour);
  const minutes = Math.floor((remaining % Hour) / Minute);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function resetLabelOf(window: UsageWindow, now: number) {
  const resetsAt = resetMillisOf(window);
  if (resetsAt === undefined) return undefined;
  if (resetsAt <= now) return 'resets now';
  if (resetsAt - now < Minute) return 'resets momentarily';
  return `↻ ${formatDuration(resetsAt - now)}`;
}

export function readingAgeOf(checkedAt: string, now: number) {
  const age = now - Date.parse(checkedAt);
  if (age < Minute) return 'read just now';
  return `read ${formatDuration(age)} ago`;
}
