export function jsonParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

export function normalizeRepositoryUrl(url: string): string {
  return 'https://github.com/' + url.split('github.com/')[1];
}