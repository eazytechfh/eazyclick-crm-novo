'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkifyMessageText } from '@/lib/conversas/message-text';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { AudioPlayer } from './AudioPlayer';
import type { ConversaAnexo, ConversaMensagem, ConversaTipo } from '@/types/database';

const ATTACHMENT_LABELS: Partial<Record<ConversaTipo, string>> = {
  image: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  document: 'Documento',
};

const MEDIA_LOAD_ERROR = 'Não foi possível carregar esta mídia.';

function formatFileSize(fileSize: number | null | undefined): string | null {
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = fileSize;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`;
}

function formatDuration(durationSeconds: number | null | undefined): string | null {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const total = Math.floor(durationSeconds);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return `${minutes}:${seconds}`;
}

function AttachmentDetails({ anexo }: { anexo: ConversaAnexo }) {
  const details = [formatFileSize(anexo.fileSize), formatDuration(anexo.durationSeconds)].filter(
    (detail): detail is string => Boolean(detail)
  );
  if (!anexo.fileName && details.length === 0) return null;
  return (
    <div className="min-w-0">
      {anexo.fileName && (
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{anexo.fileName}</p>
      )}
      {details.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{details.join(' · ')}</p>}
    </div>
  );
}

export function MessageContent({ message }: { message: ConversaMensagem }) {
  const anexo = message.anexo;
  const segments = linkifyMessageText(message.conteudo ?? '');
  const [imageOpen, setImageOpen] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const lightboxRef = useFocusTrap<HTMLDivElement>(imageOpen);
  const mediaUrl = anexo ? `/api/conversas/${message.telefone_normalizado}/mensagens/${message.id}/media` : null;
  const downloadMediaUrl = mediaUrl ? `${mediaUrl}?download=1` : null;

  useEffect(() => {
    setMediaError(null);
    setImageOpen(false);
  }, [message.id]);

  useEffect(() => {
    if (!imageOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setImageOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [imageOpen]);

  return (
    <>
      <div className="space-y-2">
        {anexo && message.tipo === 'image' && mediaUrl && (
          <button
            type="button"
            onClick={() => setImageOpen(true)}
            aria-label="Visualizar imagem ampliada"
            className="block max-w-full cursor-zoom-in rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            <img
              src={mediaUrl}
              alt={anexo.fileName || 'Imagem'}
              loading="lazy"
              onError={() => setMediaError(MEDIA_LOAD_ERROR)}
              className="max-h-64 w-auto max-w-full rounded-md object-contain"
            />
          </button>
        )}

        {anexo && message.tipo === 'audio' && mediaUrl && (
          <AudioPlayer
            src={mediaUrl}
            initialDurationSeconds={anexo.durationSeconds}
            ariaLabel={anexo.fileName ? `Reproduzir ${anexo.fileName}` : undefined}
            onError={() => setMediaError(MEDIA_LOAD_ERROR)}
            trailingSlot={
              downloadMediaUrl ? (
                <a
                  href={downloadMediaUrl}
                  download
                  aria-label="Baixar áudio"
                  title="Baixar áudio"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 outline-none transition hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : undefined
            }
          />
        )}

        {anexo && message.tipo === 'video' && mediaUrl && (
          <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
            <AttachmentDetails anexo={anexo} />
            <video controls preload="metadata" aria-label={anexo.fileName || 'Vídeo da conversa'} src={mediaUrl} onError={() => setMediaError(MEDIA_LOAD_ERROR)} className="max-h-80 w-full rounded-md">
              Seu navegador não suporta reprodução de vídeo.
            </video>
          </div>
        )}

        {anexo && message.tipo === 'document' && mediaUrl && downloadMediaUrl && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-black/5 p-3 dark:bg-white/5">
            <AttachmentDetails anexo={anexo} />
            <a
              href={downloadMediaUrl}
              download
              className="inline-flex rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-gray-700 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
            >
              Baixar {ATTACHMENT_LABELS.document?.toLowerCase()}
            </a>
          </div>
        )}

        {anexo && mediaError && (
          <p role="alert" aria-live="assertive" className="text-sm text-red-700 dark:text-red-400">
            {mediaError}
          </p>
        )}

        {message.conteudo?.trim() && (
          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-gray-800 dark:text-gray-100">
            {segments.map((segment, index) =>
              segment.type === 'link' ? (
                <a
                  key={`${segment.href}-${index}`}
                  href={segment.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
                >
                  {segment.value}
                </a>
              ) : (
                <span key={`text-${index}`}>{segment.value}</span>
              )
            )}
          </p>
        )}
      </div>

      {imageOpen && anexo && message.tipo === 'image' && mediaUrl && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={lightboxRef}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Imagem ampliada da conversa"
            onClick={() => setImageOpen(false)}
          >
            <div className="absolute right-4 top-4 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              {downloadMediaUrl && (
                <a
                  href={downloadMediaUrl}
                  download
                  aria-label="Baixar imagem"
                  title="Baixar imagem"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
                >
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => setImageOpen(false)}
                aria-label="Fechar imagem"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
              >
                ×
              </button>
            </div>
            <img
              src={mediaUrl}
              alt={anexo.fileName || 'Imagem ampliada'}
              loading="lazy"
              onError={() => setMediaError(MEDIA_LOAD_ERROR)}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90dvh] w-auto max-w-[95vw] rounded-lg object-contain shadow-2xl"
            />
          </div>,
          document.body
        )}
    </>
  );
}
