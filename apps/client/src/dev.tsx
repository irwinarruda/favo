import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from '@/App';
import { bootstrapDevContainer } from '@/shared/container/dev';
import { useApp } from '@/shared/stores/app';

bootstrapDevContainer();
await useApp.getState().loadThemes();
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  backgroundColor: useApp.getState().colors.background,
});
renderer.once('destroy', () => process.exit(0));
createRoot(renderer).render(<App onQuit={() => renderer.destroy()} />);
