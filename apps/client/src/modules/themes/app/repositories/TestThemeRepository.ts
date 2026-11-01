import { mockDb } from '@/__tests__/db';
import type { IThemeRepository } from '@/modules/themes/app/repositories/IThemeRepository';

export class TestThemeRepository implements IThemeRepository {
  async getThemes() {
    return mockDb.themeList;
  }

  async selectTheme(id: string) {
    mockDb.themeList = { ...mockDb.themeList, activeId: id };
  }
}
