import { assetNameFor, RemoteSystem, WindowsAsset } from '#domain/machines/machine';

const PosixBin = '.favo/bin';
const WindowsBin = '.favo\\bin';

export const ProbeCommands = {
  reachable: 'echo favo',
  posix: 'uname -sm',
  windows: 'cmd.exe /c ver',
};

export function detectRemoteSystem(input: { uname: string; ver: string }) {
  if (/Linux|Darwin/.test(input.uname)) return RemoteSystem.posix;
  return /Windows/i.test(input.ver) ? RemoteSystem.windows : RemoteSystem.posix;
}

export function installPlanFor(system: RemoteSystem, uname: string) {
  if (system === RemoteSystem.windows) {
    return {
      assetName: WindowsAsset,
      prepare: `cmd.exe /c "if not exist ${WindowsBin} mkdir ${WindowsBin}"`,
      stagedPath: `${PosixBin}/favo.exe.new`,
      activate: windowsActivation(),
    };
  }
  return {
    assetName: assetNameFor(uname),
    prepare: `mkdir -p ~/${PosixBin}`,
    stagedPath: `${PosixBin}/favo.new`,
    activate: [
      `chmod +x ~/${PosixBin}/favo.new`,
      `mv ~/${PosixBin}/favo.new ~/${PosixBin}/favo`,
      'mkdir -p ~/.local/bin',
      `ln -sf ~/${PosixBin}/favo ~/.local/bin/favo`,
      `~/${PosixBin}/favo --version`,
    ].join(' && '),
  };
}

function windowsActivation() {
  const steps = [
    `(if exist ${WindowsBin}\\favo.exe.old del /q ${WindowsBin}\\favo.exe.old)`,
    `(if exist ${WindowsBin}\\favo.exe move /y ${WindowsBin}\\favo.exe ${WindowsBin}\\favo.exe.old >nul)`,
    `move /y ${WindowsBin}\\favo.exe.new ${WindowsBin}\\favo.exe >nul`,
    `powershell -NoProfile -EncodedCommand ${encodePowerShell(AddToUserPath)}`,
    `${WindowsBin}\\favo.exe --version`,
  ];
  return `cmd.exe /c "${steps.join(' & ')}"`;
}

const AddToUserPath = [
  "$bin = Join-Path $env:USERPROFILE '.favo\\bin'",
  "$path = [Environment]::GetEnvironmentVariable('Path', 'User')",
  "if (($path -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', \"$path;$bin\", 'User') }",
].join('; ');

function encodePowerShell(script: string) {
  const bytes = [...script].flatMap((character) => {
    const code = character.charCodeAt(0);
    return [code & 0xff, code >> 8];
  });
  return btoa(String.fromCharCode(...bytes));
}
