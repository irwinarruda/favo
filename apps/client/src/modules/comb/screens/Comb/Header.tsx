import { shortPath } from '@/modules/comb/parsers/shortPath';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

export function Header() {
  const colors = useApp((state) => state.colors);
  const summary = useApp((state) => state.fleetSummary);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const selectedDirectory = useApp((state) => state.selectedDirectory);
  const openDirectoryPicker = useApp((state) => state.openDirectoryPicker);
  const error = useError();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={2}
      paddingTop={1}
      paddingBottom={1}
      flexShrink={0}
    >
      <box flexDirection="row" onMouseDown={error.handle(openDirectoryPicker)}>
        <text>
          <span fg={colors.accent}>{Hex.filled}</span>
          <b fg={colors.text}> favo</b>
          {!!selectedMachine && !selectedMachine.isLocal && <span fg={colors.muted}> on {selectedMachine.name}</span>}
          {!!selectedDirectory && (
            <>
              <span fg={colors.muted}> in </span>
              <span fg={colors.accentBright}>{shortPath(selectedDirectory)}</span>
            </>
          )}
        </text>
      </box>
      <text fg={colors.muted}>
        <span fg={colors.text}>{summary.machines}</span> {summary.machines === 1 ? 'hive' : 'hives'} ·{' '}
        <span fg={colors.text}>{summary.accounts}</span> {summary.accounts === 1 ? 'cell' : 'cells'} ·{' '}
        <span fg={colors.accent}>{summary.signedIn}</span> signed in
      </text>
    </box>
  );
}
