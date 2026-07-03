export function formatContagem(msRestante: number): string {
  const totalSegundos = Math.max(0, Math.floor(msRestante / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}
