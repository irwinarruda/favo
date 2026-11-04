import type { AccountView } from '@favo/contracts/rpc/views';
import { Seat } from '@/modules/comb/app/entities/Seat';

export class Account {
  constructor(
    readonly machineId: string,
    readonly name: string,
    readonly displayName: string,
    readonly isPersonal: boolean,
    readonly seats: Seat[]
  ) {}

  static fromJSON(machineId: string, view: AccountView) {
    const seats = view.seats.map((seat) => Seat.fromJSON(machineId, seat));
    return new Account(machineId, view.name, view.displayName, view.isPersonal, seats);
  }

  get key() {
    return `${this.machineId}/${this.name}`;
  }

  get visibleSeats() {
    return this.seats.filter((seat) => seat.isInstalled);
  }

  get signedInCount() {
    return this.seats.filter((seat) => seat.isSignedIn).length;
  }

  withSeat(key: string, change: (seat: Seat) => Seat) {
    const seats = this.seats.map((candidate) => (candidate.key === key ? change(candidate) : candidate));
    return new Account(this.machineId, this.name, this.displayName, this.isPersonal, seats);
  }
}
