import type { RpcRequest } from '@favo/contracts/rpc/envelope';
import { Ssh } from '@/modules/machines/gateways/ssh';

type Exit = { code: number; stderr: string; failure?: string };
type Reply = (request: RpcRequest) => string | undefined;

export class ReplyingSsh extends Ssh {
  opened = 0;
  killed = 0;
  private finish: (exit: Exit) => void = () => {};

  constructor(private readonly reply: Reply) {
    super();
  }

  async exec() {
    return { code: 0, stdout: '', stderr: '' };
  }

  async upload() {
    return { code: 0, stdout: '', stderr: '' };
  }

  exit(exit: Exit) {
    this.finish(exit);
  }

  open() {
    this.opened++;
    const listeners: ((line: string) => void)[] = [];
    const exited = new Promise<Exit>((resolve) => {
      this.finish = resolve;
    });
    return {
      write: (line: string) => {
        const answer = this.reply(JSON.parse(line));
        if (answer === undefined) return;
        queueMicrotask(() => {
          for (const listener of listeners) listener(answer);
        });
      },
      onLine: (listener: (line: string) => void) => {
        listeners.push(listener);
      },
      exited,
      kill: () => {
        this.killed++;
      },
    };
  }
}
