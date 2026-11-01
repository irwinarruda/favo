import type { ValueOf } from '#domain/shared/value-of';

export const EntryKind = {
  missing: 'missing',
  file: 'file',
  directory: 'directory',
  link: 'link',
  brokenLink: 'brokenLink',
} as const;
export type EntryKind = ValueOf<typeof EntryKind>;

export type Entry = { kind: EntryKind; target?: string; identity?: string };

export const SharedItemState = {
  linked: 'linked',
  notInBase: 'notInBase',
  needsLink: 'needsLink',
  broken: 'broken',
  conflict: 'conflict',
  ownLink: 'ownLink',
} as const;
export type SharedItemState = ValueOf<typeof SharedItemState>;

export const ItemAction = {
  keep: 'keep',
  link: 'link',
  relink: 'relink',
  report: 'report',
} as const;
export type ItemAction = ValueOf<typeof ItemAction>;

export function planSharedItem(input: { base: Entry; seat: Entry; basePath: string }) {
  const { base, seat, basePath } = input;
  const isBaseMissing = base.kind === EntryKind.missing || base.kind === EntryKind.brokenLink;
  if (seat.kind === EntryKind.brokenLink) {
    if (isBaseMissing) return { state: SharedItemState.notInBase, action: ItemAction.keep };
    return { state: SharedItemState.broken, action: ItemAction.relink };
  }
  if (seat.kind === EntryKind.link) {
    if (seat.target === basePath) return { state: SharedItemState.linked, action: ItemAction.keep };
    return { state: SharedItemState.ownLink, action: ItemAction.report };
  }
  if (seat.kind === EntryKind.missing) {
    if (isBaseMissing) return { state: SharedItemState.notInBase, action: ItemAction.keep };
    return { state: SharedItemState.needsLink, action: ItemAction.link };
  }
  if (isBaseMissing) return { state: SharedItemState.notInBase, action: ItemAction.keep };
  if (seat.identity !== undefined && seat.identity === base.identity) {
    return { state: SharedItemState.linked, action: ItemAction.keep };
  }
  return { state: SharedItemState.conflict, action: ItemAction.report };
}

export function isItemHealthy(state: SharedItemState) {
  return state === SharedItemState.linked || state === SharedItemState.notInBase;
}

const NeverMirrored = /^(?:ntuser\.|\.Trash$)/i;

export function mirrorEntries(homeEntries: string[], shared: string[]) {
  const ownRoots = new Set(shared.map((item) => item.split('/')[0]));
  return homeEntries.filter((entry) => !ownRoots.has(entry) && !NeverMirrored.test(entry)).toSorted();
}

export function unclassifiedEntries(baseEntries: string[], spec: { shared: string[]; private: string[] }) {
  const known = new Set([...spec.shared, ...spec.private]);
  return baseEntries.filter((entry) => !known.has(entry) && !entry.startsWith('.')).toSorted();
}
