import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatParams } from '#contracts/rpc/seats/seat-params';
import { SeatInspection } from '#contracts/rpc/views';

export const inspectSeat = defineMethod({
  name: 'seats.inspect',
  routing: MethodRouting.machine,
  params: SeatParams,
  result: SeatInspection,
});
