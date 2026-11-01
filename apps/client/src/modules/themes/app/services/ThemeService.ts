import type { ThemeProblem } from '@favo/contracts/rpc/themes/list-themes';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { DefaultThemeId, type Theme, type ThemeColors } from '@favo/domain/themes/theme';
import { computeFrom } from '@/libs/zustand';
import { ToastKind } from '@/shared/app/services/ToastService';
import { container } from '@/shared/container';
import type { ServiceCreator } from '@/shared/stores/app';

export type ThemeService = {
  themes: Theme[];
  themeProblems: ThemeProblem[];
  activeThemeId: string;
  previewThemeId?: string;
  isThemePickerOpen: boolean;
  theme: Theme;
  colors: ThemeColors;
  loadThemes(): Promise<void>;
  openThemePicker(): Promise<void>;
  closeThemePicker(): void;
  previewTheme(id: string): void;
  movePreviewTheme(delta: number): void;
  applyPreviewTheme(): Promise<void>;
};

export const createThemeService: ServiceCreator<ThemeService> = (set, get) => ({
  ...computeFrom(
    get,
    (state) => [state.themes, state.activeThemeId, state.previewThemeId] as const,
    (state) => {
      const theme = _themeOf(state.themes, state.previewThemeId ?? state.activeThemeId);
      return { theme, colors: theme.colors };
    }
  ),
  themes: BuiltInThemes,
  themeProblems: [],
  activeThemeId: DefaultThemeId,
  previewThemeId: undefined,
  isThemePickerOpen: false,
  async loadThemes() {
    const { showToast } = get();
    const themeRepository = container.get('IThemeRepository');
    const { themes, activeId, problems } = await themeRepository.getThemes();
    set({ themes, activeThemeId: activeId, themeProblems: problems });
    const [problem] = problems;
    if (problem) showToast(`${problem.file}: ${problem.message}`, ToastKind.error);
  },
  async openThemePicker() {
    await get().loadThemes();
    set({ isThemePickerOpen: true, previewThemeId: get().activeThemeId });
  },
  closeThemePicker() {
    set({ isThemePickerOpen: false, previewThemeId: undefined });
  },
  previewTheme(id) {
    set({ previewThemeId: id });
  },
  movePreviewTheme(delta) {
    const { themes, theme, previewTheme } = get();
    const index = themes.findIndex((candidate) => candidate.id === theme.id);
    const next = themes[(index + delta + themes.length) % themes.length];
    if (next) previewTheme(next.id);
  },
  async applyPreviewTheme() {
    const { previewThemeId, showToast } = get();
    if (!previewThemeId) return;
    const themeRepository = container.get('IThemeRepository');
    await themeRepository.selectTheme(previewThemeId);
    set({ activeThemeId: previewThemeId, previewThemeId: undefined, isThemePickerOpen: false });
    showToast(`${get().theme.name} it is.`);
  },
});

function _themeOf(themes: Theme[], id: string) {
  return themes.find((theme) => theme.id === id) ?? BuiltInThemes[0]!;
}
