import {
  completeDirectoryInput,
  joinPath,
  matchesDirectory,
  parseDirectoryInput,
} from '@favo/domain/directories/directory-input';
import { mockDb } from '@/__tests__/db';
import type { IDirectoryRepository } from '@/modules/directories/app/repositories/IDirectoryRepository';

export class TestDirectoryRepository implements IDirectoryRepository {
  async listDirectories(machineId: string, input: string) {
    const home = machineId === 'local' ? '/Users/bee' : '/home/bee';
    const tree = mockDb.directoryTrees[machineId] ?? {};
    const { parent, prefix, full } = parseDirectoryInput(input, { home, base: home });
    const entries = (tree[parent] ?? [])
      .filter((name) => matchesDirectory(name, prefix))
      .map((name) => ({
        name,
        path: joinPath(parent, name),
        completion: completeDirectoryInput(input, name, '/'),
      }));
    return { directory: full, exists: tree[full] !== undefined, entries };
  }
}
