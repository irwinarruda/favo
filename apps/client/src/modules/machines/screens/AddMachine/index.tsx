import { useKeyboard } from '@opentui/react';
import { useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { KeyHint } from '@/shared/components/KeyHint';
import { Spinner } from '@/shared/components/Spinner';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const SourceLabels = { tailscale: 'tailscale', sshConfig: 'ssh config' };

export function AddMachine() {
  const colors = useApp((state) => state.colors);
  const discoveredMachines = useApp((state) => state.discoveredMachines);
  const isJoiningMachine = useApp((state) => state.isJoiningMachine);
  const addMachineError = useApp((state) => state.addMachineError);
  const closeAddMachine = useApp((state) => state.closeAddMachine);
  const submitAddMachine = useApp((state) => state.submitAddMachine);
  const [target, setTarget] = useState('');

  function onTargetSubmit() {
    if (target.length > 0) void submitAddMachine(target);
  }

  useKeyboard((key) => {
    if (key.name === 'escape') closeAddMachine();
  });

  return (
    <Dialog title="new machine" width={62}>
      <text fg={colors.muted}>favo connects over ssh and installs itself there.</text>
      {discoveredMachines.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {discoveredMachines.map((machine) => (
            <box key={machine.target} flexDirection="row" onMouseDown={() => setTarget(machine.target)}>
              <text fg={machine.isOnline === false ? colors.faint : colors.accent}>
                {machine.isOnline === false ? Hex.hollow : Hex.filled}{' '}
              </text>
              <text fg={colors.text}>{machine.name.padEnd(24)}</text>
              <text fg={colors.faint}>{SourceLabels[machine.source]}</text>
            </box>
          ))}
        </box>
      )}
      <box border borderStyle="rounded" borderColor={colors.border} marginTop={1} height={3}>
        <input
          focused
          placeholder="user@host"
          value={target}
          onInput={setTarget}
          onSubmit={onTargetSubmit}
          textColor={colors.text}
          placeholderColor={colors.faint}
        />
      </box>
      {!!addMachineError && <text fg={colors.danger}>{addMachineError}</text>}
      <box flexDirection="row" marginTop={1}>
        {isJoiningMachine ? <Spinner label="moving in…" /> : <KeyHint keys="enter" label="connect" />}
        <KeyHint keys="esc" label="cancel" onPress={closeAddMachine} />
      </box>
    </Dialog>
  );
}
