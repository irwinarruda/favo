import { AppLoginState, DesktopAppSpecs, DesktopLogin, DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { LocalMachineId } from '@favo/domain/machines/machine';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ownValue } from '@favo/domain/shared/own-value';
import { mockDb } from '@/__tests__/db';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IDesktopRepository } from '@/modules/sessions/app/repositories/IDesktopRepository';

export class TestDesktopRepository implements IDesktopRepository {
  async getApps(machineId: string) {
    const failure = ownValue(mockDb.desktopAppFailures, machineId);
    if (failure) throw failure;
    return ownValue(mockDb.desktopApps, machineId) ?? [];
  }

  async open(seat: Seat, canClose: boolean) {
    const app = ownValue(mockDb.desktopApps, LocalMachineId)?.find(({ provider }) => provider === seat.provider);
    if (!app) throw new DomainError(DomainErrorCode.desktopAppMissing, `${seat.label} has no desktop app here.`);
    if (!app.canOpen) throw new DomainError(DomainErrorCode.desktopAppFailed, `favo cannot open ${app.label} here.`);
    if (mockDb.desktopFailure) throw mockDb.desktopFailure;
    const isRunning = mockDb.runningDesktopApps.includes(seat.provider);
    if (isRunning && !canClose) return { opening: DesktopOpening.stillOpen, label: app.label };
    mockDb.runningDesktopApps = [...mockDb.runningDesktopApps.filter((name) => name !== seat.provider), seat.provider];
    mockDb.desktopOpenings.push(seat.key);
    return { opening: DesktopOpening.opened, label: app.label };
  }

  async getLogin(seat: Seat) {
    const spec = DesktopAppSpecs[seat.provider];
    if (spec?.login !== DesktopLogin.separate) {
      throw new DomainError(DomainErrorCode.desktopAppMissing, `${seat.label} has no app with a login of its own.`);
    }
    const accounts = mockDb.accounts[seat.machineId] ?? [];
    if (!accounts.some(({ name }) => name === seat.account)) {
      throw new DomainError(DomainErrorCode.accountNotFound, `No account named "${seat.account}".`);
    }
    mockDb.appLoginReads.push(seat.key);
    return mockDb.appLogins[seat.key] ?? { login: AppLoginState.signedOut, isOtherAccount: false };
  }
}
