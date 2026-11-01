import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatUsageView } from '#contracts/rpc/views';

export const readUsage = defineMethod({
  name: 'seats.usage',
  routing: MethodRouting.machine,
  params: z.strictObject({}),
  result: z.array(SeatUsageView),
});
