import React, { createContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: (event?: React.MouseEvent | MouseEvent | HTMLElement) => void;
}

const THEME_STORAGE_KEY = 'tokenai-theme';

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore write errors
    }
  }, [theme]);

  const toggleTheme = (trigger?: React.MouseEvent | MouseEvent | HTMLElement) => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';

    // Check for prefers-reduced-motion
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Check for View Transitions API support
    const doc = document as Document & {
      startViewTransition?: (callback: () => Promise<void> | void) => {
        ready: Promise<void>;
        finished: Promise<void>;
        updateCallbackDone: Promise<void>;
      };
    };

    if (!doc.startViewTransition || isReducedMotion) {
      setTheme(nextTheme);
      return;
    }

    // Determine the exact center coordinates of the clicked theme button
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (trigger) {
      let targetElement: HTMLElement | null = null;
      if (trigger instanceof HTMLElement) {
        targetElement = trigger;
      } else if ('currentTarget' in trigger && trigger.currentTarget instanceof HTMLElement) {
        targetElement = trigger.currentTarget;
      } else if ('target' in trigger && trigger.target instanceof HTMLElement) {
        targetElement = trigger.target;
      }

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else if ('clientX' in trigger && typeof trigger.clientX === 'number') {
        x = trigger.clientX;
        y = trigger.clientY;
      }
    }

    // Calculate maximum distance to the farthest viewport corner
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // Start view transition with synchronous DOM flush
    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
      // Synchronize root class immediately for the incoming view snapshot
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });

    // Animate expanding circular clip-path on the new theme root view
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 650,
            easing: 'cubic-bezier(0.76, 0, 0.24, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => {
        // Fallback gracefully if transition was cancelled
      });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
