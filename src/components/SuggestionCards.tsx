import { ArrowUpRight } from 'lucide-react';
import { CARDS } from '../data/quickActions';

interface SuggestionCardsProps {
  selectedCardId?: string | null;
  onSelectCard?: (cardId: string) => void;
}

export const SuggestionCards: React.FC<SuggestionCardsProps> = ({
  selectedCardId = null,
  onSelectCard = () => {},
}) => {
  return (
    <div className="w-full max-w-[840px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-3.5 px-4">
      {CARDS.map((card) => {
        const IconComponent = card.icon;
        const isSelected = selectedCardId === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectCard(card.id)}
            aria-pressed={isSelected}
            className={`
              group relative flex items-center justify-between p-3.5 md:p-4 rounded-[20px]
              text-left transition-all duration-200 ease-out cursor-pointer select-none
              active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-[#1677FF]/50
              theme-transition
              ${isSelected
                ? 'bg-white dark:bg-[#161B22] border-[#1677FF]/60 dark:border-[#1677FF]/60 shadow-[0_6px_20px_-2px_rgba(22,119,255,0.16),0_0_12px_rgba(41,217,255,0.12)] dark:shadow-[0_6px_22px_-2px_rgba(22,119,255,0.28),0_0_14px_rgba(41,217,255,0.15)] ring-1 ring-[#1677FF]/30 dark:ring-[#1677FF]/35'
                : 'bg-white/90 dark:bg-[#14171C] hover:bg-white dark:hover:bg-[#191D23] border-[#EAE7DC] dark:border-white/[0.08] hover:border-[#1677FF]/35 dark:hover:border-white/[0.16] shadow-[0_2px_8px_rgba(7,26,61,0.03)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_10px_24px_-6px_rgba(7,26,61,0.07),0_0_12px_rgba(22,119,255,0.04)] dark:hover:shadow-[0_10px_24px_-6px_rgba(0,0,0,0.5)] hover:-translate-y-0.5'
              }
              border
            `}
          >
            <div className="flex items-center gap-3.5 min-w-0 mr-2">
              {/* Icon container */}
              <div 
                className={`
                  w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 theme-transition
                  ${isSelected
                    ? 'bg-[#E5F0FF] dark:bg-[#1677FF]/20 border border-[#1677FF]/35 dark:border-[#1677FF]/40 shadow-xs scale-105'
                    : 'bg-[#EEF5FF] dark:bg-[#101216] border border-[#1677FF]/10 dark:border-white/[0.08] group-hover:scale-105 group-hover:bg-[#E5F0FF] dark:group-hover:bg-[#191D23]'
                  }
                `}
              >
                <IconComponent 
                  size={19} 
                  className={isSelected ? 'text-[#1677FF] dark:text-[#40BFFF]' : 'text-[#1677FF]'} 
                  strokeWidth={isSelected ? 2.1 : 1.8} 
                />
              </div>

              {/* Title & Description */}
              <div className="min-w-0 flex flex-col justify-center">
                <span 
                  className={`
                    text-[14px] font-semibold leading-tight tracking-tight transition-colors theme-transition
                    ${isSelected
                      ? 'text-[#123CBA] dark:text-[#248BFF]'
                      : 'text-[#071A3D] dark:text-[#F4F4F5] group-hover:text-[#123CBA] dark:group-hover:text-[#248BFF]'
                    }
                  `}
                >
                  {card.title}
                </span>
                <span className="text-[12px] text-[#64748B] dark:text-[#9299A6] mt-0.5 leading-tight truncate theme-transition">
                  {card.description}
                </span>
              </div>
            </div>

            {/* Right Arrow Icon */}
            <div 
              className={`
                shrink-0 transition-all duration-200
                ${isSelected
                  ? 'text-[#1677FF] dark:text-[#40BFFF] translate-x-0.5 -translate-y-0.5'
                  : 'text-[#A0AEC0] dark:text-[#68707D] group-hover:text-[#1677FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
                }
              `}
            >
              <ArrowUpRight size={16} strokeWidth={isSelected ? 2.4 : 2} />
            </div>
          </button>
        );
      })}
    </div>
  );
};
