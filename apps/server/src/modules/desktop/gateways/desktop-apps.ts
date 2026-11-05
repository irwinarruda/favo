import type { DesktopAppSpec, DesktopLaunch } from '@favo/domain/desktop/desktop-app';

export type InstalledDesktopApp = {
  spec: DesktopAppSpec;
  launcher: string;
  executables: string[];
};

export abstract class DesktopApps {
  abstract readonly canOpen: boolean;
  abstract find(spec: DesktopAppSpec): Promise<InstalledDesktopApp | undefined>;
  abstract isRunning(app: InstalledDesktopApp): Promise<boolean>;
  abstract quit(app: InstalledDesktopApp): Promise<boolean>;
  abstract open(app: InstalledDesktopApp, launch: DesktopLaunch): Promise<void>;
  abstract defaultProfile(spec: DesktopAppSpec): string | undefined;
}
