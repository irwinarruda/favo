import type { ThemeProblem } from '@favo/contracts/rpc/themes/list-themes';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { CustomThemeFile, resolveCustomTheme, type Theme } from '@favo/domain/themes/theme';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const ThemeExtension = '.json';

export class ThemeRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async custom() {
    const themes: Theme[] = [];
    const problems: ThemeProblem[] = [];
    const files = await this.fileSystem.list(this.paths.themes);
    for (const file of files.filter((candidate) => candidate.endsWith(ThemeExtension)).toSorted()) {
      try {
        const text = await this.fileSystem.readText(`${this.paths.themes}/${file}`);
        const parsed = CustomThemeFile.parse(JSON.parse(text ?? ''));
        themes.push(resolveCustomTheme(file.slice(0, -ThemeExtension.length), parsed, BuiltInThemes));
      } catch (error) {
        problems.push({ file, message: reasonOf(error) });
      }
    }
    return { themes: themes.toSorted((left, right) => left.id.localeCompare(right.id)), problems };
  }
}

function reasonOf(error: unknown) {
  if (error instanceof SyntaxError) return 'not valid JSON';
  const parsed = error as { issues?: { path: PropertyKey[]; message: string }[]; message?: string };
  const issue = parsed.issues?.[0];
  if (issue) return `${issue.path.join('.')}: ${issue.message}`;
  return parsed.message ?? String(error);
}
