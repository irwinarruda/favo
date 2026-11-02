export abstract class ShellEnvironment {
  abstract path(): Promise<string>;

  async variables(): Promise<Record<string, string>> {
    return {};
  }
}
