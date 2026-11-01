import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [name, ...args] = process.argv.slice(2);
const home = process.env.HOME ?? '';
const isWindows = process.platform === 'win32';
const UsageResetMs = 44.5 * 60_000;

async function claudeUsage() {
  for await (const line of console) {
    const { request, request_id } = JSON.parse(line);
    const answer = (response: unknown) =>
      console.log(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id, response } }));
    if (request.subtype === 'initialize') answer({});
    if (request.subtype !== 'get_usage') continue;
    const isSubscription = process.env.ANTHROPIC_API_KEY === undefined && readdirSync('.').length === 0;
    const resets_at = new Date(Date.now() + UsageResetMs).toISOString().replace('Z', '000+00:00');
    answer({
      rate_limits_available: isSubscription,
      rate_limits: { five_hour: { utilization: 32, resets_at }, cinder_cove: null },
    });
  }
}

function claude() {
  const folder = process.env.CLAUDE_CONFIG_DIR ?? `${home}/.claude`;
  if (args[0] === 'auth' && args[1] === 'status') {
    if (!existsSync(`${folder}/identity`)) {
      console.log('{"loggedIn":false}');
      process.exit(1);
    }
    const email = readFileSync(`${folder}/identity`, 'utf8').trim();
    console.log(JSON.stringify({ loggedIn: true, email, subscriptionType: 'max' }));
    return;
  }
  if (args.includes('--input-format')) return claudeUsage();
  if (args[0] === 'auth' && args[1] === 'login') {
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/identity`, 'signed-in@bee.dev');
    console.log(`fake claude signed in at ${folder}`);
    return;
  }
  console.log(
    `fake claude cwd=${process.cwd().replaceAll('\\', '/')} home=${folder} args=${args.join(' ')} tmux=${process.env.TMUX ?? 'none'} term=${process.env.TERM ?? 'none'}`
  );
  process.exit(3);
}

async function codex() {
  const folder = process.env.CODEX_HOME ?? `${home}/.codex`;
  if (args[0] !== 'app-server') {
    console.log(`fake codex home=${folder} args=${args.join(' ')}`);
    return;
  }
  for await (const line of console) {
    if (line.includes('"id":1')) console.log('{"id":1,"result":{}}');
    if (line.includes('account/read')) {
      const hasIdentity = existsSync(`${folder}/identity`);
      const account = hasIdentity
        ? { type: 'chatgpt', email: readFileSync(`${folder}/identity`, 'utf8').trim(), planType: 'plus' }
        : null;
      console.log(JSON.stringify({ id: 2, result: { account } }));
    }
    if (line.includes('account/rateLimits/read')) {
      const resetsAt = Math.floor((Date.now() + UsageResetMs) / 1000);
      const primary = { usedPercent: 10, windowDurationMins: 300, resetsAt };
      console.log(JSON.stringify({ id: 2, result: { rateLimits: { limitId: 'codex', primary } } }));
    }
  }
}

function agy() {
  if (args[0] === 'models') {
    if (existsSync(`${home}/.gemini/antigravity-cli/signed-in`)) {
      console.log('gemini-3');
      return;
    }
    console.error('Error: Please sign in to view available models.');
    process.exit(1);
  }
  const gitconfig = existsSync(`${home}/.gitconfig`) ? readFileSync(`${home}/.gitconfig`, 'utf8') : '';
  console.log(`fake agy home=${home} gitconfig=${gitconfig}`);
}

function opencode() {
  const data = process.env.XDG_DATA_HOME ?? `${home}/.local/share`;
  if (args[0] === '--help') {
    console.log('--standalone  Run with a private server');
    return;
  }
  if (args[0] === 'auth' && args[1] === 'list') {
    const hasLogin = existsSync(`${data}/opencode/auth.json`);
    console.log(hasLogin ? 'OpenAI  OAuth  stored' : 'No authenticated integrations');
    return;
  }
  console.log(`fake opencode data=${data} args=${args.join(' ')}`);
}

function ssh() {
  appendFileSync(process.env.FAKE_SSH_LOG!, `${args.join(' ')}\n`);
  const rest = [...args];
  while (rest[0] === '-T' || rest[0] === '-t' || rest[0] === '-o') rest.splice(0, rest[0] === '-o' ? 2 : 1);
  if (rest[0] === '--') rest.shift();
  const [target, ...command] = rest;
  if (target === 'down@host') {
    console.error('ssh: connect to host port 22: Connection refused');
    process.exit(255);
  }
  const { FAVO_HOME: _favoHome, ...env } = process.env;
  const result = spawnSync('bash', ['-c', command.join(' ')], {
    cwd: process.env.FAKE_REMOTE_HOME,
    env: { ...env, HOME: process.env.FAKE_REMOTE_HOME, FAVO_HOSTNAME: 'fake-remote' },
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

function scp() {
  appendFileSync(process.env.FAKE_SSH_LOG!, `scp ${args.join(' ')}\n`);
  const [source, destination] = args.slice(-2);
  if (destination!.startsWith('down@host')) process.exit(1);
  copyFileSync(source!, `${process.env.FAKE_REMOTE_HOME}/${destination!.split(':').at(-1)}`);
}

const fakes: Record<string, () => unknown> = { claude, codex, agy, opencode, ssh, scp };
await fakes[name!]!();
if (isWindows) process.exitCode ??= 0;
