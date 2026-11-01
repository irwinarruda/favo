import { LoginState, type SeatStatus, type SeatView } from '@favo/contracts/rpc/views';
import { LoginScope, Providers } from '@favo/domain/providers/provider';

export class Seat {
  constructor(
    readonly machineId: string,
    readonly view: SeatView,
    readonly status?: SeatStatus
  ) {}

  static fromJSON(machineId: string, view: SeatView) {
    return new Seat(machineId, view);
  }

  get key() {
    return `seat:${this.machineId}/${this.view.account}/${this.view.provider}`;
  }

  get account() {
    return this.view.account;
  }

  get provider() {
    return this.view.provider;
  }

  get command() {
    return Providers[this.view.provider].executable;
  }

  get label() {
    return this.view.label;
  }

  get path() {
    return this.view.path;
  }

  get pathHint() {
    return this.view.pathHint;
  }

  get isChecking() {
    return this.status === undefined;
  }

  get isInstalled() {
    return this.view.isInstalled;
  }

  get isSignedIn() {
    return this.status?.login === LoginState.signedIn;
  }

  get canSignOut() {
    return this.view.canLogout && this.isSignedIn;
  }

  get hasSharedLogin() {
    return this.view.loginScope === LoginScope.unverified;
  }

  get problems() {
    return this.status?.problems ?? 0;
  }

  get identity() {
    return this.status?.identity;
  }

  get plan() {
    return this.status?.plan;
  }

  get headline() {
    if (!this.status) return 'checking';
    if (this.status.login === LoginState.signedIn) return this.status.identity ?? 'signed in';
    if (this.status.login === LoginState.unknown) return 'unknown';
    return this.status.plan ?? 'sign in';
  }

  withStatus(status: SeatStatus) {
    return new Seat(this.machineId, this.view, status);
  }

  withProvisioned() {
    return new Seat(this.machineId, { ...this.view, isProvisioned: true }, this.status);
  }
}
