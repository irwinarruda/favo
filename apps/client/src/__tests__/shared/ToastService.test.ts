import { describe, expect, test } from 'bun:test';
import { getApp } from '@/__tests__/utils/getApp';

describe('ToastService', () => {
  test('a stale timer cannot clear a newer toast', async () => {
    const app = await getApp();
    app.state.showToast('first');
    const first = app.state.toast!.id;
    app.state.showToast('second');
    app.state.clearToast(first);
    expect(app.state.toast?.message).toBe('second');
    app.state.clearToast(app.state.toast!.id);
    expect(app.state.toast).toBeUndefined();
  });
});
