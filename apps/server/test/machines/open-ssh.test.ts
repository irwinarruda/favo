import { describe, expect, it } from 'bun:test';
import { OpenSsh } from '@/modules/machines/gateways/open.ssh';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';

function endOfOptionsBefore(args: string[], value: string) {
  return args.indexOf('--') === args.indexOf(value) - 1 && args.indexOf('--') >= 0;
}

describe('calling ssh', () => {
  it('ends the options before the target of a command', async () => {
    const processes = new ScriptedProcessRunner();
    await new OpenSsh(processes).exec('bee@box', 'uname -sm');
    expect(processes.calls[0]?.command).toBe('ssh');
    expect(endOfOptionsBefore(processes.calls[0]!.args, 'bee@box')).toBe(true);
    expect(processes.calls[0]?.args.at(-1)).toBe('uname -sm');
  });
  it('ends the options before the target of a long connection', () => {
    const processes = new ScriptedProcessRunner();
    new OpenSsh(processes).open('bee@box', 'favo serve --stdio');
    expect(endOfOptionsBefore(processes.calls[0]!.args, 'bee@box')).toBe(true);
  });
  it('ends the options before both paths of an upload', async () => {
    const processes = new ScriptedProcessRunner();
    await new OpenSsh(processes).upload('bee@box', '/assets/favo', '.favo/bin/favo.new');
    expect(processes.calls[0]?.command).toBe('scp');
    expect(processes.calls[0]?.args.slice(-3)).toEqual(['--', '/assets/favo', 'bee@box:.favo/bin/favo.new']);
  });
});
