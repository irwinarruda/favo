import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useEffect, useRef } from 'react';
import { PoolSection } from '@/modules/usage/screens/Usage/PoolSection';
import { KeyHint } from '@/shared/components/KeyHint';
import { Spinner } from '@/shared/components/Spinner';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const TickMs = 15_000;
const MaximumNameWidth = 20;
const MinimumBarWidth = 8;
const MaximumBarWidth = 30;
const RowChrome = 30;

type UsageProps = { isEnabled: boolean; onHelp(): void; onQuit(): void };

export function Usage({ isEnabled, onHelp, onQuit }: UsageProps) {
  const colors = useApp((state) => state.colors);
  const { width } = useTerminalDimensions();
  const pools = useApp((state) => state.usagePools);
  const lines = useApp((state) => state.usageMachineLines);
  const isReading = useApp((state) => state.isUsageReading);
  const closeUsage = useApp((state) => state.closeUsage);
  const refreshUsage = useApp((state) => state.refreshUsage);
  const tickUsage = useApp((state) => state.tickUsage);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const names = pools.flatMap((pool) => pool.seats.map((seat) => seat.name.length));
  const nameWidth = Math.min(Math.max(0, ...names), MaximumNameWidth);
  const roomForBar = width - nameWidth - RowChrome;
  const barWidth = Math.max(MinimumBarWidth, Math.min(MaximumBarWidth, roomForBar));

  useKeyboard((key) => {
    if (!isEnabled) return;
    if (key.sequence === '?') onHelp();
    else if (key.name === 'escape' || key.name === 'u') closeUsage();
    else if (key.name === 'q') onQuit();
    else if (key.name === 'r') void error.handle(refreshUsage)();
    else if (key.name === 'down' || key.name === 'j') scrollRef.current?.scrollBy(1);
    else if (key.name === 'up' || key.name === 'k') scrollRef.current?.scrollBy(-1);
  });

  useEffect(() => {
    const timer = setInterval(tickUsage, TickMs);
    return () => clearInterval(timer);
  }, []);

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
          <b fg={colors.text}> Usage</b>
        </text>
        <text fg={colors.muted}>all machines · all providers</text>
      </box>
      <box flexDirection="row" flexWrap="wrap" columnGap={2} paddingX={2} paddingBottom={1} flexShrink={0}>
        {lines.map(({ id, name, label, isOld }) => (
          <text key={id}>
            <span fg={isOld ? colors.faint : colors.text}>{name}</span>
            <span fg={isOld ? colors.faint : colors.muted}> {label}</span>
          </text>
        ))}
      </box>
      <scrollbox ref={scrollRef} flexGrow={1} flexShrink={1} paddingX={2} minHeight={0}>
        {pools.map((pool) => (
          <PoolSection key={pool.provider} pool={pool} nameWidth={nameWidth} barWidth={barWidth} />
        ))}
        {pools.length === 0 && isReading && <Spinner label="reading every seat…" />}
        {pools.length === 0 && !isReading && <text fg={colors.muted}>No signed in seat reports limits.</text>}
      </scrollbox>
      <box flexDirection="row" paddingX={2} flexShrink={0} height={1} overflow="hidden">
        <KeyHint keys="r" label="refresh" onPress={error.handle(refreshUsage)} />
        <KeyHint keys="↑↓" label="scroll" />
        <KeyHint keys="esc" label="back" onPress={closeUsage} />
        <KeyHint keys="?" label="help" onPress={onHelp} />
        <KeyHint keys="q" label="quit" onPress={onQuit} />
      </box>
    </box>
  );
}
