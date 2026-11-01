import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { createTestServer } from '#test/support/test-server';

describe('the router', () => {
  it('answers an unknown method with an error, not a crash', async () => {
    const { router } = createTestServer();
    const response = await router.send({ id: 7, method: 'nope', params: {} });
    expect(response).toEqual({ id: 7, ok: false, error: { code: 'unknownMethod', message: 'Unknown method "nope".' } });
  });
  it('refuses params that break the contract', async () => {
    const { router } = createTestServer();
    const response = await router.send({ id: 1, method: 'accounts.create', params: { name: 5 } });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalidParams' } });
  });
  it('turns a forwarded reply that breaks the contract into an error that names the machine', async () => {
    const { client, remotes } = createTestServer();
    await client.call(addMachine, { target: 'bee@devbox' });
    remotes.connect('devbox', { send: async ({ id }) => ({ id, ok: true, result: { nope: true } }) });
    await expect(client.call(createAccount, { name: 'side' }, { machineId: 'devbox' })).rejects.toMatchObject({
      code: 'machineOutdated',
      message: 'devbox sent a reply favo could not read.',
    });
  });
  it('passes a forwarded error along as it came', async () => {
    const { client, remotes } = createTestServer();
    await client.call(addMachine, { target: 'bee@devbox' });
    remotes.connect('devbox', {
      send: async ({ id }) => ({ id, ok: false, error: { code: 'accountExists', message: 'taken' } }),
    });
    await expect(client.call(createAccount, { name: 'side' }, { machineId: 'devbox' })).rejects.toMatchObject({
      code: 'accountExists',
      message: 'taken',
    });
  });
  it('never forwards a hub method', async () => {
    const { router } = createTestServer();
    const response = await router.send({ id: 1, method: 'machines.list', params: {}, machineId: 'ghost' });
    expect(response.ok).toBe(true);
  });
});
