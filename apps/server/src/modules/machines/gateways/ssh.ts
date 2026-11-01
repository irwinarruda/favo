import type { PipedProcess, ProcessResult } from '@/modules/system/gateways/process-runner';

export abstract class Ssh {
  abstract exec(target: string, command: string, timeoutMs?: number): Promise<ProcessResult>;
  abstract open(target: string, command: string): PipedProcess;
  abstract upload(target: string, localPath: string, remotePath: string): Promise<ProcessResult>;
}
