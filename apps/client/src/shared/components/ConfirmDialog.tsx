import { useKeyboard } from '@opentui/react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { useApp } from '@/shared/stores/app';

export type Confirmation = { title: string; message: string; onAccept(): void };

export function ConfirmDialog(props: { confirmation: Confirmation; onClose(): void }) {
  const colors = useApp((state) => state.colors);
  const { confirmation, onClose } = props;

  function onAccept() {
    onClose();
    confirmation.onAccept();
  }

  useKeyboard((key) => {
    if (key.name === 'y') onAccept();
    if (key.name === 'n' || key.name === 'escape') onClose();
  });

  return (
    <Dialog title={confirmation.title}>
      <text fg={colors.text}>{confirmation.message}</text>
      <box flexDirection="row" marginTop={1}>
        <KeyHint keys="y" label="yes" onPress={onAccept} />
        <KeyHint keys="n" label="no" onPress={onClose} />
      </box>
    </Dialog>
  );
}
