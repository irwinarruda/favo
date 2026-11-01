import type { IFleetRepository } from '@/modules/comb/app/repositories/IFleetRepository';
import type { IDirectoryRepository } from '@/modules/directories/app/repositories/IDirectoryRepository';
import type { IMachineRepository } from '@/modules/machines/app/repositories/IMachineRepository';
import type { IDesktopRepository } from '@/modules/sessions/app/repositories/IDesktopRepository';
import type { ITerminalRepository } from '@/modules/sessions/app/repositories/ITerminalRepository';
import type { IThemeRepository } from '@/modules/themes/app/repositories/IThemeRepository';
import type { IClipboardGateway } from '@/shared/app/gateways/IClipboardGateway';
import type { ITerminalGateway } from '@/shared/app/gateways/ITerminalGateway';

export interface InjectableItems {
  IFleetRepository: IFleetRepository;
  IMachineRepository: IMachineRepository;
  ITerminalRepository: ITerminalRepository;
  IDesktopRepository: IDesktopRepository;
  IThemeRepository: IThemeRepository;
  IDirectoryRepository: IDirectoryRepository;
  IClipboardGateway: IClipboardGateway;
  ITerminalGateway: ITerminalGateway;
}

export function createContainer() {
  const items = new Map<keyof InjectableItems, unknown>();
  return {
    register<K extends keyof InjectableItems>(key: K, value: InjectableItems[K]) {
      items.set(key, value);
    },
    get<K extends keyof InjectableItems>(key: K) {
      const item = items.get(key);
      if (item === undefined) {
        throw new Error(`No registration found for "${String(key)}".`);
      }
      return item as InjectableItems[K];
    },
  };
}
