import { ProviderId } from '@favo/domain/providers/provider';
import { z } from 'zod';

export const SeatParams = z.strictObject({ account: z.string(), provider: z.enum(ProviderId) });
export type SeatParams = z.infer<typeof SeatParams>;
