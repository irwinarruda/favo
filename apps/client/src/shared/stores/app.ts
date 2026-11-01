import { create, type StateCreator } from 'zustand';
import { composeServices, computed } from '@/libs/zustand';
import { type AccountService, createAccountService } from '@/modules/accounts/app/services/AccountService';
import { createFleetService, type FleetService } from '@/modules/comb/app/services/FleetService';
import { createSelectionService, type SelectionService } from '@/modules/comb/app/services/SelectionService';
import { createDirectoryService, type DirectoryService } from '@/modules/directories/app/services/DirectoryService';
import { createMachineService, type MachineService } from '@/modules/machines/app/services/MachineService';
import { createSessionService, type SessionService } from '@/modules/sessions/app/services/SessionService';
import { createThemeService, type ThemeService } from '@/modules/themes/app/services/ThemeService';
import { createToastService, type ToastService } from '@/shared/app/services/ToastService';

export type AppService = ThemeService &
  DirectoryService &
  FleetService &
  SelectionService &
  SessionService &
  AccountService &
  MachineService &
  ToastService;

export type ServiceCreator<T> = StateCreator<AppService, [], [], T>;

export const useApp = create<AppService>()(
  computed((...args) =>
    composeServices(
      createThemeService(...args),
      createFleetService(...args),
      createSelectionService(...args),
      createDirectoryService(...args),
      createSessionService(...args),
      createAccountService(...args),
      createMachineService(...args),
      createToastService(...args)
    )
  )
);
