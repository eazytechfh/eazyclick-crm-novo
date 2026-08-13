'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PipelineEtapa } from '@/types/database';
import { ETAPAS_FALLBACK } from '@/lib/pipeline-etapas';

export function usePipelineEtapas() {
  const [etapas, setEtapas] = useState<PipelineEtapa[]>(ETAPAS_FALLBACK);
  const [loadingEtapas, setLoadingEtapas] = useState(true);
  const [erroEtapas, setErroEtapas] = useState<string | null>(null);

  const recarregarEtapas = useCallback(async () => {
    setLoadingEtapas(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pipeline_etapas')
      .select('id, slug, nome, cor, ordem, is_inicial, created_at, updated_at')
      .order('ordem', { ascending: true });

    if (error) {
      setErroEtapas(error.message);
      setEtapas(ETAPAS_FALLBACK);
    } else {
      setErroEtapas(null);
      setEtapas(((data as PipelineEtapa[] | null) ?? []).length ? (data as PipelineEtapa[]) : ETAPAS_FALLBACK);
    }
    setLoadingEtapas(false);
  }, []);

  useEffect(() => {
    recarregarEtapas();
  }, [recarregarEtapas]);

  return { etapas, setEtapas, loadingEtapas, erroEtapas, recarregarEtapas };
}
