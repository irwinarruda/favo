import { listThemes } from '@favo/contracts/rpc/themes/list-themes';
import { selectTheme } from '@favo/contracts/rpc/themes/select-theme';
import type { ThemesService } from '@/modules/themes/services/themes.service';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerThemesController(router: RpcRouter, themes: ThemesService) {
  router.handle(listThemes, () => themes.list());
  router.handle(selectTheme, ({ id }) => themes.select(id));
}
