import { AppLoginState } from '@favo/domain/desktop/desktop-app';
import type { ThemeColors } from '@favo/domain/themes/theme';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { Hex } from '@/shared/theme/glyphs';

const AppMarks: Record<AppLoginState, string> = { signedIn: Hex.filled, signedOut: Hex.hollow, unknown: '?' };

export function appMarkOf(seat: Seat) {
  return AppMarks[seat.appLogin?.login ?? AppLoginState.signedOut];
}

export function appColorOf(seat: Seat, colors: ThemeColors) {
  if (seat.isOtherAccount) return colors.danger;
  return seat.isAppSignedIn ? colors.accent : colors.faint;
}
