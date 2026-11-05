const SshVariables = ['SSH_TTY', 'SSH_CLIENT', 'SSH_CONNECTION'];
const WslVariables = ['WSL_DISTRO_NAME', 'WSL_INTEROP'];
const WslReleaseMarks = ['microsoft', 'wsl'];
const ContainerMarks = ['docker', 'containerd', 'kubepods'];
const NoBusAddresses = ['', 'none:', 'disabled:'];

export const KeychainFactFiles = {
  osRelease: '/proc/sys/kernel/osrelease',
  cgroup: '/proc/1/cgroup',
  dockerEnv: '/.dockerenv',
};

export type KeychainFacts = {
  env: Record<string, string | undefined>;
  isLinux: boolean;
  osRelease?: string;
  cgroup?: string;
  hasDockerEnv: boolean;
  hasBusSocket: boolean;
};

export function sessionBusOf(env: Record<string, string | undefined>, uid?: number) {
  if (env.XDG_RUNTIME_DIR) return `${env.XDG_RUNTIME_DIR}/bus`;
  return uid === undefined ? undefined : `/run/user/${uid}/bus`;
}

export function isKeychainSkipped(facts: KeychainFacts) {
  const { env, isLinux, osRelease = '', cgroup = '' } = facts;
  if ([...SshVariables, ...WslVariables].some((name) => !!env[name])) return true;
  if (!isLinux) return false;
  if (WslReleaseMarks.some((mark) => osRelease.toLowerCase().includes(mark))) return true;
  if (facts.hasDockerEnv || ContainerMarks.some((mark) => cgroup.includes(mark))) return true;
  return NoBusAddresses.includes(env.DBUS_SESSION_BUS_ADDRESS ?? '') && !facts.hasBusSocket;
}
