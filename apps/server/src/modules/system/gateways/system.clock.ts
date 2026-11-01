import { Clock } from '@/modules/system/gateways/clock';

export class SystemClock extends Clock {
  now() {
    return new Date();
  }

  async sleep(milliseconds: number) {
    await Bun.sleep(milliseconds);
  }
}
