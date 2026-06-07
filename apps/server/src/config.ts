import 'dotenv/config';

export interface ServerConfig {
  port: number;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number.parseInt(process.env.PORT ?? '3978', 10),
  };
}
