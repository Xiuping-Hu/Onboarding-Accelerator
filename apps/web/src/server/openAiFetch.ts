import { ProxyAgent, fetch as undiciFetch } from 'undici';

let configuredProxyUrl: string | undefined;
let proxyDispatcher: ProxyAgent | undefined;

export async function openAiFetch(url: string, init: RequestInit): Promise<Response> {
  const proxyUrl = resolveProviderProxyUrl(
    process.env.OPENAI_PROXY_URL?.trim() || process.env.HTTPS_PROXY?.trim(),
  );

  return providerFetch(url, init, proxyUrl);
}

export async function deepSeekFetch(url: string, init: RequestInit): Promise<Response> {
  const proxyUrl = resolveProviderProxyUrl(
    process.env.DEEPSEEK_PROXY_URL?.trim() ||
      process.env.OPENAI_PROXY_URL?.trim() ||
      process.env.HTTPS_PROXY?.trim(),
  );

  return providerFetch(url, init, proxyUrl);
}

export function resolveProviderProxyUrl(
  proxyUrl: string | undefined,
  isVercel = process.env.VERCEL === '1',
): string | undefined {
  if (!proxyUrl || !isVercel) {
    return proxyUrl;
  }

  try {
    const hostname = new URL(proxyUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return ['localhost', '127.0.0.1', '::1'].includes(hostname) ? undefined : proxyUrl;
  } catch {
    return proxyUrl;
  }
}

async function providerFetch(
  url: string,
  init: RequestInit,
  proxyUrl: string | undefined,
): Promise<Response> {
  if (!proxyUrl) {
    return fetch(url, init);
  }

  if (!proxyDispatcher || configuredProxyUrl !== proxyUrl) {
    if (proxyDispatcher) {
      await proxyDispatcher.close();
    }
    proxyDispatcher = new ProxyAgent(proxyUrl);
    configuredProxyUrl = proxyUrl;
  }

  const proxyInit = {
    ...init,
    dispatcher: proxyDispatcher,
  } as unknown as Parameters<typeof undiciFetch>[1];

  return (await undiciFetch(url, proxyInit)) as unknown as Response;
}

export async function closeOpenAiFetch(): Promise<void> {
  if (proxyDispatcher) {
    await proxyDispatcher.close();
    proxyDispatcher = undefined;
    configuredProxyUrl = undefined;
  }
}
