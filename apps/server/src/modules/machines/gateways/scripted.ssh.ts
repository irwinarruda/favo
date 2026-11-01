import { Ssh } from '@/modules/machines/gateways/ssh';
import type { PipedProcess, ProcessResult } from '@/modules/system/gateways/process-runner';

export class ScriptedSsh extends Ssh {
  readonly commands: string[] = [];
  readonly uploads: { target: string; localPath: string; remotePath: string }[] = [];
  private readonly replies = new Map<string, Partial<ProcessResult>>();
  unreachable = new Set<string>();

  reply(command: string, reply: Partial<ProcessResult>) {
    this.replies.set(command, reply);
  }

  async exec(target: string, command: string) {
    this.commands.push(command);
    if (this.unreachable.has(target)) return { code: 255, stdout: '', stderr: 'ssh: connect to host: timed out' };
    const reply = this.replies.get(command);
    return { code: reply?.code ?? 0, stdout: reply?.stdout ?? '', stderr: reply?.stderr ?? '' };
  }

  open(): PipedProcess {
    throw new Error('ScriptedSsh does not open pipes; use LoopbackRemoteBackends.');
  }

  async upload(target: string, localPath: string, remotePath: string) {
    this.uploads.push({ target, localPath, remotePath });
    return { code: 0, stdout: '', stderr: '' };
  }
}
