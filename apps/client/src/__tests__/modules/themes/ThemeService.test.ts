import { describe, expect, test } from 'bun:test';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

describe('ThemeService', () => {
  test('starts on the saved theme', async () => {
    const app = await getApp();
    expect(app.state.theme.id).toBe('honey');
    expect(app.state.colors.accent).toBe('#F5A623');
  });
  test('previews without saving', async () => {
    const app = await getApp();
    await app.state.openThemePicker();
    app.state.previewTheme('nord');
    expect(app.state.colors.background).toBe('#2E3440');
    expect(mockDb.themeList.activeId).toBe('honey');
    expect(app.state.activeThemeId).toBe('honey');
  });
  test('goes back to the saved theme on cancel', async () => {
    const app = await getApp();
    await app.state.openThemePicker();
    app.state.movePreviewTheme(2);
    app.state.closeThemePicker();
    expect(app.state.theme.id).toBe('honey');
    expect(app.state.isThemePickerOpen).toBe(false);
  });
  test('saves the previewed theme', async () => {
    const app = await getApp();
    await app.state.openThemePicker();
    app.state.previewTheme('midnight');
    await app.state.applyPreviewTheme();
    expect(mockDb.themeList.activeId).toBe('midnight');
    expect(app.state.theme.id).toBe('midnight');
    expect(app.state.isThemePickerOpen).toBe(false);
    expect(app.state.toast?.message).toBe('Midnight it is.');
  });
  test('wraps around the list', async () => {
    const app = await getApp();
    await app.state.openThemePicker();
    app.state.movePreviewTheme(-1);
    expect(app.state.theme.id).toBe('midnight');
    app.state.movePreviewTheme(1);
    expect(app.state.theme.id).toBe('honey');
  });
  test('rereads themes when the picker opens, so a new file shows up', async () => {
    const app = await getApp();
    mockDb.themeList = { ...mockDb.themeList, themes: mockDb.themeList.themes.slice(0, 3) };
    await app.state.openThemePicker();
    expect(app.state.themes).toHaveLength(3);
  });
  test('reports a broken theme file and keeps going', async () => {
    const app = await getApp();
    mockDb.themeList = { ...mockDb.themeList, problems: [{ file: 'bad.json', message: 'not valid JSON' }] };
    await app.state.loadThemes();
    expect(app.state.toast).toMatchObject({ kind: 'error', message: 'bad.json: not valid JSON' });
    expect(app.state.theme.id).toBe('honey');
  });
  test('falls back to the default when the saved theme is missing from the list', async () => {
    const app = await getApp();
    mockDb.themeList = { ...mockDb.themeList, activeId: 'ghost' };
    await app.state.loadThemes();
    expect(app.state.theme.id).toBe('honey');
  });
});
