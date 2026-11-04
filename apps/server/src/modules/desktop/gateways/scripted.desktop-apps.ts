import type { DesktopAppSpec, DesktopLaunch } from '@favo/domain/desktop/desktop-app';
import type { ProviderId } from '@favo/domain/providers/provider';
import { DesktopApps, type InstalledDesktopApp } from '@/modules/desktop/gateways/desktop-apps';

export class ScriptedDesktopApps extends DesktopApps {
  readonly opened: { provider: ProviderId; launch: DesktopLaunch }[] = [];
  readonly quitCalls: ProviderId[] = [];
  private readonly installed = new Set<ProviderId>();
  private readonly running = new Set<ProviderId>();
  private readonly stuck = new Set<ProviderId>();

  constructor(private readonly configHome: string) {
    super();
  }

  install(provider: ProviderId) {
    this.installed.add(provider);
  }

  run(provider: ProviderId) {
    this.running.add(provider);
  }

  refuseToQuit(provider: ProviderId) {
    this.stuck.add(provider);
  }

  async find(spec: DesktopAppSpec) {
    if (!this.installed.has(spec.provider)) return undefined;
    return { spec, launcher: spec.linux.executable, executables: spec.linux.processNames };
  }

  async isRunning({ spec }: InstalledDesktopApp) {
    return this.running.has(spec.provider);
  }

  async quit({ spec }: InstalledDesktopApp) {
    this.quitCalls.push(spec.provider);
    if (this.stuck.has(spec.provider)) return false;
    this.running.delete(spec.provider);
    return true;
  }

  async open({ spec }: InstalledDesktopApp, launch: DesktopLaunch) {
    this.opened.push({ provider: spec.provider, launch });
    this.running.add(spec.provider);
  }

  defaultProfile({ linux }: DesktopAppSpec) {
    if (!linux.defaultProfile) return undefined;
    return `${this.configHome}/${linux.defaultProfile}`;
  }
}
