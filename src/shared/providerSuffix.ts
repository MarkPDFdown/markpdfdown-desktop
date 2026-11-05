/**
 * Meaning of the value stored in `Provider.suffix`:
 * - `""` / `null`: never configured, the default suffix of the provider type applies.
 *   New and preset providers are stored this way, so it cannot also mean "no suffix".
 * - `NO_SUFFIX`: the user chose "no suffix", the base URL is the complete endpoint.
 * - anything else: the path appended to the base URL.
 */
export const NO_SUFFIX = 'none';

const DEFAULT_SUFFIXES: Record<string, string> = {
  openai: '/chat/completions',
  'openai-responses': '/responses',
  gemini: '/models',
  anthropic: '/messages',
  ollama: '/chat',
};

type Nullable<T> = T | null | undefined;

export const getDefaultSuffix = (type: Nullable<string>): string =>
  DEFAULT_SUFFIXES[type ?? ''] ?? '';

/** The value the suffix dropdown shows. A type without a default suffix has nothing else to show. */
export const getSuffixSelection = (type: Nullable<string>, suffix: Nullable<string>): string =>
  suffix || getDefaultSuffix(type) || NO_SUFFIX;

/** The path actually appended to the base URL. */
export const resolveSuffix = (type: Nullable<string>, suffix: Nullable<string>): string => {
  const selection = getSuffixSelection(type, suffix);
  return selection === NO_SUFFIX ? '' : selection;
};
