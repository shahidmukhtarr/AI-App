import './globals.css';

// Initialize services on server startup
if (typeof window === 'undefined') {
  import('../server/services/db.js').then(({ initDb }) => {
    initDb().catch(err => {
      console.error('[Bootstrap] Database initialization failed:', err.message);
    });
  });

  import('../server/services/scheduler.js').then(({ startScheduler }) => {
    if (!process.env.VERCEL) {
      startScheduler();
      console.log('[Bootstrap] Background scheduler started.');
    } else {
      console.log('[Bootstrap] Scheduler disabled in Vercel environment.');
    }
  });
}

export const metadata = {
  title: 'FLASHI — Price Comparison',
  description: "Search Pakistan's top stores, view saved product data, and manage scraper runs.",
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
