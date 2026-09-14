'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Avatar } from '@/components/Avatar';
import { StatusBadge } from '@/components/StatusBadge';
import type { ConversationListItem } from './types';
import type { PipelineEtapa } from '@/types/database';
import { sortConversationsByLastActivity } from '@/lib/conversas/conversation-order';

interface ConversationListProps {
  items: ConversationListItem[];
  selectedTelefone: string | null;
  query: string;
  stages: PipelineEtapa[];
  stageFilter: string;
  sellers: string[];
  sellerFilter: string;
  canFilterBySeller: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  filtroNaoCadastrados: boolean;
  totalNaoCadastrados: number | null;
  podeCadastrarTodos: boolean;
  cadastrandoTodos: boolean;
  onQueryChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onSellerChange: (value: string) => void;
  onSelect: (conversation: ConversationListItem) => void;
  onNewConversation: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onToggleFiltroNaoCadastrados: () => void;
  onCadastrarTodos: () => void;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

function AttachmentIcon({ kind }: { kind: 'image' | 'audio' | 'video' | 'document' }) {
  const paths: Record<typeof kind, JSX.Element> = {
    image: (
      <>
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="m4 14 4-4 3 3 3-4 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    audio: (
      <path d="M6 8v4a1 1 0 0 0 1 1h2l3.5 3V4L9 7H7a1 1 0 0 0-1 1Zm9-1.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    ),
    video: (
      <>
        <rect x="3" y="4.5" width="10" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="m13 8.5 4-2.2v7.4l-4-2.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </>
    ),
    document: (
      <>
        <path d="M5 3h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M11 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true">
      {paths[kind]}
    </svg>
  );
}

export function ConversationList({
  items,
  selectedTelefone,
  query,
  stages,
  stageFilter,
  sellers,
  sellerFilter,
  canFilterBySeller,
  loading,
  loadingMore,
  error,
  hasMore,
  total,
  filtroNaoCadastrados,
  totalNaoCadastrados,
  podeCadastrarTodos,
  cadastrandoTodos,
  onQueryChange,
  onStageChange,
  onSellerChange,
  onSelect,
  onNewConversation,
  onLoadMore,
  onRetry,
  onToggleFiltroNaoCadastrados,
  onCadastrarTodos,
}: ConversationListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastRequestedCountRef = useRef(-1);

  const sortedItems = useMemo(() => sortConversationsByLastActivity(items), [items]);

  const virtualCount = sortedItems.length + (hasMore ? 1 : 0);
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (index < sortedItems.length ? 86 : 60),
    getItemKey: (index) => sortedItems[index]?.telefoneNormalizado ?? 'load-more',
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastRow = virtualRows.at(-1);
    if (hasMore && !loadingMore && lastRow && lastRow.index >= sortedItems.length && lastRequestedCountRef.current !== sortedItems.length) {
      lastRequestedCountRef.current = sortedItems.length;
      onLoadMore();
    }
  }, [hasMore, sortedItems.length, loadingMore, onLoadMore, virtualRows]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  function selectAdjacent(index: number, direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(sortedItems.length - 1, index + direction));
    const next = sortedItems[nextIndex];
    if (!next || nextIndex === index) return;
    onSelect(next);
    rowVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-conversation-id="${next.telefoneNormalizado}"]`)?.focus();
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-white dark:bg-[#111b21]" aria-label="Lista de conversas">
      <header className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Conversas</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {loading ? 'Carregando conversas…' : `${total}${hasMore ? '+' : ''} ${total === 1 ? 'conversa' : 'conversas'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Nova conversa
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleFiltroNaoCadastrados}
            aria-pressed={filtroNaoCadastrados}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filtroNaoCadastrados
                ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {filtroNaoCadastrados ? 'Vendo só não cadastrados' : totalNaoCadastrados === null ? 'Não cadastrados' : `Não cadastrados (${totalNaoCadastrados})`}
          </button>
          {filtroNaoCadastrados && podeCadastrarTodos && (totalNaoCadastrados === null || totalNaoCadastrados > 0) && (
            <button
              type="button"
              onClick={onCadastrarTodos}
              disabled={cadastrandoTodos}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
            >
              {cadastrandoTodos ? 'Cadastrando...' : 'Cadastrar todos como lead'}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="relative block w-full min-w-0">
            <span className="sr-only">Pesquisar por nome ou telefone</span>
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) {
                  event.preventDefault();
                  onQueryChange('');
                }
              }}
              aria-keyshortcuts="/"
              placeholder="Pesquisar conversas"
              className="w-full rounded-lg border-0 bg-gray-100 py-2 pl-9 pr-11 text-sm text-gray-900 outline-none ring-primary/20 placeholder:text-gray-500 focus:ring-2 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange('');
                  searchRef.current?.focus();
                }}
                aria-label="Limpar pesquisa"
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                  <path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </label>
          {!filtroNaoCadastrados && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={stageFilter}
                onChange={(event) => onStageChange(event.target.value)}
                aria-label="Filtrar por estágio"
                className="w-full min-w-0 rounded-lg border-0 bg-gray-100 py-2 pl-2 pr-6 text-xs text-gray-900 outline-none ring-primary/20 focus:ring-2 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Todos os estágios</option>
                {stages.map((stage) => (
                  <option key={stage.slug} value={stage.slug}>
                    {stage.nome}
                  </option>
                ))}
              </select>
              {canFilterBySeller && (
                <select value={sellerFilter} onChange={(event) => onSellerChange(event.target.value)} aria-label="Filtrar por vendedor" className="w-full min-w-0 rounded-lg border-0 bg-gray-100 py-2 pl-2 pr-6 text-xs text-gray-900 outline-none ring-primary/20 focus:ring-2 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">Todos os vendedores</option>
                  {sellers.map((seller) => <option key={seller} value={seller}>{seller}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="space-y-1 p-2" aria-label="Carregando conversas">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
                <div className="h-11 w-11 rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="h-3 w-4/5 rounded bg-gray-100 dark:bg-gray-800/60" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300 dark:border-red-900 dark:bg-transparent dark:hover:bg-red-950/40"
            >
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center text-gray-500 dark:text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-700">
              <path d="M4 5h16v11H8l-4 3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <p className="font-medium text-gray-700 dark:text-gray-300">Nenhuma conversa encontrada</p>
            <p className="mt-1 text-sm">Tente pesquisar outro nome ou telefone.</p>
          </div>
        ) : (
          <div role="list" aria-label="Conversas encontradas" className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {virtualRows.map((virtualRow) => {
              const conversation = sortedItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="listitem"
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {conversation ? (
                    <button
                      type="button"
                      data-conversation-id={conversation.telefoneNormalizado}
                      onClick={() => onSelect(conversation)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          selectAdjacent(virtualRow.index, event.key === 'ArrowDown' ? 1 : -1);
                        }
                      }}
                      aria-current={selectedTelefone === conversation.telefoneNormalizado ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left outline-none transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 dark:border-gray-800 dark:hover:bg-gray-800/60 dark:focus-visible:bg-gray-800/60 ${
                        selectedTelefone === conversation.telefoneNormalizado ? 'bg-emerald-50/80 hover:bg-emerald-50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/40' : ''
                      }`}
                    >
                      <Avatar name={conversation.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{conversation.name}</p>
                          {conversation.unreadCount > 0 && (
                            <span
                              className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                              aria-label={`${conversation.unreadCount} ${conversation.unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}
                            >
                              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                            </span>
                          )}
                          {conversation.leadId === null && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                conversation.unreadCount > 0 ? '' : 'ml-auto'
                              } ${
                                conversation.isVendor
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              {conversation.isVendor ? 'Vendedor' : 'Não cadastrado'}
                            </span>
                          )}
                        </div>
                        <p
                          className={`mt-0.5 flex items-center gap-1 truncate text-xs ${
                            conversation.unreadCount > 0 ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {conversation.lastMessageTipo && conversation.lastMessageTipo !== 'text' && conversation.lastMessageTipo !== 'sticker' && (
                            <AttachmentIcon kind={conversation.lastMessageTipo} />
                          )}
                          <span className="truncate">{conversation.lastMessage ?? 'Sem mensagens'}</span>
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 overflow-hidden">
                          <span className="truncate text-xs text-gray-500 dark:text-gray-400">{formatPhone(conversation.phone)}</span>
                          {conversation.stage && <StatusBadge estagio={conversation.stage} className="shrink-0 !px-1.5 !py-0.5 !text-[11px]" />}
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="p-3 text-center">
                      <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-primary outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 dark:hover:bg-gray-800"
                      >
                        {loadingMore ? 'Carregando...' : 'Carregar mais conversas'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
