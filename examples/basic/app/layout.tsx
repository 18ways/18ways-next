import './styles.css';
import type { ReactNode } from 'react';
import { WaysRoot } from '@18ways/next/server';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="next-demo-body">
        <WaysRoot>{children}</WaysRoot>
      </body>
    </html>
  );
}
