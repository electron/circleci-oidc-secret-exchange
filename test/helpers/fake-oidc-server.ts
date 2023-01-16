import * as crypto from 'crypto';
import Fastify from 'fastify';
import { pem2jwk } from 'pem-jwk';

export const startFakeOIDCServer = async (goodOrgId: string) => {
  const fastify = Fastify();

  let endpoint = '';

  fastify.get<{
    Params: {
      orgId: string;
    };
  }>(`/no-metadata/.well-known/openid-configuration`, () => {
    return {
      request_uri_parameter_supported: false,
      claims_supported: [
        'aud',
        'sub',
        'iss',
        'iat',
        'exp',
        'oidc.circleci.com/project-id',
        'oidc.circleci.com/context-ids',
      ],
      subject_types_supported: ['public', 'pairwise'],
      scopes_supported: ['openid'],
      response_types_supported: ['id_token'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
  });

  fastify.get<{
    Params: {
      orgId: string;
    };
  }>(`/org/:orgId/.well-known/openid-configuration`, (req) => {
    return {
      request_uri_parameter_supported: false,
      claims_supported: [
        'aud',
        'sub',
        'iss',
        'iat',
        'exp',
        'oidc.circleci.com/project-id',
        'oidc.circleci.com/context-ids',
      ],
      subject_types_supported: ['public', 'pairwise'],
      scopes_supported: ['openid'],
      issuer: `${endpoint}/org/${req.params.orgId}`,
      response_types_supported: ['id_token'],
      id_token_signing_alg_values_supported: ['RS256'],
      jwks_uri: `${endpoint}/org/${req.params.orgId}/.well-known/jwks-pub.json`,
      service_documentation: 'https://circleci.com/docs/2.0/openid-connect-tokens/',
    };
  });

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  const kid = 'test-key';

  fastify.get(`/org/${goodOrgId}/.well-known/jwks-pub.json`, () => {
    return {
      keys: [
        {
          ...pem2jwk(publicKey),
          kid,
        },
      ],
    };
  });

  fastify.get(`/org/bad-keys/.well-known/jwks-pub.json`, () => {
    return {
      keys: 'foo-lol',
    };
  });

  endpoint = await fastify.listen();

  return {
    endpoint,
    close: () => fastify.close(),
    privateKey,
    publicKey,
    kid,
  };
};
