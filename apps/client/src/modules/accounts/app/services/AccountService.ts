import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type AccountService = {
  isAddAccountOpen: boolean;
  isAddingAccount: boolean;
  addAccountError?: string;
  isRenameAccountOpen: boolean;
  isRenamingAccount: boolean;
  renameAccountError?: string;
  openAddAccount(): void;
  closeAddAccount(): void;
  submitAddAccount(name: string): Promise<void>;
  openRenameAccount(): void;
  closeRenameAccount(): void;
  submitRenameAccount(name: string): Promise<void>;
  removeSelectedAccount(): Promise<void>;
};

export const createAccountService: ServiceCreator<AccountService> = (set, get) => ({
  isAddAccountOpen: false,
  isAddingAccount: false,
  addAccountError: undefined,
  isRenameAccountOpen: false,
  isRenamingAccount: false,
  renameAccountError: undefined,
  openAddAccount() {
    const { selectedMachine } = get();
    if (selectedMachine?.isOnline) set({ isAddAccountOpen: true, addAccountError: undefined });
  },
  closeAddAccount() {
    set({ isAddAccountOpen: false, addAccountError: undefined });
  },
  async submitAddAccount(name) {
    try {
      const { selectedMachine, refreshMachine, closeAddAccount, showToast } = get();
      if (!selectedMachine) return;
      set({ isAddingAccount: true, addAccountError: undefined });
      const fleetRepository = container.get('IFleetRepository');
      await fleetRepository.createAccount(selectedMachine.id, name);
      await refreshMachine(selectedMachine.id);
      closeAddAccount();
      showToast(`A new cell for ${name} on ${selectedMachine.name}.`);
    } catch (error) {
      set({ addAccountError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isAddingAccount: false });
    }
  },
  openRenameAccount() {
    if (get().selectedAccount) set({ isRenameAccountOpen: true, renameAccountError: undefined });
  },
  closeRenameAccount() {
    set({ isRenameAccountOpen: false, renameAccountError: undefined });
  },
  async submitRenameAccount(name) {
    try {
      const { selectedAccount, refreshMachine, closeRenameAccount, showToast } = get();
      if (!selectedAccount) return;
      set({ isRenamingAccount: true, renameAccountError: undefined });
      const fleetRepository = container.get('IFleetRepository');
      await fleetRepository.renameAccount(selectedAccount, name);
      await refreshMachine(selectedAccount.machineId);
      closeRenameAccount();
      showToast(`${selectedAccount.displayName} is now ${name}.`);
    } catch (error) {
      set({ renameAccountError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isRenamingAccount: false });
    }
  },
  async removeSelectedAccount() {
    const { selectedAccount, refreshMachine, showToast } = get();
    if (!selectedAccount) return;
    if (selectedAccount.isPersonal) {
      showToast(`${selectedAccount.displayName} is the base cell, so it stays.`, ToastKind.error);
      return;
    }
    const fleetRepository = container.get('IFleetRepository');
    const trashedTo = await fleetRepository.removeAccount(selectedAccount);
    await refreshMachine(selectedAccount.machineId);
    showToast(`${selectedAccount.displayName} moved to ${trashedTo}. Its logins stay there until you delete it.`);
  },
});
