'use client';

import { useRef, useState } from 'react';
import { Button, Card, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui';
import { showConfirm } from '@/components/ui/ConfirmDialog';
import { showSaveResult, showToast } from '@/components/ui/Toast';

interface AllowedDomain {
  id: string;
  domain: string;
  created_at: string;
}

interface SettingsPageProps {
  initialDomains: AllowedDomain[];
}

export function SettingsPage({ initialDomains }: SettingsPageProps) {
  const [domains, setDomains] = useState<AllowedDomain[]>(initialDomains);
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Re-entrancy guard: the kit ConfirmDialog closes imperatively, so its
  // Confirm button can be clicked twice before React re-renders — `loading`
  // state closures would be stale. A ref reliably stops a second DELETE.
  const actionInFlightRef = useRef(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/v1/allowed-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: input.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to add domain', 'error');
        return;
      }

      const { liveCacheWarning: _ignored, ...domain } = data;
      setDomains((prev) => [...prev, domain]);
      setInput('');
      showSaveResult(data, 'Domain added');
    } catch {
      showToast('Failed to add domain', 'error');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (domain: AllowedDomain) => {
    setEditingId(domain.id);
    setEditValue(domain.domain);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleUpdate = async (id: string) => {
    if (!editValue.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/allowed-domains/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: editValue.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to update domain', 'error');
        return;
      }

      const { liveCacheWarning: _ignored, ...domain } = data;
      setDomains((prev) => prev.map((d) => (d.id === id ? domain : d)));
      setEditingId(null);
      setEditValue('');
      showSaveResult(data, 'Domain updated');
    } catch {
      showToast('Failed to update domain', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doDelete = async (id: string) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/allowed-domains/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to delete domain', 'error');
        return;
      }

      setDomains((prev) => prev.filter((d) => d.id !== id));
      showSaveResult(data, 'Domain deleted');
    } catch {
      showToast('Failed to delete domain', 'error');
    } finally {
      actionInFlightRef.current = false;
      setLoading(false);
    }
  };

  const requestDelete = (domain: AllowedDomain) => {
    showConfirm(
      'Remove this domain?',
      `“${domain.domain}” will no longer be allowed to load widget embeds.`,
      () => doDelete(domain.id),
      { confirmText: 'Remove', cancelText: 'Cancel' }
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Settings</h1>
      <p className="mt-1 mb-8 text-[var(--color-text-secondary)]">
        Manage the domains that are allowed to load widget embeds.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Allowed Domains</CardTitle>
          <CardDescription>
            When empty, all embed requests are blocked. Add each domain you want to allow.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleAdd} className="mb-6 flex items-center gap-3">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. example.com"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            Save
          </Button>
        </form>

        {domains.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No domains allowed yet. When empty, all embed requests are blocked.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-light)]">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                {editingId === domain.id ? (
                  <>
                    <Input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      disabled={loading}
                    />
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(domain.id)}
                        disabled={loading || !editValue.trim()}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={loading}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {domain.domain}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(domain)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]"
                        onClick={() => requestDelete(domain)}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
