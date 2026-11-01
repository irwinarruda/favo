export type DirectoryContext = { home: string; base: string };

const WindowsDrive = /^[A-Za-z]:$/;
const AbsolutePath = /^(?:[A-Za-z]:)?\//;

export function parseDirectoryInput(input: string, context: DirectoryContext) {
  const absolute = absolutePathOf(input.trim().replaceAll('\\', '/'), context);
  const { parent, prefix } = splitPath(absolute);
  return { parent, prefix, full: prefix ? absolute : parent };
}

export function matchesDirectory(name: string, prefix: string) {
  if (name.startsWith('.') && !prefix.startsWith('.')) return false;
  return name.toLowerCase().startsWith(prefix.toLowerCase());
}

export function joinPath(parent: string, name: string) {
  return parent.endsWith('/') ? `${parent}${name}` : `${parent}/${name}`;
}

export function completeDirectoryInput(input: string, name: string, separator: string) {
  if (input === '~') return `~${separator}${name}${separator}`;
  const lastSeparator = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'));
  return `${input.slice(0, lastSeparator + 1)}${name}${separator}`;
}

export function parentDirectoryInput(input: string) {
  const parent = input.replace(/[^/\\]+[/\\]?$/, '');
  return parent.length > 0 ? parent : input;
}

export function nativePath(path: string, isWindows: boolean) {
  return isWindows ? path.replaceAll('/', '\\') : path;
}

export function pathsOverlap(left: string, right: string) {
  const [first, second] = [left, right].map((path) => comparablePath(path));
  return first!.startsWith(second!) || second!.startsWith(first!);
}

export function isSameDirectory(left: string, right: string) {
  return comparablePath(left) === comparablePath(right);
}

function comparablePath(path: string) {
  return `${path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()}/`;
}

function absolutePathOf(path: string, { home, base }: DirectoryContext) {
  const forwardBase = base.replaceAll('\\', '/');
  if (path === '') return `${forwardBase}/`;
  if (path === '~') return `${home}/`;
  if (path.startsWith('~/')) return `${home}/${path.slice(2)}`;
  if (WindowsDrive.test(path)) return `${path}/`;
  return AbsolutePath.test(path) ? path : joinPath(forwardBase, path);
}

function splitPath(path: string) {
  if (path.endsWith('/')) return { parent: rootOrTrimmed(path), prefix: '' };
  const index = path.lastIndexOf('/');
  return { parent: rootOrTrimmed(path.slice(0, index + 1)), prefix: path.slice(index + 1) };
}

function rootOrTrimmed(path: string) {
  const trimmed = path.replace(/\/+$/, '');
  if (trimmed === '') return '/';
  return WindowsDrive.test(trimmed) ? `${trimmed}/` : trimmed;
}
