import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { DefaultThemeId } from '@favo/domain/themes/theme';
import type { ConfigRepository } from '@/modules/system/repositories/config.repository';
import type { ThemeRepository } from '@/modules/themes/repositories/theme.repository';

export class ThemesService {
  constructor(
    private readonly themes: ThemeRepository,
    private readonly config: ConfigRepository
  ) {}

  async list() {
    const custom = await this.themes.custom();
    const customIds = new Set(custom.themes.map((theme) => theme.id));
    const themes = [...BuiltInThemes.filter((theme) => !customIds.has(theme.id)), ...custom.themes];
    const problems = [...custom.problems];
    const chosen = await this.config.themeId().catch((error) => {
      if (!(error instanceof DomainError)) throw error;
      problems.push({ file: 'config.json', message: error.message });
      return undefined;
    });
    const isKnown = themes.some((theme) => theme.id === chosen);
    if (chosen && !isKnown) {
      problems.push({ file: 'config.json', message: `No theme named "${chosen}"; using ${DefaultThemeId}.` });
    }
    return { activeId: chosen && isKnown ? chosen : DefaultThemeId, themes, problems };
  }

  async select(id: string) {
    const { themes } = await this.list();
    if (!themes.some((theme) => theme.id === id)) {
      throw new DomainError(DomainErrorCode.themeNotFound, `No theme named "${id}".`);
    }
    await this.config.saveTheme(id);
    return { activeId: id };
  }
}
