import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useRef } from 'react';
import { CliGroup } from '@/modules/updates/screens/ProviderClis/CliGroup';
import { KeyHint } from '@/shared/components/KeyHint';
import { Spinner } from '@/shared/components/Spinner';
import { ToastLine } from '@/shared/components/ToastLine';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const NameGap = 2;
const MinimumNameWidth = 8;

type ProviderClisProps = { isEnabled: boolean; onHelp(): void; onQuit(): void; onUpdate(): void };

export function ProviderClis({ isEnabled, onHelp, onQuit, onUpdate }: ProviderClisProps) {
  const colors = useApp((state) => state.colors);
  const groups = useApp((state) => state.providerCliGroups);
  const lines = useApp((state) => state.providerCliMachineLines);
  const isReading = useApp((state) => state.isProviderClisReading);
  const isUpdating = useApp((state) => state.isUpdatingProviderClis);
  const closeProviderClis = useApp((state) => state.closeProviderClis);
  const refreshProviderClis = useApp((state) => state.refreshProviderClis);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const names = groups.flatMap((group) => group.rows.map((row) => row.machineName.length));
  const nameWidth = Math.max(MinimumNameWidth, ...names) + NameGap;

  useKeyboard((key) => {
    if (!isEnabled) return;
    if (key.sequence === '?') onHelp();
    else if (key.shift && key.name === 'p') onUpdate();
    else if (key.name === 'escape' || key.name === 'v') closeProviderClis();
    else if (key.name === 'q') onQuit();
    else if (key.name === 'r') void error.handle(refreshProviderClis)();
    else if (key.name === 'down' || key.name === 'j') scrollRef.current?.scrollBy(1);
    else if (key.name === 'up' || key.name === 'k') scrollRef.current?.scrollBy(-1);
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={colors.background}
    >
      <box flexDirection="row" justifyContent="space-between" paddingX={2} paddingTop={1} flexShrink={0}>
        <text>
          <span fg={colors.accent}>{Hex.filled}</span>
          <b fg={colors.text}> Provider CLIs</b>
        </text>
        {isUpdating && <Spinner label="updating in the background" />}
        {!isUpdating && <text fg={colors.muted}>what each machine has installed</text>}
      </box>
      <box flexDirection="row" flexWrap="wrap" columnGap={2} paddingX={2} paddingBottom={1} flexShrink={0}>
        {lines.map(({ id, name, label, isOld }) => (
          <text key={id}>
            <span fg={isOld ? colors.faint : colors.text}>{name}</span>
            <span fg={isOld ? colors.faint : colors.muted}> {label}</span>
          </text>
        ))}
      </box>
      <scrollbox ref={scrollRef} flexGrow={1} flexShrink={1} paddingX={1} minHeight={0}>
        {groups.map((group) => (
          <CliGroup key={group.provider} group={group} nameWidth={nameWidth} />
        ))}
        {groups.length === 0 && isReading && <Spinner label="reading every machine…" />}
        {groups.length === 0 && !isReading && (
          <text fg={colors.muted}>No provider CLI on a machine favo can reach.</text>
        )}
      </scrollbox>
      <ToastLine />
      <box flexDirection="row" paddingX={2} flexShrink={0} height={1} overflow="hidden">
        <KeyHint keys="P" label={isUpdating ? 'updating…' : 'update all'} onPress={onUpdate} />
        <KeyHint keys="r" label="refresh" onPress={error.handle(refreshProviderClis)} />
        <KeyHint keys="↑↓" label="scroll" />
        <KeyHint keys="esc" label="back" onPress={closeProviderClis} />
        <KeyHint keys="?" label="help" onPress={onHelp} />
        <KeyHint keys="q" label="quit" onPress={onQuit} />
      </box>
    </box>
  );
}
