import type { DirectoryEntry } from '@favo/contracts/rpc/directories/list-directories';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useEffect, useRef } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { useError } from '@/shared/error/useError';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const ListHeight = 8;
const DialogChrome = 16;

function DirectoryRow({ entry, isHighlighted }: { entry: DirectoryEntry; isHighlighted: boolean }) {
  const colors = useApp((state) => state.colors);
  const changeDirectoryInput = useApp((state) => state.changeDirectoryInput);
  const error = useError();

  async function onDirectoryClick() {
    await changeDirectoryInput(entry.completion);
  }

  return (
    <box
      id={`directory:${entry.name}`}
      flexDirection="row"
      flexShrink={0}
      backgroundColor={isHighlighted ? colors.selection : undefined}
      onMouseDown={error.handle(onDirectoryClick)}
    >
      <text fg={colors.accent}>{isHighlighted ? `${Hex.filled} ` : `${Hex.hollow} `}</text>
      <text fg={isHighlighted ? colors.accentBright : colors.text} wrapMode="none" truncate>
        {entry.name}
      </text>
    </box>
  );
}

export function DirectoryPicker() {
  const { height } = useTerminalDimensions();
  const colors = useApp((state) => state.colors);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const directoryInput = useApp((state) => state.directoryInput);
  const directoryEntries = useApp((state) => state.directoryEntries);
  const directoryError = useApp((state) => state.directoryError);
  const highlightedIndex = useApp((state) => state.highlightedDirectoryIndex);
  const closeDirectoryPicker = useApp((state) => state.closeDirectoryPicker);
  const changeDirectoryInput = useApp((state) => state.changeDirectoryInput);
  const moveDirectoryHighlight = useApp((state) => state.moveDirectoryHighlight);
  const completeDirectory = useApp((state) => state.completeDirectory);
  const goUpDirectory = useApp((state) => state.goUpDirectory);
  const submitDirectory = useApp((state) => state.submitDirectory);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const error = useError();
  const highlighted = highlightedIndex === undefined ? undefined : directoryEntries[highlightedIndex];
  const listHeight = Math.max(Math.min(ListHeight, height - DialogChrome), 3);

  useKeyboard((key) => {
    if (key.name === 'escape') closeDirectoryPicker();
    else if (key.name === 'down') moveDirectoryHighlight(1);
    else if (key.name === 'up') moveDirectoryHighlight(-1);
    else if (key.name === 'tab') {
      key.preventDefault();
      void error.handle(completeDirectory)();
    } else if (key.name === 'backspace' && /[/\\]$/.test(directoryInput)) {
      key.preventDefault();
      void error.handle(goUpDirectory)();
    }
  });

  useEffect(() => {
    if (highlighted) scrollRef.current?.scrollChildIntoView(`directory:${highlighted.name}`);
  }, [highlighted?.name]);

  return (
    <Dialog title={`launch folder on ${selectedMachine?.name}`} width={70}>
      <box border borderStyle="rounded" borderColor={colors.accent} height={3}>
        <input
          focused
          value={directoryInput}
          onInput={error.handle(changeDirectoryInput)}
          onSubmit={() => void error.handle(submitDirectory)()}
          textColor={colors.text}
          placeholderColor={colors.faint}
        />
      </box>
      <text fg={colors.muted} marginTop={1}>
        FOLDERS
      </text>
      <scrollbox ref={scrollRef} height={listHeight}>
        {directoryEntries.map((entry, index) => (
          <DirectoryRow key={entry.name} entry={entry} isHighlighted={index === highlightedIndex} />
        ))}
        {directoryEntries.length === 0 && <text fg={colors.faint}>no folders here</text>}
      </scrollbox>
      {!!directoryError && <text fg={colors.danger}>{directoryError}</text>}
      <box flexDirection="row" marginTop={1}>
        <KeyHint keys="↑↓" label="move" />
        <KeyHint keys="tab" label="complete" onPress={error.handle(completeDirectory)} />
        <KeyHint keys="⌫" label="back" onPress={error.handle(goUpDirectory)} />
        <KeyHint keys="enter" label={highlighted ? 'open' : 'use folder'} onPress={error.handle(submitDirectory)} />
        <KeyHint keys="esc" label="close" onPress={closeDirectoryPicker} />
      </box>
    </Dialog>
  );
}
