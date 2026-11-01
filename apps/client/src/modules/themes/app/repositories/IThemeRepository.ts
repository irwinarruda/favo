import type { ThemeList } from '@favo/contracts/rpc/themes/list-themes';

export type IThemeRepository = {
  getThemes(): Promise<ThemeList>;
  selectTheme(id: string): Promise<void>;
};
