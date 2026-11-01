import { describe, expect, it } from 'bun:test';
import {
  findProvider,
  isolationEnvironment,
  ProviderOrder,
  Providers,
  requireProvider,
} from '#domain/providers/provider';

describe('providers', () => {
  it('moves Claude Code with its own variable', () => {
    expect(isolationEnvironment(Providers.claude, '/a/claude')).toEqual({ CLAUDE_CONFIG_DIR: '/a/claude' });
  });
  it('moves Codex with its own variable', () => {
    expect(isolationEnvironment(Providers.codex, '/a/codex')).toEqual({ CODEX_HOME: '/a/codex' });
  });
  it('gives Antigravity a private home because it only follows HOME', () => {
    expect(isolationEnvironment(Providers.antigravity, '/a/antigravity')).toEqual({
      HOME: '/a/antigravity',
      USERPROFILE: '/a/antigravity',
    });
  });
  it('moves OpenCode data and state and leaves its config alone', () => {
    const environment = isolationEnvironment(Providers.opencode, '/a/opencode');
    expect(environment).toEqual({ XDG_DATA_HOME: '/a/opencode', XDG_STATE_HOME: '/a/opencode/state' });
    expect(Object.keys(environment)).not.toContain('XDG_CONFIG_HOME');
  });
  it('finds a provider by its command name', () => {
    expect(findProvider('agy')?.id).toBe('antigravity');
    expect(findProvider('antigravity')?.id).toBe('antigravity');
    expect(findProvider('gemini')).toBeUndefined();
  });
  it('refuses an unknown provider', () => {
    expect(() => requireProvider('gemini')).toThrow('Unknown provider');
  });
  it('never shares a credential or a thread', () => {
    const secrets = ['auth.json', '.claude.json', 'projects', 'sessions', 'history.jsonl', 'memories'];
    for (const id of ProviderOrder) {
      for (const secret of secrets) expect(Providers[id].shared).not.toContain(secret);
    }
  });
});
