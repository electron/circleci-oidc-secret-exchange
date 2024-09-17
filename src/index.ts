import Fastify from 'fastify';
import { OIDCSecretExchangeConfig } from './config';
import { FileSecretProvider } from './providers/FileProvider';
import { GenericSecretProvider } from './providers/GenericProvider';
import { GitHubAppTokenProvider } from './providers/GitHubAppProvider';
import { SecretProvider } from './SecretProvider';
import {
  SubjectedSecretProvider,
  getProvidersForConfig,
  perPlatformHandlers,
} from './oidc/handlers';

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

    // let validatedClaims: CircleCIOIDCClaims | null = null;
    // const chosenConfig: OIDCSecretExchangeConfig[0] | null = null;
    let filteredSecretProviders: SubjectedSecretProvider | null = null;
    for (const configuration of config) {
      switch (configuration.type) {
        case 'circleci': {
          filteredSecretProviders = await getProvidersForConfig(
            req.log,
            configuration,
            perPlatformHandlers.circleci,
            token,
          );
          break;
        }
        case 'github': {
          filteredSecretProviders = await getProvidersForConfig(
            req.log,
            configuration,
            perPlatformHandlers.github,
            token,
          );
          break;
        }
        case 'invalid': {
          filteredSecretProviders = await getProvidersForConfig(
            req.log,
            configuration,
            perPlatformHandlers.invalid,
            token,
          );
          break;
        }
      }
    }

    if (!filteredSecretProviders) {
      req.log.warn(
        'Failed to validing incoming OIDC token, did not match any configured organization',
      );
      return reply.code(401).send();
    }

    const secretProvidersInitialized = filteredSecretProviders.providers.map((provider) =>
      provider(),
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
      `Respond to a secrets exchange request from "${
        filteredSecretProviders.subject
      }" with ${JSON.stringify(Object.keys(secretsToSend))}`,
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
