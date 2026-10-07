import React from 'react';
import { SparkleIcon } from './SparkleIcon';

export const WelcomeArea: React.FC = () => {
  return (
    <div className="flex flex-col items-center text-center px-4 mb-6 md:mb-8 select-none">
      {/* Large 4-point AI sparkle icon with electric blue styling and soft glow */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Ambient radial halo behind sparkle */}
        <div className="absolute w-24 h-24 rounded-full bg-[#1677FF]/15 dark:bg-[#1677FF]/20 filter blur-xl pointer-events-none animate-pulse-subtle" />
        
        {/* Center sparkle badge: charcoal background #14171C, neutral border */}
        <div className="w-13 h-13 md:w-15 md:h-15 rounded-2xl bg-white/95 dark:bg-[#14171C] border border-[#1677FF]/25 dark:border-white/[0.08] shadow-[0_8px_24px_rgba(22,119,255,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex items-center justify-center relative z-10 transition-transform duration-300 hover:scale-105 theme-transition">
          <SparkleIcon size={30} className="text-[#1677FF]" glow={true} />
        </div>
      </div>

      {/* Greeting typography */}
      <h1 className="text-3xl md:text-4xl lg:text-[38px] font-bold text-[#071A3D] dark:text-[#F4F4F5] tracking-tight leading-tight theme-transition">
        Merhaba,
      </h1>
      <p className="text-xl md:text-2xl lg:text-[25px] font-normal text-[#071A3D]/75 dark:text-[#9299A6] tracking-tight mt-1.5 leading-snug theme-transition">
        Bugün sana nasıl yardımcı olabilirim?
      </p>
    </div>
  );
};
