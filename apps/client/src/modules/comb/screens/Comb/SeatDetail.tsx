import type { SharedItemView } from '@favo/contracts/rpc/views';
import { SharedItemState } from '@favo/domain/sharing/shared-item';
import type { ThemeColors } from '@favo/domain/themes/theme';
import { shortThreadId, threadAgeOf } from '@favo/domain/threads/thread';
import { useEffect } from 'react';
import type { Machine } from '@/modules/comb/app/entities/Machine';
import type { Seat } from '@/modules/comb/app/entities/Seat';
import { shortPath } from '@/modules/comb/parsers/shortPath';
import { KeyHint } from '@/shared/components/KeyHint';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const ItemMarks: Record<SharedItemState, { mark: string; color: keyof ThemeColors }> = {
  linked: { mark: '✓', color: 'success' },
  notInBase: { mark: '·', color: 'faint' },
  needsLink: { mark: '+', color: 'accent' },
  broken: { mark: '!', color: 'danger' },
  conflict: { mark: '!', color: 'danger' },
  ownLink: { mark: '~', color: 'accent' },
};

type CellProps = { isCompact: boolean; onRemoveAccount(): void; onGoBackToThread(): Promise<void> };
type SeatPanelProps = CellProps & { seat: Seat };

function Heading({ children }: { children: string }) {
  const colors = useApp((state) => state.colors);
  return (
    <text fg={colors.muted} marginTop={1}>
      {children}
    </text>
  );
}

function SharedItem({ item }: { item: SharedItemView }) {
  const colors = useApp((state) => state.colors);
  const { mark, color } = ItemMarks[item.state];

  return (
    <text fg={item.state === SharedItemState.notInBase ? colors.faint : colors.text} wrapMode="none" truncate>
      <span fg={colors[color]}>{mark}</span> {item.name}
    </text>
  );
}

function LaunchDirectory() {
  const colors = useApp((state) => state.colors);
  const selectedDirectory = useApp((state) => state.selectedDirectory);
  const openDirectoryPicker = useApp((state) => state.openDirectoryPicker);
  const error = useError();

  return (
    <box flexDirection="column" onMouseDown={error.handle(openDirectoryPicker)}>
      <Heading>LAUNCHES IN · press d to change</Heading>
      <text fg={colors.text} wrapMode="char">
        {selectedDirectory ? shortPath(selectedDirectory) : 'unknown until it connects'}
      </text>
    </box>
  );
}

function LastThread({ onGoBackToThread }: Pick<CellProps, 'onGoBackToThread'>) {
  const colors = useApp((state) => state.colors);
  const selectedThreads = useApp((state) => state.selectedThreads);
  const needsThreadHook = useApp((state) => state.needsThreadHook);
  const error = useError();
  const thread = selectedThreads[0];
  const others = selectedThreads.length - 1;

  if (!thread) {
    return (
      <box flexDirection="column" onMouseDown={error.handle(onGoBackToThread)}>
        <Heading>{needsThreadHook ? 'THREADS · press b to remember them' : 'LAST THREAD'}</Heading>
        <text fg={colors.faint}>{needsThreadHook ? 'favo is not keeping them yet' : 'none yet'}</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" onMouseDown={error.handle(onGoBackToThread)}>
      <Heading>LAST THREAD · press b to go back</Heading>
      <text fg={colors.text} wrapMode="none" truncate>
        {threadAgeOf(thread.updatedAt, Date.now())}
        <span fg={colors.faint}> · {shortThreadId(thread.id)}</span>
        {others > 0 && <span fg={colors.faint}> · {others} more</span>}
      </text>
      <text fg={thread.isDirectoryGone ? colors.danger : colors.muted} wrapMode="char">
        {thread.isDirectoryGone ? `gone: ${shortPath(thread.directory)}` : shortPath(thread.directory)}
      </text>
      {thread.isGuess && <text fg={colors.faint}>a guess: with two sessions here it can pick the wrong one</text>}
    </box>
  );
}

function CellActions({ isCompact, onRemoveAccount }: Omit<CellProps, 'onGoBackToThread'>) {
  const selectedAccount = useApp((state) => state.selectedAccount);
  const openRenameAccount = useApp((state) => state.openRenameAccount);

  return (
    <box flexDirection="row" marginTop={isCompact ? 0 : 1}>
      <KeyHint keys="n" label="rename" onPress={openRenameAccount} />
      {!selectedAccount?.isPersonal && <KeyHint keys="x" label="delete" onPress={onRemoveAccount} />}
    </box>
  );
}

function SeatPanel({ seat, isCompact, onRemoveAccount, onGoBackToThread }: SeatPanelProps) {
  const colors = useApp((state) => state.colors);
  const selectedAccount = useApp((state) => state.selectedAccount);
  const inspection = useApp((state) => state.inspection);
  const inspectSelectedSeat = useApp((state) => state.inspectSelectedSeat);
  const loadSelectedThreads = useApp((state) => state.loadSelectedThreads);
  const selectedDirectory = useApp((state) => state.selectedDirectory);
  const canKeepThreads = useApp((state) => state.canKeepThreads);
  const copySelectedPath = useApp((state) => state.copySelectedPath);
  const error = useError();
  const items = inspection?.items.filter((item) => item.state !== SharedItemState.notInBase) ?? [];
  const absent = (inspection?.items.length ?? 0) - items.length;

  useEffect(() => {
    void error.handle(inspectSelectedSeat)();
  }, [seat.key]);

  useEffect(() => {
    void error.handle(loadSelectedThreads)();
  }, [seat.key, selectedDirectory]);

  return (
    <box flexDirection="column">
      <text>
        <span fg={seat.isSignedIn ? colors.accent : colors.faint}>{seat.isSignedIn ? Hex.filled : Hex.hollow}</span>
        <b fg={colors.text}> {seat.label}</b>
        <span fg={colors.muted}> as </span>
        <span fg={colors.accent}>{selectedAccount?.displayName}</span>
      </text>
      <text fg={seat.isSignedIn ? colors.text : colors.faint} wrapMode="none" truncate>
        {seat.identity ?? (seat.isSignedIn ? 'signed in' : 'not signed in')}
      </text>
      {!!seat.plan && <text fg={colors.muted}>{seat.plan}</text>}
      <CellActions isCompact={isCompact} onRemoveAccount={onRemoveAccount} />
      <LaunchDirectory />
      {canKeepThreads && <LastThread onGoBackToThread={onGoBackToThread} />}
      <Heading>CONFIG PATH · press c to copy</Heading>
      <box onMouseDown={error.handle(copySelectedPath)}>
        <text fg={colors.accentBright} wrapMode="char">
          {shortPath(seat.path)}
        </text>
      </box>
      <text fg={colors.faint}>T3 Code: {seat.pathHint}</text>
      {!isCompact && (
        <>
          <Heading>SHARED WALLS</Heading>
          {items.map((item) => (
            <SharedItem key={item.name} item={item} />
          ))}
          {items.length === 0 && <text fg={colors.faint}>nothing to share yet</text>}
          {absent > 0 && <text fg={colors.faint}>· {absent} more not in your base</text>}
          <Heading>SEALED IN THIS CELL</Heading>
          <text fg={colors.faint}>login, threads, history</text>
        </>
      )}
      {seat.hasSharedLogin && (
        <text fg={colors.danger} marginTop={1}>
          Threads are separate, but this login may be shared across accounts.
        </text>
      )}
    </box>
  );
}

function MachinePanel({ machine }: { machine: Machine }) {
  const colors = useApp((state) => state.colors);
  return (
    <box flexDirection="column">
      <text>
        <b fg={colors.text}>{machine.name}</b>
      </text>
      <text fg={colors.muted}>{machine.where}</text>
      <text fg={machine.isOnline ? colors.success : colors.danger} marginTop={1}>
        {machine.presenceLabel}
      </text>
      {!!machine.message && <text fg={colors.muted}>{machine.message}</text>}
      {!!machine.directory && <LaunchDirectory />}
      {machine.canInstall && (
        <text fg={colors.text} marginTop={1}>
          Press i to {machine.installLabel} favo there.
        </text>
      )}
    </box>
  );
}

type SeatDetailProps = CellProps & { width?: number };

export function SeatDetail({ width, isCompact, onRemoveAccount, onGoBackToThread }: SeatDetailProps) {
  const colors = useApp((state) => state.colors);
  const selectedSeat = useApp((state) => state.selectedSeat);
  const selectedMachine = useApp((state) => state.selectedMachine);

  return (
    <box
      flexDirection="column"
      width={width}
      flexShrink={0}
      paddingX={2}
      paddingY={isCompact ? 0 : 1}
      marginBottom={1}
      border
      borderStyle="rounded"
      borderColor={colors.border}
      title=" cell "
    >
      {selectedSeat ? (
        <SeatPanel
          seat={selectedSeat}
          isCompact={isCompact}
          onRemoveAccount={onRemoveAccount}
          onGoBackToThread={onGoBackToThread}
        />
      ) : (
        !!selectedMachine && <MachinePanel machine={selectedMachine} />
      )}
    </box>
  );
}
