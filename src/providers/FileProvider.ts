import * as path from 'path';
import * as fs from 'fs/promises';

import { SecretProvider } from '../SecretProvider';

export class FileSecretProvider<T> extends SecretProvider<T> {
  constructor(
    private filePath: string,
    private getSecretsFromFileContent: (content: T) => Record<string, string>,
  ) {
    super();

    if (!path.isAbsolute(this.filePath)) {
      throw new Error('Path in FileSecretProvider must be absolute');
    }
  }

  loadableContentKey(): string {
    return `file-secret::${this.filePath}`;
  }

  async loadContent(): Promise<T> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    return JSON.parse(content);
  }

  async provideSecrets(content: T): Promise<Record<string, string>> {
    return this.getSecretsFromFileContent(content);
  }
}
