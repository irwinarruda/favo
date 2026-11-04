import { type AppLoginStatus, LoginState, type SeatStatus, type SeatView } from '@favo/contracts/rpc/views';
import { AppLoginState } from '@favo/domain/desktop/desktop-app';
import { LoginScope, Providers } from '@favo/domain/providers/provider';

export class Seat {
  constructor(
    readonly machineId: string,
    readonly view: SeatView,
    readonly status?: SeatStatus,
    readonly appLogin?: AppLoginStatus
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

  get hasAppLogin() {
    return this.appLogin !== undefined;
  }

  get isAppSignedIn() {
    return this.appLogin?.login === AppLoginState.signedIn;
  }

  get isOtherAccount() {
    return this.isSignedIn && this.isAppSignedIn && this.appLogin?.isOtherAccount === true;
  }

  get appLoginLabel() {
    if (this.isOtherAccount) return 'on another account';
    if (this.isAppSignedIn) return 'signed in';
    if (this.appLogin?.login === AppLoginState.unknown) return 'sign-in unknown';
    return 'signed out';
  }

  get headline() {
    if (!this.status) return 'checking';
    if (this.status.login === LoginState.signedIn) return this.status.identity ?? 'signed in';
    if (this.status.login === LoginState.unknown) return 'unknown';
    return this.status.plan ?? 'sign in';
  }

  withStatus(status: SeatStatus) {
    return new Seat(this.machineId, this.view, status, this.appLogin);
  }

  withAppLogin(appLogin?: AppLoginStatus) {
    return new Seat(this.machineId, this.view, this.status, appLogin);
  }

  withProvisioned() {
    return new Seat(this.machineId, { ...this.view, isProvisioned: true }, this.status, this.appLogin);
  }
}
