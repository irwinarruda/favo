import type { Account } from '@/modules/comb/app/entities/Account';
import { SeatRow } from '@/modules/comb/screens/Comb/SeatRow';
import { useApp } from '@/shared/stores/app';

const CellWidth = 38;

export function AccountCell({ account }: { account: Account }) {
  const colors = useApp((state) => state.colors);
  return (
    <box flexDirection="column" width={CellWidth}>
      <text paddingLeft={1}>
        <b fg={account.isPersonal ? colors.text : colors.accent}>{account.displayName}</b>
        {account.isPersonal && <span fg={colors.faint}> base</span>}
      </text>
      {account.visibleSeats.map((seat) => (
        <SeatRow key={seat.key} seat={seat} />
      ))}
    </box>
  );
}
