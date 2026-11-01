import { z } from 'zod';
import { assertDomain, DomainErrorCode } from '#domain/shared/domain-error';
import type { ValueOf } from '#domain/shared/value-of';

export const DefaultThemeId = 'honey';

export const ThemeAppearance = {
  dark: 'dark',
  light: 'light',
} as const;
export type ThemeAppearance = ValueOf<typeof ThemeAppearance>;

export const ThemeSource = {
  builtIn: 'builtIn',
  custom: 'custom',
} as const;
export type ThemeSource = ValueOf<typeof ThemeSource>;

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #F5A623.');

export const ThemeColors = z.strictObject({
  background: HexColor,
  panel: HexColor,
  selection: HexColor,
  border: HexColor,
  accent: HexColor,
  accentBright: HexColor,
  text: HexColor,
  muted: HexColor,
  faint: HexColor,
  success: HexColor,
  danger: HexColor,
});
export type ThemeColors = z.infer<typeof ThemeColors>;

export const Theme = z.strictObject({
  id: z.string(),
  name: z.string(),
  appearance: z.enum(ThemeAppearance),
  source: z.enum(ThemeSource),
  colors: ThemeColors,
});
export type Theme = z.infer<typeof Theme>;

export const CustomThemeFile = z.strictObject({
  name: z.string().optional(),
  appearance: z.enum(ThemeAppearance).optional(),
  extends: z.string().optional(),
  colors: ThemeColors.partial(),
});
export type CustomThemeFile = z.infer<typeof CustomThemeFile>;

export function resolveCustomTheme(id: string, file: CustomThemeFile, builtIns: Theme[]): Theme {
  const baseId = file.extends ?? DefaultThemeId;
  const base = builtIns.find((theme) => theme.id === baseId);
  assertDomain(base, DomainErrorCode.invalidTheme, `extends "${baseId}", which is not a built-in theme.`);
  return {
    id,
    name: file.name ?? id,
    appearance: file.appearance ?? base.appearance,
    source: ThemeSource.custom,
    colors: { ...base.colors, ...file.colors },
  };
}
