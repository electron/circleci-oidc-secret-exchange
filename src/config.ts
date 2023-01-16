import { SecretProvider } from './SecretProvider';

// interface ISecretProvider implements SecretProvider {};

export type OIDCSecretExchangeConfiguration<Content> = {
  provider: (projectId: string, contextId: string) => SecretProvider<Content>;
  filters: {
    projectIds: string[];
    contextIds: string[];
  };
};

export type OIDCSecretExchangeConfig = {
  organizationId: string;
  secrets: OIDCSecretExchangeConfiguration<unknown>[];
}[];
