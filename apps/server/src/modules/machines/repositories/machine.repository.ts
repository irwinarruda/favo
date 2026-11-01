import { assertMachineTarget, Machine } from '@favo/domain/machines/machine';
import { z } from 'zod';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const MachinesFile = z.object({ machines: z.array(Machine) });

export class MachineRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async list() {
    const text = await this.fileSystem.readText(this.paths.machinesFile);
    if (text === undefined) return [];
    const { machines } = MachinesFile.parse(JSON.parse(text));
    for (const { id, target } of machines) {
      assertMachineTarget(target ?? '', `The target of "${id}" in ${this.paths.machinesFile}`);
    }
    return machines;
  }

  async add(machine: Machine) {
    await this.save([...(await this.list()), machine]);
  }

  async remove(id: string) {
    await this.save((await this.list()).filter((machine) => machine.id !== id));
  }

  private async save(machines: Machine[]) {
    await this.fileSystem.writePrivateText(this.paths.machinesFile, `${JSON.stringify({ machines }, undefined, 2)}\n`);
  }
}
