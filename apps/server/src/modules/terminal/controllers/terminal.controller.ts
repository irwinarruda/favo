import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import { listProviderUpdates } from '@favo/contracts/rpc/updates/list-provider-updates';
import { listProviderVersions } from '@favo/contracts/rpc/updates/list-provider-versions';
import { planFavoUpdate } from '@favo/contracts/rpc/updates/plan-favo-update';
import { planUpdate } from '@favo/contracts/rpc/updates/plan-update';
import { recordProviderUpdate } from '@favo/contracts/rpc/updates/record-provider-update';
import type { ProviderUpdatesService } from '@/modules/providers/services/provider-updates.service';
import type { TerminalService } from '@/modules/terminal/services/terminal.service';
import type { UpdateService } from '@/modules/terminal/services/update.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerTerminalController(
  router: RpcRouter,
  terminal: TerminalService,
  updates: UpdateService,
  providerUpdates: ProviderUpdatesService
) {
  router.handle(planTerminal, (params) => terminal.plan(params));
  router.handle(planFavoUpdate, () => updates.planFavo());
  router.handle(planUpdate, (params) => updates.planOn(params));
  router.handle(listProviderUpdates, ({ provider }) => providerUpdates.list(provider));
  router.handle(listProviderVersions, ({ provider }) => providerUpdates.versions(provider));
  router.handle(recordProviderUpdate, ({ provider, outcome }) => providerUpdates.record(provider, outcome));
}
