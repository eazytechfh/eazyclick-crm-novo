'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { getPreferredTheme, setTheme, type ThemePreference } from '@/lib/theme';

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ThemeToggleProps {
  className?: string;
  // "row": item de lista com ícone + rótulo (menu do usuário, Configurações).
  // "icon": botão redondo só com ícone, para ficar sempre visível fora de qualquer menu.
  variant?: 'row' | 'icon';
}

// Fica null até o primeiro effect rodar no cliente: em vez de assumir "claro" como padrão do
// servidor (o que piscaria o ícone errado caso o usuário já tenha "escuro" salvo), simplesmente
// não renderiza nada até saber a preferência real — o parágrafo/ícone nunca aparece errado.
export function ThemeToggle({ className, variant = 'row' }: ThemeToggleProps) {
  const [theme, setThemeState] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setThemeState(getPreferredTheme());
  }, []);

  if (theme === null) {
    return (
      <div
        className={clsx(variant === 'icon' ? 'h-9 w-9' : 'h-9', className)}
        aria-hidden="true"
      />
    );
  }

  function toggle() {
    const next: ThemePreference = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  const label = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={theme === 'dark'}
        aria-label={label}
        title={label}
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
          className
        )}
      >
        {theme === 'dark' ? (
          <SunIcon key="sun" className="h-5 w-5" />
        ) : (
          <MoonIcon key="moon" className="h-5 w-5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      className={clsx(
        'flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
        className
      )}
    >
      {theme === 'dark' ? (
        <SunIcon key="sun" className="h-4 w-4" />
      ) : (
        <MoonIcon key="moon" className="h-4 w-4" />
      )}
      {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    </button>
  );
}
