import Fastify from 'fastify';
import { OIDCSecretExchangeConfig, OIDCSecretExchangeConfiguration } from './config';
import { getValidatedToken } from './oidc/validate-token';
import { FileSecretProvider } from './providers/FileProvider';
import { GenericSecretProvider } from './providers/GenericProvider';
import { GitHubAppTokenProvider } from './providers/GitHubAppProvider';
import { SecretProvider } from './SecretProvider';
import { CircleCIOIDCClaims } from './type';

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

export const configureAndListen = async (
  config: OIDCSecretExchangeConfig,
  port: number = DEFAULT_PORT,
) => {
  const fastify = Fastify({
    logger: true,
  });

  fastify.get('/healthcheck', async () => {
    return { alive: true };
  });

  fastify.post<{
    Querystring: { format: string };
    Body: { token: string };
  }>('/exchange', async (req, reply) => {
    req.log.info('Received secret exchange request');
    let token = req.body?.token;
    if (!token) {
      token = req.headers['x-oidc-token'] as string;
    }

    if (!token || typeof token !== 'string') {
      return reply.code(400).send('Missing token');
    }

    let validatedClaims: CircleCIOIDCClaims | null = null;
    let secretProviders: OIDCSecretExchangeConfiguration<unknown>[] | null = null;
    for (const configuration of config) {
      validatedClaims = await getValidatedToken(
        token,
        `https://oidc.circleci.com/org/${configuration.organizationId}`,
      );
      if (validatedClaims) {
        req.log.info(`Validated incoming OIDC token from: ${validatedClaims.sub}`);
        secretProviders = configuration.secrets;
        break;
      }
    }

    if (!validatedClaims || !secretProviders) {
      req.log.warn(
        'Failed to validing incoming OIDC token, did not match any configured organization',
      );
      return reply.code(401).send();
    }

    // Do a quick-pass to filter down secret providers based on contextId and projectId claims
    const projectId = validatedClaims['oidc.circleci.com/project-id'];
    // It is currently specified by CircleCI that this token will only ever have a single context ID
    // Ref: https://circleci.com/docs/openid-connect-tokens/#format-of-the-openid-connect-id-token
    // Due to a bug however the OIDC token may claim a "null" context-ids array, in that case
    // we assume 0 contexts to take the least-privilege approach
    let validatedContextIds = validatedClaims['oidc.circleci.com/context-ids'];
    if (validatedContextIds === null) {
      validatedContextIds = [];
    }
    const contextId = validatedContextIds[0];
    const filteredSecretProviders = secretProviders.filter((provider) => {
      if (!provider.filters.projectIds.includes(projectId)) return false;
      // If the wildcard context is allowed then we don't need to check the contextIds filter
      if (!provider.filters.contextIds.includes('*')) {
        // If the contextId is missing from the claim don't validate it in case consumers
        // accidentally put `undefined` in the contextIds array
        if (!contextId || !provider.filters.contextIds.includes(contextId)) return false;
      }
      return true;
    });

    const secretProvidersInitialized = filteredSecretProviders.map((provider) =>
      provider.provider(projectId, contextId),
    );

    // Some secret providers need to load content, and some secrets use the same
    // loaded content.  To reduce work we share loadable content across secret providers
    const contentToLoad: Record<string, Promise<unknown> | undefined> = {};

    // Get content we need to load and share
    const loaders: Promise<unknown>[] = [];
    for (const secretProvider of secretProvidersInitialized) {
      const key = secretProvider.loadableContentKey();
      if (contentToLoad[key]) continue;

      const promise = secretProvider.loadContent();
      contentToLoad[key] = promise;
      loaders.push(promise);
    }

    // Wait for all content to load
    await Promise.all(loaders);

    const secretsToSend: Record<string, string> = {};
    await Promise.all(
      secretProvidersInitialized.map(async (provider) => {
        const key = provider.loadableContentKey();
        const providedSecrets = await provider.provideSecrets(await contentToLoad[key]);
        for (const secretKey of Object.keys(providedSecrets)) {
          if (secretsToSend[secretKey]) {
            throw new Error(`Two secret providers provided the same secret key: "${secretKey}"`);
          }

          secretsToSend[secretKey] = providedSecrets[secretKey];
        }
      }),
    );

    req.log.info(
      `Respond to a secrets exchange request from "${validatedClaims.sub}" with ${JSON.stringify(
        Object.keys(secretsToSend),
      )}`,
    );

    if (req.query.format === 'shell' || req.query.format === 'powershell') {
      for (const secretKey of Object.keys(secretsToSend)) {
        if (!/^[A-Za-z][A-Za-z0-9_]+$/i.test(secretKey)) {
          req.log.error(
            `Shell format was requested but the "${secretKey}" key is not compatible with shell variable naming`,
          );
          return reply.status(422).send('');
        }
      }
      if (req.query.format === 'shell') {
        return Object.keys(secretsToSend)
          .map((secretKey) => `export ${secretKey}=${JSON.stringify(secretsToSend[secretKey])}\n`)
          .join('');
      }
      if (req.query.format === 'powershell') {
        return Object.keys(secretsToSend)
          .map((secretKey) => `$env:${secretKey} = ${JSON.stringify(secretsToSend[secretKey])}\n`)
          .join('');
      }
    }

    return secretsToSend;
  });

  await fastify.listen({
    port,
    host: '0.0.0.0',
  });
};

export { FileSecretProvider, GenericSecretProvider, GitHubAppTokenProvider, SecretProvider };
