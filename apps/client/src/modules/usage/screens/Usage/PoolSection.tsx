import { UsageBarPart, usageHeadlineOf, usageRowOf } from '@favo/domain/usage/usage-bar';
import type { UsagePool, UsagePoolColumn, UsagePoolWindow } from '@favo/domain/usage/usage-pool';
import { useApp } from '@/shared/stores/app';

const LabelWidth = 16;

type RowSizes = { nameWidth: number; barWidth: number };

function SeatBar({
  column,
  showPercent,
  nameWidth,
  barWidth,
}: RowSizes & { column: UsagePoolColumn; showPercent: boolean }) {
  const colors = useApp((state) => state.colors);
  const now = useApp((state) => state.usageNow);
  const { seat, member } = column;
  const name = seat.name.padEnd(nameWidth);
  const partColors = {
    [UsageBarPart.left]: colors.accent,
    [UsageBarPart.refill]: colors.muted,
    [UsageBarPart.track]: colors.faint,
    [UsageBarPart.tick]: colors.text,
  };

  if (!member) {
    return (
      <text fg={colors.faint} paddingLeft={2} wrapMode="none" truncate>
        {`${name}  not reported`}
      </text>
    );
  }

  const { isStale } = member;
  const { bar, percent, facts } = usageRowOf(member, barWidth, now);

  return (
    <text paddingLeft={2} wrapMode="none" truncate>
      <span fg={isStale ? colors.faint : colors.text}>{`${name}  `}</span>
      {bar.map(({ offset, part, text }) => (
        <span key={offset} fg={isStale ? colors.faint : partColors[part]}>
          {text}
        </span>
      ))}
      {showPercent && <span fg={isStale ? colors.faint : colors.text}>{` ${percent}`}</span>}
      <span fg={isStale ? colors.faint : colors.muted}>{`  ${facts}`}</span>
    </text>
  );
}

function PoolWindow({ pool, window, ...sizes }: RowSizes & { pool: UsagePool; window: UsagePoolWindow }) {
  const colors = useApp((state) => state.colors);
  const { label, remaining, facts } = usageHeadlineOf(window);

  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={2} marginTop={1}>
      <text wrapMode="none" truncate>
        <span fg={window.isStale ? colors.faint : colors.text}>{label}</span>
        <b fg={window.isStale ? colors.faint : colors.accent}>{remaining}</b>
        <span fg={colors.muted}>{facts}</span>
      </text>
      {window.columns.map((column) => (
        <SeatBar key={column.seat.key} column={column} showPercent={pool.seats.length > 1} {...sizes} />
      ))}
    </box>
  );
}

export function PoolSection({ pool, ...sizes }: RowSizes & { pool: UsagePool }) {
  const colors = useApp((state) => state.colors);

  if (pool.summary) {
    return (
      <text marginBottom={1} wrapMode="none" truncate>
        <b fg={colors.text}>{pool.label.padEnd(LabelWidth)}</b>
        <span fg={colors.faint}>{pool.summary}</span>
      </text>
    );
  }

  return (
    <box flexDirection="column" flexShrink={0} marginBottom={1}>
      <text>
        <b fg={colors.text}>{pool.label}</b>
      </text>
      {pool.windows.map((window) => (
        <PoolWindow key={`${window.kind}:${window.id}`} pool={pool} window={window} {...sizes} />
      ))}
      {pool.notices.map(({ name, message }) => (
        <text key={name} fg={colors.faint} paddingLeft={2} marginTop={1} wrapMode="none" truncate>
          {name}: {message}
        </text>
      ))}
    </box>
  );
}
