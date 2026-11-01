import { ProviderId } from '@favo/domain/providers/provider';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { z } from 'zod';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const ProviderConfig = z.object({ launchArgs: z.array(z.string()).optional() });
const FavoConfig = z.object({
  theme: z.string().optional(),
  accountNames: z.record(z.string(), z.string()).optional(),
  providers: z.partialRecord(z.enum(ProviderId), ProviderConfig).optional(),
});

export class ConfigRepository {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async launchArgsOf(provider: ProviderId) {
    return (await this.read()).providers?.[provider]?.launchArgs ?? [];
  }

  async themeId() {
    return (await this.read()).theme;
  }

  async saveTheme(theme: string) {
    await this.save({ theme });
  }

  async accountNames() {
    return (await this.read()).accountNames ?? {};
  }

  async saveAccountName(account: string, displayName: string | undefined) {
    await this.save({ accountNames: { ...(await this.accountNames()), [account]: displayName } });
  }

  private async save(changes: Record<string, unknown>) {
    const text = `${JSON.stringify({ ...(await this.readObject()), ...changes }, undefined, 2)}\n`;
    await this.fileSystem.writePrivateText(this.paths.configFile, text);
  }

  private async read() {
    const parsed = FavoConfig.safeParse(await this.readObject());
    if (parsed.success) return parsed.data;
    throw new DomainError(
      DomainErrorCode.invalidConfig,
      `${this.paths.configFile}: ${parsed.error.issues[0]?.message}`
    );
  }

  private async readObject(): Promise<Record<string, unknown>> {
    const text = await this.fileSystem.readText(this.paths.configFile);
    if (text === undefined) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new DomainError(DomainErrorCode.invalidConfig, `${this.paths.configFile} is not valid JSON.`);
    }
  }
}
