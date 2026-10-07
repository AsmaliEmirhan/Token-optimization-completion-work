import { useContext } from 'react';
import { ThemeContext, type ThemeContextType } from './ThemeContext';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      toggleTheme: () => {},
    };
  }
  return context;
};
