'use client';

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Avatar } from '@/components/Avatar';
import { StatusBadge } from '@/components/StatusBadge';
import type { ConversaMensagem } from '@/types/database';
import { AudioPlayer } from './AudioPlayer';
import { MessageContent } from './MessageContent';
import type { ConversationListItem, PendingConversationMessage } from './types';

const MAX_RECORDING_SECONDS = 300;

function formatRecordingTime(totalSeconds: number): string {
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${seconds}`;
}

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  );
}

// Fora do componente para não recriar o objeto (e mudar a identidade de `style`) a cada render.
const MESSAGE_AREA_BACKGROUND_STYLE = {
  backgroundImage: 'radial-gradient(rgba(120,113,108,0.08) 1px, transparent 1px)',
  backgroundSize: '18px 18px',
} as const;

interface ConversationPanelProps {
  conversation: ConversationListItem | null;
  messages: ConversaMensagem[];
  pendingMessages: PendingConversationMessage[];
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  hasMore: boolean;
  leadDetailsAvailable: boolean;
  signatureEnabled: boolean;
  signatureSaving: boolean;
  signatureError: string | null;
  onLoadOlder: () => void;
  onSyncHistory: () => Promise<{ mensagensImportadas: number }>;
  onOpenLead: () => void;
  onCreateLead: () => void;
  onSendMessage: (content: string) => Promise<void>;
  onSendAudio: (blob: Blob, durationSeconds: number) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onRetryMessage: (message: PendingConversationMessage) => void;
  onRetry: () => void;
  onBack: () => void;
  onSignatureEnabledChange: (enabled: boolean) => void;
}

export function ConversationPanel({
  conversation,
  messages,
  pendingMessages,
  loading,
  loadingOlder,
  error,
  hasMore,
  leadDetailsAvailable,
  signatureEnabled,
  signatureSaving,
  signatureError,
  onLoadOlder,
  onSyncHistory,
  onOpenLead,
  onCreateLead,
  onSendMessage,
  onSendAudio,
  onSendFile,
  onRetryMessage,
  onRetry,
  onBack,
  onSignatureEnabledChange,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousConversationRef = useRef<number | null>(null);
  const wasNearBottomRef = useRef(true);
  const [draft, setDraft] = useState('');
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [historySyncMessage, setHistorySyncMessage] = useState<string | null>(null);
  const [historySyncError, setHistorySyncError] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreviewUrl, setPendingFilePreviewUrl] = useState<string | null>(null);
  const [sendingPendingFile, setSendingPendingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const audioRecordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';
  const previousMessagesRef = useRef<{ conversationId: number | null; firstId: number | null; totalSize: number }>({
    conversationId: null,
    firstId: null,
    totalSize: 0,
  });
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    getItemKey: (index) => messages[index]?.id ?? index,
    overscan: 10,
  });

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !conversation) return;
    const changedConversation = previousConversationRef.current !== conversation.leadId;
    const firstId = messages[0]?.id ?? null;
    const totalSize = messageVirtualizer.getTotalSize();
    const previous = previousMessagesRef.current;
    const prepended =
      !changedConversation && previous.conversationId === conversation.leadId && previous.firstId !== null && firstId !== null && previous.firstId !== firstId;

    if (prepended) {
      messageVirtualizer.scrollToOffset(container.scrollTop + Math.max(0, totalSize - previous.totalSize));
    } else if ((changedConversation || wasNearBottomRef.current) && messages.length) {
      messageVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }

    previousMessagesRef.current = { conversationId: conversation.leadId, firstId, totalSize };
    previousConversationRef.current = conversation.leadId;
  }, [conversation?.leadId, messageVirtualizer, messages]);

  useEffect(() => {
    setDraft('');
    setRecordingError(null);
    setHistorySyncMessage(null);
    setHistorySyncError(false);
    setDraggingFile(false);
    dragCounterRef.current = 0;
    setPendingFile(null);
    return () => {
      discardRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.leadId]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') discardRecording();
    }
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => {
    if (!pendingFile) return;
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelPendingFile();
    }
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile]);

  useEffect(() => {
    if (!pendingFile || !pendingFile.type.startsWith('image/')) {
      setPendingFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !pendingMessages.length) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [pendingMessages]);

  function stopRecordingTimer() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function releaseRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function discardRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = releaseRecordingStream;
      recorder.stop();
    } else {
      releaseRecordingStream();
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    stopRecordingTimer();
    setRecording(false);
    setRecordingSeconds(0);
  }

  async function startRecording() {
    if (recording || !audioRecordingSupported) return;
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          if (current + 1 >= MAX_RECORDING_SECONDS) {
            void finishRecording();
            return current;
          }
          return current + 1;
        });
      }, 1000);
    } catch {
      setRecordingError('Não foi possível acessar o microfone.');
    }
  }

  async function finishRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    stopRecordingTimer();
    const finalDurationSeconds = recordingSeconds;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        releaseRecordingStream();
        resolve(new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setRecording(false);
    setRecordingSeconds(0);
    if (blob.size === 0) return;
    await onSendAudio(blob, Math.max(1, finalDurationSeconds));
  }

  async function syncHistory() {
    if (syncingHistory) return;
    setSyncingHistory(true);
    setHistorySyncMessage(null);
    setHistorySyncError(false);
    try {
      const result = await onSyncHistory();
      setHistorySyncMessage(
        result.mensagensImportadas > 0
          ? `${result.mensagensImportadas} mensagem(ns) do histórico sincronizada(s).`
          : 'Nenhuma mensagem nova encontrada no histórico.'
      );
    } catch (error) {
      setHistorySyncError(true);
      setHistorySyncMessage(error instanceof Error ? error.message : 'Não foi possível sincronizar o histórico.');
    } finally {
      setSyncingHistory(false);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragCounterRef.current = 0;
    setDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setPendingFile(file);
  }

  async function confirmPendingFile() {
    if (!pendingFile || sendingPendingFile) return;
    setSendingPendingFile(true);
    try {
      await onSendFile(pendingFile);
      setPendingFile(null);
    } finally {
      setSendingPendingFile(false);
    }
  }

  function cancelPendingFile() {
    if (sendingPendingFile) return;
    setPendingFile(null);
  }

  async function submitMessage() {
    const content = draft.trim();
    if (!content || submittingMessage) return;
    setSubmittingMessage(true);
    setDraft('');
    try {
      await onSendMessage(content);
    } finally {
      setSubmittingMessage(false);
    }
  }

  if (!conversation) {
    return (
      <section className="hidden h-full flex-1 flex-col items-center justify-center bg-[#f7f5f2] px-8 text-center dark:bg-[#0b141a] md:flex">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10">
            <path d="M4 5h16v11H8l-4 3V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Conversas do WhatsApp</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">Selecione um lead para visualizar o histórico.</p>
      </section>
    );
  }


  // Cores fixas (WhatsApp) de propósito, não os tokens de tema do app — ver decisão equivalente
  // já tomada no CRM A: parecer com o WhatsApp reduz a carga cognitiva desta tela específica.
  return (
    <section
      className="relative flex h-full min-w-0 flex-1 flex-col bg-[#efeae2] dark:bg-[#0b141a]"
      aria-label={`Conversa com ${conversation.name}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {draggingFile && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-emerald-600/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-emerald-500 bg-white/95 px-8 py-6 text-center shadow-lg dark:bg-[#111b21]/95">
            <p className="text-2xl" aria-hidden="true">📎</p>
            <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Solte o arquivo para enviar</p>
          </div>
        </div>
      )}
      <header className="flex h-[73px] shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-[#202c33]">
        <button type="button" onClick={onBack} className="-ml-1 rounded-full p-3 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 md:hidden" aria-label="Voltar para conversas">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button
          type="button"
          onClick={conversation.leadId === null ? onCreateLead : onOpenLead}
          disabled={conversation.leadId !== null && !leadDetailsAvailable}
          aria-label={conversation.leadId === null ? `Cadastrar ${conversation.name} como lead` : `Abrir informações de ${conversation.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:hover:bg-transparent dark:hover:bg-white/5"
        >
          <Avatar name={conversation.name} size={42} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{conversation.name}</span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {conversation.leadId === null ? 'Não cadastrado · toque para cadastrar' : conversation.phone}
              {conversation.vehicle ? ` · ${conversation.vehicle}` : ''}
            </span>
          </span>
        </button>
        {conversation.leadId === null ? (
          <span className="hidden shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 sm:inline-flex">
            Não cadastrado
          </span>
        ) : (
          conversation.stage && <StatusBadge estagio={conversation.stage} className="hidden sm:inline-flex" />
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 dark:bg-[#0b141a] sm:px-8"
        style={MESSAGE_AREA_BACKGROUND_STYLE}
      >
        {!loading && (
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2">
              {hasMore && (
                <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="rounded-full bg-white px-4 py-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:bg-[#202c33] dark:text-gray-300 dark:hover:bg-[#2a3942]">
                  {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void syncHistory()}
                disabled={syncingHistory}
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                {syncingHistory ? 'Sincronizando histórico...' : 'Sincronizar histórico antigo'}
              </button>
            </div>
            {historySyncMessage && (
              <p className={`text-xs ${historySyncError ? 'text-red-700 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'}`} role={historySyncError ? 'alert' : 'status'}>
                {historySyncMessage}
              </p>
            )}
          </div>
        )}
        {loading ? (
          <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-3" aria-label="Carregando histórico" role="status">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className={`h-14 rounded-lg bg-white/70 shadow-sm dark:bg-white/10 ${index % 3 === 1 ? 'ml-auto w-[58%] bg-emerald-100/80 dark:bg-emerald-900/30' : index % 3 === 2 ? 'w-[72%]' : 'w-[46%]'}`} />
            ))}
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300 dark:border-red-900 dark:bg-transparent dark:hover:bg-red-950/40">
              Tentar novamente
            </button>
          </div>
        ) : messages.length === 0 && pendingMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">Nenhuma mensagem disponível.</div>
        ) : (
          <div className="mx-auto w-full max-w-4xl" role="log" aria-live="polite" aria-label={`Histórico da conversa com ${conversation.name}`}>
            <div className="relative w-full" style={{ height: messageVirtualizer.getTotalSize() }}>
              {messageVirtualizer.getVirtualItems().map((virtualMessage) => {
                const message = messages[virtualMessage.index];
                if (!message) return null;
                const outgoing = message.direcao === 'saida';
                return (
                  <div
                    key={virtualMessage.key}
                    ref={messageVirtualizer.measureElement}
                    data-index={virtualMessage.index}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualMessage.start}px)` }}
                  >
                    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${outgoing ? 'rounded-tr-sm bg-[#d9fdd3] dark:bg-[#005c4b]' : 'rounded-tl-sm bg-white dark:bg-[#202c33]'}`}>
                        <MessageContent message={message} />
                        {outgoing && message.enviado_por_nome && (
                          <p className="mt-1 text-right text-[10px] text-emerald-800/70 dark:text-emerald-200/60">{message.enviado_por_nome}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingMessages.map((message) => (
              <div key={message.clientMessageId} className="flex justify-end pb-2">
                <div className="max-w-[88%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-sm dark:bg-[#005c4b] sm:max-w-[72%]">
                  {message.kind === 'audio' && message.audioUrl ? (
                    <AudioPlayer src={message.audioUrl} initialDurationSeconds={message.durationSeconds} ariaLabel="Reproduzir áudio enviado" />
                  ) : message.kind === 'file' ? (
                    <p className="break-all text-sm text-gray-900 dark:text-gray-100">📎 {message.content}</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">{message.content}</p>
                  )}
                  <div className={`mt-1 flex items-center justify-end gap-2 text-xs ${message.status === 'failed' ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-200'}`}>
                    <span>{message.status === 'sending' ? 'Enviando...' : message.status === 'sent' ? message.error || 'Enviada' : message.error || 'Falha no envio'}</span>
                    {message.status === 'failed' && (
                      <button type="button" className="font-semibold underline" onClick={() => onRetryMessage(message)}>
                        Tentar novamente
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-gray-200 bg-[#f0f2f5] dark:border-gray-800 dark:bg-[#202c33]">
        {pendingFile ? (
          <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
            <button
              type="button"
              onClick={cancelPendingFile}
              disabled={sendingPendingFile}
              aria-label="Cancelar envio do arquivo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
                <path d="M6 6l8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-2 truncate text-sm text-gray-700 dark:text-gray-200">
              {pendingFilePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingFilePreviewUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <span aria-hidden="true">📎</span>
              )}
              <span className="truncate">Enviar &ldquo;{pendingFile.name}&rdquo;?</span>
            </div>
            <button
              type="button"
              onClick={() => void confirmPendingFile()}
              disabled={sendingPendingFile}
              aria-label="Confirmar envio do arquivo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-wait disabled:opacity-60"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
                <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : recording ? (
          <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
            <button type="button" onClick={discardRecording} aria-label="Cancelar gravação" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 dark:text-red-400 dark:hover:bg-red-500/10">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
                <path d="M6 6l8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              <span className="tabular-nums">{formatRecordingTime(recordingSeconds)}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Gravando áudio...</span>
            </div>
            <button type="button" onClick={() => void finishRecording()} aria-label="Enviar áudio" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-300">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
                <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-end gap-2 px-4 pt-2 text-xs text-gray-600 dark:text-gray-300">
              <span>Assinatura</span>
              <button
                type="button"
                role="switch"
                aria-checked={signatureEnabled}
                aria-label="Assinatura nas mensagens de texto"
                disabled={signatureSaving}
                onClick={() => onSignatureEnabledChange(!signatureEnabled)}
                title="Envia seu nome em negrito no WhatsApp sem mostrá-lo no histórico do CRM"
                className={`relative h-5 w-9 rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-wait disabled:opacity-60 ${
                  signatureEnabled ? 'bg-emerald-600' : 'bg-gray-400 dark:bg-gray-600'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${signatureEnabled ? 'left-[18px]' : 'left-0.5'}`}
                />
              </button>
            </div>
            {signatureError && <p role="alert" className="px-4 pt-1 text-right text-xs text-red-600 dark:text-red-400">{signatureError}</p>}
            <form
              className="flex items-end gap-2 px-3 py-2 sm:px-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitMessage();
              }}
            >
              <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700" aria-label="Anexar arquivo" title="Anexar imagem, vídeo ou documento (até 20 MB)">
                <span aria-hidden="true">📎</span>
                <input type="file" className="sr-only" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) setPendingFile(file); event.currentTarget.value = ''; }} />
              </label>
              <label className="sr-only" htmlFor="conversation-message">
                Mensagem para {conversation.name}
              </label>
              <textarea
                id="conversation-message"
                ref={messageInputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage();
                  } else if (event.key === 'Escape' && pendingFile) {
                    event.preventDefault();
                    cancelPendingFile();
                  } else if (event.key === 'Escape' && draft) {
                    event.preventDefault();
                    setDraft('');
                  }
                }}
                rows={1}
                maxLength={4096}
                placeholder="Digite uma mensagem"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-700 dark:bg-[#2a3942] dark:text-gray-100 dark:focus:ring-emerald-900/40"
              />
              {draft.trim() ? (
                <button type="submit" disabled={submittingMessage} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar mensagem">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M4 4l17 8-17 8 3-8-3-8zM7 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={!audioRecordingSupported}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Gravar áudio"
                  title={audioRecordingSupported ? undefined : 'Gravação de áudio não suportada neste navegador'}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                    <path d="M10 2.5a2.75 2.75 0 0 0-2.75 2.75v4.5a2.75 2.75 0 0 0 5.5 0v-4.5A2.75 2.75 0 0 0 10 2.5Z" />
                    <path d="M5.75 9a.75.75 0 0 0-1.5 0 5.75 5.75 0 0 0 5 5.703V16.5H7.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-1.75v-1.797A5.75 5.75 0 0 0 15.75 9a.75.75 0 0 0-1.5 0 4.25 4.25 0 0 1-8.5 0Z" />
                  </svg>
                </button>
              )}
            </form>
          </div>
        )}
        {recordingError && (
          <p role="alert" className="px-4 pb-2 text-center text-xs text-red-600 dark:text-red-400">
            {recordingError}
          </p>
        )}
        {conversation.commercialSummary?.trim() && (
          <div className="max-h-24 overflow-y-auto border-t border-gray-200 px-4 py-2 text-center text-xs leading-5 text-gray-600 dark:border-gray-800 dark:text-gray-300">
            <span className="mr-1 font-semibold text-gray-700 dark:text-gray-200">Resumo comercial:</span>
            {conversation.commercialSummary}
          </div>
        )}
      </footer>
    </section>
  );
}
