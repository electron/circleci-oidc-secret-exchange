import {
  appCredentialsFromString,
  RepoInfo,
  AuthNarrowing,
  getTokenForRepo,
} from '@electron/github-app-auth';

import { SecretProvider } from '../SecretProvider';

export class GitHubAppTokenProvider extends SecretProvider<null> {
  constructor(
    private options: {
      credsString: string;
      repo: RepoInfo;
      permissions: AuthNarrowing['permissions'];
    },
    private secretName: string = 'GITHUB_TOKEN',
  ) {
    super();
  }

  loadableContentKey(): string {
    return `github-installation::${this.options.repo.owner}/${this.options.repo.name}`;
  }

  async loadContent(): Promise<null> {
    return null;
  }

  async provideSecrets(): Promise<Record<string, string>> {
    const { credsString, repo, permissions } = this.options;

    const creds = appCredentialsFromString(credsString);
    const token = await getTokenForRepo(repo, creds, {
      repositoryNames: [repo.name],
      permissions: permissions,
    });
    if (!token) {
      throw new Error(`Failed to generate GitHub token for repo "${repo.owner}/${repo.name}"`);
    }

    return {
      [this.secretName]: token,
    };
  }
}
