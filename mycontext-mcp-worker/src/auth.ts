const BEARER_PREFIX = "Bearer ";

export function isAuthorized(authorizationHeader: string | null, expectedToken: string): boolean {
  const providedToken = extractBearerToken(authorizationHeader);
  if (providedToken === null || expectedToken.length === 0) {
    return false;
  }

  return constantTimeEqual(providedToken, expectedToken);
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length);
  return token.length === 0 ? null : token;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = index < left.length ? left.charCodeAt(index) : 0;
    const rightCode = index < right.length ? right.charCodeAt(index) : 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
}
