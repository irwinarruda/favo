export function shortPath(path: string) {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~');
}
