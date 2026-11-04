import type { ThemeColors } from '@favo/domain/themes/theme';
import type { UpdateState } from '@favo/domain/updates/update-outcome';
import type { ProviderCliGroup, ProviderCliRow } from '@/modules/updates/app/services/ProviderCliService';
import { updateNoteOf } from '@/modules/updates/parsers/updateNote';
import { useApp } from '@/shared/stores/app';

const VersionWidth = 16;
const OlderMark = ' older';
const NoteColors: Record<UpdateState, keyof ThemeColors> = {
  updating: 'accent',
  failed: 'danger',
  stopped: 'danger',
  leftAlone: 'muted',
};

type CliRowProps = { row: ProviderCliRow; nameWidth: number };

function CliRow({ row, nameWidth }: CliRowProps) {
  const colors = useApp((state) => state.colors);
  const version = row.version ?? 'unknown version';
  const versionCell = `${version}${row.isOlder ? OlderMark : ''}`.padEnd(VersionWidth);

  return (
    <box flexDirection="column" paddingLeft={2}>
      <text wrapMode="none" truncate>
        <span fg={colors.text}>{row.machineName.padEnd(nameWidth)}</span>
        <span fg={row.isOlder ? colors.danger : colors.text}>{versionCell}</span>
        <span fg={colors.muted}>{row.installedWith}</span>
      </text>
      {!!row.lastUpdate && (
        <text wrapMode="none" truncate>
          <span>{' '.repeat(nameWidth)}</span>
          <span fg={colors[NoteColors[row.lastUpdate.state]]}>{updateNoteOf(row.lastUpdate, Date.now())}</span>
        </text>
      )}
    </box>
  );
}

export function CliGroup({ group, nameWidth }: { group: ProviderCliGroup; nameWidth: number }) {
  const colors = useApp((state) => state.colors);

  return (
    <box flexDirection="column" flexShrink={0} marginBottom={1} paddingX={1}>
      <text>
        <b fg={colors.text}>{group.label}</b>
      </text>
      {group.rows.map((row) => (
        <CliRow key={row.key} row={row} nameWidth={nameWidth} />
      ))}
    </box>
  );
}
