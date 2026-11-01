import { adoptAccount } from '@favo/contracts/rpc/accounts/adopt-account';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { removeAccount } from '@favo/contracts/rpc/accounts/remove-account';
import { renameAccount } from '@favo/contracts/rpc/accounts/rename-account';
import { getSeatStatus } from '@favo/contracts/rpc/seats/get-seat-status';
import { inspectSeat } from '@favo/contracts/rpc/seats/inspect-seat';
import { provisionSeat } from '@favo/contracts/rpc/seats/provision-seat';
import { readUsage } from '@favo/contracts/rpc/seats/read-usage';
import { repairSeats } from '@favo/contracts/rpc/seats/repair-seats';
import type { AccountsService } from '@/modules/accounts/services/accounts.service';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { UsageService } from '@/modules/accounts/services/usage.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerAccountsController(
  router: RpcRouter,
  accounts: AccountsService,
  seats: SeatsService,
  usage: UsageService
) {
  router.handle(listAccounts, () => accounts.list());
  router.handle(createAccount, ({ name }) => accounts.create(name));
  router.handle(renameAccount, ({ name, newName }) => accounts.rename(name, newName));
  router.handle(removeAccount, ({ name }) => accounts.remove(name));
  router.handle(adoptAccount, ({ name, provider, from }) => accounts.adopt(name, provider, from));
  router.handle(getSeatStatus, ({ account, provider }) => seats.status(account, provider));
  router.handle(inspectSeat, ({ account, provider }) => seats.inspect(account, provider));
  router.handle(provisionSeat, ({ account, provider }) => seats.reconcile(account, provider));
  router.handle(repairSeats, ({ account }) => seats.repairAll(account));
  router.handle(readUsage, () => usage.read());
}
