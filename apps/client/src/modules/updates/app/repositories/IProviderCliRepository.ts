import type { StartedUpdate, StartProviderUpdatesParams } from '@favo/contracts/rpc/updates/start-provider-updates';
import type { ProviderVersionView } from '@favo/contracts/rpc/views';

export type IProviderCliRepository = {
  readMachine(machineId: string): Promise<ProviderVersionView[]>;
  startUpdates(machineId: string, request: StartProviderUpdatesParams): Promise<StartedUpdate[]>;
};
