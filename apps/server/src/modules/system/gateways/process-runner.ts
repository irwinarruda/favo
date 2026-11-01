export type ProcessRequest = {
  command: string;
  args: string[];
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  stdinFile?: string;
};

export type ProcessResult = { code: number; stdout: string; stderr: string };

export type PipedProcess = {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  exited: Promise<{ code: number; stderr: string; failure?: string }>;
  kill(): void;
};

export abstract class ProcessRunner {
  abstract run(request: ProcessRequest): Promise<ProcessResult>;
  abstract open(request: ProcessRequest): PipedProcess;
  abstract detach(request: ProcessRequest): boolean;
  abstract which(command: string, path: string): string | undefined;
}
