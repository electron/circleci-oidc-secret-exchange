import got from 'got';
import { BaseClient, Issuer } from 'openid-client';
import * as jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';
import { CircleCIOIDCClaims } from '../type';
import * as path from 'path';

export async function getValidatedToken(token: string, discoveryUrl: string) {
  if (!token) {
    // Token is an empty string, no point even trying
    return null;
  }

  let issuer: Issuer<BaseClient>;
  try {
    issuer = await Issuer.discover(discoveryUrl);
  } catch {
    // Failed to discover the OIDC issuer
    return null;
  }

  if (!issuer?.metadata?.jwks_uri) {
    // Project is not eligible for JWKS backed OIDC credential exchange
    return null;
  }

  const jwks = await got.get(issuer.metadata.jwks_uri, {
    throwHttpErrors: false,
  });

  if (jwks.statusCode !== 200) {
    // Project is not eligible for JWKS backed OIDC credential exchange
    // Failed to load JWKS
    return null;
  }

  // Full claims, not validated
  const claims = jwt.decode(token, { complete: true });
  if (!claims) {
    // Failed to decode token, invalid token provided
    return null;
  }

  const { keys } = JSON.parse(jwks.body);
  // Ensure keys is present, an array, and all items have a kid for matching
  if (!keys || !Array.isArray(keys) || !keys.every((key) => !!key.kid)) {
    // Invalid JWKS endpoints
    return null;
  }

  const nonNullClaims = claims;
  const key = keys.find((key) => key.kid && key.kid === nonNullClaims.header.kid);

  if (!key) {
    // Invalid kid found in the token provided
    return null;
  }

  // Try convert the discovered key into a PEM for jwt verification
  const pem = jwkToPem(key);
  let verifiedClaims: jwt.Jwt;
  try {
    verifiedClaims = jwt.verify(token, pem, {
      complete: true,
      algorithms: ['RS256'],
      issuer: discoveryUrl,
      audience: path.basename(discoveryUrl),
    });
  } catch (err) {
    // Could not verify the provided token against the OIDC provider
    return null;
  }

  return verifiedClaims.payload as CircleCIOIDCClaims;
}
