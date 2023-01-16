# @electron/circleci-oidc-secret-exchange

> Provides dynamic access to secrets in exchange for a valid OIDC token

[![CircleCI](https://circleci.com/gh/electron/github-app-auth.svg?style=svg)](https://circleci.com/gh/electron/circleci-oidc-secret-exchange)

## Usage

```typescript
import { configureAndListen } from '@electron/circleci-oidc-secret-exchange';

configureAndListen([
  {
    organizationId: 'foo',
    secrets: [ ... ],
  },
  {
    organizationId: 'bar',
    secrets: [ ... ]
  }
])
```

By default `configureAndListen` listens on `$PORT` for incoming requests.  In CircleCI you just need to POST a valid OIDC token to the
`/exchange` endpoint.  You'll receive a JSON key<>value map of secrets for your build job.

## Secret Providers

All secret providers are configured with a `filters` object which dictates which CircleCI projects and contexts are allowed access
to the secrets it provides.  Please note that we apply an **and** operation to the `projectIds` and `contextIds` filters.  So the
OIDC token must be issued for an allowed project **and** an allowed context.  Not just one or the other.

```typescript
// Will only use this provider if the OIDC token is generated for project abc-def and the build is running in context 123-456
{
  provider: () => ...,
  filters: {
    projectIds: ['abc-def'],
    contextIds: ['123-456'],
  }
}
```

We have a few built-in secret providers documented below, you can build your own provider by importing and implementing the base `SecretProvider` class.

### File Secret Provider

This provider loads a JSON file from disk and let's you read and provide secrets from it.  The file is read fresh on every request
so if you change the file on disk even without restarting the service the updated secrets will be read

```typescript
import { GitHubAppTokenProvider } from '@electron/circleci-oidc-secret-exchange';

export const config = [
  {
    organizationId: 'foo',
    secrets: [
      provider: () => new FileSecretProvider('/etc/org.d/secrets.json', (secrets) => ({
        MY_SECRET_KEY: secrets.fooSecret,
        OTHER_SECRET_KEY: secrets.barSecret,
      })),
      filters: { ... },
    ]
  }
]
```

### GitHub App Token Provider

This provider hands off a permission-scoped, repo-scoped GitHub App installation token as a secret.  These tokens last ~60 minutes
so you if your job takes longer than that the token will no longer be valid.

```typescript
import { GitHubAppTokenProvider } from '@electron/circleci-oidc-secret-exchange';

export const config = [
  {
    organizationId: 'foo',
    secrets: [
      provider: () => new GitHubAppTokenProvider({
        // Creds bundle generated for `@electron/github-app-auth`
        credString: process.env.MY_GITHUB_APP_CREDS,
        // The repo to generate this token for, could be any repo
        // not just the repo that generated the OIDC token
        repo: {
          owner: 'my-org',
          name: 'my-repo',
        },
        // A key<>value map of GitHub app permissions and their values
        permissions: {
          members: 'read',
          contents: 'write',
        }
      }),
      filters: { ... },
    ]
  }
]
```

By default the `GitHubAppTokenProvider` provides a secret with the name `GITHUB_TOKEN`.  You can change that name by providing it as a second parameter to the constructor.