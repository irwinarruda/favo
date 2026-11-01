import type { SeatUsageView } from '@favo/contracts/rpc/views';

export type IUsageRepository = {
  readMachine(machineId: string): Promise<SeatUsageView[]>;
};
