import type { Theme } from '@favo/domain/themes/theme';
import { ThemeSource } from '@favo/domain/themes/theme';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useEffect, useRef } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';

const ListChrome = 12;
const NameWidth = 28;
const Swatches = ['accent', 'accentBright', 'success', 'danger'] as const;

function ThemeRow({ theme }: { theme: Theme }) {
  const colors = useApp((state) => state.colors);
  const isPreviewed = useApp((state) => state.theme.id === theme.id);
  const isActive = useApp((state) => state.activeThemeId === theme.id);
  const previewTheme = useApp((state) => state.previewTheme);
  const applyPreviewTheme = useApp((state) => state.applyPreviewTheme);
  const error = useError();

  async function onThemeClick() {
    if (isPreviewed) await applyPreviewTheme();
    else previewTheme(theme.id);
  }

  return (
    <box
      id={`theme:${theme.id}`}
      flexDirection="row"
      flexShrink={0}
      backgroundColor={isPreviewed ? colors.selection : undefined}
      onMouseDown={error.handle(onThemeClick)}
    >
      <text fg={colors.accent}>{isPreviewed ? '▸ ' : '  '}</text>
      <text fg={isPreviewed ? colors.accentBright : colors.text}>{theme.name.padEnd(NameWidth)}</text>
      <text>
        {Swatches.map((token) => (
          <span key={token} fg={theme.colors[token]}>
            ■{' '}
          </span>
        ))}
      </text>
      {isActive && <text fg={colors.faint}> saved</text>}
    </box>
  );
}

export function ThemePicker() {
  const { height } = useTerminalDimensions();
  const colors = useApp((state) => state.colors);
  const themes = useApp((state) => state.themes);
  const themeProblems = useApp((state) => state.themeProblems);
  const previewedId = useApp((state) => state.theme.id);
  const movePreviewTheme = useApp((state) => state.movePreviewTheme);
  const closeThemePicker = useApp((state) => state.closeThemePicker);
  const applyPreviewTheme = useApp((state) => state.applyPreviewTheme);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const builtIn = themes.filter((theme) => theme.source === ThemeSource.builtIn);
  const custom = themes.filter((theme) => theme.source === ThemeSource.custom);
  const headingRows = custom.length > 0 ? 3 : 1;
  const listHeight = Math.min(themes.length + headingRows, Math.max(height - ListChrome, 4));

  useKeyboard((key) => {
    if (key.name === 'down' || key.name === 'j') movePreviewTheme(1);
    if (key.name === 'up' || key.name === 'k') movePreviewTheme(-1);
    if (key.name === 'return') void error.handle(applyPreviewTheme)();
    if (key.name === 'escape') closeThemePicker();
  });

  useEffect(() => {
    scrollRef.current?.scrollChildIntoView(`theme:${previewedId}`);
  }, [previewedId]);

  return (
    <Dialog title="theme" width={60}>
      <scrollbox ref={scrollRef} height={listHeight}>
        <text fg={colors.muted}>BUILT IN</text>
        {builtIn.map((theme) => (
          <ThemeRow key={theme.id} theme={theme} />
        ))}
        {custom.length > 0 && (
          <text fg={colors.muted} marginTop={1}>
            CUSTOM
          </text>
        )}
        {custom.map((theme) => (
          <ThemeRow key={theme.id} theme={theme} />
        ))}
      </scrollbox>
      {themeProblems.map((problem) => (
        <text key={problem.file} fg={colors.danger} wrapMode="none" truncate>
          {problem.file}: {problem.message}
        </text>
      ))}
      <box flexDirection="row" marginTop={1}>
        <KeyHint keys="↑↓" label="preview" />
        <KeyHint keys="enter" label="save" onPress={error.handle(applyPreviewTheme)} />
        <KeyHint keys="esc" label="cancel" onPress={closeThemePicker} />
      </box>
    </Dialog>
  );
}
