import { useApp } from '@/shared/stores/app';

type KeyHintProps = { keys: string; label: string; onPress?: () => void };

export function KeyHint({ keys, label, onPress }: KeyHintProps) {
  const colors = useApp((state) => state.colors);
  return (
    <box flexDirection="row" flexShrink={0} marginRight={2} onMouseDown={onPress}>
      <text>
        <span fg={colors.accent}>{keys}</span>
        <span fg={colors.muted}> {label}</span>
      </text>
    </box>
  );
}
