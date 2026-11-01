import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import type { IDesktopRepository } from '@/modules/sessions/app/repositories/IDesktopRepository';

export class TestDesktopRepository implements IDesktopRepository {
  async getApps() {
    return mockDb.desktopApps;
  }

  async open(seat: Seat, canClose: boolean) {
    const app = mockDb.desktopApps.find(({ provider }) => provider === seat.provider);
    if (!app) throw new DomainError(DomainErrorCode.desktopAppMissing, `${seat.label} has no desktop app here.`);
    if (mockDb.desktopFailure) throw mockDb.desktopFailure;
    const isRunning = mockDb.runningDesktopApps.includes(seat.provider);
    if (isRunning && !canClose) return { opening: DesktopOpening.stillOpen, label: app.label };
    mockDb.runningDesktopApps = [...mockDb.runningDesktopApps.filter((name) => name !== seat.provider), seat.provider];
    mockDb.desktopOpenings.push(seat.key);
    return { opening: DesktopOpening.opened, label: app.label };
  }
}
