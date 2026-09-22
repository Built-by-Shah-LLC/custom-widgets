import { supabase } from '@/lib/db';
import { SettingsPage, type RecentLoadTiming } from '@/components/SettingsPage';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const [{ data: domains }, { data: timings }] = await Promise.all([
    supabase
      .from('allowed_domains')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('widget_load_timings')
      .select('id, created_at, widget_id, host, data_ms, renderer_ms, ok, slower')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="min-h-screen p-10">
      <SettingsPage
        initialDomains={domains ?? []}
        recentLoads={(timings as RecentLoadTiming[] | null) ?? []}
      />
    </div>
  );
}
