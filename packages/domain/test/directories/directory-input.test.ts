import { describe, expect, it } from 'bun:test';
import {
  completeDirectoryInput,
  matchesDirectory,
  nativePath,
  parentDirectoryInput,
  parseDirectoryInput,
  pathsOverlap,
} from '#domain/directories/directory-input';

const mac = { home: '/Users/bee', base: '/Users/bee/code' };
const windows = { home: 'C:/Users/bee', base: 'C:\\Users\\bee\\code' };

describe('parseDirectoryInput', () => {
  it('expands the home folder and splits what is being typed', () => {
    expect(parseDirectoryInput('~/D', mac)).toEqual({
      parent: '/Users/bee',
      prefix: 'D',
      full: '/Users/bee/D',
    });
  });
  it('lists inside a folder when the input ends with a separator', () => {
    expect(parseDirectoryInput('~/Documents/', mac)).toEqual({
      parent: '/Users/bee/Documents',
      prefix: '',
      full: '/Users/bee/Documents',
    });
  });
  it('treats a bare ~ as the home folder', () => {
    expect(parseDirectoryInput('~', mac).full).toBe('/Users/bee');
  });
  it('starts from the current folder when empty', () => {
    expect(parseDirectoryInput('', mac).full).toBe('/Users/bee/code');
  });
  it('reads a relative path from the current folder', () => {
    expect(parseDirectoryInput('app/sr', mac)).toMatchObject({ parent: '/Users/bee/code/app', prefix: 'sr' });
  });
  it('handles the root', () => {
    expect(parseDirectoryInput('/', mac)).toEqual({ parent: '/', prefix: '', full: '/' });
    expect(parseDirectoryInput('/us', mac)).toEqual({ parent: '/', prefix: 'us', full: '/us' });
  });
  it('reads Windows paths with either slash', () => {
    expect(parseDirectoryInput('C:\\Users\\be', windows)).toEqual({
      parent: 'C:/Users',
      prefix: 'be',
      full: 'C:/Users/be',
    });
    expect(parseDirectoryInput('C:/Users/', windows).full).toBe('C:/Users');
  });
  it('treats a drive as its root', () => {
    expect(parseDirectoryInput('D:', windows)).toEqual({ parent: 'D:/', prefix: '', full: 'D:/' });
    expect(parseDirectoryInput('C:\\', windows)).toEqual({ parent: 'C:/', prefix: '', full: 'C:/' });
    expect(parseDirectoryInput('C:\\Us', windows)).toEqual({ parent: 'C:/', prefix: 'Us', full: 'C:/Us' });
  });
  it('starts from a Windows current folder', () => {
    expect(parseDirectoryInput('', windows).full).toBe('C:/Users/bee/code');
  });
});

describe('matchesDirectory', () => {
  it('matches the start of the name, in any case', () => {
    expect(matchesDirectory('Documents', 'do')).toBe(true);
    expect(matchesDirectory('Documents', 'ment')).toBe(false);
  });
  it('hides dot folders until you type a dot', () => {
    expect(matchesDirectory('.config', '')).toBe(false);
    expect(matchesDirectory('.config', '.c')).toBe(true);
  });
});

describe('completeDirectoryInput', () => {
  it('replaces what is being typed and keeps the way you wrote the rest', () => {
    expect(completeDirectoryInput('~/D', 'Documents', '/')).toBe('~/Documents/');
    expect(completeDirectoryInput('C:\\Users\\b', 'bee', '\\')).toBe('C:\\Users\\bee\\');
  });
  it('goes inside a folder that already ends with a separator', () => {
    expect(completeDirectoryInput('~/Documents/', 'projects', '/')).toBe('~/Documents/projects/');
  });
  it('completes a bare name and a bare ~', () => {
    expect(completeDirectoryInput('co', 'code', '/')).toBe('code/');
    expect(completeDirectoryInput('~', 'code', '/')).toBe('~/code/');
  });
});

describe('parentDirectoryInput', () => {
  it('goes up one folder', () => {
    expect(parentDirectoryInput('~/Documents/projects/')).toBe('~/Documents/');
    expect(parentDirectoryInput('C:\\Users\\bee\\')).toBe('C:\\Users\\');
  });
  it('stays at the top', () => {
    expect(parentDirectoryInput('~/')).toBe('~/');
    expect(parentDirectoryInput('/')).toBe('/');
    expect(parentDirectoryInput('C:\\')).toBe('C:\\');
  });
});

describe('pathsOverlap', () => {
  it('sees the same folder, a folder inside and a folder around', () => {
    expect(pathsOverlap('/home/bee/.claude', '/home/bee/.claude')).toBe(true);
    expect(pathsOverlap('/home/bee/.claude/projects', '/home/bee/.claude')).toBe(true);
    expect(pathsOverlap('/home/bee', '/home/bee/.claude')).toBe(true);
    expect(pathsOverlap('/', '/home/bee/.claude')).toBe(true);
  });
  it('keeps a neighbour with a longer name apart', () => {
    expect(pathsOverlap('/home/bee/.claude-work', '/home/bee/.claude')).toBe(false);
    expect(pathsOverlap('/home/bee/.claude', '/home/bee/.claude-work')).toBe(false);
  });
  it('reads Windows paths and trailing separators', () => {
    expect(pathsOverlap('C:\\Users\\bee\\.claude\\', 'C:/Users/bee/.claude')).toBe(true);
  });
  it('ignores case, because a Windows or macOS folder answers to any', () => {
    expect(pathsOverlap('c:/users/bee/.CLAUDE', 'C:/Users/bee/.claude')).toBe(true);
  });
});

describe('nativePath', () => {
  it('shows a Windows path the Windows way', () => {
    expect(nativePath('C:/Users/bee/.claude', true)).toBe('C:\\Users\\bee\\.claude');
    expect(nativePath('/Users/bee/.claude', false)).toBe('/Users/bee/.claude');
  });
});
