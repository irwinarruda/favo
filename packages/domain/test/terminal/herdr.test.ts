import { describe, expect, it } from 'bun:test';
import { ProviderId } from '#domain/providers/provider';
import {
  herdrAgentOf,
  herdrPaneOf,
  herdrReleaseStep,
  herdrReportArguments,
  herdrResumeCommand,
  herdrSequenceOf,
  hookReportArguments,
} from '#domain/terminal/herdr';

const InHerdr = { HERDR_ENV: '1', HERDR_BIN_PATH: '/bin/herdr', HERDR_PANE_ID: 'w1:p1' };

describe('a Herdr pane', () => {
  it('needs every variable Herdr sets', () => {
    expect(herdrPaneOf(InHerdr)).toEqual({ binary: '/bin/herdr', paneId: 'w1:p1' });
    expect(herdrPaneOf({ ...InHerdr, HERDR_ENV: '0' })).toBeUndefined();
    expect(herdrPaneOf({ ...InHerdr, HERDR_PANE_ID: undefined })).toBeUndefined();
    expect(herdrPaneOf({})).toBeUndefined();
  });
});

describe('who reports to Herdr', () => {
  it('is Claude Code and Codex on a cell', () => {
    expect(herdrAgentOf('work', ProviderId.claude)).toBe('claude');
    expect(herdrAgentOf('work', ProviderId.codex)).toBe('codex');
  });
  it('is never a personal seat, which Herdr already restores', () => {
    expect(herdrAgentOf('personal', ProviderId.claude)).toBeUndefined();
  });
  it('is not OpenCode or Antigravity, whose Herdr hooks hold the pane', () => {
    expect(herdrAgentOf('work', ProviderId.opencode)).toBeUndefined();
    expect(herdrAgentOf('work', ProviderId.antigravity)).toBeUndefined();
  });
});

describe('the report', () => {
  it('sends the command that brings this thread back', () => {
    const resume = herdrResumeCommand('work', ProviderId.claude, 'abc');
    expect(resume).toEqual(['favo', 'resume', 'work', 'claude', 'abc']);
    const report = { agent: 'claude', threadId: 'abc', resume, seq: 5 };
    expect(herdrReportArguments({ binary: '/bin/herdr', paneId: 'w1:p1' }, report)).toEqual([
      'pane',
      'report-agent-session',
      'w1:p1',
      '--source',
      'favo',
      '--agent',
      'claude',
      '--agent-session-id',
      'abc',
      '--seq',
      '5',
      '--',
      'favo',
      'resume',
      'work',
      'claude',
      'abc',
    ]);
  });
  it('uses a number that always grows', () => {
    expect(herdrSequenceOf(2)).toBeGreaterThan(herdrSequenceOf(1));
  });
  it('can be retried by favo itself', () => {
    expect(hookReportArguments(ProviderId.antigravity, 'abc')).toEqual(['hook', 'agy', '--report', 'abc']);
  });
});

describe('releasing the pane', () => {
  it('happens after the provider exits, stamped when it runs', () => {
    expect(herdrReleaseStep(InHerdr, 'work', ProviderId.claude)).toEqual({
      command: '/bin/herdr',
      args: ['pane', 'release-agent', 'w1:p1', '--source', 'favo', '--agent', 'claude'],
      stampFlag: '--seq',
    });
  });
  it('needs a pane and a seat that reported', () => {
    expect(herdrReleaseStep({}, 'work', ProviderId.claude)).toBeUndefined();
    expect(herdrReleaseStep(InHerdr, 'personal', ProviderId.claude)).toBeUndefined();
    expect(herdrReleaseStep(InHerdr, 'work', ProviderId.opencode)).toBeUndefined();
  });
});
