const WEAK_SECRETS = new Set(["changeme", "secret", "dev-secret", "123456", "password"]);
const MIN_SECRET_LENGTH = 32;

export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true" || process.env.NODE_ENV === "test";
}

export function validateSecurityConfig(): void {
  if (isAuthDisabled()) return;

  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing AUTH_JWT_SECRET. Set a strong secret (>= 32 chars) or AUTH_DISABLED=true for local-only runs.");
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_JWT_SECRET is too short. Minimum length is ${MIN_SECRET_LENGTH} characters.`);
  }

  if (WEAK_SECRETS.has(secret.toLowerCase())) {
    throw new Error("AUTH_JWT_SECRET is weak. Use a high-entropy value.");
  }
}
