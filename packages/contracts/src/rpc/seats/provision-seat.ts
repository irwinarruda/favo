import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatParams } from '#contracts/rpc/seats/seat-params';
import { SeatRepair } from '#contracts/rpc/views';

export const provisionSeat = defineMethod({
  name: 'seats.provision',
  routing: MethodRouting.machine,
  params: SeatParams,
  result: SeatRepair,
});
