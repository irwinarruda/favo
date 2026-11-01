import { Theme } from '@favo/domain/themes/theme';
import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';

export const ThemeProblem = z.strictObject({ file: z.string(), message: z.string() });
export type ThemeProblem = z.infer<typeof ThemeProblem>;

export const ThemeList = z.strictObject({
  activeId: z.string(),
  themes: z.array(Theme),
  problems: z.array(ThemeProblem),
});
export type ThemeList = z.infer<typeof ThemeList>;

export const listThemes = defineMethod({
  name: 'themes.list',
  routing: MethodRouting.hub,
  params: z.strictObject({}),
  result: ThemeList,
});
