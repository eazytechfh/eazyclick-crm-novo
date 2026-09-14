'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { normalizarTelefone } from '@/lib/conversas/phone';
import { sortConversationsByLastActivity } from '@/lib/conversas/conversation-order';
import { upsertRealtimeConversation } from '@/lib/conversas/realtime-list';
import { ListRequestEpoch } from '@/lib/conversas/list-request-epoch';
import { persistConversationReadSnapshot } from '@/lib/conversas/mark-replied-read';
import { canDeleteLeadByRole } from '@/lib/leads';
import type { BaseDeLeads, ConversaMensagem, ConversaResumo, PipelineEtapa, Vendedor } from '@/types/database';
import { ConversationList } from './ConversationList';
import { ConversationPanel } from './ConversationPanel';
import { NewConversationDialog } from './NewConversationDialog';
import { NovoLeadModal } from '@/components/NovoLeadModal';
import type {
  ConversationListItem,
  ConversationListResponse,
  ConversationMessagesResponse,
  NewConversationLead,
  PendingConversationMessage,
} from './types';

const ConversationLeadDrawer = dynamic(() => import('./ConversationLeadDrawer').then((module) => module.ConversationLeadDrawer));

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new HttpError(body.error || 'Não foi possível carregar os dados.', response.status);
  return body;
}

function mergeIncrementalMessages(current: ConversaMensagem[], incoming: ConversaMensagem[]): ConversaMensagem[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  // Ordena por created_at, não por id: mensagens importadas do histórico antigo têm id novo
  // (bigserial sempre crescente) mas created_at antigo, então id sozinho inverteria a ordem.
  return [...byId.values()].sort((left, right) => {
    const timeDiff = Date.parse(left.created_at) - Date.parse(right.created_at);
    return timeDiff !== 0 ? timeDiff : left.id - right.id;
  });
}

export function reconcilePendingMessages(pending: PendingConversationMessage[], incoming: ConversaMensagem[]): PendingConversationMessage[] {
  const remaining = [...pending];
  for (const message of incoming) {
    if (message.direcao !== 'saida') continue;
    const index = remaining.findIndex(
      (candidate) => {
        if (message.client_message_id) return candidate.clientMessageId === message.client_message_id;
        return candidate.status === 'sent' &&
          ((candidate.kind === 'audio' && message.tipo === 'audio') ||
            (candidate.kind !== 'audio' && message.tipo === 'text' && candidate.content.trim() === (message.conteudo ?? '').trim()));
      }
    );
    if (index >= 0) {
      revokePendingAudioUrl(remaining[index]);
      remaining.splice(index, 1);
    }
  }
  return remaining;
}

function revokePendingAudioUrl(message: PendingConversationMessage | undefined) {
  if (message?.kind === 'audio' && message.audioUrl) URL.revokeObjectURL(message.audioUrl);
}

export function ConversasClient() {
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [canFilterBySeller, setCanFilterBySeller] = useState(false);
  const [canDeleteLead, setCanDeleteLead] = useState(false);
  const [filtroNaoCadastrados, setFiltroNaoCadastrados] = useState(false);
  const [totalNaoCadastrados, setTotalNaoCadastrados] = useState<number | null>(null);
  const [podeCadastrarTodos, setPodeCadastrarTodos] = useState(false);
  const [cadastrandoTodos, setCadastrandoTodos] = useState(false);
  const [etapas, setEtapas] = useState<PipelineEtapa[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversaMensagem[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesRequestVersion, setMessagesRequestVersion] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [leadDetails, setLeadDetails] = useState<BaseDeLeads | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [novoLeadTelefone, setNovoLeadTelefone] = useState<string | null>(null);
  const [meuNome, setMeuNome] = useState('');
  const [meuUsuarioId, setMeuUsuarioId] = useState<string | null>(null);
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  const selectedTelefoneRef = useRef<string | null>(null);
  const messageGenerationRef = useRef(0);
  const totalMessagesRef = useRef<number>(0);
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);
  const listRequestEpochRef = useRef(new ListRequestEpoch());
  const reconcileListTimeoutRef = useRef<number | null>(null);

  // "Abrir conversa" no LeadDrawer (Pipeline/Leads) grava o lead alvo aqui antes de navegar pra
  // cá, já que a navegação entre rotas não carrega estado de componente. Uma leitura/consumo só
  // no mount evita reabrir a mesma conversa depois de uma edição local do estado.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem('abrirConversaLead');
      sessionStorage.removeItem('abrirConversaLead');
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const dadosLead = JSON.parse(raw) as NewConversationLead;
      if (dadosLead.phone) startConversation(dadosLead);
    } catch {
      // payload inválido — ignora e segue com a lista normal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Garante que o recebimento de mensagens da UAZAPI esteja ativo sempre que alguém abre esta
  // aba — sem isso, dependia de um admin_master lembrar de clicar em "Ativar recebimento" em
  // Configurações. Registro é idempotente na UAZAPI, então repetir a cada abertura é seguro; erro
  // aqui não bloqueia a tela, mas vai pro console (em vez de sumir silenciosamente) para dar pra
  // diagnosticar via DevTools/Vercel logs por que o recebimento ao vivo não está funcionando.
  useEffect(() => {
    fetch('/api/conversas/ensure-webhook', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          console.error('[conversas] Falha ao garantir o recebimento de mensagens da UAZAPI:', body?.error ?? response.status);
        }
      })
      .catch((error) => {
        console.error('[conversas] Falha ao chamar ensure-webhook:', error);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: etapasData } = await supabase.from('pipeline_etapas').select('id, slug, nome, cor, ordem, created_at, updated_at').order('ordem');
      if (!cancelled) setEtapas((etapasData as PipelineEtapa[]) ?? []);

      const { data: vendedoresData } = await supabase.from('VENDEDORES').select('*').order('vendedor');
      if (!cancelled) setVendedores((vendedoresData as Vendedor[]) ?? []);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome, cargo, assinatura_mensagens_ativa')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = profile as { nome: string | null; cargo: string; assinatura_mensagens_ativa: boolean } | null;
      setMeuUsuarioId(userData.user.id);
      setMeuNome(p?.nome ?? '');
      setPodeCadastrarTodos(p?.cargo === 'admin_master');
      setCanFilterBySeller(['admin_master', 'admin', 'gerente'].includes(p?.cargo ?? ''));
      setCanDeleteLead(canDeleteLeadByRole(p?.cargo));
      setSignatureEnabled(p?.assinatura_mensagens_ativa !== false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const fetchList = useCallback(
    async (cursor: string | null, append: boolean, silent = false) => {
      const requestEpoch = listRequestEpochRef.current.begin(!append);
      if (append) setLoadingMore(true);
      else if (!silent) setListLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          stage: filtroNaoCadastrados ? '' : stageFilter,
          pageSize: '30',
          filtro: filtroNaoCadastrados ? 'sem_lead' : 'todos',
          vendedor: filtroNaoCadastrados ? '' : sellerFilter,
        });
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(`/api/conversas?${params}`, { cache: 'no-store' });
        const data = await readJson<ConversationListResponse>(response);
        if (!listRequestEpochRef.current.isCurrent(requestEpoch)) return;
        setConversations((current) => {
          if (!append) return sortConversationsByLastActivity(data.items);
          const byId = new Map(current.map((item) => [item.telefoneNormalizado, item]));
          for (const item of data.items) byId.set(item.telefoneNormalizado, item);
          return sortConversationsByLastActivity([...byId.values()]);
        });
        setSelected((current) => data.items.find((item) => item.telefoneNormalizado === current?.telefoneNormalizado) ?? current);
        setNextCursor(data.nextCursor);
        setHasMoreConversations(data.hasMore);
        setTotal((current) => data.total ?? (append ? current + data.items.length : data.items.length));
        if (data.totalNaoCadastrados !== null) setTotalNaoCadastrados(data.totalNaoCadastrados);
        setListError(null);
      } catch (error) {
        if (listRequestEpochRef.current.isCurrent(requestEpoch)) {
          setListError(error instanceof Error ? error.message : 'Erro ao carregar conversas.');
        }
      } finally {
        if (append) setLoadingMore(false);
        if (listRequestEpochRef.current.isCurrent(requestEpoch)) setListLoading(false);
      }
    },
    [debouncedQuery, stageFilter, sellerFilter, filtroNaoCadastrados]
  );

  useEffect(() => {
    setNextCursor(null);
    void fetchList(null, false);
  }, [fetchList]);

  // Realtime substitui o polling de 15s do CRM A: qualquer INSERT/UPDATE em conversas_resumo
  // visível para este usuário (RLS já filtra) recarrega a primeira página da lista.
  useEffect(() => {
    const channel = supabase
      .channel('conversas-resumo-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas_resumo' }, (payload) => {
        const row = payload.new as ConversaResumo;
        setConversations((current) => {
          const existing = current.find((item) => item.telefoneNormalizado === row.telefone_normalizado);
          if (!existing) return current;
          return upsertRealtimeConversation(current, {
            ...existing,
            lastMessageId: row.ultima_mensagem_id,
            lastMessage: row.ultima_mensagem_preview,
            lastMessageTipo: row.ultima_mensagem_tipo,
            lastMessageEm: row.ultima_mensagem_em,
            unreadCount: existing.unreadCount + 1,
          }, current.length);
        });
        if (reconcileListTimeoutRef.current !== null) window.clearTimeout(reconcileListTimeoutRef.current);
        reconcileListTimeoutRef.current = window.setTimeout(() => void fetchList(null, false, true), 750);
      })
      .subscribe();
    return () => {
      if (reconcileListTimeoutRef.current !== null) window.clearTimeout(reconcileListTimeoutRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchList]);

  const markConversationRead = useCallback(
    async (telefoneNormalizado: string, ultimaMensagemLidaId: number, totalMensagens: number) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      await persistConversationReadSnapshot(supabase, telefoneNormalizado, userData.user.id, ultimaMensagemLidaId, totalMensagens);
      setConversations((current) => current.map((c) => (c.telefoneNormalizado === telefoneNormalizado ? { ...c, unreadCount: 0 } : c)));
      setSelected((current) => (current?.telefoneNormalizado === telefoneNormalizado ? { ...current, unreadCount: 0 } : current));
    },
    [supabase]
  );

  useEffect(() => {
    if (!selected) return;
    const telefone = selected.telefoneNormalizado;
    selectedTelefoneRef.current = telefone;
    const generation = ++messageGenerationRef.current;
    setMessagesLoading(true);
    setMessagesError(null);
    setMessages([]);
    setPendingMessages((current) => {
      current.forEach(revokePendingAudioUrl);
      return [];
    });
    setLeadDetails(null);
    setLeadDrawerOpen(false);

    fetch(`/api/conversas/${telefone}?limit=60`, { cache: 'no-store' })
      .then(readJson<ConversationMessagesResponse>)
      .then((data) => {
        if (generation !== messageGenerationRef.current || selectedTelefoneRef.current !== telefone) return;
        setMessages(data.messages);
        setHasOlder(data.hasMore);
        totalMessagesRef.current = data.totalMessages ?? data.messages.length;
        setLeadDetails(data.lead);
      })
      .catch((error) => {
        setMessagesError(error instanceof Error ? error.message : 'Erro ao carregar mensagens.');
      })
      .finally(() => {
        if (generation === messageGenerationRef.current) setMessagesLoading(false);
      });
  }, [messagesRequestVersion, selected?.telefoneNormalizado]);

  // Realtime da conversa aberta — substitui o polling de 15s de mensagens do CRM A.
  useEffect(() => {
    if (!selected) return;
    const telefone = selected.telefoneNormalizado;
    const channel = supabase
      .channel(`conversas-mensagens-${telefone}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversas_mensagens', filter: `telefone_normalizado=eq.${telefone}` },
        (payload) => {
          const incoming = payload.new as ConversaMensagem;
          if (selectedTelefoneRef.current !== telefone) return;
          setMessages((current) => mergeIncrementalMessages(current, [incoming]));
          setPendingMessages((current) => reconcilePendingMessages(current, [incoming]));
          totalMessagesRef.current += 1;
          if (document.visibilityState === 'visible') {
            void markConversationRead(telefone, incoming.id, totalMessagesRef.current);
          }
        }
      )
      .subscribe();
    messagesChannelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.telefoneNormalizado]);

  async function loadOlder() {
    if (!selected || loadingOlder || !hasOlder) return;
    const telefone = selected.telefoneNormalizado;
    const generation = messageGenerationRef.current;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(`/api/conversas/${telefone}?beforeId=${oldestId}&limit=60`, { cache: 'no-store' });
      const data = await readJson<ConversationMessagesResponse>(response);
      if (generation !== messageGenerationRef.current || selectedTelefoneRef.current !== telefone) return;
      setMessages((current) => mergeIncrementalMessages(data.messages, current));
      setHasOlder(data.hasMore);
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Erro ao carregar mensagens anteriores.');
    } finally {
      if (generation === messageGenerationRef.current) setLoadingOlder(false);
    }
  }

  async function syncHistory(): Promise<{ mensagensImportadas: number }> {
    if (!selected) return { mensagensImportadas: 0 };
    const telefone = selected.telefoneNormalizado;
    const response = await fetch(`/api/conversas/${telefone}/sincronizar-historico`, { method: 'POST' });
    const data = await readJson<{ mensagensImportadas: number }>(response);
    if (selectedTelefoneRef.current === telefone && data.mensagensImportadas > 0) {
      setMessagesRequestVersion((current) => current + 1);
    }
    return data;
  }

  function selectConversation(conversation: ConversationListItem) {
    selectedTelefoneRef.current = conversation.telefoneNormalizado;
    setSelected(conversation);
  }

  function clearSelection() {
    messageGenerationRef.current += 1;
    selectedTelefoneRef.current = null;
    setSelected(null);
    setMessages([]);
    setPendingMessages((current) => {
      current.forEach(revokePendingAudioUrl);
      return [];
    });
    setLeadDetails(null);
    setLeadDrawerOpen(false);
  }

  function updateLeadEverywhere(updated: BaseDeLeads) {
    const leftCurrentFilter = Boolean(stageFilter) && !filtroNaoCadastrados && updated.estagio_lead !== stageFilter;
    if (leftCurrentFilter) {
      setConversations((current) => current.filter((c) => c.leadId !== updated.id));
      setTotal((current) => Math.max(0, current - 1));
      clearSelection();
      return;
    }
    const patch = {
      leadId: updated.id,
      name: updated.nome_lead,
      phone: updated.telefone,
      stage: updated.estagio_lead,
      vehicle: updated.veiculo_interesse,
      commercialSummary: updated.resumo_comercial,
    };
    setLeadDetails(updated);
    setSelected((current) => (current?.telefoneNormalizado ? { ...current, ...patch } : current));
    setConversations((current) => current.map((c) => (c.telefoneNormalizado === selectedTelefoneRef.current ? { ...c, ...patch } : c)));
  }

  function removeLeadEverywhere(leadId: number) {
    setConversations((current) => current.map((c) => (c.leadId === leadId ? { ...c, leadId: null, stage: null, vehicle: null, commercialSummary: null } : c)));
    setLeadDrawerOpen(false);
    setSelected((current) => (current?.leadId === leadId ? { ...current, leadId: null, stage: null, vehicle: null, commercialSummary: null } : current));
    setLeadDetails((current) => (current?.id === leadId ? null : current));
  }

  function startConversation(lead: NewConversationLead) {
    const telefoneNormalizado = normalizarTelefone(lead.phone);
    if (!telefoneNormalizado) return;
    const existing = conversations.find((c) => c.telefoneNormalizado === telefoneNormalizado);
    const conversation: ConversationListItem =
      existing ?? {
        telefoneNormalizado,
        leadId: lead.id,
        name: lead.name,
        phone: lead.phone,
        stage: lead.stage,
        vehicle: lead.vehicle,
        commercialSummary: lead.commercialSummary,
        isVendor: false,
        lastMessageId: null,
        lastMessage: 'Sem mensagens',
        lastMessageTipo: null,
        lastMessageEm: null,
        unreadCount: 0,
      };
    setNewConversationOpen(false);
    selectConversation(conversation);
  }

  function handleLeadCreated(lead: BaseDeLeads) {
    const telefoneNormalizado = normalizarTelefone(lead.telefone) ?? novoLeadTelefone;
    setNovoLeadTelefone(null);
    if (!telefoneNormalizado) return;
    const patch = {
      leadId: lead.id,
      name: lead.nome_lead,
      phone: lead.telefone,
      stage: lead.estagio_lead,
      vehicle: lead.veiculo_interesse,
      commercialSummary: lead.resumo_comercial,
    };
    setConversations((current) => current.map((c) => (c.telefoneNormalizado === telefoneNormalizado ? { ...c, ...patch } : c)));
    setSelected((current) => (current?.telefoneNormalizado === telefoneNormalizado ? { ...current, ...patch } : current));
    setLeadDetails(lead);
    void fetchList(null, false, true);
  }

  async function cadastrarTodosNaoCadastrados() {
    setCadastrandoTodos(true);
    try {
      let done = false;
      while (!done) {
        const response = await fetch('/api/conversas/cadastrar-nao-cadastrados', { method: 'POST' });
        const data = await readJson<{ done: boolean }>(response);
        done = data.done;
      }
      await fetchList(null, false);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Erro ao cadastrar contatos.');
    } finally {
      setCadastrandoTodos(false);
    }
  }

  async function sendMessage(content: string, replacedClientMessageId?: string) {
    if (!selected) return;
    const telefone = selected.telefoneNormalizado;
    const clientMessageId = crypto.randomUUID();
    const pending: PendingConversationMessage = { clientMessageId, content, status: 'sending', error: null };
    setPendingMessages((current) => [...current.filter((m) => m.clientMessageId !== replacedClientMessageId), pending]);

    try {
      const response = await fetch(`/api/conversas/${telefone}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, clientMessageId }),
      });
      const result = await readJson<{ status: string; historySyncPending?: boolean }>(response);
      if (selectedTelefoneRef.current !== telefone) return;
      setPendingMessages((current) =>
        current.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: result.status === 'falhou' ? 'failed' : 'sent' } : m))
      );
      if (result.historySyncPending) {
        window.setTimeout(() => {
          void fetch(`/api/conversas/${telefone}/sincronizar-historico`, { method: 'POST' });
        }, 1500);
      }
    } catch (error) {
      if (selectedTelefoneRef.current !== telefone) return;
      setPendingMessages((current) =>
        current.map((m) =>
          m.clientMessageId === clientMessageId
            ? { ...m, status: 'failed', error: error instanceof Error ? error.message : 'Não foi possível enviar.' }
            : m
        )
      );
    }
  }

  async function sendAudioMessage(blob: Blob, durationSeconds: number, replacedClientMessageId?: string) {
    if (!selected) return;
    const telefone = selected.telefoneNormalizado;
    const clientMessageId = crypto.randomUUID();
    const audioUrl = URL.createObjectURL(blob);
    const pending: PendingConversationMessage = {
      clientMessageId,
      content: '',
      status: 'sending',
      error: null,
      kind: 'audio',
      audioUrl,
      audioBlob: blob,
      durationSeconds,
    };
    setPendingMessages((current) => {
      const replaced = current.find((m) => m.clientMessageId === replacedClientMessageId);
      if (replaced) revokePendingAudioUrl(replaced);
      return [...current.filter((m) => m.clientMessageId !== replacedClientMessageId), pending];
    });

    try {
      const formData = new FormData();
      formData.set('audio', blob, 'audio');
      formData.set('clientMessageId', clientMessageId);
      formData.set('durationSeconds', String(durationSeconds));
      const response = await fetch(`/api/conversas/${telefone}/mensagens/audio`, { method: 'POST', body: formData });
      const result = await readJson<{ status: string; historySyncPending?: boolean }>(response);
      if (selectedTelefoneRef.current !== telefone) return;
      setPendingMessages((current) =>
        current.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: result.status === 'falhou' ? 'failed' : 'sent' } : m))
      );
      if (result.historySyncPending) {
        window.setTimeout(() => {
          void fetch(`/api/conversas/${telefone}/sincronizar-historico`, { method: 'POST' });
        }, 1500);
      }
    } catch (error) {
      if (selectedTelefoneRef.current !== telefone) return;
      setPendingMessages((current) =>
        current.map((m) =>
          m.clientMessageId === clientMessageId
            ? { ...m, status: 'failed', error: error instanceof Error ? error.message : 'Não foi possível enviar o áudio.' }
            : m
        )
      );
    }
  }

  async function sendFileMessage(file: File, replacedClientMessageId?: string) {
    if (!selected) return;
    const telefone = selected.telefoneNormalizado;
    const clientMessageId = crypto.randomUUID();
    const pending: PendingConversationMessage = { clientMessageId, content: file.name, status: 'sending', error: null, kind: 'file', fileBlob: file };
    setPendingMessages((current) => [...current.filter((message) => message.clientMessageId !== replacedClientMessageId), pending]);
    try {
      const formData = new FormData();
      formData.set('file', file, file.name);
      formData.set('clientMessageId', clientMessageId);
      const result = await readJson<{ status: string }>(await fetch(`/api/conversas/${telefone}/mensagens/arquivo`, { method: 'POST', body: formData }));
      if (selectedTelefoneRef.current === telefone) setPendingMessages((current) => current.map((message) => message.clientMessageId === clientMessageId ? { ...message, status: result.status === 'falhou' ? 'failed' : 'sent' } : message));
    } catch (error) {
      if (selectedTelefoneRef.current === telefone) setPendingMessages((current) => current.map((message) => message.clientMessageId === clientMessageId ? { ...message, status: 'failed', error: error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.' } : message));
    }
  }

  async function updateSignaturePreference(enabled: boolean) {
    if (!meuUsuarioId || signatureSaving) return;
    const previous = signatureEnabled;
    setSignatureEnabled(enabled);
    setSignatureSaving(true);
    setSignatureError(null);
    try {
      const { error } = await supabase.from('profiles').update({ assinatura_mensagens_ativa: enabled }).eq('id', meuUsuarioId);
      if (error) throw error;
    } catch {
      setSignatureEnabled(previous);
      setSignatureError('Não foi possível salvar a preferência de assinatura.');
    } finally {
      setSignatureSaving(false);
    }
  }

  return (
    <div className="h-full min-h-[560px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#111b21]">
      <div className="flex h-full min-h-0">
        <div className={`${selected ? 'hidden md:block' : 'block'} h-full w-full shrink-0 md:w-[38%] md:max-w-[430px] md:border-r md:border-gray-200 dark:md:border-gray-800`}>
          <ConversationList
            items={conversations}
            selectedTelefone={selected?.telefoneNormalizado ?? null}
            query={query}
            stages={etapas}
            stageFilter={stageFilter}
            sellers={[...new Set(vendedores.map((v) => v.vendedor).filter((name): name is string => Boolean(name)))]}
            sellerFilter={sellerFilter}
            canFilterBySeller={canFilterBySeller}
            loading={listLoading}
            loadingMore={loadingMore}
            error={listError}
            hasMore={hasMoreConversations}
            total={total}
            filtroNaoCadastrados={filtroNaoCadastrados}
            totalNaoCadastrados={totalNaoCadastrados}
            podeCadastrarTodos={podeCadastrarTodos}
            cadastrandoTodos={cadastrandoTodos}
            onQueryChange={setQuery}
            onStageChange={(stage) => {
              clearSelection();
              setStageFilter(stage);
            }}
            onSellerChange={(seller) => { clearSelection(); setSellerFilter(seller); }}
            onSelect={selectConversation}
            onNewConversation={() => setNewConversationOpen(true)}
            onLoadMore={() => void fetchList(nextCursor, true)}
            onRetry={() => void fetchList(null, false)}
            onToggleFiltroNaoCadastrados={() => {
              clearSelection();
              setSellerFilter('');
              setFiltroNaoCadastrados((current) => !current);
            }}
            onCadastrarTodos={() => void cadastrarTodosNaoCadastrados()}
          />
        </div>
        <ConversationPanel
          conversation={selected}
          messages={messages}
          pendingMessages={pendingMessages}
          loading={messagesLoading}
          loadingOlder={loadingOlder}
          error={messagesError}
          hasMore={hasOlder}
          leadDetailsAvailable={leadDetails !== null}
          signatureEnabled={signatureEnabled}
          signatureSaving={signatureSaving}
          signatureError={signatureError}
          onLoadOlder={() => void loadOlder()}
          onSyncHistory={syncHistory}
          onOpenLead={() => {
            if (leadDetails) setLeadDrawerOpen(true);
          }}
          onCreateLead={() => {
            if (selected) setNovoLeadTelefone(selected.phone);
          }}
          onSendMessage={(content) => sendMessage(content)}
          onSendAudio={(blob, durationSeconds) => sendAudioMessage(blob, durationSeconds)}
          onSendFile={(file) => sendFileMessage(file)}
          onRetryMessage={(message) => {
            if (message.kind === 'audio' && message.audioBlob) {
              void sendAudioMessage(message.audioBlob, message.durationSeconds ?? 0, message.clientMessageId);
              return;
            }
            if (message.kind === 'file' && message.fileBlob) {
              void sendFileMessage(message.fileBlob, message.clientMessageId);
              return;
            }
            void sendMessage(message.content, message.clientMessageId);
          }}
          onSignatureEnabledChange={(enabled) => void updateSignaturePreference(enabled)}
          onRetry={() => setMessagesRequestVersion((current) => current + 1)}
          onBack={clearSelection}
        />
      </div>
      {leadDrawerOpen && leadDetails && (
        <ConversationLeadDrawer lead={leadDetails} etapas={etapas} onClose={() => setLeadDrawerOpen(false)} onUpdated={updateLeadEverywhere} onDeleted={removeLeadEverywhere} canDeleteLead={canDeleteLead} />
      )}
      <NewConversationDialog open={newConversationOpen} onClose={() => setNewConversationOpen(false)} onSelect={startConversation} />
      {novoLeadTelefone !== null && (
        <NovoLeadModal
          initialValues={{ telefone: novoLeadTelefone, vendedor: meuNome ?? '' }}
          onClose={() => setNovoLeadTelefone(null)}
          onCreated={handleLeadCreated}
        />
      )}
    </div>
  );
}
