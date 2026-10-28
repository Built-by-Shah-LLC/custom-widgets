import { supabase } from '@/lib/db';
import { beforeAfterFromDbRow } from '@/lib/before-after-config';
import {
  BeforeAfterEditor,
  type BeforeAfterEditorWidget,
} from '@/components/editor/BeforeAfterEditor';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Before/After Slider — Editor',
};

export default async function BeforeAfterWidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  let widgets = null;
  if (id) {
    const selected = await supabase
      .from('before_after_widgets')
      .select('*')
      .eq('id', id)
      .limit(1);
    widgets = selected.data;
  }

  // Preserve the direct /widgets/before-after and stale-link behavior by
  // falling back to the first widget when no selected row exists.
  if (!widgets?.length) {
    const fallback = await supabase
      .from('before_after_widgets')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);
    widgets = fallback.data;
  }

  const items: BeforeAfterEditorWidget[] = (widgets ?? []).map((w) => ({
    widgetId: w.id,
    widgetName: w.name,
    initialConfig: beforeAfterFromDbRow(w),
  }));

  return <BeforeAfterEditor items={items} initialSelectedId={id} />;
}
