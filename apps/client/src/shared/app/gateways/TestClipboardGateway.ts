import { mockDb } from '@/__tests__/db';
import type { IClipboardGateway } from '@/shared/app/gateways/IClipboardGateway';

export class TestClipboardGateway implements IClipboardGateway {
  async copy(text: string) {
    mockDb.clipboard.push(text);
    return true;
  }
}
