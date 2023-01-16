export abstract class SecretProvider<LoadableContent> {
  abstract loadableContentKey(): string;
  abstract loadContent(): Promise<LoadableContent>;
  abstract provideSecrets(content: LoadableContent): Promise<Record<string, string>>;
}
