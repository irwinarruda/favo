import type { ThemeColors } from '@favo/domain/themes/theme';

const Bold = '\u001b[1m';
const Reset = '\u001b[0m';

export type Paint = ReturnType<typeof createPaint>;

export function createPaint(isEnabled: boolean, colors: Pick<ThemeColors, 'accent' | 'muted'>) {
  function wrap(prefix: string, text: string) {
    return isEnabled ? `${prefix}${text}${Reset}` : text;
  }
  return {
    accent: (text: string) => wrap(foregroundOf(colors.accent), text),
    dim: (text: string) => wrap(foregroundOf(colors.muted), text),
    bold: (text: string) => wrap(Bold, text),
    color: (hex: string, text: string) => wrap(foregroundOf(hex), text),
  };
}

function foregroundOf(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `\u001b[38;2;${red};${green};${blue}m`;
}
