import { listDirectories } from '@favo/contracts/rpc/directories/list-directories';
import type { DirectoriesService } from '@/modules/directories/services/directories.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerDirectoriesController(router: RpcRouter, directories: DirectoriesService) {
  router.handle(listDirectories, ({ input }) => directories.list(input));
}
