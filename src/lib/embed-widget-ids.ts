import { supabase } from './db';

async function idsFrom(
  table: 'widgets' | 'before_after_widgets' | 'form_widgets',
  businessId?: string
): Promise<string[]> {
  const query = supabase.from(table).select('id');
  const filtered = businessId ? query.eq('business_id', businessId) : query;
  const { data, error } = await filtered;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.id));
}

export async function listAllEmbedWidgetIds(): Promise<string[]> {
  const [widgets, slides, forms] = await Promise.all([
    idsFrom('widgets'),
    idsFrom('before_after_widgets'),
    idsFrom('form_widgets'),
  ]);
  return [...widgets, ...slides, ...forms];
}

export async function listReviewWidgetIdsForBusiness(
  businessId: string
): Promise<string[]> {
  return idsFrom('widgets', businessId);
}
