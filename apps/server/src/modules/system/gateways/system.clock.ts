import { Clock } from '@/modules/system/gateways/clock';

export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}
