import { SecretProvider } from '../SecretProvider';

export class GenericSecretProvider extends SecretProvider<null> {
  constructor(private getSecrets: () => Promise<Record<string, string>>) {
    super();
  }

  loadableContentKey(): string {
    return `generic-secret-no-content`;
  }

  async loadContent(): Promise<null> {
    return null;
  }

  async provideSecrets(): Promise<Record<string, string>> {
    return await Promise.resolve(this.getSecrets());
  }
}
