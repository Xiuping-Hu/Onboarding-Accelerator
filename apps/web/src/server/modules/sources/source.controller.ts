import { z } from 'zod';
import { AppError } from '../../core/errors/appError';
import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseParams } from '../../core/http/requestParsers';
import { safeHttpHref, type SourceLinkService } from '../../sourceLinkService';

const SourceParamsSchema = z.object({ sourceId: z.string().min(1) });

export function createSourceController(service: SourceLinkService) {
  const open: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { sourceId } = parseParams(context.params, SourceParamsSchema);
    const source = await service.resolveSource(sourceId, user.id);
    if (!source) throw AppError.notFound('Source is unavailable');

    const externalHref = safeHttpHref(source.uri);
    if (externalHref) return httpResult.redirect(externalHref);

    return httpResult.text(renderSourcePreview(source.title, source.excerpt), 200, {
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
  };

  return { open };
}

function renderSourcePreview(title: string, excerpt: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; background: #f5f7fb; color: #1d2939; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(720px, calc(100% - 32px)); margin: 48px auto; border: 1px solid #d8e0eb;
        border-radius: 14px; padding: 24px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 10%); }
      p { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <p><strong>Company knowledge source</strong></p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(excerpt)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
