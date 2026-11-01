import { useKeyboard } from '@opentui/react';
import { useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { Spinner } from '@/shared/components/Spinner';
import { useApp } from '@/shared/stores/app';

export function RenameAccount() {
  const colors = useApp((state) => state.colors);
  const selectedAccount = useApp((state) => state.selectedAccount);
  const isRenamingAccount = useApp((state) => state.isRenamingAccount);
  const renameAccountError = useApp((state) => state.renameAccountError);
  const closeRenameAccount = useApp((state) => state.closeRenameAccount);
  const submitRenameAccount = useApp((state) => state.submitRenameAccount);
  const [name, setName] = useState(selectedAccount?.displayName ?? '');

  function onNameSubmit() {
    if (name.length > 0) void submitRenameAccount(name);
  }

  useKeyboard((key) => {
    if (key.name === 'escape') closeRenameAccount();
  });

  return (
    <Dialog title={`rename ${selectedAccount?.displayName}`}>
      <text fg={colors.muted}>Only the name changes. Logins, threads and copied paths stay as they are.</text>
      <box border borderStyle="rounded" borderColor={colors.border} marginTop={1} height={3}>
        <input
          focused
          value={name}
          onInput={setName}
          onSubmit={onNameSubmit}
          textColor={colors.text}
          placeholderColor={colors.faint}
        />
      </box>
      {!!renameAccountError && <text fg={colors.danger}>{renameAccountError}</text>}
      <box flexDirection="row" marginTop={1}>
        {isRenamingAccount ? <Spinner label="renaming…" /> : <KeyHint keys="enter" label="rename" />}
        <KeyHint keys="esc" label="cancel" onPress={closeRenameAccount} />
      </box>
    </Dialog>
  );
}
