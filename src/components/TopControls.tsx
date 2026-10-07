import React, { useRef } from 'react';
import { Sun, Moon, Bell, Menu } from 'lucide-react';
import { useTheme } from '../context/useTheme';
import { ProfilePopover } from './ProfilePopover';
import { NotificationPopover } from './NotificationPopover';
import { ChartNoAxesColumnIncreasing } from 'lucide-react';

interface TopControlsProps {
  onToggleSidebar?: () => void;
  isProfileOpen?: boolean;
  onToggleProfile?: () => void;
  onCloseProfile?: () => void;
  isNotificationOpen?: boolean;
  onToggleNotification?: () => void;
  onCloseNotification?: () => void;
  isMetricsOpen?: boolean;
  onToggleMetrics?: () => void;
  onOpenSettings?: () => void;
}

export const TopControls: React.FC<TopControlsProps> = ({ 
  onToggleSidebar,
  isProfileOpen = false,
  onToggleProfile,
  onCloseProfile = () => {},
  isNotificationOpen = false,
  onToggleNotification,
  onCloseNotification = () => {},
  isMetricsOpen = false,
  onToggleMetrics,
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center justify-between lg:justify-end w-full px-6 pt-5 pb-2 shrink-0 relative z-30">
      {/* Mobile Menu Button */}
      <button
        onClick={onToggleSidebar}
        type="button"
        className="lg:hidden p-2 rounded-xl text-[#071A3D] dark:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] border border-[#E8E5DC] dark:border-white/[0.08] transition-colors theme-transition"
        aria-label="Menüyü aç"
      >
        <Menu size={18} />
      </button>

      {/* Right side controls */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Sun/Moon Theme Toggle Button: Sun in Light Mode, Moon in Dark Mode */}
        <button
          type="button"
          onClick={(e) => toggleTheme(e)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[#071A3D] dark:text-[#F4F4F5] hover:bg-white/80 dark:hover:bg-[#191D23] hover:shadow-xs transition-all duration-150 cursor-pointer theme-transition"
          title={theme === 'dark' ? "Açık temaya geç" : "Koyu temaya geç"}
        >
          {theme === 'dark' ? (
            <Moon size={18} strokeWidth={2} className="text-[#F4F4F5]" />
          ) : (
            <Sun size={18} strokeWidth={2} className="text-[#071A3D]" />
          )}
        </button>

        {/* Metrics Toggle Button */}
        <button
          id="metrics-toggle-button"
          type="button"
          onClick={onToggleMetrics}
          className={`
            relative w-9 h-9 rounded-xl flex items-center justify-center text-[#071A3D] dark:text-[#F4F4F5] hover:bg-white/80 dark:hover:bg-[#191D23] hover:shadow-xs transition-all duration-150 cursor-pointer theme-transition
            ${isMetricsOpen 
              ? 'bg-white/90 dark:bg-[#191D23] shadow-xs ring-1 ring-[#1677FF]/30 dark:ring-white/[0.12]' 
              : ''
            }
          `}
          title="Kullanım İstatistikleri"
          aria-label="Kullanım İstatistikleri"
          aria-expanded={isMetricsOpen}
        >
          <ChartNoAxesColumnIncreasing size={18} strokeWidth={2} />
        </button>

        {/* Notification / Bell Icon with Dropdown Popover */}
        <div className="relative">
          <button
            ref={notificationButtonRef}
            type="button"
            onClick={onToggleNotification}
            className={`
              relative w-9 h-9 rounded-xl flex items-center justify-center text-[#071A3D] dark:text-[#F4F4F5] hover:bg-white/80 dark:hover:bg-[#191D23] hover:shadow-xs transition-all duration-150 cursor-pointer theme-transition
              ${isNotificationOpen 
                ? 'bg-white/90 dark:bg-[#191D23] shadow-xs ring-1 ring-[#1677FF]/30 dark:ring-white/[0.12]' 
                : ''
              }
            `}
            title="Bildirimler"
            aria-label="Bildirimler"
            aria-expanded={isNotificationOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} strokeWidth={2} />
            {/* Subtle electric blue notification indicator dot */}
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#1677FF]" />
          </button>

          {/* Notification Popover directly below bell and aligned to right */}
          {isNotificationOpen && (
            <NotificationPopover
              onClose={onCloseNotification}
              triggerRef={notificationButtonRef}
            />
          )}
        </div>

        {/* Thin vertical divider */}
        <div className="w-[1px] h-4 bg-[#DFDBD0] dark:bg-white/[0.12] mx-1 theme-transition" />

        {/* Circular Profile Avatar with Dropdown Popover */}
        <div className="relative">
          <button
            ref={profileButtonRef}
            type="button"
            onClick={onToggleProfile}
            className={`
              relative w-8 h-8 rounded-full overflow-hidden border shadow-xs transition-all duration-150 cursor-pointer flex items-center justify-center bg-gradient-to-br from-[#123CBA] to-[#071A3D] text-white text-xs font-semibold
              ${isProfileOpen 
                ? 'border-[#1677FF] ring-2 ring-[#1677FF]/25' 
                : 'border-[#D8D3C5] dark:border-white/[0.16] hover:border-[#1677FF]/50'
              }
            `}
            title="Profil"
            aria-expanded={isProfileOpen}
            aria-haspopup="dialog"
          >
            <span>EA</span>
          </button>

          {/* Profile Popover directly below avatar and aligned to right */}
          {isProfileOpen && (
            <ProfilePopover
              position="top-right"
              onClose={onCloseProfile}
              triggerRef={profileButtonRef}
              onOpenSettings={onOpenSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
};
