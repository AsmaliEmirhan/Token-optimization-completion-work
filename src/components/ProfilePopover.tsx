import React, { useEffect, useRef } from 'react';
import { User, Settings, LogOut } from 'lucide-react';

interface ProfilePopoverProps {
  position?: 'top-right' | 'sidebar';
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onOpenSettings?: () => void;
}

export const ProfilePopover: React.FC<ProfilePopoverProps> = ({
  position = 'top-right',
  onClose,
  triggerRef,
  onOpenSettings,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // If clicking inside the popover, do nothing
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      // If clicking on the trigger button itself, let the button's own onClick handle toggle
      if (triggerRef?.current && triggerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, triggerRef]);

  const positionClasses = position === 'top-right'
    ? 'top-full right-0 mt-2.5 origin-top-right animate-popover-in'
    : 'bottom-full left-0 mb-2.5 origin-bottom-left animate-popover-in-up';

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Kullanıcı Profili"
      className={`
        absolute ${positionClasses}
        w-[275px] p-3 rounded-2xl
        bg-white dark:bg-[#14171C]
        border border-[#E8E5DC] dark:border-white/[0.08]
        shadow-[0_12px_36px_-6px_rgba(7,26,61,0.12),0_4px_16px_rgba(7,26,61,0.04)]
        dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.65)]
        z-50 select-none
      `}
    >
      {/* Top Profile Header: Avatar, Name, Role */}
      <div className="flex items-center gap-3 px-2 py-1.5">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#123CBA] to-[#071A3D] text-white font-semibold flex items-center justify-center text-sm shadow-xs shrink-0 border border-white/20 dark:border-white/10">
          <span>EA</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] leading-snug truncate">
            Emirhan Asmalı
          </span>
          <span className="text-[12px] text-[#596E8A] dark:text-[#9299A6] leading-none mt-0.5">
            Kullanıcı
          </span>
        </div>
      </div>

      {/* Subtle Divider */}
      <div className="border-t border-[#EAE7DC] dark:border-white/[0.08] my-2" />

      {/* Navigation Rows */}
      <div className="flex flex-col space-y-0.5">
        {/* Profilim */}
        <button
          type="button"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] text-[#071A3D]/80 dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] transition-colors cursor-pointer group text-left"
        >
          <User size={16} className="text-[#596E8A] dark:text-[#68707D] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5] transition-colors shrink-0" />
          <span className="font-medium">Profilim</span>
        </button>

        {/* Ayarlar */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSettings?.();
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] text-[#071A3D]/80 dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#EFECE3]/60 dark:hover:bg-[#191D23] transition-colors cursor-pointer group text-left"
        >
          <Settings size={16} className="text-[#596E8A] dark:text-[#68707D] group-hover:text-[#071A3D] dark:group-hover:text-[#F4F4F5] transition-colors shrink-0" />
          <span className="font-medium">Ayarlar</span>
        </button>
      </div>

      {/* Subtle Divider */}
      <div className="border-t border-[#EAE7DC] dark:border-white/[0.08] my-1.5" />

      {/* Çıkış Yap */}
      <button
        type="button"
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] text-[#D93838] dark:text-[#E05252] hover:bg-[#FDE8E8]/60 dark:hover:bg-[#E05252]/10 transition-colors cursor-pointer group text-left"
      >
        <LogOut size={16} className="text-[#D93838] dark:text-[#E05252] group-hover:translate-x-0.5 transition-transform shrink-0" />
        <span className="font-medium">Çıkış Yap</span>
      </button>
    </div>
  );
};
