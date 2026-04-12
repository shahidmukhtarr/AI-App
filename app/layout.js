import './globals.css';
import '../server/bootstrap.js';

export const metadata = {
  title: 'FLASHI — Price Comparison',
  description: "Search Pakistan's top stores, view saved product data, and manage scraper runs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
