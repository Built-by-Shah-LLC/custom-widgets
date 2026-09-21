import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { normalizeDomain } from '@/lib/domain-utils';
import { requireAdmin } from '@/lib/require-admin';
import { jsonSaved, publishAllEmbedWidgets } from '@/lib/widget-publication';

export const maxDuration = 60;

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await supabase
    .from('allowed_domains')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch domains', message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = normalizeDomain(body.domain ?? '');
  if (!domain) {
    return NextResponse.json(
      { error: 'Domain is required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('allowed_domains')
    .insert({ domain })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Domain already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to save domain', message: error.message },
      { status: 500 }
    );
  }

  return jsonSaved(data, await publishAllEmbedWidgets(request), 201);
}
