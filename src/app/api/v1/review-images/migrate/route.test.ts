import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAdmin,
  migrateBusinessReviewImages,
  publishEmbedWidgets,
  jsonSaved,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  migrateBusinessReviewImages: vi.fn(),
  publishEmbedWidgets: vi.fn(),
  jsonSaved: vi.fn((result: unknown, cache: unknown) => Response.json({ result, cache })),
}));

vi.mock('@/lib/require-admin', () => ({ requireAdmin }));
vi.mock('@/lib/review-image-migration', () => ({ migrateBusinessReviewImages }));
vi.mock('@/lib/widget-publication', () => ({ publishEmbedWidgets, jsonSaved }));

import { POST } from './route';

const businessId = '123e4567-e89b-42d3-a456-426614174000';

function request(body: unknown) {
  return new Request('https://widgets.example/api/v1/review-images/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('review photo migration route', () => {
  beforeEach(() => {
    requireAdmin.mockResolvedValue({ error: null });
  });

  it('rejects an invalid business id before any migration', async () => {
    const response = await POST(request({ businessId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A valid businessId is required' });
    expect(migrateBusinessReviewImages).not.toHaveBeenCalled();
  });

  it('publishes every affected widget after a successful migration', async () => {
    const result = { businessId, widgetIds: ['widget-1'], reviews: [], complete: true };
    migrateBusinessReviewImages.mockResolvedValue(result);
    publishEmbedWidgets.mockResolvedValue({ ok: true });
    const migrationRequest = request({ businessId });

    const response = await POST(migrationRequest);

    expect(migrateBusinessReviewImages).toHaveBeenCalledWith(businessId);
    expect(publishEmbedWidgets).toHaveBeenCalledWith(migrationRequest, ['widget-1']);
    expect(jsonSaved).toHaveBeenCalledWith(result, { ok: true });
    expect(response.status).toBe(200);
  });
});
