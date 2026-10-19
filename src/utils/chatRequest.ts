export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

export function createChatRequest(provider: string, model: string, message: string, history: readonly ConversationTurn[]) {
  return {
    provider, model, message,
    // Modelin gördüğü tüm önceki turlar gönderilir; yerel hata ve arayüz verileri bağlam değildir.
    conversation: history.filter(turn => !turn.isError).map(({ role, content }) => ({ role, content })),
  };
}
