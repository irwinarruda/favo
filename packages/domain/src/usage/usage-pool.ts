import { ProviderId, ProviderOrder, Providers } from '#domain/providers/provider';
import {
  clampPercent,
  compareUsageKinds,
  elapsedShareOf,
  isOldUsage,
  paceOfShares,
  resetMillisOf,
  type SeatUsage,
  type UsagePace,
  type UsageWindow,
  UsageWindowKind,
  usageNoticeOf,
} from '#domain/usage/seat-usage';

const ClaudeOverallWeekId = 'seven_day';

export type UsageSeat = {
  key: string;
  machineName: string;
  displayName: string;
  provider: ProviderId;
  identity?: string;
  plan?: string;
  usage: SeatUsage;
};

export type UsagePoolSeat = UsageSeat & { name: string; machineNames: string[] };

export type UsagePoolMember = {
  seat: UsagePoolSeat;
  window: UsageWindow;
  refillPercent: number;
  isStale: boolean;
};

export type UsagePoolColumn = { seat: UsagePoolSeat; member?: UsagePoolMember };

export type UsagePoolWindow = {
  id: string;
  kind: UsageWindowKind;
  label: string;
  columns: UsagePoolColumn[];
  usedPercent: number;
  remainingPercent: number;
  pace?: UsagePace;
  restoresPercent?: number;
  isStale: boolean;
};

export type UsagePool = {
  provider: ProviderId;
  label: string;
  seats: UsagePoolSeat[];
  windows: UsagePoolWindow[];
  notices: { name: string; message: string }[];
  summary?: string;
};

export function collectUsagePools(seats: UsageSeat[], now: number) {
  const accounts = uniqueAccounts(seats);
  return ProviderOrder.flatMap((provider) => {
    const members = accounts.filter((seat) => seat.provider === provider);
    return members.length > 0 ? [poolOf(provider, members, now)] : [];
  });
}

function uniqueAccounts(seats: UsageSeat[]) {
  const accounts = new Map<string, UsagePoolSeat>();
  for (const seat of seats) {
    const key = accountKeyOf(seat);
    const previous = accounts.get(key);
    const kept = previous && !isBetterReading(seat, previous) ? previous : seat;
    const machineNames = [...new Set([...(previous?.machineNames ?? []), seat.machineName])];
    accounts.set(key, { ...kept, name: kept.displayName, machineNames });
  }
  return [...accounts.values()];
}

function accountKeyOf(seat: UsageSeat) {
  if (!seat.identity) return seat.key;
  return JSON.stringify([seat.provider, seat.identity.trim().toLowerCase(), seat.plan]);
}

function isBetterReading(next: UsageSeat, previous: UsageSeat) {
  const isUsable = usageNoticeOf(next.usage) === undefined;
  const wasUsable = usageNoticeOf(previous.usage) === undefined;
  if (isUsable !== wasUsable) return isUsable;
  return Date.parse(next.usage.checkedAt) > Date.parse(previous.usage.checkedAt);
}

function poolOf(provider: ProviderId, accounts: UsagePoolSeat[], now: number): UsagePool {
  const seats = accounts.map((seat) => ({ ...seat, name: uniqueNameOf(seat, accounts) }));
  const reporting = seats.filter((seat) => usageNoticeOf(seat.usage) === undefined);
  const notices = seats.flatMap(({ name, usage }) => {
    const message = usageNoticeOf(usage);
    return message ? [{ name, message }] : [];
  });
  const sorted = sortSeats(provider, reporting, now);
  const windows = poolWindows(provider, sorted, now);
  const first = notices[0]?.message;
  const isOneNotice = windows.length === 0 && notices.every(({ message }) => message === first);
  return {
    provider,
    label: Providers[provider].label,
    seats: sorted,
    windows,
    notices,
    summary: isOneNotice ? first : undefined,
  };
}

function uniqueNameOf(seat: UsagePoolSeat, seats: UsagePoolSeat[]) {
  const isShared = seats.some((other) => other !== seat && other.displayName === seat.displayName);
  return isShared ? `${seat.displayName} · ${seat.machineName}` : seat.displayName;
}

function sortSeats(provider: ProviderId, seats: UsagePoolSeat[], now: number) {
  const first = seats.flatMap((seat) => seat.usage.windows).toSorted(compareUsageKinds)[0];
  function resetOf(seat: UsagePoolSeat) {
    const window = seat.usage.windows.find(
      (candidate) => first && poolKeyOf(provider, candidate) === poolKeyOf(provider, first)
    );
    const reset = window ? resetMillisOf(memberOf(seat, window, now).window) : undefined;
    return reset ?? Number.POSITIVE_INFINITY;
  }
  return seats.toSorted(
    (left, right) =>
      resetOf(left) - resetOf(right) ||
      left.name.toLowerCase().localeCompare(right.name.toLowerCase()) ||
      left.key.localeCompare(right.key)
  );
}

function poolKeyOf(provider: ProviderId, window: UsageWindow) {
  return provider === ProviderId.codex ? window.kind : `${window.kind}:${window.id}`;
}

function isOverallWeek(provider: ProviderId, window: UsageWindow) {
  if (provider === ProviderId.claude) return window.id === ClaudeOverallWeekId;
  return provider === ProviderId.codex && window.kind === UsageWindowKind.weekly;
}

function memberOf(seat: UsagePoolSeat, reported: UsageWindow, now: number): UsagePoolMember {
  const spentWeek = seat.usage.windows.find(
    (window) =>
      reported.kind === UsageWindowKind.session && window.usedPercent >= 100 && isOverallWeek(seat.provider, window)
  );
  if (!spentWeek) {
    const refillPercent = resetMillisOf(reported) === undefined ? 0 : reported.usedPercent;
    return { seat, window: reported, refillPercent, isStale: isStale(seat, reported, now) };
  }
  const cutoff = Math.max(now, Date.parse(seat.usage.checkedAt));
  const { resetsAt, refillPercent } = blockedSessionReset(reported, spentWeek, cutoff);
  const window = { ...reported, usedPercent: 100, resetsAt, windowDurationMins: undefined };
  return { seat, window, refillPercent, isStale: isStale(seat, reported, now) };
}

function blockedSessionReset(session: UsageWindow, week: UsageWindow, cutoff: number) {
  const sessionReset = resetMillisOf(session);
  const weekReset = resetMillisOf(week);
  const isKnown = sessionReset !== undefined && weekReset !== undefined && sessionReset > cutoff && weekReset > cutoff;
  if (!isKnown) return { resetsAt: undefined, refillPercent: 0 };
  if (sessionReset <= weekReset) return { resetsAt: week.resetsAt, refillPercent: 100 };
  if (session.usedPercent >= 100) return { resetsAt: session.resetsAt, refillPercent: 100 };
  return { resetsAt: week.resetsAt, refillPercent: 100 - clampPercent(session.usedPercent) };
}

function isStale(seat: UsagePoolSeat, window: UsageWindow, now: number) {
  const reset = resetMillisOf(window);
  return isOldUsage(seat.usage, now) || (reset !== undefined && reset <= now);
}

function poolWindows(provider: ProviderId, seats: UsagePoolSeat[], now: number) {
  const byKey = new Map<string, UsagePoolMember[]>();
  for (const seat of seats) {
    for (const reported of seat.usage.windows) {
      const pooled = poolKeyOf(provider, reported);
      const isTaken = byKey.get(pooled)?.some((member) => member.seat === seat);
      const key = isTaken ? `${reported.kind}:${reported.id}` : pooled;
      byKey.set(key, [...(byKey.get(key) ?? []), memberOf(seat, reported, now)]);
    }
  }
  const windows = [...byKey.entries()].map(([key, members]) => poolWindowOf(key, members, seats, now));
  return windows.toSorted(compareUsageKinds);
}

function poolWindowOf(key: string, members: UsagePoolMember[], seats: UsagePoolSeat[], now: number): UsagePoolWindow {
  const first = members[0]!.window;
  const usedPercent = meanOf(members.map(({ window }) => window.usedPercent));
  const nextReset = nextResetOf(members);
  return {
    id: first.kind === key ? key : first.id,
    kind: first.kind,
    label: first.label,
    columns: seats.map((seat) => ({ seat, member: members.find((member) => member.seat === seat) })),
    usedPercent: Math.round(usedPercent),
    remainingPercent: Math.round(100 - usedPercent),
    pace: poolPaceOf(members, now),
    restoresPercent: seats.length > 1 ? nextReset : undefined,
    isStale: members.every((member) => member.isStale),
  };
}

function poolPaceOf(members: UsagePoolMember[], now: number) {
  const timed = members.flatMap(({ window }) => {
    const elapsed = elapsedShareOf(window, now);
    return elapsed === undefined ? [] : [{ used: window.usedPercent, elapsed }];
  });
  if (timed.length === 0) return undefined;
  return paceOfShares(meanOf(timed.map(({ used }) => used)), meanOf(timed.map(({ elapsed }) => elapsed)));
}

function nextResetOf(members: UsagePoolMember[]) {
  const resets = members.flatMap(({ window, refillPercent }) => {
    const at = resetMillisOf(window);
    return at === undefined ? [] : [{ at, restoresPercent: Math.round(refillPercent / members.length) }];
  });
  const giving = resets.filter(({ restoresPercent }) => restoresPercent > 0);
  return giving.toSorted((left, right) => left.at - right.at)[0]?.restoresPercent;
}

function meanOf(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
