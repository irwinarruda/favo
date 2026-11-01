import { bootstrapDevContainer } from '@/shared/container/dev';
import { useApp } from '@/shared/stores/app';

export async function getApp(options: { isLoaded?: boolean } = {}) {
  bootstrapDevContainer();
  useApp.setState(useApp.getInitialState(), true);
  await useApp.getState().loadThemes();
  if (options.isLoaded ?? true) await useApp.getState().loadFleet();
  return {
    get state() {
      return useApp.getState();
    },
  };
}
