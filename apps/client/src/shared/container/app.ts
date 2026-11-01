import { createRpcClient } from '@favo/contracts/rpc/client';
import type { RpcTransport } from '@favo/contracts/rpc/envelope';
import { ApiFleetRepository } from '@/modules/comb/app/repositories/ApiFleetRepository';
import { ApiDirectoryRepository } from '@/modules/directories/app/repositories/ApiDirectoryRepository';
import { ApiMachineRepository } from '@/modules/machines/app/repositories/ApiMachineRepository';
import { ApiDesktopRepository } from '@/modules/sessions/app/repositories/ApiDesktopRepository';
import { ApiTerminalRepository } from '@/modules/sessions/app/repositories/ApiTerminalRepository';
import { ApiThemeRepository } from '@/modules/themes/app/repositories/ApiThemeRepository';
import type { IClipboardGateway } from '@/shared/app/gateways/IClipboardGateway';
import type { ITerminalGateway } from '@/shared/app/gateways/ITerminalGateway';
import { container } from '@/shared/container';

export function bootstrapAppContainer(input: {
  transport: RpcTransport;
  clipboardGateway: IClipboardGateway;
  terminalGateway: ITerminalGateway;
}) {
  const client = createRpcClient(input.transport);
  container.register('IFleetRepository', new ApiFleetRepository(client));
  container.register('IMachineRepository', new ApiMachineRepository(client));
  container.register('ITerminalRepository', new ApiTerminalRepository(client));
  container.register('IDesktopRepository', new ApiDesktopRepository(client));
  container.register('IThemeRepository', new ApiThemeRepository(client));
  container.register('IDirectoryRepository', new ApiDirectoryRepository(client));
  container.register('IClipboardGateway', input.clipboardGateway);
  container.register('ITerminalGateway', input.terminalGateway);
}
