import { mockDb } from '@/__tests__/db';
import { TestFleetRepository } from '@/modules/comb/app/repositories/TestFleetRepository';
import { TestDirectoryRepository } from '@/modules/directories/app/repositories/TestDirectoryRepository';
import { TestMachineRepository } from '@/modules/machines/app/repositories/TestMachineRepository';
import { TestDesktopRepository } from '@/modules/sessions/app/repositories/TestDesktopRepository';
import { TestTerminalRepository } from '@/modules/sessions/app/repositories/TestTerminalRepository';
import { TestThemeRepository } from '@/modules/themes/app/repositories/TestThemeRepository';
import { TestThreadRepository } from '@/modules/threads/app/repositories/TestThreadRepository';
import { TestProviderCliRepository } from '@/modules/updates/app/repositories/TestProviderCliRepository';
import { TestUsageRepository } from '@/modules/usage/app/repositories/TestUsageRepository';
import { TestClipboardGateway } from '@/shared/app/gateways/TestClipboardGateway';
import { TestTerminalGateway } from '@/shared/app/gateways/TestTerminalGateway';
import { container } from '@/shared/container';

export function bootstrapDevContainer() {
  mockDb.reset();
  container.register('IFleetRepository', new TestFleetRepository());
  container.register('IMachineRepository', new TestMachineRepository());
  container.register('ITerminalRepository', new TestTerminalRepository());
  container.register('IDesktopRepository', new TestDesktopRepository());
  container.register('IThemeRepository', new TestThemeRepository());
  container.register('IThreadRepository', new TestThreadRepository());
  container.register('IUsageRepository', new TestUsageRepository());
  container.register('IProviderCliRepository', new TestProviderCliRepository());
  container.register('IDirectoryRepository', new TestDirectoryRepository());
  container.register('IClipboardGateway', new TestClipboardGateway());
  container.register('ITerminalGateway', new TestTerminalGateway());
}
