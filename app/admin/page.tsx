'use client';

import { useEffect, useMemo, useState } from 'react';

type BasicProject = { id: string; name: string; contractor_name?: string | null };
type LinkRow = { work_orders_project_id: string; irrigation_project_id: string; irrigation_project_name: string | null; last_synced_at: string | null };

export default function Page() {
  const [workProjects, setWorkProjects] = useState<BasicProject[]>([]);
  const [irrigationProjects, setIrrigationProjects] = useState<BasicProject[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selections, setSelections] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const response = await fetch('/api/irrigation/projects', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || 'تعذر تحميل بيانات الربط.');
    else {
      setWorkProjects(data.workProjects || []);
      setIrrigationProjects(data.irrigationProjects || []);
      setLinks(data.links || []);
      const next: Record<string,string> = {};
      for (const link of data.links || []) next[link.work_orders_project_id] = link.irrigation_project_id;
      setSelections(next);
    }
    setLoading(false);
  }

  const linkMap = useMemo(() => new Map(links.map((link) => [link.work_orders_project_id, link])), [links]);

  async function saveAndSync(workProjectId: string) {
    const irrigationProjectId = selections[workProjectId];
    if (!irrigationProjectId) { setMessage('اختر مشروع الري المقابل أولًا.'); return; }
    setBusyId(workProjectId); setMessage('');
    const linkResponse = await fetch('/api/irrigation/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workProjectId, irrigationProjectId }),
    });
    const linkData = await linkResponse.json();
    if (!linkResponse.ok) { setMessage(linkData.error || 'تعذر حفظ الربط.'); setBusyId(''); return; }

    const syncResponse = await fetch('/api/irrigation/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workProjectId }),
    });
    const syncData = await syncResponse.json();
    if (!syncResponse.ok) setMessage(syncData.error || 'تم حفظ الربط لكن تعذرت المزامنة.');
    else setMessage(`تم الربط ومزامنة ${syncData.synced} موقع بنجاح.`);
    await load();
    setBusyId('');
  }

  return <div className="module-page irrigation-link-page">
    <div className="module-heading">
      <span className="eyebrow">إدارة النظام</span>
      <h1>ربط مواقع مشروع الري</h1>
      <p>طابق كل مشروع في مرجع أوامر العمل مع مشروعه المقابل في نظام الري، ثم نفّذ المزامنة.</p>
    </div>

    {message ? <div className="integration-message">{message}</div> : null}

    <section className="integration-panel">
      <div className="integration-panel-head">
        <div><small>المصدر</small><strong>garden-irrigation-system / gardens</strong></div>
        <div><small>الوجهة</small><strong>work-orders-db / sites</strong></div>
      </div>
      {loading ? <div className="module-empty">جاري تحميل المشاريع...</div> : (
        <div className="integration-project-list">
          {workProjects.map((project) => {
            const linked = linkMap.get(project.id);
            return <article className="integration-project-row" key={project.id}>
              <div className="integration-work-project">
                <small>مشروع أوامر العمل</small>
                <strong>{project.name}</strong>
                <span>{project.contractor_name || 'المقاول غير مسجل'}</span>
              </div>
              <div className="integration-arrow">←</div>
              <label>
                <small>المشروع المقابل في نظام الري</small>
                <select value={selections[project.id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [project.id]: event.target.value }))}>
                  <option value="">اختر مشروع الري...</option>
                  {irrigationProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="integration-action">
                <span className={linked ? 'linked-state yes' : 'linked-state'}>{linked ? 'مربوط' : 'غير مربوط'}</span>
                {linked?.last_synced_at ? <small>آخر مزامنة: {new Date(linked.last_synced_at).toLocaleString('ar-SA')}</small> : null}
                <button type="button" onClick={() => void saveAndSync(project.id)} disabled={busyId === project.id}>
                  {busyId === project.id ? 'جاري المزامنة...' : linked ? 'حفظ ومزامنة' : 'ربط ومزامنة'}
                </button>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  </div>;
}
