import { rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const RenameAttempts = 10;
const RenameRetryMs = 100;
const BusyRenameCodes = ['EPERM', 'EACCES', 'EBUSY'];

export async function renameOver(from: string, to: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt === RenameAttempts || !BusyRenameCodes.includes(code)) throw error;
      await setTimeout(RenameRetryMs);
    }
  }
}
