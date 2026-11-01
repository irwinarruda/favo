import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { stageScene } from '@/__tests__/scenes';
import { App } from '@/App';
import { bootstrapDevContainer } from '@/shared/container/dev';
import { useApp } from '@/shared/stores/app';

const FirstFrameMs = 800;
const KeySettleMs = 60;
const [sceneName, readyFile] = Bun.argv.slice(2);

bootstrapDevContainer();
const scene = sceneName ? stageScene(sceneName) : undefined;
await useApp.getState().loadThemes();
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  backgroundColor: useApp.getState().colors.background,
});
renderer.once('destroy', () => process.exit(0));
createRoot(renderer).render(<App onQuit={() => renderer.destroy()} />);

if (scene) {
  await Bun.sleep(FirstFrameMs);
  for (const key of scene.keys) {
    renderer.stdin.emit('data', Buffer.from(key));
    await Bun.sleep(KeySettleMs);
  }
  if (readyFile) await Bun.write(readyFile, '');
}
