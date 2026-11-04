import type { ProviderVersionView } from '@favo/contracts/rpc/views';

export type IProviderCliRepository = {
  readMachine(machineId: string): Promise<ProviderVersionView[]>;
};
