import type { Seat } from '@/modules/comb/app/entities/Seat';
import { appBadgeOf } from '@/modules/comb/screens/Comb/appMark';
import { Spinner } from '@/shared/components/Spinner';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const CommandWidth = 9;

function AppBadge({ seat }: { seat: Seat }) {
  const colors = useApp((state) => state.colors);
  const { label, fg, bg } = appBadgeOf(seat, colors);

  return (
    <text fg={fg} bg={bg} marginLeft={1} flexShrink={0}>
      {label}
    </text>
  );
}

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
      <text fg={colors.accent} flexShrink={0}>
        {isSelected ? '▸' : ' '}
      </text>
      {seat.isChecking ? (
        <box marginLeft={1} width={2} flexShrink={0}>
          <Spinner />
        </box>
      ) : (
        <text fg={seat.isSignedIn ? colors.accent : colors.faint} flexShrink={0}>
          {` ${seat.isSignedIn ? Hex.filled : Hex.hollow} `}
        </text>
      )}
      <text fg={isSelected ? colors.accentBright : colors.text} flexShrink={0}>
        {seat.command.padEnd(CommandWidth)}
      </text>
      <text fg={headlineColor} flexGrow={1} flexShrink={1} wrapMode="none" truncate>
        {seat.headline}
      </text>
      {seat.hasAppLogin && <AppBadge seat={seat} />}
      {seat.problems > 0 && (
        <text fg={colors.danger} flexShrink={0}>
          {' !'}
        </text>
      )}
    </box>
  );
}
