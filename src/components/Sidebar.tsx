import React, { useState, useRef } from 'react';
import { SparkleIcon } from './SparkleIcon';
import { useTheme } from '../context/useTheme';
import { ProfilePopover } from './ProfilePopover';
import { 
  Plus, 
  MessageSquare, 
  Settings, 
  Moon, 
  Sun, 
  User, 
  X 
} from 'lucide-react';

interface ConversationItem {
  id: string;
  title: string;
  date: string;
}

const CONVERSATIONS: ConversationItem[] = [];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isProfileOpen?: boolean;
  onToggleProfile?: () => void;
  onCloseProfile?: () => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen = true, 
  onClose,
  isProfileOpen = false,
  onToggleProfile,
  onCloseProfile = () => {},
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [conversations] = useState<ConversationItem[]>(CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<string>('');
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-[#071A3D]/20 dark:bg-black/60 backdrop-blur-xs z-30 lg:hidden theme-transition"
        />
      )}

      <aside 
        className={`
          fixed lg:static top-3 bottom-3 left-3 z-40
          w-[310px] md:w-[320px] shrink-0 h-[calc(100%-24px)] lg:h-[calc(100%-24px)]
          m-3 rounded-[24px] bg-[#FAF9F5] dark:bg-[#101216]
          border border-[#E8E5DC] dark:border-white/[0.08]
          shadow-[0_8px_30px_-6px_rgba(7,26,61,0.05),0_0_15px_rgba(22,119,255,0.03)] dark:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.5)]
          flex flex-col justify-between
          transition-transform duration-300 ease-out theme-transition
          ${isOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0'}
        `}
      >
        {/* Top Section: Header, New Chat, Chat History */}
        <div className="flex flex-col px-4 pt-5 pb-2 overflow-hidden flex-1">
          {/* Logo & Assistant Title */}
          <div className="flex items-center justify-between px-1 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EEF5FF] dark:bg-[#14171C] border border-[#1677FF]/20 dark:border-white/[0.08] flex items-center justify-center shadow-xs theme-transition">
                <SparkleIcon size={20} className="text-[#1677FF]" glow={true} />
              </div>
              <div className="flex flex-col">
                <span className="text-[17px] font-bold tracking-tight text-[#071A3D] dark:text-[#F4F4F5] leading-tight theme-transition">
                  TokenAI
                </span>
                <span className="text-[11.5px] font-normal text-[#596E8A] dark:text-[#9299A6] leading-tight mt-0.5 theme-transition">
                  Yapay Zeka Asistanı
                </span>
              </div>
            </div>

            {/* Mobile close button */}
            {onClose && (
              <button 
                onClick={onClose}
                className="lg:hidden p-1.5 rounded-lg text-[#596E8A] dark:text-[#9299A6] hover:bg-[#EFECE3] dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] transition-colors"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* "+ Yeni Sohbet" Button */}
          <button 
            type="button"
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-white dark:bg-[#14171C] border border-[#E5E2D8] dark:border-white/[0.08] text-[#1677FF] font-medium text-[14px] shadow-[0_2px_8px_rgba(7,26,61,0.03)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_14px_rgba(22,119,255,0.1)] hover:border-[#1677FF]/40 dark:hover:border-white/[0.16] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] active:scale-[0.99] transition-all duration-200 cursor-pointer mb-5 theme-transition"
          >
            <Plus size={18} strokeWidth={2.2} className="text-[#1677FF]" />
            <span>Yeni Sohbet</span>
          </button>

          {/* Chat History Header */}
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[12.5px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] tracking-wide theme-transition">
              Sohbet Geçmişi
            </span>
          </div>

          {/* Conversation History Area */}
          {conversations.length === 0 ? (
            /* Minimal Non-Dominant Empty State */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
              <div className="w-8 h-8 rounded-xl bg-white/70 dark:bg-[#14171C] border border-[#EAE7DC] dark:border-white/[0.08] flex items-center justify-center text-[#8695A8] dark:text-[#68707D] mb-2.5 shadow-2xs theme-transition">
                <MessageSquare size={16} strokeWidth={1.8} className="text-[#8695A8] dark:text-[#68707D] theme-transition" />
              </div>
              <p className="text-[13px] font-medium text-[#071A3D]/75 dark:text-[#F4F4F5]/85 mb-1 theme-transition">
                Henüz sohbet yok
              </p>
              <p className="text-[11.5px] text-[#8695A8] dark:text-[#68707D] leading-relaxed max-w-[210px] theme-transition">
                Yeni bir sohbet başlattığında burada görünecek.
              </p>
            </div>
          ) : (
            /* Conversation History List */
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1 -mr-1">
              {conversations.map((conv) => {
                const isSelected = conv.id === selectedId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    type="button"
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer group theme-transition
                      ${isSelected 
                        ? 'bg-[#EEF5FF] dark:bg-[#191D23] text-[#071A3D] dark:text-[#F4F4F5] font-medium shadow-[0_1px_3px_rgba(22,119,255,0.08)] dark:shadow-none' 
                        : 'bg-transparent text-[#071A3D]/80 dark:text-[#9299A6] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] hover:text-[#071A3D] dark:hover:text-[#F4F4F5]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 mr-2">
                      <MessageSquare 
                        size={15} 
                        className={`shrink-0 transition-colors ${isSelected ? 'text-[#1677FF]' : 'text-[#8695A8] dark:text-[#68707D] group-hover:text-[#596E8A] dark:group-hover:text-[#F4F4F5]'}`}
                        strokeWidth={1.8}
                      />
                      <span className="text-[13px] truncate">
                        {conv.title}
                      </span>
                    </div>
                    <span className={`text-[11px] shrink-0 ${isSelected ? 'text-[#1677FF]/80 font-medium' : 'text-[#8695A8] dark:text-[#68707D]'}`}>
                      {conv.date}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar Bottom Controls */}
        <div className="p-3 border-t border-[#EAE7DC] dark:border-white/[0.08] theme-transition relative z-30">
          <div className="flex flex-col space-y-0.5">
            <button 
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] text-[#071A3D]/80 dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] transition-colors cursor-pointer group theme-transition"
            >
              <Settings size={16} className="text-[#596E8A] dark:text-[#68707D] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5] transition-colors theme-transition" />
              <span>Ayarlar</span>
            </button>

            {/* Tema Button */}
            <button 
              type="button"
              onClick={(e) => toggleTheme(e)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] text-[#071A3D]/80 dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] transition-colors cursor-pointer group theme-transition"
              title="Temayı değiştir"
            >
              {theme === 'dark' ? (
                <Sun size={16} className="text-[#596E8A] dark:text-[#9299A6] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5] transition-colors theme-transition" />
              ) : (
                <Moon size={16} className="text-[#596E8A] dark:text-[#9299A6] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5] transition-colors theme-transition" />
              )}
              <span>Tema</span>
            </button>

            {/* Profil Button with Popover */}
            <div className="relative">
              <button 
                ref={profileButtonRef}
                type="button"
                onClick={onToggleProfile}
                className={`
                  flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer group theme-transition
                  ${isProfileOpen 
                    ? 'bg-[#EFECE3]/80 dark:bg-[#191D23] text-[#071A3D] dark:text-[#F4F4F5]' 
                    : 'text-[#071A3D]/80 dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23]'
                  }
                `}
                title="Profil"
                aria-expanded={isProfileOpen}
                aria-haspopup="dialog"
              >
                <User size={16} className={`transition-colors theme-transition ${isProfileOpen ? 'text-[#1677FF]' : 'text-[#596E8A] dark:text-[#68707D] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5]'}`} />
                <span className="font-medium">Profil</span>
              </button>

              {/* Profile Popover opening upward in bottom-left sidebar area */}
              {isProfileOpen && (
                <ProfilePopover
                  position="sidebar"
                  onClose={onCloseProfile}
                  triggerRef={profileButtonRef}
                  onOpenSettings={onOpenSettings}
                />
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
