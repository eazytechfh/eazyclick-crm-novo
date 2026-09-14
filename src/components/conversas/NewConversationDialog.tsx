'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { StatusBadge } from '@/components/StatusBadge';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { NewConversationLead } from './types';

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (lead: NewConversationLead) => void;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export function NewConversationDialog({ open, onClose, onSelect }: NewConversationDialogProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NewConversationLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setItems([]);
      setError(null);
      return;
    }
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/conversas/leads?q=${encodeURIComponent(query.trim())}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { items?: NewConversationLead[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Não foi possível buscar os leads.');
        setItems(body.items ?? []);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar os leads.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 id="new-conversation-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Nova conversa
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Escolha um lead que possua WhatsApp.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" aria-label="Fechar nova conversa">
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path d="m5 5 10 10m0-10L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="border-b border-gray-100 p-4 dark:border-gray-800">
          <label className="relative block">
            <span className="sr-only">Buscar lead por nome ou telefone</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou telefone do lead"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>

        <div className="min-h-48 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
              Buscando leads...
            </div>
          ) : error ? (
            <div className="m-2 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400" role="alert">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum lead com telefone encontrado.</div>
          ) : (
            <ul>
              {items.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(lead)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:hover:bg-gray-800"
                  >
                    <Avatar name={lead.name} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.name}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {formatPhone(lead.phone)}
                        {lead.vehicle ? ` · ${lead.vehicle}` : ''}
                      </span>
                    </span>
                    {lead.stage && <StatusBadge estagio={lead.stage} className="shrink-0 !text-[11px]" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
