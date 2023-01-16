import Fastify from 'fastify';
import { OIDCSecretExchangeConfig, OIDCSecretExchangeConfiguration } from './config';
import { getValidatedToken } from './oidc/validate-token';
import { FileSecretProvider } from './providers/FileProvider';
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
    Body: { token: string };
  }>(
    '/exchange',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      req.log.info('Received secret exchange request');
      const { token } = req.body;

      let validatedClaims: CircleCIOIDCClaims | null = null;
      let secretProviders: OIDCSecretExchangeConfiguration<unknown>[] | null = null;
      for (const configuration of config) {
        validatedClaims = await getValidatedToken(
          token,
          `https://oidc.circleci.com/org/fbdaa81e-9fcd-4b31-9f5d-11feaa8ef52d${configuration.organizationId}`,
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
        return reply.code(401);
      }

      // Do a quick-pass to filter down secret providers based on contextId and projectId claims
      const projectId = validatedClaims['oidc.circleci.com/project-id'];
      // It is currently specified by CircleCI that this token will only ever have a single context ID
      // Ref: https://circleci.com/docs/openid-connect-tokens/#format-of-the-openid-connect-id-token
      const contextId = validatedClaims['oidc.circleci.com/context-ids'][0];
      const filteredSecretProviders = secretProviders.filter((provider) => {
        if (!provider.filters.projectIds.includes(projectId)) return false;
        if (!provider.filters.contextIds.includes(contextId)) return false;
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

      return secretsToSend;
    },
  );

  await fastify.listen({
    port,
  });
};

export { FileSecretProvider, GitHubAppTokenProvider, SecretProvider };
