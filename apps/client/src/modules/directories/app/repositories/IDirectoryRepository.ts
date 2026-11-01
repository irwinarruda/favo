import type { DirectoryListing } from '@favo/contracts/rpc/directories/list-directories';

export type IDirectoryRepository = {
  listDirectories(machineId: string, input: string): Promise<DirectoryListing>;
};
