import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { v4 } from 'uuid';

import { getValidatedToken } from '../src/oidc/validate-token';
import { startFakeOIDCServer } from './helpers/fake-oidc-server';

describe('getValidatedToken()', () => {
  const orgId = v4();
  const projectId = v4();
  const userId = v4();
  const contextId = v4();
  let endpoint: string;
  let kid: string;
  let close: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validTokenClaims: any = {};
  let privateKey: string;

  beforeAll(async () => {
    const server = await startFakeOIDCServer(orgId);
    endpoint = server.endpoint;
    close = server.close;
    privateKey = server.privateKey;
    kid = server.kid;
    validTokenClaims = {
      sub: `org/${orgId}/project/${projectId}/user/${userId}`,
      'oidc.circleci.com/project-id': projectId,
      'oidc.circleci.com/context-ids': [contextId],
      iss: `${endpoint}/org/${orgId}`,
      aud: orgId,
    };
  });

  afterAll(() => close());

  it('should return null for an empty token', async () => {
    expect(await getValidatedToken('', 'url')).toBe(null);
  });

  it('should return null for an invalid discovery URL', async () => {
    expect(await getValidatedToken('token', `${endpoint}/bad`)).toBe(null);
  });

  it('should return null for a valid discovery URL without jwks metadata', async () => {
    expect(await getValidatedToken('token', `${endpoint}/no-metadata`)).toBe(null);
  });

  it('should return null for a valid discovery but no server JWKS', async () => {
    expect(await getValidatedToken('token', `${endpoint}/org/${v4()}`)).toBe(null);
  });

  it('should return null for a valid JWKS but a malformed token', async () => {
    expect(await getValidatedToken('token', `${endpoint}/org/${orgId}`)).toBe(null);
  });

  it('should return null for a valid JWKS, a valid token but a bad keys response', async () => {
    const token = jwt.sign(validTokenClaims, privateKey, {
      algorithm: 'RS256',
      header: {
        kid: kid,
        alg: 'RS256',
      },
    });
    expect(await getValidatedToken(token, `${endpoint}/org/bad-keys`)).toBe(null);
  });

  it('should return null for a valid JWKS, a valid token but a mismatching kid', async () => {
    const token = jwt.sign(validTokenClaims, privateKey, {
      algorithm: 'RS256',
      header: {
        kid: 'bad-kid',
        alg: 'RS256',
      },
    });
    expect(await getValidatedToken(token, `${endpoint}/org/${orgId}`)).toBe(null);
  });

  it('should return null for a valid JWKS, a valid token, a matching kid but incorrectly signed', async () => {
    const badKeyPair = crypto.generateKeyPairSync('rsa', {
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
    const token = jwt.sign(validTokenClaims, badKeyPair.privateKey, {
      algorithm: 'RS256',
      header: {
        kid: kid,
        alg: 'RS256',
      },
    });
    expect(await getValidatedToken(token, `${endpoint}/org/${orgId}`)).toBe(null);
  });

  it('should return null for a valid JWKS, a valid token, a matching kid and correctly signed but the wrong algorithm', async () => {
    const token = jwt.sign(validTokenClaims, privateKey, {
      algorithm: 'RS512',
      header: {
        kid: kid,
        alg: 'RS512',
      },
      expiresIn: 60,
    });
    expect(await getValidatedToken(token, `${endpoint}/org/${orgId}`)).toEqual(null);
  });

  it('should return null for a valid JWKS, a valid token, a matching kid and correctly signed but the wrong audience', async () => {
    const token = jwt.sign(
      {
        ...validTokenClaims,
        aud: v4(),
      },
      privateKey,
      {
        algorithm: 'RS256',
        header: {
          kid: kid,
          alg: 'RS256',
        },
        expiresIn: 60,
      },
    );
    expect(await getValidatedToken(token, `${endpoint}/org/${orgId}`)).toEqual(null);
  });

  it('should return null for a valid JWKS, a valid token, a matching kid and correctly signed but the wrong issuer', async () => {
    const token = jwt.sign(
      {
        ...validTokenClaims,
        iss: `${endpoint}/org/${v4()}`,
      },
      privateKey,
      {
        algorithm: 'RS256',
        header: {
          kid: kid,
          alg: 'RS256',
        },
        expiresIn: 60,
      },
    );
    expect(await getValidatedToken(token, `${endpoint}/org/${orgId}`)).toEqual(null);
  });

  it('should return the provided claims for a valid JWKS, a valid token, a matching kid and correctly signed', async () => {
    const token = jwt.sign(validTokenClaims, privateKey, {
      algorithm: 'RS256',
      header: {
        kid: kid,
        alg: 'RS256',
      },
      expiresIn: 60,
    });
    const validated = await getValidatedToken(token, `${endpoint}/org/${orgId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { iat, exp, ...rest } = validated as any;
    expect(typeof iat).toBe('number');
    expect(typeof exp).toBe('number');
    expect(rest).toEqual(validTokenClaims);
  });
});
