export abstract class ShellEnvironment {
  abstract path(): Promise<string>;
}
