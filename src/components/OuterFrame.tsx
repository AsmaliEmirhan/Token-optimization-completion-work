import React from 'react';

interface OuterFrameProps {
  children: React.ReactNode;
}

export const OuterFrame: React.FC<OuterFrameProps> = ({ children }) => {
  return (
    <div className="relative w-screen h-screen p-3 md:p-4 bg-[#F7F5EF] dark:bg-[#08090B] overflow-hidden flex items-center justify-center theme-transition">
      {/* Outer ambient soft glow layer breathing outside the border (subtle elegant accent on near-black) */}
      <div 
        className="absolute inset-3 md:inset-4 rounded-[32px] pointer-events-none filter blur-xl opacity-70 dark:opacity-45 z-0 overflow-hidden transition-opacity duration-300"
        aria-hidden="true"
      >
        <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] rotating-ambient-halo" />
      </div>

      {/* Main illuminated border container */}
      <div className="relative w-full h-full rounded-[30px] p-[1.5px] overflow-hidden shadow-soft-frame z-10 flex">
        {/* Animated illuminated traveling light border: dark navy -> deep blue -> electric blue -> light blue -> cyan */}
        <div 
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] rotating-conic-glow pointer-events-none" 
          aria-hidden="true"
        />

        {/* Inner application content surface: #0B0D10 in dark mode */}
        <div className="relative z-10 w-full h-full bg-[#F7F5EF] dark:bg-[#0B0D10] rounded-[28.5px] flex overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-none theme-transition">
          {children}
        </div>
      </div>
    </div>
  );
};
