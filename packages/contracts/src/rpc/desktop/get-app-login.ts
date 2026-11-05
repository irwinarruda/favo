import { defineMethod, MethodRouting } from '#contracts/rpc/method';
import { SeatParams } from '#contracts/rpc/seats/seat-params';
import { AppLoginStatus } from '#contracts/rpc/views';

export const getAppLogin = defineMethod({
  name: 'desktop.login',
  routing: MethodRouting.machine,
  params: SeatParams,
  result: AppLoginStatus,
});
