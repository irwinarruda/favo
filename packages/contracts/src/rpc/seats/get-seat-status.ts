import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatParams } from '#contracts/rpc/seats/seat-params';
import { SeatStatus } from '#contracts/rpc/views';

export const getSeatStatus = defineMethod({
  name: 'seats.status',
  routing: MethodRouting.machine,
  params: SeatParams,
  result: SeatStatus,
});
