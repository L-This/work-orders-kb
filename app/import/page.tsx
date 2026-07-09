'use client';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { normalizeArabic, toNumber, excelDateToISO } from '@/lib/helpers';

type Row = Record<string, any>;

type Mapping = {
  projectName:string; siteName:string; workOrderNumber:string; workOrderDate:string; itemName:string; unit:string; quantity:string; executedQuantity:string; remainingQuantity:string; itemNo:string;
};
const emptyMap: Mapping = {projectName:'',siteName:'',workOrderNumber:'',workOrderDate:'',itemName:'',unit:'',quantity:'',executedQuantity:'',remainingQuantity:'',itemNo:''};
const labels:any = {projectName:'اسم المشروع',siteName:'اسم الموقع',workOrderNumber:'رقم أمر العمل',workOrderDate:'تاريخ أمر العمل',itemName:'اسم البند',unit:'الوحدة',quantity:'كمية أمر العمل',executedQuantity:'المنفذ',remainingQuantity:'المتبقي',itemNo:'رقم البند'};

function guess(headers:string[], words:string[]){
  return headers.find(h => words.some(w => normalizeArabic(h).includes(normalizeArabic(w)))) || '';
}

export default function ImportPage(){
  const [fileName,setFileName]=useState('');
  const [sheets,setSheets]=useState<Record<string, Row[]>>({});
  const [sheet,setSheet]=useState('');
  const [mapping,setMapping]=useState<Mapping>(emptyMap);
  const [status,setStatus]=useState('');
  const rows=sheets[sheet]||[];
  const headers=useMemo(()=> rows[0] ? Object.keys(rows[0]) : [],[rows]);
  const parsed=useMemo(()=> rows.map((r,idx)=>({
    rowNumber: idx+2,
    projectName: mapping.projectName ? r[mapping.projectName] : '',
    siteName: mapping.siteName ? r[mapping.siteName] : '',
    workOrderNumber: mapping.workOrderNumber ? r[mapping.workOrderNumber] : '',
    workOrderDate: mapping.workOrderDate ? excelDateToISO(r[mapping.workOrderDate]) : null,
    itemName: mapping.itemName ? r[mapping.itemName] : '',
    unit: mapping.unit ? r[mapping.unit] : '',
    quantity: mapping.quantity ? toNumber(r[mapping.quantity]) : 0,
    executedQuantity: mapping.executedQuantity ? toNumber(r[mapping.executedQuantity]) : 0,
    remainingQuantity: mapping.remainingQuantity ? toNumber(r[mapping.remainingQuantity]) : 0,
    itemNo: mapping.itemNo ? r[mapping.itemNo] : '',
    raw: r
  })).filter(r=>r.itemName || r.siteName || r.workOrderNumber),[rows,mapping]);

  async function onFile(e:React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0]; if(!f) return;
    setFileName(f.name); setStatus('جاري قراءة الملف...');
    const data=await f.arrayBuffer();
    const wb=XLSX.read(data,{type:'array', cellDates:true});
    const all:Record<string,Row[]>={};
    wb.SheetNames.forEach(name=>{
      const ws=wb.Sheets[name];
      const json=XLSX.utils.sheet_to_json<Row>(ws,{defval:'', raw:false});
      if(json.length) all[name]=json;
    });
    setSheets(all); const first=Object.keys(all)[0]||''; setSheet(first);
    const hs=first ? Object.keys(all[first]?.[0]||{}) : [];
    setMapping({
      projectName: guess(hs,['المشروع','اسم المشروع']) || '',
      siteName: guess(hs,['الموقع','الحديقة','الشارع','مكان التنفيذ']) || '',
      workOrderNumber: guess(hs,['امر العمل','أمر العمل','رقم الامر','رقم الأمر']) || '',
      workOrderDate: guess(hs,['التاريخ','تاريخ الامر','تاريخ أمر']) || '',
      itemName: guess(hs,['البند','الوصف','بيان الاعمال','بيان الأعمال']) || '',
      unit: guess(hs,['الوحده','الوحدة','وحدة']) || '',
      quantity: guess(hs,['الكميه','الكمية','كمية الامر','كمية أمر']) || '',
      executedQuantity: guess(hs,['المنفذ','المنفذة','اجمالي المنفذ']) || '',
      remainingQuantity: guess(hs,['المتبقي','المتبقية','الباقي']) || '',
      itemNo: guess(hs,['رقم البند','م','البند رقم']) || ''
    });
    setStatus('تمت قراءة الملف. راجع ربط الأعمدة ثم اضغط استيراد.');
  }

  async function ensureProject(name:string){
    const projectName = String(name||'مشروع صيانة وري الحدائق والمزروعات شرق محافظة جدة - بريمان وطيبة').trim();
    let {data}=await supabase.from('projects').select('id').eq('name',projectName).maybeSingle();
    if(data?.id) return data.id;
    const res=await supabase.from('projects').insert({name:projectName,status:'active'}).select('id').single();
    if(res.error) throw res.error; return res.data.id;
  }
  async function ensureSite(project_id:string,name:string){
    const siteName=String(name||'موقع غير محدد').trim();
    let {data}=await supabase.from('sites').select('id').eq('project_id',project_id).eq('name',siteName).maybeSingle();
    if(data?.id) return data.id;
    const res=await supabase.from('sites').insert({project_id,name:siteName,normalized_name:normalizeArabic(siteName)}).select('id').single();
    if(res.error) throw res.error; return res.data.id;
  }
  async function ensureItem(name:string,unit:string){
    const itemName=String(name||'بند غير محدد').trim();
    let {data}=await supabase.from('items').select('id').eq('name',itemName).maybeSingle();
    if(data?.id) return data.id;
    const res=await supabase.from('items').insert({name:itemName,normalized_name:normalizeArabic(itemName),unit:unit||null}).select('id').single();
    if(res.error) throw res.error; return res.data.id;
  }
  async function ensureWorkOrder(project_id:string, num:string, date:any){
    const work_order_number=String(num||'بدون رقم').trim();
    let {data}=await supabase.from('work_orders').select('id').eq('project_id',project_id).eq('work_order_number',work_order_number).maybeSingle();
    if(data?.id) return data.id;
    const res=await supabase.from('work_orders').insert({project_id,work_order_number,work_order_date:date,source_file_name:fileName}).select('id').single();
    if(res.error) throw res.error; return res.data.id;
  }

  async function importData(){
    if(!isSupabaseConfigured){ setStatus('لم يتم ربط Supabase. أضف .env.local أولاً.'); return; }
    if(!parsed.length){ setStatus('لا توجد بيانات قابلة للاستيراد.'); return; }
    setStatus('جاري الاستيراد...');
    const batch=await supabase.from('import_batches').insert({file_name:fileName,import_status:'uploaded'}).select('id').single();
    if(batch.error){ setStatus(batch.error.message); return; }
    let ok=0, err=0;
    for(const r of parsed){
      try{
        const project_id=await ensureProject(r.projectName);
        const site_id=await ensureSite(project_id,r.siteName);
        const item_id=await ensureItem(r.itemName,r.unit);
        const work_order_id=await ensureWorkOrder(project_id,r.workOrderNumber,r.workOrderDate);
        await supabase.from('work_order_sites').upsert({work_order_id,site_id},{onConflict:'work_order_id,site_id'});
        const ins=await supabase.from('work_order_items').insert({work_order_id,site_id,item_id,item_no:String(r.itemNo||''),unit:r.unit||null,quantity:r.quantity,executed_quantity:r.executedQuantity,remaining_quantity:r.remainingQuantity,source_sheet:sheet,source_row_number:r.rowNumber});
        if(ins.error) throw ins.error;
        await supabase.from('raw_excel_rows').insert({import_batch_id:batch.data.id,sheet_name:sheet,row_number:r.rowNumber,raw_data:r.raw,parsed_project_name:r.projectName,parsed_site_name:r.siteName,parsed_work_order_number:r.workOrderNumber,parsed_work_order_date:r.workOrderDate,parsed_item_name:r.itemName,parsed_unit:r.unit,parsed_quantity:r.quantity,parsed_executed_quantity:r.executedQuantity,parsed_remaining_quantity:r.remainingQuantity,parse_status:'imported'});
        ok++;
      }catch(e:any){ err++; console.error(e); }
    }
    await supabase.from('import_batches').update({import_status: err?'imported_with_errors':'imported',imported_rows_count:ok,error_rows_count:err}).eq('id',batch.data.id);
    setStatus(`تم الاستيراد: ${ok} صف. أخطاء: ${err}.`);
  }

  return <main className="page">
    <Link href="/" className="btn">رجوع</Link>
    <div className="section-title"><h3>استيراد مشروع من Excel</h3></div>
    <div className="steps"><span className="step active">1 رفع الملف</span><span className="step active">2 ربط الأعمدة</span><span className="step active">3 معاينة</span><span className="step">4 استيراد</span></div>
    <section className="drop"><input type="file" accept=".xlsx,.xls" onChange={onFile}/><p className="muted">اختر ملف أوامر العمل. تتم القراءة داخل المتصفح.</p></section>
    {status && <p className="notice">{status}</p>}
    {headers.length>0 && <section className="panel" style={{marginTop:18}}>
      <div className="toolbar"><label>اختر الشيت</label><select value={sheet} onChange={e=>setSheet(e.target.value)}>{Object.keys(sheets).map(s=><option key={s}>{s}</option>)}</select></div>
      <h3>ربط الأعمدة</h3><div className="mapping">{Object.keys(labels).map(k=><label key={k}>{labels[k]}<select value={(mapping as any)[k]} onChange={e=>setMapping(m=>({...m,[k]:e.target.value}))}><option value="">غير مربوط</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
    </section>}
    {parsed.length>0 && <section className="panel" style={{marginTop:18}}><div className="section-title"><h3>معاينة أول 50 صف</h3><button className="btn primary" onClick={importData}>استيراد إلى Supabase</button></div><div className="table-wrap"><table><thead><tr><th>المشروع</th><th>الموقع</th><th>رقم الأمر</th><th>التاريخ</th><th>البند</th><th>الوحدة</th><th>الكمية</th><th>المنفذ</th><th>المتبقي</th></tr></thead><tbody>{parsed.slice(0,50).map((r,i)=><tr key={i}><td>{r.projectName}</td><td>{r.siteName}</td><td>{r.workOrderNumber}</td><td>{r.workOrderDate||'—'}</td><td><b>{r.itemName}</b></td><td>{r.unit}</td><td>{r.quantity}</td><td>{r.executedQuantity}</td><td>{r.remainingQuantity}</td></tr>)}</tbody></table></div></section>}
  </main>
}
