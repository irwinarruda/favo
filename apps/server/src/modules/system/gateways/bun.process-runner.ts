import { mergeEnvironment } from '@favo/domain/shared/environment';
import { spawnCommandOf } from '@favo/domain/terminal/terminal-plan';
import { type PipedProcess, type ProcessRequest, ProcessRunner } from '@/modules/system/gateways/process-runner';
import { MaximumLineBytes, readLines, readTail } from '@/shared/rpc/read-lines';

const MissingCommandCode = 127;
const FailedConnectionCode = 1;
const MaximumStderrBytes = 64 * 1024;

export class BunProcessRunner extends ProcessRunner {
  private readonly openChildren = new Set<Bun.Subprocess>();

  constructor(
    private readonly baseEnv: Record<string, string | undefined>,
    private readonly isCaseInsensitive: boolean
  ) {
    super();
  }

  async run(request: ProcessRequest) {
    try {
      const child = Bun.spawn(spawnCommandOf(request.command, request.args), {
        cwd: request.cwd,
        env: this.environmentOf(request),
        stdin: request.stdinFile ? Bun.file(request.stdinFile) : 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      this.trackOpen(child);
      const timer = request.timeoutMs ? setTimeout(() => child.kill(), request.timeoutMs) : undefined;
      const [stdout, stderr, code] = await Promise.all([
        readTail(child.stdout, MaximumLineBytes),
        readTail(child.stderr, MaximumStderrBytes),
        child.exited,
      ]);
      clearTimeout(timer);
      return { code, stdout, stderr };
    } catch (error) {
      return { code: MissingCommandCode, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
    }
  }

  open(request: ProcessRequest): PipedProcess {
    const child = Bun.spawn(spawnCommandOf(request.command, request.args), {
      cwd: request.cwd,
      env: this.environmentOf(request),
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    this.trackOpen(child);
    const listeners: ((line: string) => void)[] = [];
    const failed = Promise.withResolvers<{ code: number; stderr: string; failure: string }>();
    function failWith(error: unknown) {
      const failure = error instanceof Error ? error.message : String(error);
      child.kill();
      failed.resolve({ code: FailedConnectionCode, stderr: '', failure });
    }
    void readLines(child.stdout, (line) => {
      for (const listener of listeners) listener(line);
    }).catch(failWith);
    const stderr = readTail(child.stderr, MaximumStderrBytes);
    return {
      write(line) {
        void writeLine(child.stdin, line).catch(failWith);
      },
      onLine(listener) {
        listeners.push(listener);
      },
      exited: Promise.race([failed.promise, child.exited.then(async (code) => ({ code, stderr: await stderr }))]),
      kill() {
        child.kill();
      },
    };
  }

  detach(request: ProcessRequest) {
    try {
      const child = Bun.spawn(spawnCommandOf(request.command, request.args), {
        env: this.environmentOf(request),
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        detached: true,
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  killOpen() {
    for (const child of this.openChildren) child.kill();
  }

  which(command: string, path: string) {
    return Bun.which(command, { PATH: path }) ?? undefined;
  }

  isAlive(pid: number) {
    try {
      return process.kill(pid, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  private trackOpen(child: Bun.Subprocess) {
    this.openChildren.add(child);
    void child.exited.then(() => this.openChildren.delete(child));
  }

  private environmentOf(request: ProcessRequest) {
    const { baseEnv, isCaseInsensitive } = this;
    return mergeEnvironment({ base: baseEnv, overrides: request.env, isCaseInsensitive });
  }
}

async function writeLine(input: Bun.FileSink, line: string) {
  await input.write(`${line}\n`);
  await input.flush();
}
