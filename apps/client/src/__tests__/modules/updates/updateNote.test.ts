import { describe, expect, test } from 'bun:test';
import { updateNoteOf } from '@/modules/updates/parsers/updateNote';

const Now = Date.parse('2026-11-04T15:00:00.000Z');
const ThreeHoursAgo = '2026-11-04T12:00:00.000Z';

describe('the note under a provider', () => {
  test('says why a provider was left alone', () => {
    const update = { state: 'leftAlone' as const, reason: 'it is pinned in Homebrew', at: ThreeHoursAgo };
    expect(updateNoteOf(update, Now)).toBe('left alone: it is pinned in Homebrew · 3h 0m ago');
  });
  test('gives the exit code of a failure', () => {
    expect(updateNoteOf({ state: 'failed', reason: 'exit 1', at: ThreeHoursAgo }, Now)).toBe(
      'the last update failed, exit 1 · 3h 0m ago'
    );
  });
  test('says when the last update stopped before it finished', () => {
    expect(updateNoteOf({ state: 'stopped', at: ThreeHoursAgo }, Now)).toBe(
      'the last update stopped before it finished · 3h 0m ago'
    );
  });
  test('shows an update that is still going as just now', () => {
    expect(updateNoteOf({ state: 'updating', at: new Date(Now - 5_000).toISOString() }, Now)).toBe(
      'updating · just now'
    );
  });
});
