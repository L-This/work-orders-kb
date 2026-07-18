"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ReactNode,useState} from "react";
const nav=[
["/","لوحة القيادة","⌂"],["/projects","المشاريع","▦"],["/work-orders","أوامر العمل","▤"],
["/sites","المواقع","⌖"],["/items","البنود","≡"],["/search","البحث الشامل","⌕"],
["/import","استيراد Excel","⇧"],["/alerts","مركز التنبيهات","!"],["/admin","إدارة النظام","⚙"]
];
export default function AppShell({children}:{children:ReactNode}){
 const path=usePathname(); const [collapsed,setCollapsed]=useState(false); const [refreshing,setRefreshing]=useState(false);
 function refreshPage(){setRefreshing(true);window.location.reload()}
 return <div className={`system-shell ${collapsed?"shell-collapsed":""}`}>
  <aside className="system-sidebar">
   <div className="sidebar-brand"><div className="brand-mark">م</div><div className="brand-copy"><strong>مرجع أوامر العمل</strong><span>قاعدة المعرفة التشغيلية</span></div></div>
   <nav className="sidebar-nav">{nav.map(([href,label,icon])=>{
    const active=href==="/"?path==="/":path===href||path.startsWith(href+"/");
    return <Link key={href} href={href} className={`side-link ${active?"active":""}`}><span className="side-icon">{icon}</span><span className="side-label">{label}</span></Link>
   })}</nav>
   <div className="sidebar-footer"><span className="system-status-dot"/><div className="brand-copy"><strong>النظام متصل</strong><span>Supabase • قاعدة البيانات</span></div></div>
  </aside>
  <section className="system-main">
   <header className="system-topbar">
    <button className="sidebar-toggle" onClick={()=>setCollapsed(v=>!v)}>☰</button>
    <div className="topbar-spacer" />
    <div className="topbar-actions"><Link href="/alerts" className="topbar-icon">!</Link><button type="button" className="topbar-refresh" onClick={refreshPage} disabled={refreshing}><span className={refreshing?"is-spinning":""}>↻</span>{refreshing?"جاري التحديث...":"تحديث البيانات"}</button></div>
   </header>
   <main className="system-content">{children}</main>
  </section>
 </div>
}
