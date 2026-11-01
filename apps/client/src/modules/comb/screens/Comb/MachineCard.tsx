import type { Machine } from '@/modules/comb/app/entities/Machine';
import { MachinePresence } from '@/modules/comb/app/enums/MachinePresence';
import { AccountCell } from '@/modules/comb/screens/Comb/AccountCell';
import { Spinner } from '@/shared/components/Spinner';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

export function MachineCard({ machine }: { machine: Machine }) {
  const colors = useApp((state) => state.colors);
  const accounts = useApp((state) => state.accounts).filter((account) => account.machineId === machine.id);
  const isActive = useApp((state) => state.selectedMachine?.id === machine.id);
  const selectRow = useApp((state) => state.selectRow);
  const isBusy = machine.presence === MachinePresence.connecting || machine.presence === MachinePresence.installing;
  const rowKey = `machine:${machine.id}`;
  const mark = machine.isOnline ? Hex.filled : Hex.hollow;

  return (
    <box
      id={rowKey}
      flexDirection="column"
      flexShrink={0}
      marginBottom={1}
      paddingX={1}
      border
      borderStyle="rounded"
      borderColor={isActive ? colors.accent : colors.border}
      title={` ${mark} ${machine.name} · ${machine.where} `}
      onMouseDown={() => accounts.length === 0 && selectRow(rowKey)}
    >
      {accounts.length > 0 ? (
        <box flexDirection="row" flexWrap="wrap" rowGap={1} columnGap={1}>
          {accounts.map((account) => (
            <AccountCell key={account.key} account={account} />
          ))}
        </box>
      ) : isBusy ? (
        <Spinner label={machine.presence === MachinePresence.installing ? 'moving in…' : 'reaching out…'} />
      ) : (
        <text fg={colors.muted}>{machine.presenceLabel}</text>
      )}
    </box>
  );
}
