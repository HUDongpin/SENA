export const SENA_VERIFIER_EXTERNAL_ENV_KEYS: readonly string[];

export function buildSenaVerifierEnvironment(
  baseEnvironment?: NodeJS.ProcessEnv | Record<string, string | undefined>,
  overrides?: NodeJS.ProcessEnv | Record<string, string | undefined>,
  projectDirectory?: string
): Readonly<Record<string, string>>;

export function assertSenaVerifierEnvironmentIsLocal<T extends Record<string, string | undefined>>(
  environment: T,
  expectedEnterpriseDbDir: string
): T;
