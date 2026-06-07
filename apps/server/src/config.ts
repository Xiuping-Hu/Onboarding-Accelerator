import 'dotenv/config';

export interface ServerConfig {
  port: number;
  webSearchAllowed: boolean;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number.parseInt(process.env.PORT ?? '3978', 10),
    webSearchAllowed: process.env.WEB_SEARCH_ALLOWED === 'true',
  };
}
