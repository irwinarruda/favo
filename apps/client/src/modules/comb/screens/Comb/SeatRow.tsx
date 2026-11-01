import type { Seat } from '@/modules/comb/app/entities/Seat';
import { Spinner } from '@/shared/components/Spinner';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const CommandWidth = 9;

export function SeatRow({ seat }: { seat: Seat }) {
  const colors = useApp((state) => state.colors);
  const isSelected = useApp((state) => state.selectedRow?.key === seat.key);
  const selectRow = useApp((state) => state.selectRow);
  const openSelectedSeat = useApp((state) => state.openSelectedSeat);
  const error = useError();
  const headlineColor = seat.isSignedIn ? colors.text : colors.faint;

  async function onSeatClick() {
    if (isSelected) await openSelectedSeat();
    else selectRow(seat.key);
  }

  return (
    <box
      id={seat.key}
      flexDirection="row"
      backgroundColor={isSelected ? colors.selection : undefined}
      onMouseDown={error.handle(onSeatClick)}
    >
      <text fg={colors.accent}>{isSelected ? '▸' : ' '}</text>
      {seat.isChecking ? (
        <box marginLeft={1} width={2}>
          <Spinner />
        </box>
      ) : (
        <text
          fg={seat.isSignedIn ? colors.accent : colors.faint}
        >{` ${seat.isSignedIn ? Hex.filled : Hex.hollow} `}</text>
      )}
      <text fg={isSelected ? colors.accentBright : colors.text}>{seat.command.padEnd(CommandWidth)}</text>
      <text fg={headlineColor} flexGrow={1} flexShrink={1} wrapMode="none" truncate>
        {seat.headline}
      </text>
      {seat.problems > 0 && <text fg={colors.danger}> !</text>}
    </box>
  );
}
