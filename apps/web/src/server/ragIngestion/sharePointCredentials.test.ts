import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSharePointCredentials } from './sharePointCredentials';

void test('SharePoint credentials fall back to the Microsoft SSO application', () => {
  assert.deepEqual(
    loadSharePointCredentials({
      AUTH_MICROSOFT_TENANT_ID: 'sso-tenant',
      AUTH_MICROSOFT_CLIENT_ID: 'sso-client',
      AUTH_MICROSOFT_CLIENT_SECRET: 'sso-secret',
    }),
    {
      tenantId: 'sso-tenant',
      clientId: 'sso-client',
      clientSecret: 'sso-secret',
    },
  );
});

void test('dedicated SharePoint credentials take precedence over SSO credentials', () => {
  assert.deepEqual(
    loadSharePointCredentials({
      RAG_SHAREPOINT_TENANT_ID: 'rag-tenant',
      RAG_SHAREPOINT_CLIENT_ID: 'rag-client',
      RAG_SHAREPOINT_CLIENT_SECRET: 'rag-secret',
      AUTH_MICROSOFT_TENANT_ID: 'sso-tenant',
      AUTH_MICROSOFT_CLIENT_ID: 'sso-client',
      AUTH_MICROSOFT_CLIENT_SECRET: 'sso-secret',
    }),
    {
      tenantId: 'rag-tenant',
      clientId: 'rag-client',
      clientSecret: 'rag-secret',
    },
  );
});

void test('blank dedicated values do not suppress the SSO fallback', () => {
  assert.deepEqual(
    loadSharePointCredentials({
      RAG_SHAREPOINT_TENANT_ID: ' ',
      RAG_SHAREPOINT_CLIENT_ID: '',
      RAG_SHAREPOINT_CLIENT_SECRET: '  ',
      AUTH_MICROSOFT_TENANT_ID: 'sso-tenant',
      AUTH_MICROSOFT_CLIENT_ID: 'sso-client',
      AUTH_MICROSOFT_CLIENT_SECRET: 'sso-secret',
    }),
    {
      tenantId: 'sso-tenant',
      clientId: 'sso-client',
      clientSecret: 'sso-secret',
    },
  );
});
