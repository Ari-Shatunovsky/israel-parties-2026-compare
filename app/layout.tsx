import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Выборы 2026 · Партии и люди',
  description: 'Нейтральное сравнение израильских партий, их позиций, кандидатов и источников.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Кроссплатформенный стек: латиница, иврит и заголовочная антиква
            не должны зависеть от того, что установлено у читателя. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Правило no-page-custom-font написано для pages-роутера; в корневом
            layout шрифт подключается один раз на всё приложение. */}
        {/* eslint-disable-next-line next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Source+Serif+4:ital,wght@0,400;0,500;1,400&family=Noto+Sans+Hebrew:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
