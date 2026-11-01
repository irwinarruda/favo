import type { IClipboardGateway } from '@/shared/app/gateways/IClipboardGateway';

const ClipboardCommands = [['pbcopy'], ['clip.exe'], ['wl-copy'], ['xclip', '-selection', 'clipboard']];

type Osc52Terminal = { copyToClipboardOSC52(text: string): boolean };

export class SystemClipboardGateway implements IClipboardGateway {
  constructor(
    private readonly terminal: Osc52Terminal,
    private readonly isRemoteSession: boolean
  ) {}

  async copy(text: string) {
    if (this.isRemoteSession) return this.terminal.copyToClipboardOSC52(text);
    for (const command of ClipboardCommands) {
      if (!Bun.which(command[0]!)) continue;
      const child = Bun.spawn(command, { stdin: new TextEncoder().encode(text), stdout: 'ignore', stderr: 'ignore' });
      if ((await child.exited) === 0) return true;
    }
    return this.terminal.copyToClipboardOSC52(text);
  }
}
