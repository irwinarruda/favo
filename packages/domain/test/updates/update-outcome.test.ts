import { describe, expect, it } from 'bun:test';
import { settledRecordOf, UpdateState } from '#domain/updates/update-outcome';

const At = '2026-11-04T12:00:00.000Z';

describe('what the last update of a provider says', () => {
  it('keeps an update that is still going, without the process that runs it', () => {
    const record = { state: UpdateState.updating, from: '2.1.300', at: At };
    expect(settledRecordOf({ ...record, pid: 4242 }, true)).toEqual(record);
  });
  it('calls an update whose process is gone stopped, not updating forever', () => {
    const record = { state: UpdateState.updating, from: '2.1.300', at: At };
    expect(settledRecordOf({ ...record, pid: 4242 }, false)).toEqual({ ...record, state: UpdateState.stopped });
  });
  it('leaves a finished update as it is', () => {
    const record = { state: UpdateState.failed, from: '2.1.300', reason: 'exit 1', at: At };
    expect(settledRecordOf(record, false)).toEqual(record);
  });
});
