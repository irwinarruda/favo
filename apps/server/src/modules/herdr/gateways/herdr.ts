import type { ValueOf } from '@favo/domain/shared/value-of';
import type { HerdrPane, HerdrReport } from '@favo/domain/terminal/herdr';

export const HerdrAnswer = {
  accepted: 'accepted',
  tooEarly: 'tooEarly',
  failed: 'failed',
} as const;
export type HerdrAnswer = ValueOf<typeof HerdrAnswer>;

export abstract class Herdr {
  abstract report(pane: HerdrPane, report: HerdrReport): Promise<HerdrAnswer>;
}
