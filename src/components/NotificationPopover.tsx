import React, { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationPopoverProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  onClose,
  triggerRef,
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

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Bildirimler"
      className="
        absolute top-full right-[-52px] sm:right-0 mt-2.5
        w-[360px] max-w-[calc(100vw-2rem)]
        rounded-[20px]
        bg-white dark:bg-[#14171C]
        border border-[#E8E5DC] dark:border-white/[0.08]
        shadow-[0_12px_36px_-6px_rgba(7,26,61,0.12),0_4px_16px_rgba(7,26,61,0.04)]
        dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.65)]
        origin-top-right animate-popover-in
        z-50 select-none overflow-hidden
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Bell size={16} strokeWidth={2} className="text-[#071A3D] dark:text-[#F4F4F5]" />
          <h2 className="text-[14px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] leading-none">
            Bildirimler
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] transition-colors cursor-pointer"
          aria-label="Bildirimleri kapat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Subtle Divider */}
      <div className="border-t border-[#EAE7DC] dark:border-white/[0.08]" />

      {/* Minimal Clean Empty State */}
      <div className="px-5 py-9 flex flex-col items-center justify-center text-center">
        <div className="w-11 h-11 rounded-2xl bg-[#FAF9F5] dark:bg-[#191D23] border border-[#E8E5DC] dark:border-white/[0.06] flex items-center justify-center mb-3">
          <Bell size={18} strokeWidth={1.75} className="text-[#596E8A] dark:text-[#9299A6]" />
        </div>
        <p className="text-[13.5px] font-medium text-[#071A3D] dark:text-[#F4F4F5] mb-1">
          Henüz bildirimin yok
        </p>
        <p className="text-[12px] text-[#596E8A] dark:text-[#9299A6] max-w-[230px] leading-relaxed">
          Yeni bildirimlerin burada görünecek.
        </p>
      </div>
    </div>
  );
};
