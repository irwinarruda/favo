import type { StartProviderUpdatesParams } from '@favo/contracts/rpc/updates/start-provider-updates';
import { ownValue } from '@favo/domain/shared/own-value';
import { UpdateState } from '@favo/domain/updates/update-outcome';
import { mockDb } from '@/__tests__/db';
import type { IProviderCliRepository } from '@/modules/updates/app/repositories/IProviderCliRepository';

export class TestProviderCliRepository implements IProviderCliRepository {
  async readMachine(machineId: string) {
    mockDb.providerVersionReads.push(machineId);
    await mockDb.providerVersionHold;
    const failure = ownValue(mockDb.providerVersionFailures, machineId);
    if (failure) throw failure;
    return ownValue(mockDb.providerVersions, machineId) ?? [];
  }

  async startUpdates(machineId: string, { providers, isRunningIncluded }: StartProviderUpdatesParams) {
    const failure = ownValue(mockDb.providerUpdateFailures, machineId);
    if (failure) throw failure;
    mockDb.providerUpdateStarts.push({ machineId, providers, isRunningIncluded });
    const at = new Date().toISOString();
    const outcomes = ownValue(mockDb.providerUpdateOutcomes, machineId);
    const versions = ownValue(mockDb.providerVersions, machineId) ?? [];
    const chosen = versions.filter(
      ({ provider, lastUpdate }) =>
        (providers === undefined || providers.includes(provider)) && lastUpdate?.state !== UpdateState.updating
    );
    mockDb.providerVersions[machineId] = versions.map((view) => {
      if (!chosen.includes(view)) return view;
      if (outcomes) return { ...view, lastUpdate: undefined, ...ownValue(outcomes, view.provider) };
      return { ...view, lastUpdate: { state: UpdateState.updating, from: view.version, at } };
    });
    return chosen.map(({ provider, version }) => ({ provider, version }));
  }
}
