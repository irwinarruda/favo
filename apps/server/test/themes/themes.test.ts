import { describe, expect, it } from 'bun:test';
import { listThemes } from '@favo/contracts/rpc/themes/list-themes';
import { selectTheme } from '@favo/contracts/rpc/themes/select-theme';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { createTestServer, Home } from '#test/support/test-server';

const ThemesFolder = `${Home}/.favo/themes`;
const ConfigFile = `${Home}/.favo/config.json`;

describe('themes', () => {
  it('starts on honey, with every built-in', async () => {
    const { client } = createTestServer();
    const list = await client.call(listThemes, {});
    expect(list.activeId).toBe('honey');
    expect(list.themes.map((theme) => theme.id)).toEqual(BuiltInThemes.map((theme) => theme.id));
    expect(list.problems).toEqual([]);
  });
  it('reads custom themes from the themes folder, after the built-ins', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(
      `${ThemesFolder}/mine.json`,
      JSON.stringify({ name: 'Mine', extends: 'nord', colors: { accent: '#112233' } })
    );
    const { themes } = await client.call(listThemes, {});
    expect(themes.at(-1)).toMatchObject({ id: 'mine', name: 'Mine', source: 'custom' });
    expect(themes.at(-1)?.colors.accent).toBe('#112233');
    expect(themes.at(-1)?.colors.background).toBe('#2E3440');
  });
  it('sorts a theme before its variants', async () => {
    const { client, fileSystem } = createTestServer();
    for (const id of ['bee', 'bee-night']) {
      await fileSystem.writePrivateText(`${ThemesFolder}/${id}.json`, JSON.stringify({ colors: {} }));
    }
    const { themes } = await client.call(listThemes, {});
    expect(themes.slice(-2).map((theme) => theme.id)).toEqual(['bee', 'bee-night']);
  });
  it('ignores files that are not themes', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(`${ThemesFolder}/notes.txt`, 'hello');
    expect((await client.call(listThemes, {})).problems).toEqual([]);
  });
  it('lets a custom theme replace a built-in of the same name', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(`${ThemesFolder}/honey.json`, JSON.stringify({ colors: { accent: '#000001' } }));
    const { themes } = await client.call(listThemes, {});
    const honeys = themes.filter((theme) => theme.id === 'honey');
    expect(honeys).toHaveLength(1);
    expect(honeys[0]?.source).toBe('custom');
  });
  it('skips a broken theme, says why, and keeps the others', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(`${ThemesFolder}/bad-json.json`, '{ nope');
    await fileSystem.writePrivateText(`${ThemesFolder}/bad-color.json`, JSON.stringify({ colors: { accent: 'red' } }));
    await fileSystem.writePrivateText(`${ThemesFolder}/bad-base.json`, JSON.stringify({ extends: 'x', colors: {} }));
    await fileSystem.writePrivateText(`${ThemesFolder}/good.json`, JSON.stringify({ colors: {} }));
    const list = await client.call(listThemes, {});
    expect(list.themes.at(-1)?.id).toBe('good');
    expect(list.problems).toEqual([
      { file: 'bad-base.json', message: 'extends "x", which is not a built-in theme.' },
      { file: 'bad-color.json', message: 'colors.accent: Use a color like #F5A623.' },
      { file: 'bad-json.json', message: 'not valid JSON' },
    ]);
  });
  it('saves the choice in config.json and keeps everything else there', async () => {
    const { client, fileSystem } = createTestServer();
    const config = { providers: { claude: { launchArgs: ['--flag'] } }, somethingElse: true };
    await fileSystem.writePrivateText(ConfigFile, JSON.stringify(config));
    await client.call(selectTheme, { id: 'nord' });
    expect(JSON.parse((await fileSystem.readText(ConfigFile))!)).toEqual({ ...config, theme: 'nord' });
    expect((await client.call(listThemes, {})).activeId).toBe('nord');
  });
  it('creates config.json when there is none', async () => {
    const { client, fileSystem } = createTestServer();
    await client.call(selectTheme, { id: 'wax' });
    expect(JSON.parse((await fileSystem.readText(ConfigFile))!)).toEqual({ theme: 'wax' });
  });
  it('refuses a theme that does not exist', async () => {
    const { client, fileSystem } = createTestServer();
    await expect(client.call(selectTheme, { id: 'ghost' })).rejects.toMatchObject({ code: 'themeNotFound' });
    expect(await fileSystem.readText(ConfigFile)).toBeUndefined();
  });
  it('falls back to honey when the configured theme is gone', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(ConfigFile, JSON.stringify({ theme: 'ghost' }));
    const list = await client.call(listThemes, {});
    expect(list.activeId).toBe('honey');
    expect(list.problems).toEqual([{ file: 'config.json', message: 'No theme named "ghost"; using honey.' }]);
  });
  it('still opens with a broken config, and never overwrites it', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(ConfigFile, '{ broken');
    const list = await client.call(listThemes, {});
    expect(list.activeId).toBe('honey');
    expect(list.problems[0]?.file).toBe('config.json');
    await expect(client.call(selectTheme, { id: 'nord' })).rejects.toMatchObject({ code: 'invalidConfig' });
    expect(await fileSystem.readText(ConfigFile)).toBe('{ broken');
  });
});
