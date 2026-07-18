export interface HttpCookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  expires?: Date;
  maxAge?: number;
}

interface HttpResultBase {
  status: number;
  headers?: Record<string, string>;
  cookies?: HttpCookie[];
}

export type HttpResult =
  | (HttpResultBase & { kind: 'json'; body: object })
  | (HttpResultBase & { kind: 'empty' })
  | (HttpResultBase & { kind: 'text'; body: string })
  | (HttpResultBase & { kind: 'redirect'; location: string });

export const httpResult = {
  json(body: object, status = 200, headers?: Record<string, string>): HttpResult {
    return { kind: 'json', body, status, ...(headers ? { headers } : {}) };
  },
  empty(status = 204, headers?: Record<string, string>): HttpResult {
    return { kind: 'empty', status, ...(headers ? { headers } : {}) };
  },
  text(body: string, status = 200, headers?: Record<string, string>): HttpResult {
    return { kind: 'text', body, status, ...(headers ? { headers } : {}) };
  },
  redirect(location: string, status = 307, cookies?: HttpCookie[]): HttpResult {
    return { kind: 'redirect', location, status, ...(cookies ? { cookies } : {}) };
  },
  withCookies(result: HttpResult, cookies: HttpCookie[]): HttpResult {
    return { ...result, cookies };
  },
};
