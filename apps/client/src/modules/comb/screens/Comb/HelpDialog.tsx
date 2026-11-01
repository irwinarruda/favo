import { useKeyboard } from '@opentui/react';
import { Dialog } from '@/shared/components/Dialog';
import { useApp } from '@/shared/stores/app';

const Keys = [
  ['↑ ↓ / j k', 'move between seats'],
  ['← → / h l', 'move between accounts'],
  ['tab', 'next machine'],
  ['enter', 'launch, or sign in'],
  ['s / o', 'sign in / sign out'],
  ['c', 'copy the config path'],
  ['p', 'open the desktop app'],
  ['u', 'see what every seat has left'],
  ['a / n / x', 'add / rename / delete a cell'],
  ['m / X', 'add / forget a machine'],
  ['i', 'install or update favo there'],
  ['U', 'update favo everywhere'],
  ['r / R', 'refresh / mend shared links'],
  ['d', 'choose the launch folder'],
  ['t', 'change the theme'],
  ['q', 'quit'],
  ['↗ → ↘', 'ahead of, on or under pace'],
  ['█ ╱ ░ │', 'left, next reset, rest, pace'],
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  const colors = useApp((state) => state.colors);
  useKeyboard((key) => {
    if (key.name === 'escape' || key.sequence === '?' || key.name === 'return') onClose();
  });

  return (
    <Dialog title="keys" width={46}>
      {Keys.map(([keys, label]) => (
        <text key={keys}>
          <span fg={colors.accent}>{keys!.padEnd(12)}</span>
          <span fg={colors.text}>{label}</span>
        </text>
      ))}
    </Dialog>
  );
}
