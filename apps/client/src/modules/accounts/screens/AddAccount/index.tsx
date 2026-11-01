import { useKeyboard } from '@opentui/react';
import { useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { Spinner } from '@/shared/components/Spinner';
import { useApp } from '@/shared/stores/app';

export function AddAccount() {
  const colors = useApp((state) => state.colors);
  const selectedMachine = useApp((state) => state.selectedMachine);
  const isAddingAccount = useApp((state) => state.isAddingAccount);
  const addAccountError = useApp((state) => state.addAccountError);
  const closeAddAccount = useApp((state) => state.closeAddAccount);
  const submitAddAccount = useApp((state) => state.submitAddAccount);
  const [name, setName] = useState('');

  function onNameSubmit() {
    if (name.length > 0) void submitAddAccount(name);
  }

  useKeyboard((key) => {
    if (key.name === 'escape') closeAddAccount();
  });

  return (
    <Dialog title={`new cell on ${selectedMachine?.name}`}>
      <text fg={colors.muted}>Each account gets its own login and threads, and shares your skills and settings.</text>
      <box border borderStyle="rounded" borderColor={colors.border} marginTop={1} height={3}>
        <input
          focused
          placeholder="work"
          value={name}
          onInput={setName}
          onSubmit={onNameSubmit}
          textColor={colors.text}
          placeholderColor={colors.faint}
        />
      </box>
      {!!addAccountError && <text fg={colors.danger}>{addAccountError}</text>}
      <box flexDirection="row" marginTop={1}>
        {isAddingAccount ? (
          <box flexShrink={0} marginRight={2}>
            <Spinner label="building the cell…" />
          </box>
        ) : (
          <KeyHint keys="enter" label="add" />
        )}
        <KeyHint keys="esc" label="cancel" onPress={closeAddAccount} />
      </box>
    </Dialog>
  );
}
