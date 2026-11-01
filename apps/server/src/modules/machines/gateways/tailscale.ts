export type TailscalePeer = { name: string; isOnline: boolean; os: string };

export abstract class Tailscale {
  abstract peers(): Promise<TailscalePeer[]>;
}
