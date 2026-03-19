import './styles.css';
import type { ReactNode } from 'react';
import { init as initWays } from '@18ways/next/server';

// make sure this code is server-rendered, not client-only rendered
const { WaysRoot } = initWays({
  apiKey: 'pk_dummy_demo_token',
  baseLocale: 'en-GB',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="next-demo-body">
        <WaysRoot>{children}</WaysRoot>
      </body>
    </html>
  );
}
