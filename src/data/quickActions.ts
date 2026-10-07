import React from 'react';
import { 
  Code2, 
  BookOpen, 
  Lightbulb, 
  PenLine, 
  Search, 
  CalendarCheck 
} from 'lucide-react';

export interface SuggestionCardData {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  placeholder: string;
}

export const CARDS: SuggestionCardData[] = [
  {
    id: 'code',
    icon: Code2,
    title: 'Kod Yaz',
    description: 'Kod örnekleri ve teknik çözümler',
    placeholder: 'Ne geliştirmek istediğini anlat...',
  },
  {
    id: 'explain',
    icon: BookOpen,
    title: 'Açıkla',
    description: 'Karmaşık konuları basitçe açıkla',
    placeholder: 'Açıklamamı istediğin konuyu yaz...',
  },
  {
    id: 'ideas',
    icon: Lightbulb,
    title: 'Fikir Ver',
    description: 'Projeler ve yaratıcı fikirler',
    placeholder: 'Hangi konuda fikir istediğini yaz...',
  },
  {
    id: 'edit',
    icon: PenLine,
    title: 'Düzenle',
    description: 'Metin ve içerik düzenleme',
    placeholder: 'Düzenlememi istediğin metni yaz...',
  },
  {
    id: 'research',
    icon: Search,
    title: 'Araştır',
    description: 'Kaynak ve bilgi araştırma',
    placeholder: 'Araştırmamı istediğin konuyu yaz...',
  },
  {
    id: 'plan',
    icon: CalendarCheck,
    title: 'Planla',
    description: 'Görev ve proje planlaması',
    placeholder: 'Planlamak istediğin şeyi anlat...',
  },
];
