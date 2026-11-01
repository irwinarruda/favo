import { describe, expect, it } from 'bun:test';
import { BuiltInThemes } from '#domain/themes/built-in-themes';
import { CustomThemeFile, DefaultThemeId, resolveCustomTheme, Theme } from '#domain/themes/theme';

describe('built-in themes', () => {
  it('are all valid, with unique ids', () => {
    for (const theme of BuiltInThemes) expect(Theme.safeParse(theme).success).toBe(true);
    expect(new Set(BuiltInThemes.map((theme) => theme.id)).size).toBe(BuiltInThemes.length);
  });
  it('start with the default', () => {
    expect(BuiltInThemes[0]?.id).toBe(DefaultThemeId);
  });
  it('offer a light theme', () => {
    expect(BuiltInThemes.some((theme) => theme.appearance === 'light')).toBe(true);
  });
  it('keep text readable on the background', () => {
    for (const { id, colors } of BuiltInThemes) {
      expect([id, contrast(colors.text, colors.background) >= 4.5]).toEqual([id, true]);
      expect([id, contrast(colors.accent, colors.background) >= 3]).toEqual([id, true]);
    }
  });
});

describe('custom themes', () => {
  it('fills what a file leaves out from the default theme', () => {
    const theme = resolveCustomTheme('mine', { colors: { accent: '#112233' } }, BuiltInThemes);
    expect(theme.colors.accent).toBe('#112233');
    expect(theme.colors.background).toBe(BuiltInThemes[0]!.colors.background);
    expect(theme).toMatchObject({ id: 'mine', name: 'mine', source: 'custom', appearance: 'dark' });
  });
  it('can start from another theme, and inherits its appearance', () => {
    const theme = resolveCustomTheme('mine', { extends: 'wax', colors: {} }, BuiltInThemes);
    expect(theme.appearance).toBe('light');
    expect(theme.colors.text).toBe(BuiltInThemes[1]!.colors.text);
  });
  it('refuses to extend a theme that does not exist', () => {
    expect(() => resolveCustomTheme('mine', { extends: 'ghost', colors: {} }, BuiltInThemes)).toThrow('ghost');
  });
  it('refuses a bad color and an unknown key', () => {
    expect(CustomThemeFile.safeParse({ colors: { accent: 'orange' } }).success).toBe(false);
    expect(CustomThemeFile.safeParse({ colors: { acent: '#112233' } }).success).toBe(false);
  });
});

function contrast(left: string, right: string) {
  const [lighter, darker] = [luminance(left), luminance(right)].toSorted((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}
