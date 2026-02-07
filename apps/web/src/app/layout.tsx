import './globals.css';

export const metadata = {
  title: 'Cadence App',
  description: 'Email cadence management with Temporal.io',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
