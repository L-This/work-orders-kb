import type { Metadata } from "next";
import "./globals.css";
import "./identity.css";
import AppShell from "./components/AppShell";
export const metadata: Metadata = { title: "مرجع أوامر العمل", description: "قاعدة المعرفة التشغيلية للمشاريع" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body><AppShell>{children}</AppShell></body></html>;
}
