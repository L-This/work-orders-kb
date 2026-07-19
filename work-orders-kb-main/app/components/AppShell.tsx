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
 const current=nav.find(([href])=>href==="/"?path==="/":path===href||path.startsWith(href+"/"));
 const detailTitle=path.startsWith("/work-order/")?"تفاصيل أمر العمل":path.startsWith("/site/")?"تفاصيل الموقع":path.startsWith("/project/")?"تفاصيل المشروع":null;
 function refreshPage(){setRefreshing(true);window.location.reload()}
 return <div className={`system-shell ${collapsed?"shell-collapsed":""}`}>
  <aside className="system-sidebar">
   <div className="sidebar-brand"><div className="brand-mark"><b>جدة</b><i/></div><div className="brand-copy"><strong>مرجع أوامر العمل</strong><span>أمانة محافظة جدة</span></div></div>
   <div className="sidebar-section-title">التنقل الرئيسي</div>
   <nav className="sidebar-nav">{nav.map(([href,label,icon])=>{
    const active=href==="/"?path==="/":path===href||path.startsWith(href+"/");
    return <Link key={href} href={href} className={`side-link ${active?"active":""}`}><span className="side-icon">{icon}</span><span className="side-label">{label}</span></Link>
   })}</nav>
   <div className="sidebar-footer"><span className="system-status-dot"/><div className="brand-copy"><strong>النظام متصل</strong><span>Supabase • قاعدة البيانات</span></div></div>
  </aside>
  <section className="system-main">
   <header className="system-topbar">
    <button className="sidebar-toggle" onClick={()=>setCollapsed(v=>!v)}>☰</button>
    <div className="topbar-page-title"><small>مرجع أوامر العمل</small><strong>{detailTitle||current?.[1]||"لوحة القيادة"}</strong></div>
    <div className="topbar-actions"><Link href="/alerts" className="topbar-icon">!</Link><button type="button" className="topbar-refresh" onClick={refreshPage} disabled={refreshing}><span className={refreshing?"is-spinning":""}>↻</span>{refreshing?"جاري التحديث...":"تحديث البيانات"}</button></div>
   </header>
   <main className="system-content">{children}</main>
  </section>
 </div>
}
