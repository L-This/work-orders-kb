import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'مرجع أوامر العمل',
  description: 'نظام إدارة معرفة المشاريع وأوامر العمل والكميات',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <header className="topbar">
          <div>
            <h1>مرجع أوامر العمل</h1>
            <p>بحث عام، بحث داخل المشروع، وبحث داخل الموقع</p>
          </div>
          <nav>
            <Link href="/">الرئيسية</Link>
            <Link href="/import">استيراد Excel</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
