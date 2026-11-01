import { describe, expect, it } from 'bun:test';
import { herdrReportArguments } from '@favo/domain/terminal/herdr';
import { CliHerdr } from '@/modules/herdr/gateways/cli.herdr';
import { HerdrAnswer } from '@/modules/herdr/gateways/herdr';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';

const Pane = { binary: '/usr/bin/herdr', paneId: 'p1' };
const Report = { agent: 'claude', threadId: 'abc', resume: ['favo', 'resume', 'work', 'claude', 'abc'], seq: 7 };
const Line = [Pane.binary, ...herdrReportArguments(Pane, Report)].join(' ');

async function answerTo(reply: { code: number; stdout?: string; stderr?: string }) {
  const processes = new ScriptedProcessRunner();
  processes.reply(Line, reply);
  return { answer: await new CliHerdr(processes).report(Pane, Report), processes };
}

describe('telling Herdr about a thread', () => {
  it('counts a report Herdr took as accepted', async () => {
    const { answer, processes } = await answerTo({ code: 0 });
    expect(answer).toBe(HerdrAnswer.accepted);
    expect(processes.calls[0]?.args).toContain('--agent-session-id');
  });
  it('waits when Herdr has not seen the agent yet', async () => {
    const { answer } = await answerTo({ code: 1, stderr: 'error: resume_not_accepted: no agent detected' });
    expect(answer).toBe(HerdrAnswer.tooEarly);
  });
  it('gives up on any other refusal', async () => {
    const { answer } = await answerTo({ code: 1, stderr: 'error: unknown pane p1' });
    expect(answer).toBe(HerdrAnswer.failed);
  });
});
