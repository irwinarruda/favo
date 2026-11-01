import type { RpcClient } from '@favo/contracts/rpc/client';
import { listThemes } from '@favo/contracts/rpc/themes/list-themes';
import { selectTheme } from '@favo/contracts/rpc/themes/select-theme';
import type { IThemeRepository } from '@/modules/themes/app/repositories/IThemeRepository';

export class ApiThemeRepository implements IThemeRepository {
  constructor(private readonly client: RpcClient) {}

  getThemes() {
    return this.client.call(listThemes, {});
  }

  async selectTheme(id: string) {
    await this.client.call(selectTheme, { id });
  }
}
