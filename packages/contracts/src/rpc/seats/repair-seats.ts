import { z } from 'zod';
import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatRepair } from '#contracts/rpc/views';

export const repairSeats = defineMethod({
  name: 'seats.repair',
  routing: MethodRouting.machine,
  params: z.strictObject({ account: z.string().optional() }),
  result: z.array(SeatRepair),
});
