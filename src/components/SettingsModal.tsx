import React, { useState, useEffect } from 'react';
import { 
  X, 
  SlidersHorizontal, 
  Palette, 
  Bell, 
  Info, 
  Sun, 
  Moon, 
  Check,
  KeyRound
} from 'lucide-react';
import { SparkleIcon } from './SparkleIcon';
import { useTheme } from '../context/useTheme';

type SettingsTab = 'genel' | 'api' | 'gorunum' | 'bildirimler' | 'hakkinda';

interface ProviderConfig {
  id: string;
  name: string;
  configured: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('genel');
  const { theme, toggleTheme } = useTheme();

  // Genel options state
  const [enterToSend, setEnterToSend] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);

  // Görünüm options state
  const [density, setDensity] = useState<'rahat' | 'kompakt'>('rahat');

  // Bildirimler options state
  const [allowNotifications, setAllowNotifications] = useState(false);
  const [audioNotifications, setAudioNotifications] = useState(false);

  // API options state
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (isOpen) {
      fetch('/api/providers')
        .then(res => res.json())
        .then(data => {
          if (data.providers) setProviders(data.providers);
        })
        .catch(err => console.error('Error fetching providers:', err));
    }
  }, [isOpen]);

  const handleSaveKey = async (providerId: string) => {
    const apiKey = keyInputs[providerId];
    if (!apiKey) return;

    setIsSaving(prev => ({ ...prev, [providerId]: true }));
    setSaveErrors(prev => ({ ...prev, [providerId]: null }));
    
    try {
      const res = await fetch(`/api/providers/${providerId}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const data = await res.json();
      
      if (data.success) {
        setProviders(prev => prev.map(p => p.id === providerId ? { ...p, configured: true } : p));
        setKeyInputs(prev => ({ ...prev, [providerId]: '' }));
        window.dispatchEvent(new Event('providers-updated'));
      } else {
        setSaveErrors(prev => ({ ...prev, [providerId]: data.error || 'Gemini API anahtarı doğrulanamadı.' }));
      }
    } catch (err) {
      console.error('Error saving key:', err);
      setSaveErrors(prev => ({ ...prev, [providerId]: 'Bir ağ hatası oluştu.' }));
    } finally {
      setIsSaving(prev => ({ ...prev, [providerId]: false }));
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Modal Container */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[660px] max-h-[75vh] rounded-[24px] bg-white dark:bg-[#101216] border border-[#E8E5DC] dark:border-white/[0.08] shadow-[0_24px_60px_-15px_rgba(7,26,61,0.2)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-modal-in select-none"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#EAE7DC] dark:border-white/[0.08] shrink-0">
          <div>
            <h2 id="settings-title" className="text-[18px] font-bold text-[#071A3D] dark:text-[#F4F4F5] leading-tight">
              Ayarlar
            </h2>
            <p className="text-[12.5px] text-[#596E8A] dark:text-[#9299A6] leading-tight mt-0.5">
              TokenAI deneyimini kişiselleştir.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#596E8A] dark:text-[#9299A6] hover:bg-[#EFECE3]/70 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left Navigation & Right Content */}
        <div className="flex-1 flex overflow-hidden min-h-[360px]">
          {/* Left-side Navigation */}
          <div className="w-[185px] md:w-[195px] p-3 border-r border-[#EAE7DC] dark:border-white/[0.08] flex flex-col space-y-1 shrink-0 bg-[#FAF9F5]/40 dark:bg-[#0B0D10]/40">
            <button
              type="button"
              onClick={() => setActiveTab('genel')}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 cursor-pointer text-left
                ${activeTab === 'genel'
                  ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF] font-semibold dark:border dark:border-white/[0.08]'
                  : 'text-[#071A3D]/75 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                }
              `}
            >
              <SlidersHorizontal size={16} className={activeTab === 'genel' ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D]'} />
              <span>Genel</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('api')}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 cursor-pointer text-left
                ${activeTab === 'api'
                  ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF] font-semibold dark:border dark:border-white/[0.08]'
                  : 'text-[#071A3D]/75 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                }
              `}
            >
              <KeyRound size={16} className={activeTab === 'api' ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D]'} />
              <span>API</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gorunum')}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 cursor-pointer text-left
                ${activeTab === 'gorunum'
                  ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF] font-semibold dark:border dark:border-white/[0.08]'
                  : 'text-[#071A3D]/75 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                }
              `}
            >
              <Palette size={16} className={activeTab === 'gorunum' ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D]'} />
              <span>Görünüm</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bildirimler')}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 cursor-pointer text-left
                ${activeTab === 'bildirimler'
                  ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF] font-semibold dark:border dark:border-white/[0.08]'
                  : 'text-[#071A3D]/75 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                }
              `}
            >
              <Bell size={16} className={activeTab === 'bildirimler' ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D]'} />
              <span>Bildirimler</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hakkinda')}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 cursor-pointer text-left
                ${activeTab === 'hakkinda'
                  ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#1677FF] font-semibold dark:border dark:border-white/[0.08]'
                  : 'text-[#071A3D]/75 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                }
              `}
            >
              <Info size={16} className={activeTab === 'hakkinda' ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D]'} />
              <span>Hakkında</span>
            </button>
          </div>

          {/* Right-side Content */}
          <div className="flex-1 p-5 md:p-6 overflow-y-auto custom-scrollbar">
            {/* 1. GENEL TAB */}
            {activeTab === 'genel' && (
              <div className="space-y-5">
                {/* Dil */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      Dil
                    </h3>
                    <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                      Arayüz ve yanıt dili
                    </p>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#E8E5DC] dark:border-white/[0.08] text-[13px] font-medium text-[#071A3D] dark:text-[#F4F4F5] shadow-2xs">
                    Türkçe
                  </div>
                </div>

                <div className="border-t border-[#EAE7DC] dark:border-white/[0.08]" />

                {/* Enter ile mesaj gönder */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      Enter ile mesaj gönder
                    </h3>
                    <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                      Yeni satır için Shift + Enter kullanın
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enterToSend}
                    onClick={() => setEnterToSend(!enterToSend)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      enterToSend ? 'bg-[#1677FF]' : 'bg-[#D1D5DB] dark:bg-[#2A2E37]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                      enterToSend ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="border-t border-[#EAE7DC] dark:border-white/[0.08]" />

                {/* Ses efektleri */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      Ses efektleri
                    </h3>
                    <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                      İşlemler tamamlandığında ses çal
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEffects}
                    onClick={() => setSoundEffects(!soundEffects)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      soundEffects ? 'bg-[#1677FF]' : 'bg-[#D1D5DB] dark:bg-[#2A2E37]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                      soundEffects ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* 1.5. API TAB */}
            {activeTab === 'api' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] mb-2.5">
                    API Sağlayıcıları
                  </h3>
                  <div className="flex flex-col gap-3">
                    {providers.map(provider => (
                      <div key={provider.id} className="p-3.5 rounded-2xl border bg-[#FAF9F5] dark:bg-[#14171C] border-[#E8E5DC] dark:border-white/[0.08] shadow-2xs">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[13px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                            {provider.name}
                          </span>
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${provider.configured ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 'bg-[#64748B]/10 text-[#64748B] dark:text-[#9299A6] border border-[#64748B]/20'}`}>
                            {provider.configured && <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                            {provider.configured ? 'Yapılandırıldı' : 'Yapılandırılmadı'}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="sk-••••••••••••••••"
                            value={keyInputs[provider.id] || ''}
                            onChange={(e) => setKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            className="flex-1 bg-white dark:bg-[#0B0D10] border border-[#EAE7DC] dark:border-white/[0.12] rounded-xl px-3 text-[13px] text-[#071A3D] dark:text-[#F4F4F5] outline-none focus:border-[#1677FF] transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveKey(provider.id)}
                            disabled={!keyInputs[provider.id] || isSaving[provider.id]}
                            className="px-4 py-1.5 bg-[#1677FF] text-white text-[12.5px] font-medium rounded-xl hover:bg-[#123CBA] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                          >
                            {isSaving[provider.id] ? 'Doğrulanıyor...' : 'Kaydet'}
                          </button>
                        </div>
                        {saveErrors[provider.id] && (
                          <div className="text-[12px] text-[#D93838] mt-2 font-medium">
                            {saveErrors[provider.id]}
                          </div>
                        )}
                      </div>
                    ))}
                    {providers.length === 0 && (
                      <div className="text-[13px] text-[#596E8A] dark:text-[#9299A6] py-4 text-center">
                        Yükleniyor...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. GÖRÜNÜM TAB */}
            {activeTab === 'gorunum' && (
              <div className="space-y-5">
                {/* Tema */}
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] mb-2.5">
                    Tema
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Açık Tema Kartı */}
                    <button
                      type="button"
                      onClick={(e) => {
                        if (theme !== 'light') toggleTheme(e);
                      }}
                      className={`
                        relative flex items-center gap-3 p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150
                        ${theme === 'light'
                          ? 'bg-[#EEF5FF] border-[#1677FF] shadow-xs'
                          : 'bg-[#FAF9F5] dark:bg-[#14171C] border-[#E8E5DC] dark:border-white/[0.08] hover:border-[#1677FF]/40'
                        }
                      `}
                    >
                      <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E2D8] flex items-center justify-center text-[#071A3D] shadow-2xs">
                        <Sun size={17} strokeWidth={2} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                          Açık
                        </span>
                        <span className="text-[11.5px] text-[#596E8A] dark:text-[#9299A6]">
                          Sıcak kırık beyaz
                        </span>
                      </div>
                      {theme === 'light' && (
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#1677FF] flex items-center justify-center text-white">
                          <Check size={11} strokeWidth={3} />
                        </div>
                      )}
                    </button>

                    {/* Koyu Tema Kartı */}
                    <button
                      type="button"
                      onClick={(e) => {
                        if (theme !== 'dark') toggleTheme(e);
                      }}
                      className={`
                        relative flex items-center gap-3 p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150
                        ${theme === 'dark'
                          ? 'bg-[#191D23] border-[#1677FF] shadow-xs'
                          : 'bg-[#FAF9F5] dark:bg-[#14171C] border-[#E8E5DC] dark:border-white/[0.08] hover:border-[#1677FF]/40'
                        }
                      `}
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#0B0D10] border border-white/10 flex items-center justify-center text-[#F4F4F5] shadow-2xs">
                        <Moon size={17} strokeWidth={2} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                          Koyu
                        </span>
                        <span className="text-[11.5px] text-[#596E8A] dark:text-[#9299A6]">
                          Kömür siyahı
                        </span>
                      </div>
                      {theme === 'dark' && (
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#1677FF] flex items-center justify-center text-white">
                          <Check size={11} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#EAE7DC] dark:border-white/[0.08]" />

                {/* Arayüz yoğunluğu */}
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] mb-2.5">
                    Arayüz yoğunluğu
                  </h3>
                  <div className="inline-flex p-1 rounded-xl bg-[#FAF9F5] dark:bg-[#14171C] border border-[#E8E5DC] dark:border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setDensity('rahat')}
                      className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                        density === 'rahat'
                          ? 'bg-white dark:bg-[#191D23] text-[#1677FF] shadow-xs font-semibold'
                          : 'text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                      }`}
                    >
                      Rahat
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensity('kompakt')}
                      className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                        density === 'kompakt'
                          ? 'bg-white dark:bg-[#191D23] text-[#1677FF] shadow-xs font-semibold'
                          : 'text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                      }`}
                    >
                      Kompakt
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. BİLDİRİMLER TAB */}
            {activeTab === 'bildirimler' && (
              <div className="space-y-5">
                {/* Bildirimlere izin ver */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      Bildirimlere izin ver
                    </h3>
                    <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                      Yanıtlar hazır olduğunda masaüstü bildirimi al
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allowNotifications}
                    onClick={() => setAllowNotifications(!allowNotifications)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      allowNotifications ? 'bg-[#1677FF]' : 'bg-[#D1D5DB] dark:bg-[#2A2E37]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                      allowNotifications ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="border-t border-[#EAE7DC] dark:border-white/[0.08]" />

                {/* Sesli bildirim */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5]">
                      Sesli bildirim
                    </h3>
                    <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                      Arka plandayken tamamlanan işlemler için sesli uyarı
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={audioNotifications}
                    onClick={() => setAudioNotifications(!audioNotifications)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      audioNotifications ? 'bg-[#1677FF]' : 'bg-[#D1D5DB] dark:bg-[#2A2E37]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                      audioNotifications ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* 4. HAKKINDA TAB */}
            {activeTab === 'hakkinda' && (
              <div className="flex flex-col items-center justify-center text-center py-6 h-full">
                {/* Logo & Sparkle */}
                <div className="w-12 h-12 rounded-2xl bg-[#EEF5FF] dark:bg-[#14171C] border border-[#1677FF]/20 dark:border-white/[0.08] flex items-center justify-center shadow-xs mb-3.5">
                  <SparkleIcon size={24} className="text-[#1677FF]" glow={true} />
                </div>

                <h3 className="text-[20px] font-bold text-[#071A3D] dark:text-[#F4F4F5] tracking-tight">
                  TokenAI
                </h3>
                <p className="text-[13px] text-[#596E8A] dark:text-[#9299A6] mt-0.5">
                  Yapay Zeka Asistanı
                </p>

                {/* Version badge */}
                <span className="mt-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#1677FF]/10 text-[#1677FF] border border-[#1677FF]/20">
                  v0.1.0
                </span>

                <p className="text-[13px] text-[#596E8A] dark:text-[#9299A6] max-w-[320px] mt-4 leading-relaxed">
                  Modern ve sade bir yapay zeka sohbet arayüzü.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
