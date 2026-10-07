import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TopControls } from './TopControls';
import { WelcomeArea } from './WelcomeArea';
import { SuggestionCards } from './SuggestionCards';
import { CARDS } from '../data/quickActions';
import { ChatInput } from './ChatInput';
import { SparkleIcon } from './SparkleIcon';
import { MetricsPopover } from './MetricsPopover';
import type { ExperimentRecord } from './MetricsPopover';
import { MarkdownRenderer } from './MarkdownRenderer';
import { RequestAnalysis } from './RequestAnalysis';
import type { RequestAnalysisData } from '../types/telemetry';
import { ChevronDown, Check } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  isError?: boolean;
  requestAnalysis?: RequestAnalysisData;
}

interface ProviderModel {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  configured: boolean;
  models: ProviderModel[];
}

interface MainWorkspaceProps {
  onToggleSidebar?: () => void;
  isProfileOpen?: boolean;
  onToggleProfile?: () => void;
  onCloseProfile?: () => void;
  isNotificationOpen?: boolean;
  onToggleNotification?: () => void;
  onCloseNotification?: () => void;
  isMetricsOpen?: boolean;
  onToggleMetrics?: () => void;
  onCloseMetrics?: () => void;
  onOpenSettings?: () => void;
}

type ViewState = 'welcome' | 'transitioning' | 'conversation';

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({ 
  onToggleSidebar,
  isProfileOpen,
  onToggleProfile,
  onCloseProfile,
  isNotificationOpen,
  onToggleNotification,
  onCloseNotification,
  isMetricsOpen,
  onToggleMetrics,
  onCloseMetrics,
  onOpenSettings,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewState, setViewState] = useState<ViewState>('welcome');
  const [isLoading, setIsLoading] = useState(false);

  // Providers & Models state
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  // Metrics state
  const [experimentRecords, setExperimentRecords] = useState<ExperimentRecord[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const conversationContainerRef = useRef<HTMLDivElement>(null);

  // Fetch providers
  const fetchProviders = useCallback(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => {
        if (data.providers) {
          const fetchedProviders = data.providers;
          setProviders(fetchedProviders);
          
          // Select default
          const configured = fetchedProviders.filter((p: Provider) => p.configured);
          if (configured.length > 0) {
            setSelectedProvider(prev => {
              const currentProvider = prev ? configured.find((p: Provider) => p.id === prev) : null;
              const providerToUse = currentProvider || configured[0];

              setSelectedModel(prevModel => {
                if (!providerToUse.models || providerToUse.models.length === 0) return '';
                if (prevModel && providerToUse.models.find((m: any) => m.id === prevModel)) return prevModel;
                return providerToUse.models[0].id;
              });

              return providerToUse.id;
            });
          }
        }
      })
      .catch(err => console.error('Error fetching providers:', err));
  }, []);

  useEffect(() => {
    fetchProviders();

    const handleProvidersUpdated = () => {
      fetchProviders();
    };

    window.addEventListener('providers-updated', handleProvidersUpdated);
    return () => {
      window.removeEventListener('providers-updated', handleProvidersUpdated);
    };
  }, [fetchProviders]);

  const selectedCard = CARDS.find((c) => c.id === selectedCardId) || null;
  const currentPlaceholder = selectedCard ? selectedCard.placeholder : 'Mesajını buraya yaz...';

  const handleSelectCard = (cardId: string) => {
    setSelectedCardId(cardId);
    setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const handleClearAction = () => {
    setSelectedCardId(null);
    setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && conversationEndRef.current) {
      requestAnimationFrame(() => {
        conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }, [messages, isLoading]);


  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedProvider || !selectedModel) {
      setViewState('conversation');
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Önce Ayarlar > API bölümünden bir API sağlayıcısı ve model seç.',
        createdAt: new Date(),
        isError: true
      }]);
      return false; // Tells ChatInput NOT to clear the input
    }

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);

    if (viewState === 'welcome') {
      setViewState('transitioning');
      setTimeout(() => {
        setViewState('conversation');
      }, 210);
    }

    const runChat = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selectedProvider,
            model: selectedModel,
            message: content
          })
        });

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Bilinmeyen bir hata oluştu');
        }

        const assistantContent = data.message?.content || '';

        let requestAnalysis: RequestAnalysisData | undefined = undefined;
        if (data.telemetry) {
          requestAnalysis = {
            provider: data.telemetry.provider || data.provider || selectedProvider,
            model: data.telemetry.model || data.model || selectedModel,
            inputTokens: data.telemetry.inputTokens ?? null,
            outputTokens: data.telemetry.outputTokens ?? null,
            thinkingTokens: data.telemetry.thinkingTokens ?? null,
            totalTokens: data.telemetry.totalTokens ?? null,
            latencyMs: data.telemetry.latencyMs ?? 0,
          };
        } else if (data.metrics) {
          requestAnalysis = {
            provider: data.provider || selectedProvider,
            model: data.model || selectedModel,
            inputTokens: data.metrics.inputTokens ?? null,
            outputTokens: data.metrics.outputTokens ?? null,
            thinkingTokens: data.metrics.thinkingTokens ?? null,
            totalTokens: data.metrics.totalTokens ?? null,
            latencyMs: data.metrics.latencyMs ?? 0,
          };
        }

        setMessages(prev => [...prev, {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          createdAt: new Date(),
          requestAnalysis,
        }]);

        if (data.telemetry) {
          const telemetry = data.telemetry;
          const newRecord: ExperimentRecord = {
            id: telemetry.requestId,
            timestamp: telemetry.timestamp ?? Date.now(),
            mode: 'baseline',
            provider: telemetry.provider || data.provider || selectedProvider,
            model: telemetry.model || data.model || selectedModel,
            prompt: content,
            response: assistantContent,
            telemetry,
            metrics: {
              inputTokens: telemetry.inputTokens ?? null,
              outputTokens: telemetry.outputTokens ?? null,
              thinkingTokens: telemetry.thinkingTokens ?? null,
              totalTokens: telemetry.totalTokens ?? null,
              latencyMs: telemetry.latencyMs ?? 0
            }
          };
          setExperimentRecords(prev => [...prev, newRecord]);
          
          console.log('[Baseline Experiment]', {
            id: newRecord.id,
            model: newRecord.model,
            inputTokens: newRecord.metrics.inputTokens,
            outputTokens: newRecord.metrics.outputTokens,
            thinkingTokens: newRecord.metrics.thinkingTokens,
            totalTokens: newRecord.metrics.totalTokens,
            latencyMs: newRecord.metrics.latencyMs
          });
        }

      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err.message || 'Yanıt alınamadı. Lütfen API ayarlarını kontrol et.',
          createdAt: new Date(),
          isError: true
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    runChat();
    return true; // Tells ChatInput to clear the input
  }, [viewState, selectedProvider, selectedModel]);

  const configuredProviders = providers.filter(p => p.configured);
  const currentProviderObj = providers.find(p => p.id === selectedProvider);
  const currentModelObj = currentProviderObj?.models.find(m => m.id === selectedModel);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden relative theme-transition">
      {/* Top Header Controls */}
      <TopControls 
        onToggleSidebar={onToggleSidebar}
        isProfileOpen={isProfileOpen}
        onToggleProfile={onToggleProfile}
        onCloseProfile={onCloseProfile}
        isNotificationOpen={isNotificationOpen}
        onToggleNotification={onToggleNotification}
        onCloseNotification={onCloseNotification}
        isMetricsOpen={isMetricsOpen}
        onToggleMetrics={onToggleMetrics}
        onOpenSettings={onOpenSettings}
      />

      {/* Metrics Popover - Wait, triggerRef is tricky to pass without modifying TopControls.
          We can just use document.getElementById since TopControls renders it, but let's just render it and handle clicks outside via a wrapper or ID. TopControls has the button, we can just render the popover right here absolute top-16 right-6 */}
      {isMetricsOpen && (
        <div className="absolute top-[68px] right-[24px] z-50">
          <MetricsPopover 
            experimentRecords={experimentRecords}
            onClose={() => onCloseMetrics?.()}
            triggerRef={{ current: null } as any} // we handle escape and click outside using id
          />
        </div>
      )}

      {/* Center content area */}
      {viewState !== 'conversation' ? (
        <div className={`flex-1 flex flex-col items-center justify-center my-auto py-4 md:py-6 ${viewState === 'transitioning' ? 'animate-welcome-exit' : ''}`}>
          <WelcomeArea />
          <SuggestionCards 
            selectedCardId={selectedCardId}
            onSelectCard={handleSelectCard}
          />
        </div>
      ) : (
        <div 
          ref={conversationContainerRef}
          className="flex-1 flex flex-col overflow-y-auto conversation-scrollbar animate-conversation-enter"
        >
          <div className="flex-1 flex flex-col justify-end w-full max-w-[840px] mx-auto px-4 py-6">
            <div className="flex flex-col gap-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-message-in`}
                >
                  <div className={`flex ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-3 ${msg.role === 'user' ? 'max-w-[88%] md:max-w-[75%]' : 'max-w-[95%] md:max-w-[85%] lg:max-w-[90%]'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-[#EEF5FF] dark:bg-[#14171C] border border-[#1677FF]/20 dark:border-white/[0.08] flex items-center justify-center shrink-0 shadow-xs mt-1">
                        <SparkleIcon size={16} className={msg.isError ? "text-[#D93838]" : "text-[#1677FF]"} glow={!msg.isError} />
                      </div>
                    )}
                    
                    {msg.role === 'assistant' ? (
                      <div className="flex flex-col w-full min-w-0">
                        <div
                          className={`
                            ${msg.isError
                              ? 'px-4 py-3 rounded-[20px] rounded-bl-[6px] bg-[#FEF2F2] dark:bg-[#3F1D1D] border border-[#FCA5A5] dark:border-[#DC2626]/30 text-[#991B1B] dark:text-[#FECACA] text-[15px] leading-relaxed whitespace-pre-wrap break-words'
                              : 'px-5 py-4 rounded-[20px] rounded-bl-[6px] bg-white dark:bg-[#0B0D10] border border-[#E8E5DC] dark:border-white/[0.08] shadow-sm w-full min-w-0'
                            }
                            font-normal theme-transition select-text
                          `}
                        >
                          {!msg.isError ? (
                            <MarkdownRenderer content={msg.content} />
                          ) : (
                            msg.content
                          )}
                        </div>

                        {!msg.isError && msg.requestAnalysis && (
                          <RequestAnalysis {...msg.requestAnalysis} />
                        )}
                      </div>
                    ) : (
                      <div
                        className="px-4 py-3 rounded-[20px] rounded-br-[6px] bg-[#EEF3FB] dark:bg-[#1A1F27] border border-[#D8E4F2] dark:border-[#1677FF]/20 text-[#071A3D] dark:text-[#F4F4F5] shadow-[0_2px_8px_rgba(7,26,61,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] text-[15px] leading-relaxed whitespace-pre-wrap break-words font-normal theme-transition select-text"
                      >
                        {msg.content}
                      </div>
                    )}

                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1677FF] via-[#123CBA] to-[#071A3D] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(22,119,255,0.2)]">
                        <span className="text-[10px] font-bold text-white leading-none select-none">EA</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start animate-message-in">
                  <div className="flex items-start gap-3 max-w-[88%] md:max-w-[75%]">
                    <div className="w-7 h-7 rounded-lg bg-[#EEF5FF] dark:bg-[#14171C] border border-[#1677FF]/20 dark:border-white/[0.08] flex items-center justify-center shrink-0 shadow-xs mt-1">
                      <SparkleIcon size={16} className="text-[#1677FF] animate-pulse-subtle" />
                    </div>
                    <div className="px-4 py-3 rounded-[20px] rounded-bl-[6px] bg-white dark:bg-[#0B0D10] border border-[#E8E5DC] dark:border-white/[0.08] flex items-center gap-1.5 h-[46px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1677FF]/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1677FF]/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1677FF]/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={conversationEndRef} className="h-1 shrink-0" />
          </div>
        </div>
      )}

      {/* Floating Bottom Chat Input */}
      <div className="w-full flex flex-col items-center pb-5 md:pb-7 pt-2 shrink-0">
        <div className="w-full max-w-[840px] px-4 flex justify-start mb-2 relative">
          {/* Model Selector Dropdown */}
          <div className="relative">
            <button 
              type="button"
              onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#14171C] border border-[#E8E5DC] dark:border-white/[0.08] shadow-xs text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] text-[12px] font-medium transition-colors"
            >
              {currentProviderObj ? `${currentProviderObj.name} · ${currentModelObj?.name || 'Seçiniz'}` : 'Sağlayıcı Seçin'}
              <ChevronDown size={14} />
            </button>
            
            {isModelSelectorOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-[220px] bg-white dark:bg-[#101216] border border-[#E8E5DC] dark:border-white/[0.08] shadow-[0_12px_36px_-6px_rgba(7,26,61,0.12)] dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.65)] rounded-2xl overflow-hidden animate-popover-in-up z-50">
                {configuredProviders.length === 0 ? (
                  <div className="p-3 text-[12px] text-center text-[#596E8A] dark:text-[#9299A6]">
                    Yapılandırılmış sağlayıcı yok.
                  </div>
                ) : (
                  <div className="max-h-[260px] overflow-y-auto custom-scrollbar p-1.5">
                    {configuredProviders.map(provider => (
                      <div key={provider.id} className="mb-1 last:mb-0">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-[#596E8A] dark:text-[#9299A6] uppercase tracking-wider">
                          {provider.name}
                        </div>
                        {provider.models.map(model => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => {
                              setSelectedProvider(provider.id);
                              setSelectedModel(model.id);
                              setIsModelSelectorOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[12px] text-left transition-colors ${selectedProvider === provider.id && selectedModel === model.id ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF]' : 'text-[#071A3D] dark:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23]'}`}
                          >
                            <span>{model.name}</span>
                            {selectedProvider === provider.id && selectedModel === model.id && <Check size={14} className="text-[#1677FF]" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <ChatInput 
          selectedAction={selectedCard ? { id: selectedCard.id, title: selectedCard.title } : null}
          placeholder={currentPlaceholder}
          onClearAction={handleClearAction}
          inputRef={inputRef}
          onSendMessage={handleSendMessage}
        />
      </div>
    </main>
  );
};
