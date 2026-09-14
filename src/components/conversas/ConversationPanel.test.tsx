import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationPanel } from './ConversationPanel';

const conversation = {
  telefoneNormalizado: '1199999999',
  leadId: 1,
  name: 'Lead Teste',
  phone: '11999999999',
  stage: 'novo',
  vehicle: null,
  commercialSummary: null,
  isVendor: false,
  lastMessageId: null,
  lastMessage: null,
  lastMessageTipo: null,
  lastMessageEm: null,
  unreadCount: 0,
};

describe('ConversationPanel signature control', () => {
  it('mostra a preferência atual e permite desativá-la', async () => {
    const user = userEvent.setup();
    const onSignatureEnabledChange = vi.fn();
    const Panel = ConversationPanel as unknown as ComponentType<Record<string, unknown>>;

    render(
      <Panel
        conversation={conversation}
        messages={[]}
        pendingMessages={[]}
        loading={false}
        loadingOlder={false}
        error={null}
        hasMore={false}
        leadDetailsAvailable
        signatureEnabled
        signatureSaving={false}
        onLoadOlder={vi.fn()}
        onSyncHistory={vi.fn().mockResolvedValue({ mensagensImportadas: 0 })}
        onOpenLead={vi.fn()}
        onCreateLead={vi.fn()}
        onSendMessage={vi.fn().mockResolvedValue(undefined)}
        onSendAudio={vi.fn().mockResolvedValue(undefined)}
        onRetryMessage={vi.fn()}
        onRetry={vi.fn()}
        onBack={vi.fn()}
        onSignatureEnabledChange={onSignatureEnabledChange}
      />
    );

    const toggle = screen.getByRole('switch', { name: 'Assinatura nas mensagens de texto' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(onSignatureEnabledChange).toHaveBeenCalledWith(false);
  });
});
