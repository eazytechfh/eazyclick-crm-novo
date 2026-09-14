function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Candidatos de telefone com/sem DDI 55, para casar contra o que a UAZAPI aceita em `/send/text`. */
export function normalizePhoneCandidates(value: unknown): string[] {
  const digits = onlyDigits(value);
  const candidates = new Set(digits ? [digits] : []);
  if (digits.length === 10 || digits.length === 11) candidates.add(`55${digits}`);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    candidates.add(digits.slice(2));
  }
  return [...candidates];
}

/** Telefone com DDI 55 — formato que a UAZAPI espera no campo `number` de /send/text e /send/media. */
export function toUazapiNumber(value: unknown): string | null {
  const candidates = normalizePhoneCandidates(value);
  return candidates.find((candidate) => candidate.startsWith('55')) ?? candidates[0] ?? null;
}

export function toWhatsAppJid(value: unknown): string | null {
  const digits = onlyDigits(value);
  return digits ? `${digits}@s.whatsapp.net` : null;
}

/** Espelho em JS de public.normalizar_telefone() no banco — precisa produzir exatamente a
 * mesma forma canônica (DDD + 8 dígitos, sem 55, sem o 9 extra) usada em telefone_normalizado. */
export function normalizarTelefone(value: unknown): string | null {
  let digits = onlyDigits(value);
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    digits = digits.slice(0, 2) + digits.slice(3);
  }
  return digits;
}
