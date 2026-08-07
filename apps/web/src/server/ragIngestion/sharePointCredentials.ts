export interface SharePointCredentials {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export function loadSharePointCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): SharePointCredentials {
  return {
    tenantId: preferred(environment.RAG_SHAREPOINT_TENANT_ID, environment.AUTH_MICROSOFT_TENANT_ID),
    clientId: preferred(environment.RAG_SHAREPOINT_CLIENT_ID, environment.AUTH_MICROSOFT_CLIENT_ID),
    clientSecret: preferred(
      environment.RAG_SHAREPOINT_CLIENT_SECRET,
      environment.AUTH_MICROSOFT_CLIENT_SECRET,
    ),
  };
}

function preferred(primary: string | undefined, fallback: string | undefined): string | undefined {
  return nonEmpty(primary) ?? nonEmpty(fallback);
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
