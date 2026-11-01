import type { ThreadView } from '@favo/contracts/rpc/views';
import { shortThreadId, threadAgeOf } from '@favo/domain/threads/thread';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useEffect, useRef } from 'react';
import { shortPath } from '@/modules/comb/parsers/shortPath';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';

const AgeWidth = 10;
const ListChrome = 12;
const RowHeight = 2;
const MinimumListHeight = 4;

function ThreadRow({ thread, isHighlighted }: { thread: ThreadView; isHighlighted: boolean }) {
  const colors = useApp((state) => state.colors);

  return (
    <box
      id={`thread:${thread.id}`}
      flexDirection="column"
      flexShrink={0}
      backgroundColor={isHighlighted ? colors.selection : undefined}
    >
      <text wrapMode="none" truncate>
        <span fg={colors.accent}>{isHighlighted ? '▸ ' : '  '}</span>
        <span fg={isHighlighted ? colors.accentBright : colors.text}>
          {threadAgeOf(thread.updatedAt, Date.now()).padEnd(AgeWidth)}
        </span>
        <span fg={colors.faint}>{shortThreadId(thread.id)}</span>
        {thread.isDirectoryGone && <span fg={colors.danger}> folder gone</span>}
        {thread.isGuess && <span fg={colors.faint}> a guess</span>}
      </text>
      <text fg={colors.muted} wrapMode="none" truncate>
        {`  ${shortPath(thread.directory)}`}
      </text>
    </box>
  );
}

export function ThreadPicker() {
  const { height } = useTerminalDimensions();
  const colors = useApp((state) => state.colors);
  const selectedThreads = useApp((state) => state.selectedThreads);
  const highlightedThreadIndex = useApp((state) => state.highlightedThreadIndex);
  const moveThreadHighlight = useApp((state) => state.moveThreadHighlight);
  const resumeHighlightedThread = useApp((state) => state.resumeHighlightedThread);
  const closeThreadPicker = useApp((state) => state.closeThreadPicker);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const hasGuess = selectedThreads.some((thread) => thread.isGuess);
  const highlighted = selectedThreads[highlightedThreadIndex];
  const listHeight = Math.min(selectedThreads.length * RowHeight, Math.max(height - ListChrome, MinimumListHeight));

  useKeyboard((key) => {
    if (key.name === 'down' || key.name === 'j') moveThreadHighlight(1);
    if (key.name === 'up' || key.name === 'k') moveThreadHighlight(-1);
    if (key.name === 'return') void error.handle(resumeHighlightedThread)();
    if (key.name === 'escape') closeThreadPicker();
  });

  useEffect(() => {
    if (highlighted) scrollRef.current?.scrollChildIntoView(`thread:${highlighted.id}`);
  }, [highlighted?.id]);

  return (
    <Dialog title="go back to a thread" width={60}>
      <scrollbox ref={scrollRef} height={listHeight}>
        {selectedThreads.map((thread, index) => (
          <ThreadRow key={thread.id} thread={thread} isHighlighted={index === highlightedThreadIndex} />
        ))}
      </scrollbox>
      {hasGuess && (
        <text fg={colors.faint} marginTop={1}>
          A guess comes from the provider's own list. With two sessions in one folder it can pick the wrong one.
        </text>
      )}
      <box flexDirection="row" marginTop={1}>
        <KeyHint keys="↑↓" label="move" />
        <KeyHint keys="enter" label="go back" onPress={error.handle(resumeHighlightedThread)} />
        <KeyHint keys="esc" label="cancel" onPress={closeThreadPicker} />
      </box>
    </Dialog>
  );
}
