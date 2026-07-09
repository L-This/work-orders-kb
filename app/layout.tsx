import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'مرجع أوامر العمل',
  description: 'قاعدة معرفة لأوامر العمل والمواقع والكميات',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">WO</span>
            <div>
              <strong>مرجع أوامر العمل</strong>
              <small>Project Knowledge Base</small>
            </div>
          </Link>
          <nav className="nav">
            <Link href="/">الرئيسية</Link>
            <Link href="/import">استيراد Excel</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
