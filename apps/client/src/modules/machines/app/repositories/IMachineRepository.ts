import type { DiscoveredMachine } from '@favo/contracts/rpc/machines/discover-machines';

export type IMachineRepository = {
  discover(): Promise<DiscoveredMachine[]>;
  add(target: string): Promise<{ id: string; name: string }>;
  remove(id: string): Promise<void>;
  install(id: string): Promise<string>;
};
