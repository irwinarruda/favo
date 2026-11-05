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
    const environment = isolationEnvironment(Providers.antigravity, '/a/antigravity');
    expect(environment.HOME).toBe('/a/antigravity');
    expect(environment.USERPROFILE).toBe('/a/antigravity');
  });
  it('sets WSL_INTEROP for Antigravity, so agy keeps the login in the cell instead of the one keychain entry', () => {
    expect(isolationEnvironment(Providers.antigravity, '/a/antigravity').WSL_INTEROP).toBe('favo');
    expect(Object.keys(isolationEnvironment(Providers.antigravity, '/a/antigravity'))[0]).toBe('HOME');
  });
  it('keeps a real WSL_INTEROP, which Windows programs need inside WSL', () => {
    const inherited = { WSL_INTEROP: '/run/WSL/12_interop' };
    expect(isolationEnvironment(Providers.antigravity, '/a', inherited).WSL_INTEROP).toBe('/run/WSL/12_interop');
  });
  it('adds nothing for the providers whose own variable already keeps the login in the cell', () => {
    for (const spec of [Providers.claude, Providers.codex, Providers.opencode]) {
      expect(isolationEnvironment(spec, '/a').WSL_INTEROP).toBeUndefined();
    }
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
  it('never links a file that agy saves by renaming a new copy over it, which would break the link', () => {
    for (const name of ['settings.json', 'keybindings.json']) {
      expect(Providers.antigravity.shared).not.toContain(`.gemini/antigravity-cli/${name}`);
      expect(Providers.antigravity.private).toContain(`.gemini/antigravity-cli/${name}`);
    }
  });
  it('never shares a credential or a thread', () => {
    const secrets = ['auth.json', '.claude.json', 'projects', 'sessions', 'history.jsonl', 'memories'];
    for (const id of ProviderOrder) {
      for (const secret of secrets) expect(Providers[id].shared).not.toContain(secret);
    }
  });
});
