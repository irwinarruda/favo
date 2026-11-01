export function parseSshHosts(text: string) {
  const hosts = text.split('\n').flatMap((line) => {
    const match = /^\s*host\s+(.+)$/i.exec(line);
    return match ? match[1]!.trim().split(/\s+/) : [];
  });
  return hosts.filter((host) => !/[*?!]/.test(host));
}
