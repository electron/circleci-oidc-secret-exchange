import { FastifyBaseLogger } from 'fastify';
import {
  CircleOIDCPlatform,
  InvalidOIDCPlatform,
  OIDCSecretExchangeConfig,
  OIDCSecretExchangeConfigItem,
  OIDCSecretExchangeConfiguration,
} from '../config';
import { BaseClaims, CircleCIOIDCClaims } from '../type';
import { getValidatedToken } from './validate-token';

export type SubjectedSecretProvider = {
  subject: string;
  providers: OIDCSecretExchangeConfiguration<object, unknown>['provider'][];
};

export type PlatformHandler<
  TConfig extends OIDCSecretExchangeConfig[0],
  TClaims extends BaseClaims,
> = {
  discoveryUrlForToken: (config: TConfig, token: string) => string | null;
  validateToken: (token: string, discoveryUrl: string) => Promise<TClaims | null>;
  filterSecretProviders: (config: TConfig, claims: TClaims) => Promise<SubjectedSecretProvider>;
};

const circleci: PlatformHandler<
  OIDCSecretExchangeConfigItem<CircleOIDCPlatform>,
  CircleCIOIDCClaims
> = {
  discoveryUrlForToken: (config, token) => {
    // TODO: Pre-validate the token to claim this audience
    return `https://oidc.circleci.com/org/${config.organizationId}`;
  },
  validateToken: async (token, discoveryUrl) => {
    return await getValidatedToken(token, discoveryUrl);
  },
  filterSecretProviders: async (config, claims) => {
    // Do a quick-pass to filter down secret providers based on contextId and projectId claims
    const projectId = claims['oidc.circleci.com/project-id'];
    // It is currently specified by CircleCI that this token will only ever have a single context ID
    // Ref: https://circleci.com/docs/openid-connect-tokens/#format-of-the-openid-connect-id-token
    // Due to a bug however the OIDC token may claim a "null" context-ids array, in that case
    // we assume 0 contexts to take the least-privilege approach
    let validatedContextIds = claims['oidc.circleci.com/context-ids'];
    if (validatedContextIds === null) {
      validatedContextIds = [];
    }
    const contextId = validatedContextIds[0];
    const filteredSecretProviders = config.secrets
      .filter((provider) => {
        if (!provider.filters.projectIds.includes(projectId)) return false;
        // If the wildcard context is allowed then we don't need to check the contextIds filter
        if (!provider.filters.contextIds.includes('*')) {
          // If the contextId is missing from the claim don't validate it in case consumers
          // accidentally put `undefined` in the contextIds array
          if (!contextId || !provider.filters.contextIds.includes(contextId)) return false;
        }
        return true;
      })
      .map((p) => p.provider);

    return { subject: claims.sub, providers: filteredSecretProviders };
  },
};

const invalid: PlatformHandler<OIDCSecretExchangeConfigItem<InvalidOIDCPlatform>, BaseClaims> = {
  discoveryUrlForToken: () => {
    return null;
  },
  validateToken: async () => {
    return null;
  },
  filterSecretProviders: async (_, claims) => {
    return { subject: claims.sub, providers: [] };
  },
};

export const perPlatformHandlers = {
  circleci,
  invalid,
};

export const getProvidersForConfig = async <
  TClaims extends BaseClaims,
  TConfig extends OIDCSecretExchangeConfig[0],
  THandler extends PlatformHandler<TConfig, TClaims>,
>(
  logger: FastifyBaseLogger,
  config: TConfig,
  handler: THandler & PlatformHandler<TConfig, TClaims>,
  token: string,
) => {
  const discoveryUrl = handler.discoveryUrlForToken(config, token);
  if (!discoveryUrl) return null;

  const claims = await handler.validateToken(token, discoveryUrl);
  if (!claims) return null;

  logger.info(`Validated incoming OIDC token from: ${claims.sub}`);

  return await handler.filterSecretProviders(config, claims);
};
