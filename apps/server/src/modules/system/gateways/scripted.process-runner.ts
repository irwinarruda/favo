import {
  type PipedProcess,
  type ProcessRequest,
  type ProcessResult,
  ProcessRunner,
} from '@/modules/system/gateways/process-runner';

type Reply = Partial<ProcessResult>;

export class ScriptedProcessRunner extends ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly replies = new Map<string, Reply>();
  private readonly conversations = new Map<string, string[]>();
  private readonly installed = new Map<string, string>();

  install(command: string, path = `/usr/bin/${command}`) {
    this.installed.set(command, path);
  }

  reply(commandLine: string, reply: Reply) {
    this.replies.set(commandLine, reply);
  }

  converse(commandLine: string, lines: string[]) {
    this.conversations.set(commandLine, lines);
  }

  async run(request: ProcessRequest) {
    this.calls.push(request);
    const reply = this.replies.get(lineOf(request));
    return { code: reply?.code ?? 0, stdout: reply?.stdout ?? '', stderr: reply?.stderr ?? '' };
  }

  open(request: ProcessRequest): PipedProcess {
    this.calls.push(request);
    const lines = this.conversations.get(lineOf(request));
    const listeners: ((line: string) => void)[] = [];
    return {
      write() {
        for (const line of lines ?? []) for (const listener of listeners) listener(line);
      },
      onLine(listener) {
        listeners.push(listener);
      },
      exited: lines ? new Promise(() => {}) : Promise.resolve({ code: 127, stderr: 'not found' }),
      kill() {},
    };
  }

  which(command: string) {
    return this.installed.get(command);
  }
}

function lineOf(request: ProcessRequest) {
  return [request.command, ...request.args].join(' ');
}
