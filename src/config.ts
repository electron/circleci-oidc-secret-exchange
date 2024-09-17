import { SecretProvider } from './SecretProvider';

export type OIDCSecretExchangeConfiguration<Filters extends object, Content> = {
  provider: () => SecretProvider<Content>;
  filters: Filters;
};

type OIDCPlatform<
  Identifier extends string,
  TopLevelConfig extends object,
  ProviderFilters extends object,
> = {
  identifier: Identifier;
  topLevel: TopLevelConfig;
  filters: ProviderFilters;
};

export type OIDCSecretExchangeConfigItem<
  OIDCPlatformConfig extends OIDCPlatform<string, object, object>,
> = {
  secrets: OIDCSecretExchangeConfiguration<OIDCPlatformConfig['filters'], unknown>[];
} & OIDCPlatformConfig['topLevel'] & {
    type: OIDCPlatformConfig['identifier'];
  };

export type CircleOIDCPlatform = OIDCPlatform<
  'circleci',
  {
    organizationId: string;
  },
  {
    projectIds: string[];
    contextIds: string[];
  }
>;

export type GitHubActionsOIDCPlatform = OIDCPlatform<
  'github',
  {
    organizationId: string;
  },
  {
    repositoryIds: string[];
    environments: string[];
  }
>;

export type InvalidOIDCPlatform = OIDCPlatform<'invalid', object, object>;

export type OIDCSecretExchangeConfig = (
  | OIDCSecretExchangeConfigItem<CircleOIDCPlatform>
  | OIDCSecretExchangeConfigItem<GitHubActionsOIDCPlatform>
  | OIDCSecretExchangeConfigItem<InvalidOIDCPlatform>
)[];
