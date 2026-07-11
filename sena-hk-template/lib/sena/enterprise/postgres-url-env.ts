export const SENA_POSTGRES_URL_ENV_KEYS = [
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL"
] as const;

export type SenaPostgresUrlEnvKey = typeof SENA_POSTGRES_URL_ENV_KEYS[number];

function envValue(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

export function enterprisePostgresConnectionStringFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  for (const key of SENA_POSTGRES_URL_ENV_KEYS) {
    const value = envValue(env, key);
    if (value) return value;
  }
  return undefined;
}

export function enterprisePostgresUrlEnvNameFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  return SENA_POSTGRES_URL_ENV_KEYS.find((key) => Boolean(envValue(env, key)));
}

export function supportedPostgresUrlEnvNamesLabel() {
  return SENA_POSTGRES_URL_ENV_KEYS.join(" or ");
}
