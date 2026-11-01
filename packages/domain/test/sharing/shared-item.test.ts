import { describe, expect, it } from 'bun:test';
import {
  EntryKind,
  ItemAction,
  isItemHealthy,
  mirrorEntries,
  planSharedItem,
  SharedItemState,
  unclassifiedEntries,
} from '#domain/sharing/shared-item';

const basePath = '/home/bee/.claude/skills';
const inBase = { kind: EntryKind.directory };
const notInBase = { kind: EntryKind.missing };

describe('planSharedItem', () => {
  it('creates a link when the base has the item', () => {
    expect(planSharedItem({ base: inBase, seat: { kind: EntryKind.missing }, basePath })).toEqual({
      state: SharedItemState.needsLink,
      action: ItemAction.link,
    });
  });
  it('keeps a link that already points at the base', () => {
    expect(planSharedItem({ base: inBase, seat: { kind: EntryKind.link, target: basePath }, basePath })).toEqual({
      state: SharedItemState.linked,
      action: ItemAction.keep,
    });
  });
  it('replaces a broken link when the base has the item', () => {
    const seat = { kind: EntryKind.brokenLink, target: '/gone' };
    expect(planSharedItem({ base: inBase, seat, basePath }).action).toBe(ItemAction.relink);
  });
  it('never overwrites a real file where a link belongs', () => {
    expect(planSharedItem({ base: inBase, seat: { kind: EntryKind.file }, basePath })).toEqual({
      state: SharedItemState.conflict,
      action: ItemAction.report,
    });
  });
  it('accepts a hard link, which is how Windows shares a file without Developer Mode', () => {
    const base = { kind: EntryKind.file, identity: '1:42' };
    expect(planSharedItem({ base, seat: { kind: EntryKind.file, identity: '1:42' }, basePath }).state).toBe(
      SharedItemState.linked
    );
  });
  it('reports a hard link that was split by a save, and leaves it alone', () => {
    const base = { kind: EntryKind.file, identity: '1:42' };
    expect(planSharedItem({ base, seat: { kind: EntryKind.file, identity: '1:43' }, basePath })).toEqual({
      state: SharedItemState.conflict,
      action: ItemAction.report,
    });
  });
  it('leaves a link the person pointed elsewhere and reports it', () => {
    const seat = { kind: EntryKind.link, target: '/somewhere/else' };
    expect(planSharedItem({ base: inBase, seat, basePath }).state).toBe(SharedItemState.ownLink);
  });
  it('does nothing when the base does not have the item', () => {
    expect(planSharedItem({ base: notInBase, seat: { kind: EntryKind.missing }, basePath }).action).toBe(
      ItemAction.keep
    );
    expect(planSharedItem({ base: notInBase, seat: { kind: EntryKind.file }, basePath }).state).toBe(
      SharedItemState.notInBase
    );
  });
  it('counts only real problems as unhealthy', () => {
    expect(isItemHealthy(SharedItemState.linked)).toBe(true);
    expect(isItemHealthy(SharedItemState.notInBase)).toBe(true);
    expect(isItemHealthy(SharedItemState.conflict)).toBe(false);
    expect(isItemHealthy(SharedItemState.needsLink)).toBe(false);
  });
});

describe('mirrorEntries', () => {
  it('mirrors a home except the folders the provider owns', () => {
    const shared = ['.gemini/config', '.gemini/antigravity-cli/skills'];
    expect(mirrorEntries(['.ssh', '.gemini', '.gitconfig'], shared)).toEqual(['.gitconfig', '.ssh']);
  });
});

describe('mirrorEntries on a real home', () => {
  it('never touches the Windows registry files that live in a home folder', () => {
    const entries = [
      'NTUSER.DAT',
      'ntuser.dat.LOG1',
      'NTUSER.DAT{2ad838bb-efea-11ee-a54d-000d3a94eaa1}.TxR.blf',
      'ntuser.ini',
      'AppData',
      '.gitconfig',
    ];
    expect(mirrorEntries(entries, [])).toEqual(['.gitconfig', 'AppData']);
  });
  it('leaves the macOS trash out', () => {
    expect(mirrorEntries(['.Trash', '.ssh'], [])).toEqual(['.ssh']);
  });
});

describe('unclassifiedEntries', () => {
  it('lists what favo knows nothing about, so the allowlist can stay current', () => {
    const spec = { shared: ['skills'], private: ['projects'] };
    expect(unclassifiedEntries(['skills', 'projects', 'new-thing', '.tmp'], spec)).toEqual(['new-thing']);
  });
});
