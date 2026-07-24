export type StatusEstoque = 'disponivel' | 'indisponivel' | 'vendido';

export function normalizarTexto(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function normalizarStatusEstoque(value: string | null | undefined): StatusEstoque | null {
  const status = normalizarTexto(value);
  return status === 'disponivel' || status === 'indisponivel' || status === 'vendido' ? status : null;
}

export function validarFechamento(nome: string, valor: string | number | null) {
  const numero = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  const erros: string[] = [];
  if (!nome.trim()) erros.push('Informe o nome do lead.');
  if (!Number.isFinite(numero) || numero <= 0) erros.push('Informe um valor maior que zero.');
  return { valido: erros.length === 0, erros, nome: nome.trim(), valor: numero };
}
