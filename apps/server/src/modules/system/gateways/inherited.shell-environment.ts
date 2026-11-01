import { ShellEnvironment } from '@/modules/system/gateways/shell-environment';

export class InheritedShellEnvironment extends ShellEnvironment {
  constructor(private readonly inheritedPath: string) {
    super();
  }

  async path() {
    return this.inheritedPath;
  }
}
