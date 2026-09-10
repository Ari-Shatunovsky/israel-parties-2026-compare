import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Выборы 2026 · Партии и люди',
  description: 'Нейтральное сравнение израильских партий, их позиций, кандидатов и источников.',
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ru"><body>{children}</body></html>;
}

