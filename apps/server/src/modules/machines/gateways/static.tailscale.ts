import { Tailscale, type TailscalePeer } from '@/modules/machines/gateways/tailscale';

export class StaticTailscale extends Tailscale {
  constructor(private readonly staticPeers: TailscalePeer[] = []) {
    super();
  }

  async peers() {
    return this.staticPeers;
  }
}
