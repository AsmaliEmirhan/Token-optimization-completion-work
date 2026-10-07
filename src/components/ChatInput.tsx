import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Globe, Mic, ArrowUp, X, FileText, Image as ImageIcon } from 'lucide-react';

export interface Attachment {
  id: string;
  file: File;
  type: 'file' | 'image';
  previewUrl?: string;
}

interface ChatInputProps {
  selectedAction?: { id: string; title: string } | null;
  placeholder?: string;
  onClearAction?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSendMessage?: (content: string) => Promise<boolean | void> | boolean | void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  selectedAction = null,
  placeholder = 'Mesajını buraya yaz...',
  onClearAction,
  inputRef,
  onSendMessage,
}) => {
  const [message, setMessage] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sendPressed, setSendPressed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const paperclipButtonRef = useRef<HTMLButtonElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use external ref if provided, otherwise internal
  const resolvedRef = inputRef || textareaRef;

  // Keep ref updated for unmount cleanup
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Clean up object URLs, toast timer, and speech recognition on unmount
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((att) => {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
        }
      });
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  // Close attachment menu on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      if (paperclipButtonRef.current && paperclipButtonRef.current.contains(target)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleFiles = (files: FileList | null, type: 'file' | 'image') => {
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
    const MAX_ATTACHMENTS = 5;

    const currentCount = attachments.length;
    const newAttachments: Attachment[] = [];
    let sizeExceeded = false;
    let countExceeded = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > MAX_FILE_SIZE) {
        sizeExceeded = true;
        continue;
      }

      if (currentCount + newAttachments.length >= MAX_ATTACHMENTS) {
        countExceeded = true;
        break;
      }

      const isImage = type === 'image' || file.type.startsWith('image/');
      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        type: isImage ? 'image' : 'file',
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      });
    }

    if (sizeExceeded) {
      showToast('Dosya boyutu en fazla 20 MB olabilir.');
    } else if (countExceeded || (files.length > 0 && newAttachments.length === 0 && currentCount >= MAX_ATTACHMENTS)) {
      showToast('En fazla 5 dosya ekleyebilirsin.');
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((att) => att.id !== id);
    });
  };

  const handleFileOptionClick = () => {
    setIsMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleImageOptionClick = () => {
    setIsMenuOpen(false);
    imageInputRef.current?.click();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    }
    setIsListening(false);
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Sesle yazma bu tarayıcıda desteklenmiyor.');
      return;
    }

    baseTextRef.current = message.trim();

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const spokenText = `${finalTranscript} ${interimTranscript}`.trim();
        if (!spokenText) return;

        const combined = baseTextRef.current
          ? `${baseTextRef.current} ${spokenText}`
          : spokenText;

        setMessage(combined);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          showToast('Mikrofon izni verilmedi.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        showToast('Mikrofon izni verilmedi.');
      }
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const hasAttachments = attachments.length > 0;
  const canSend = message.trim() !== '';

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    
    setSendPressed(true);
    setTimeout(() => setSendPressed(false), 160);
    
    const success = await Promise.resolve(onSendMessage?.(trimmed));
    if (success !== false) {
      setMessage('');
    }
    // Auto-resize textarea back after clearing
    requestAnimationFrame(() => {
      const el = resolvedRef?.current;
      if (el) {
        el.style.height = 'auto';
        el.focus();
      }
    });
  }, [message, onSendMessage, resolvedRef]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't send during IME composition
    if (e.nativeEvent.isComposing || isComposingRef.current) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div className="w-full max-w-[840px] px-4 flex flex-col items-center">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,application/pdf,text/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files, 'file');
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files, 'image');
          e.target.value = '';
        }}
      />

      {/* Temporary Toast Notification (Do NOT use alert()) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 px-3.5 py-1.5 rounded-full bg-[#071A3D] dark:bg-white text-white dark:text-[#071A3D] text-[12px] font-medium shadow-[0_4px_16px_rgba(7,26,61,0.15)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.5)] animate-popover-in flex items-center gap-1.5 select-none z-30"
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Outer illuminated container matching main frame identity with subtle glow */}
      <div 
        className={`
          relative w-full rounded-[30px] p-[1.5px]
          ${hasAttachments ? 'min-h-[116px] md:min-h-[126px] h-auto' : 'min-h-[92px] md:min-h-[100px] h-auto'}
          shadow-[0_16px_36px_-10px_rgba(7,26,61,0.06),0_0_24px_-4px_rgba(22,119,255,0.07)]
          dark:shadow-[0_16px_36px_-10px_rgba(0,0,0,0.5),0_0_18px_-4px_rgba(22,119,255,0.08)]
          transition-all duration-300 group
          focus-within:shadow-[0_20px_40px_-10px_rgba(7,26,61,0.08),0_0_30px_-2px_rgba(22,119,255,0.12)]
          dark:focus-within:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6),0_0_26px_-2px_rgba(22,119,255,0.16)]
          theme-transition
        `}
      >
        {/* Animated subtle rotating illuminated border - clipped cleanly within border mask */}
        <div className="absolute inset-0 rounded-[30px] overflow-hidden pointer-events-none" aria-hidden="true">
          <div 
            className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] input-rotating-glow opacity-45 dark:opacity-50 group-focus-within:opacity-85 dark:group-focus-within:opacity-90 transition-opacity duration-300" 
          />
        </div>

        {/* Inner Input Surface: charcoal #111419 in dark mode */}
        <div 
          className={`
            relative z-10 w-full h-full bg-white dark:bg-[#111419] rounded-[28.5px]
            ${hasAttachments ? 'flex flex-col justify-between py-2.5 px-3 md:px-5 gap-2' : 'flex items-center justify-between px-3 md:px-5 gap-2 md:gap-3'}
            theme-transition
          `}
        >
          {/* ATTACHMENT CHIPS (Visible only when attachments exist) */}
          {hasAttachments && (
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2 pt-0.5 px-1 animate-fadeIn">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-xl bg-[#FAF9F5] dark:bg-[#191D23] border border-[#E8E5DC] dark:border-white/[0.08] shadow-xs select-none max-w-[220px] transition-all duration-150 animate-popover-in"
                >
                  {/* Icon or Thumbnail */}
                  {att.type === 'image' && att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.file.name}
                      className="w-6 h-6 rounded-md object-cover shrink-0 border border-black/5 dark:border-white/10"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-[#EEF5FF] dark:bg-[#101216] border border-[#1677FF]/15 dark:border-white/[0.08] flex items-center justify-center shrink-0 text-[#1677FF]">
                      <FileText size={13} strokeWidth={2} />
                    </div>
                  )}

                  {/* File name & size */}
                  <div className="flex flex-col min-w-0 mr-1">
                    <span 
                      className="text-[12px] font-medium text-[#071A3D] dark:text-[#F4F4F5] truncate max-w-[120px] leading-tight" 
                      title={att.file.name}
                    >
                      {att.file.name}
                    </span>
                    <span className="text-[10px] text-[#596E8A] dark:text-[#9299A6] leading-none mt-0.5">
                      {formatFileSize(att.file.size)}
                    </span>
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[#596E8A] hover:text-[#D93838] hover:bg-[#D93838]/10 dark:text-[#9299A6] dark:hover:text-[#E05252] dark:hover:bg-[#E05252]/10 transition-colors cursor-pointer shrink-0"
                    aria-label={`${att.file.name} dosyasını kaldır`}
                    title="Kaldır"
                  >
                    <X size={11} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MAIN INPUT ROW */}
          <div className="flex items-center justify-between w-full gap-2 md:gap-3">
            {/* LEFT: Paperclip Attachment with Floating Popover Menu */}
            <div className="relative shrink-0">
              <button
                ref={paperclipButtonRef}
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className={`
                  w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] active:scale-95 transition-all duration-150 cursor-pointer shrink-0 theme-transition
                  ${isMenuOpen ? 'bg-[#FAF9F5] dark:bg-[#191D23] text-[#071A3D] dark:text-[#F4F4F5] ring-1 ring-[#1677FF]/25' : ''}
                `}
                title="Dosya ekle"
                aria-label="Dosya ekle"
                aria-expanded={isMenuOpen}
                aria-haspopup="true"
              >
                <Paperclip size={20} strokeWidth={1.8} />
              </button>

              {/* Floating Attachment Menu directly above paperclip */}
              {isMenuOpen && (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label="Dosya yükleme seçenekleri"
                  className="
                    absolute bottom-full left-0 mb-3
                    w-[205px] p-1.5 rounded-[16px]
                    bg-white dark:bg-[#14171C]
                    border border-[#E8E5DC] dark:border-white/[0.08]
                    shadow-[0_12px_36px_-6px_rgba(7,26,61,0.12),0_4px_16px_rgba(7,26,61,0.04)]
                    dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.65)]
                    origin-bottom-left animate-popover-in-up
                    z-50 select-none
                  "
                >
                  {/* Dosya Yükle */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleFileOptionClick}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-[#071A3D] dark:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] transition-colors cursor-pointer text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#EEF5FF] dark:bg-[#101216] border border-[#1677FF]/15 dark:border-white/[0.08] flex items-center justify-center text-[#1677FF] group-hover:scale-105 transition-transform shrink-0">
                      <FileText size={15} strokeWidth={2} />
                    </div>
                    <span>Dosya Yükle</span>
                  </button>

                  {/* Görsel Yükle */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleImageOptionClick}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-[#071A3D] dark:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] transition-colors cursor-pointer text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#EEF5FF] dark:bg-[#101216] border border-[#1677FF]/15 dark:border-white/[0.08] flex items-center justify-center text-[#1677FF] group-hover:scale-105 transition-transform shrink-0">
                      <ImageIcon size={15} strokeWidth={2} />
                    </div>
                    <span>Görsel Yükle</span>
                  </button>
                </div>
              )}
            </div>

            {/* CENTER: Text Input Area */}
            <div className="flex-1 flex items-center h-full min-w-0">
              {/* Removable mode chip when quick action is selected */}
              {selectedAction && (
                <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 mr-2 rounded-xl bg-[#EEF5FF] dark:bg-[#1677FF]/15 border border-[#1677FF]/25 dark:border-[#1677FF]/35 text-[#1677FF] dark:text-[#40BFFF] text-[12px] font-medium shrink-0 select-none">
                  <span className="leading-none whitespace-nowrap">{selectedAction.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearAction?.();
                    }}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#1677FF]/15 dark:hover:bg-[#1677FF]/30 text-[#1677FF] dark:text-[#40BFFF] transition-colors cursor-pointer"
                    aria-label={`${selectedAction.title} modunu kaldır`}
                    title="Modu kaldır"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Removable mode chip when Web Search is active */}
              {webSearchEnabled && (
                <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 mr-2 rounded-xl bg-[#EEF5FF] dark:bg-[#14171C] border border-[#1677FF]/25 dark:border-[#1677FF]/35 text-[#1677FF] dark:text-[#40BFFF] text-[12px] font-medium shrink-0 select-none animate-fadeIn">
                  <Globe size={13} strokeWidth={2} className="text-[#1677FF] dark:text-[#40BFFF] shrink-0" />
                  <span className="leading-none whitespace-nowrap text-[#1677FF] dark:text-[#F4F4F5]">Web'de Ara</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWebSearchEnabled(false);
                    }}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#1677FF]/15 dark:hover:bg-[#1677FF]/30 text-[#1677FF] dark:text-[#40BFFF] transition-colors cursor-pointer ml-0.5"
                    aria-label="Web'de Ara modunu kapat"
                    title="Web aramasını kapat"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Listening status indicator with subtle audio wave */}
              {isListening && (
                <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 mr-2 rounded-xl bg-[#EEF5FF] dark:bg-[#1677FF]/15 border border-[#1677FF]/30 dark:border-[#1677FF]/40 text-[#1677FF] dark:text-[#40BFFF] text-[12px] font-medium shrink-0 select-none animate-fadeIn">
                  <span className="flex items-center gap-0.5 h-3 px-0.5" aria-hidden="true">
                    <span className="w-0.5 h-2 bg-[#1677FF] dark:bg-[#40BFFF] rounded-full animate-[pulse_0.6s_ease-in-out_infinite]" />
                    <span className="w-0.5 h-3.5 bg-[#1677FF] dark:bg-[#40BFFF] rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.15s]" />
                    <span className="w-0.5 h-1.5 bg-[#1677FF] dark:bg-[#40BFFF] rounded-full animate-[pulse_0.5s_ease-in-out_infinite_0.3s]" />
                  </span>
                  <span className="leading-none whitespace-nowrap text-[#1677FF] dark:text-[#F4F4F5]">Dinleniyor...</span>
                </div>
              )}

              <textarea
                ref={resolvedRef as React.RefObject<HTMLTextAreaElement>}
                value={message}
                onChange={handleTextareaInput}
                onKeyDown={handleTextareaKeyDown}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                placeholder={placeholder}
                rows={1}
                className="w-full text-[15px] md:text-[16px] text-[#071A3D] dark:text-[#F4F4F5] placeholder-[#94A3B8] dark:placeholder-[#68707D] font-normal bg-transparent outline-none border-none py-2 px-1 focus:ring-0 leading-relaxed theme-transition resize-none overflow-y-auto max-h-[120px]"
                style={{ height: 'auto' }}
              />
            </div>

            {/* RIGHT: Globe, Mic, Send Button */}
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              {/* Globe Web Search Icon with Tooltip */}
              <div className="relative group/globe">
                <button
                  type="button"
                  onClick={() => setWebSearchEnabled((prev) => !prev)}
                  aria-label="Web'de Ara"
                  aria-pressed={webSearchEnabled}
                  className={`
                    w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 theme-transition
                    ${webSearchEnabled
                      ? 'bg-[#EEF5FF] dark:bg-[#1677FF]/15 text-[#1677FF] dark:text-[#40BFFF] border border-[#1677FF]/30 dark:border-[#1677FF]/40 shadow-[0_0_12px_rgba(22,119,255,0.25)] dark:shadow-[0_0_14px_rgba(41,217,255,0.25)] scale-105 active:scale-100'
                      : 'text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] active:scale-95 border border-transparent'
                    }
                  `}
                  title={webSearchEnabled ? "Web Arama Açık" : "Web'de Ara"}
                >
                  <Globe size={19} strokeWidth={webSearchEnabled ? 2.1 : 1.8} />
                </button>

                {/* Styled Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-[#071A3D] dark:bg-[#191D23] text-white text-[11px] font-medium shadow-[0_4px_12px_rgba(7,26,61,0.15)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-transparent dark:border-white/[0.08] pointer-events-none opacity-0 group-hover/globe:opacity-100 group-hover/globe:translate-y-0 translate-y-1 transition-all duration-150 whitespace-nowrap z-40 select-none">
                  <span>{webSearchEnabled ? "Web Arama Açık" : "Web'de Ara"}</span>
                </div>
              </div>

              {/* Microphone Voice Button with Gentle Pulse & Tooltip */}
              <div className="relative group/mic">
                <button
                  type="button"
                  onClick={toggleListening}
                  aria-label={isListening ? "Sesle yazmayı durdur" : "Sesle yazmayı başlat"}
                  aria-pressed={isListening}
                  className={`
                    relative w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 theme-transition
                    ${isListening
                      ? 'bg-[#EEF5FF] dark:bg-[#1677FF]/15 text-[#1677FF] dark:text-[#40BFFF] border border-[#1677FF]/30 dark:border-[#1677FF]/40 shadow-[0_0_12px_rgba(22,119,255,0.25)] dark:shadow-[0_0_14px_rgba(41,217,255,0.25)] scale-105 active:scale-100'
                      : 'text-[#596E8A] dark:text-[#9299A6] hover:text-[#071A3D] dark:hover:text-[#F4F4F5] hover:bg-[#FAF9F5] dark:hover:bg-[#191D23] active:scale-95 border border-transparent'
                    }
                  `}
                  title={isListening ? "Sesle yazmayı durdur" : "Sesli mesaj"}
                >
                  {/* Gentle pulse animation when active */}
                  {isListening && (
                    <span 
                      className="absolute inset-0 rounded-xl bg-[#1677FF]/20 dark:bg-[#1677FF]/25 animate-ping pointer-events-none" 
                      aria-hidden="true" 
                    />
                  )}
                  <Mic size={19} strokeWidth={isListening ? 2.1 : 1.8} className="relative z-10" />
                </button>

                {/* Styled Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-[#071A3D] dark:bg-[#191D23] text-white text-[11px] font-medium shadow-[0_4px_12px_rgba(7,26,61,0.15)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-transparent dark:border-white/[0.08] pointer-events-none opacity-0 group-hover/mic:opacity-100 group-hover/mic:translate-y-0 translate-y-1 transition-all duration-150 whitespace-nowrap z-40 select-none">
                  <span>{isListening ? "Sesle yazmayı durdur" : "Sesle yazmayı başlat"}</span>
                </div>
              </div>

              {/* Send Button: Rounded blue square with elegant gradient & white arrow */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-disabled={!canSend}
                className={`
                  w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-[#1677FF] via-[#123CBA] to-[#071A3D] text-white flex items-center justify-center transition-all duration-200 ml-1
                  ${canSend
                    ? 'shadow-[0_4px_14px_rgba(22,119,255,0.35)] hover:shadow-[0_6px_20px_rgba(22,119,255,0.48)] hover:scale-105 active:scale-95 cursor-pointer opacity-100'
                    : 'opacity-45 cursor-default shadow-none'
                  }
                  ${sendPressed ? 'animate-send-press' : ''}
                `}
                title="Gönder"
              >
                <ArrowUp size={20} strokeWidth={2.4} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle bottom disclaimer text */}
      <span className="text-[11px] text-[#8695A8] dark:text-[#68707D] mt-2 tracking-tight select-none theme-transition">
        TokenAI yanıtlarında hata yapabilir. Önemli bilgileri kontrol ediniz.
      </span>
    </div>
  );
};
