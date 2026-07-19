'use client';

import { useMemo, useRef, useState } from 'react';
import { normalizeArabic } from '@/lib/helpers';
import { parseWorkOrdersMatrixWorkbook, SmartWorkbook } from '@/lib/excel-import';
import { calculateDurationDays } from '@/lib/work-order-timing';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type SyncedSite={id:string;name:string;area_name:string|null;project_id:string;source_system:string|null};
type ManualOrder={number:string;startDate:string;endDate:string;siteIds:string[];quantities:Record<string,string>};
const keyOf=(itemNo:string,itemName:string)=>`${itemNo}::${normalizeArabic(itemName)}`;
const emptyOrder=(index:number):ManualOrder=>({number:String(index+1).padStart(2,'0'),startDate:'',endDate:'',siteIds:[],quantities:{}});
const itemNumber=(value:string)=>{const latin=String(value||'').replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));const match=latin.match(/\d+(?:\.\d+)?/);return match?Number(match[0]):Number.NaN;};

export default function ImportPage(){
  const fileInput=useRef<HTMLInputElement>(null);
  const [fileName,setFileName]=useState('');
  const [startItemNo,setStartItemNo]=useState('');
  const [data,setData]=useState<SmartWorkbook|null>(null);
  const [sites,setSites]=useState<SyncedSite[]>([]);
  const [orders,setOrders]=useState<ManualOrder[]>([]);
  const [activeOrder,setActiveOrder]=useState(0);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  async function loadSyncedSites(parsed:SmartWorkbook){
    if(!isSupabaseConfigured)return;
    const projectResult=parsed.project.code?await supabase.from('projects').select('id').eq('code',parsed.project.code).maybeSingle():await supabase.from('projects').select('id').eq('name',parsed.project.name).maybeSingle();
    if(projectResult.error)throw projectResult.error;
    if(!projectResult.data?.id){setSites([]);return;}
    const result=await supabase.from('sites').select('id,name,area_name,project_id,source_system').eq('project_id',projectResult.data.id).eq('source_system','irrigation').eq('status','active').order('name');
    if(result.error)throw result.error;
    setSites((result.data||[]) as SyncedSite[]);
  }

  async function parseFile(file:File){
    if(!/\.(xlsx|xls)$/i.test(file.name)){setError('اختر ملف Excel بصيغة XLSX أو XLS.');return;}
    const cutoff=itemNumber(startItemNo);
    if(!Number.isFinite(cutoff)){setError('أدخل رقم بداية البنود أولًا.');return;}
    setError('');setStatus('جاري قراءة بيانات المشروع وجدول الكميات...');setDone(false);
    try{
      const parsed=parseWorkOrdersMatrixWorkbook(await file.arrayBuffer());
      const filteredItems=parsed.boqItems.filter(item=>{const number=itemNumber(item.itemNo);return Number.isFinite(number)&&number>=cutoff;});
      if(!filteredItems.length)throw new Error(`لم يتم العثور على بنود تبدأ من الرقم ${startItemNo} أو بعده.`);
      const scoped:SmartWorkbook={...parsed,boqItems:filteredItems,project:{...parsed.project,contractValue:filteredItems.reduce((sum,item)=>sum+item.totalPrice,0)},warnings:[...parsed.warnings,`تم اعتماد البنود من الرقم ${startItemNo} وما بعده.`]};
      setData(scoped);setFileName(file.name);setOrders([]);setActiveOrder(0);
      await loadSyncedSites(scoped);
      setStatus('تم جلب المشروع والبنود فقط. أدخل أوامر العمل يدويًا ثم راجعها قبل الاعتماد.');
    }catch(e:any){setError(e?.message||'تعذر تحليل الملف.');setStatus('');}
  }

  function setOrderCount(value:number){
    const count=Math.max(0,Math.min(50,Number(value)||0));
    setOrders(current=>Array.from({length:count},(_,index)=>current[index]||emptyOrder(index)));
    setActiveOrder(index=>Math.min(index,Math.max(0,count-1)));
  }
  function updateOrder(index:number,patch:Partial<ManualOrder>){setOrders(current=>current.map((order,i)=>i===index?{...order,...patch}:order));}
  function toggleSite(index:number,siteId:string){const order=orders[index];if(!order)return;const selected=order.siteIds.includes(siteId)?order.siteIds.filter(id=>id!==siteId):[...order.siteIds,siteId];updateOrder(index,{siteIds:selected});}
  function setQuantity(index:number,itemKey:string,value:string){const order=orders[index];if(!order)return;updateOrder(index,{quantities:{...order.quantities,[itemKey]:value}});}

  const validation=useMemo(()=>orders.map(order=>({
    ready:Boolean(order.number.trim()&&order.startDate&&order.endDate&&order.endDate>=order.startDate&&order.siteIds.length&&Object.values(order.quantities).some(value=>Number(value)>0)),
    lines:Object.values(order.quantities).filter(value=>Number(value)>0).length,
  })),[orders]);
  const ready=Boolean(data&&orders.length&&validation.every(item=>item.ready));
  const active=orders[activeOrder];
  const activeValue=useMemo(()=>!data||!active?0:data.boqItems.reduce((sum,item)=>sum+(Number(active.quantities[keyOf(item.itemNo,item.itemName)])||0)*item.unitPrice,0),[data,active]);

  async function ensureProject(parsed:SmartWorkbook){
    const payload={name:parsed.project.name,code:parsed.project.code||null,municipality:parsed.project.municipality||null,contractor_name:parsed.project.contractorName||null,status:'active',description:'تم استيراد بيانات المشروع وجدول الكميات ثم إدخال أوامر العمل يدويًا.'};
    const existing=parsed.project.code?await supabase.from('projects').select('id').eq('code',parsed.project.code).maybeSingle():await supabase.from('projects').select('id').eq('name',parsed.project.name).maybeSingle();
    if(existing.error)throw existing.error;
    if(existing.data?.id){const updated=await supabase.from('projects').update(payload).eq('id',existing.data.id);if(updated.error)throw updated.error;return existing.data.id as string;}
    const inserted=await supabase.from('projects').insert(payload).select('id').single();if(inserted.error)throw inserted.error;return inserted.data.id as string;
  }
  async function ensureContract(projectId:string,parsed:SmartWorkbook){
    const contractNumber=parsed.project.code||'العقد الرئيسي';
    const payload={project_id:projectId,contract_number:contractNumber,contract_name:parsed.project.name,start_date:parsed.project.startDate,end_date:parsed.project.endDate,contractor_name:parsed.project.contractorName||null,total_value:parsed.project.contractValue,notes:`مصدر البيانات: ${fileName}`};
    const existing=await supabase.from('contracts').select('id').eq('project_id',projectId).eq('contract_number',contractNumber).maybeSingle();if(existing.error)throw existing.error;
    if(existing.data?.id){const updated=await supabase.from('contracts').update(payload).eq('id',existing.data.id);if(updated.error)throw updated.error;return existing.data.id as string;}
    const inserted=await supabase.from('contracts').insert(payload).select('id').single();if(inserted.error)throw inserted.error;return inserted.data.id as string;
  }

  async function approve(){
    if(!data||!ready||!isSupabaseConfigured)return;
    setSaving(true);setError('');setStatus('جاري اعتماد المشروع وكتابة البيانات...');
    try{
      const projectId=await ensureProject(data);const contractId=await ensureContract(projectId,data);
      const batch=await supabase.from('import_batches').insert({project_id:projectId,file_name:fileName,import_status:'parsed',notes:`استيراد يدوي: ${orders.length} أوامر، ${data.boqItems.length} بند.`}).select('id').single();if(batch.error)throw batch.error;
      const itemIds=new Map<string,string>();const boqIds=new Map<string,string>();
      for(const item of data.boqItems){
        const key=keyOf(item.itemNo,item.itemName);const found=await supabase.from('items').select('id').eq('normalized_name',normalizeArabic(item.itemName)).maybeSingle();if(found.error)throw found.error;
        let itemId=found.data?.id as string|undefined;if(!itemId){const created=await supabase.from('items').insert({name:item.itemName,normalized_name:normalizeArabic(item.itemName),unit:item.unit||null,is_active:true}).select('id').single();if(created.error)throw created.error;itemId=created.data.id;}
        itemIds.set(key,itemId);
        const existing=await supabase.from('project_boq_items').select('id').eq('project_id',projectId).eq('item_id',itemId).eq('boq_item_no',item.itemNo).maybeSingle();if(existing.error)throw existing.error;
        const payload={project_id:projectId,contract_id:contractId,item_id:itemId,boq_item_no:item.itemNo,unit:item.unit||null,contract_quantity:item.contractQuantity,unit_price:item.unitPrice,total_price:item.totalPrice,notes:`صف Excel رقم ${item.rowNumber}`};
        let boqId=existing.data?.id as string|undefined;if(boqId){const updated=await supabase.from('project_boq_items').update(payload).eq('id',boqId);if(updated.error)throw updated.error;}else{const created=await supabase.from('project_boq_items').insert(payload).select('id').single();if(created.error)throw created.error;boqId=created.data.id;}boqIds.set(key,boqId);
      }
      let lineCount=0;const cumulativeExecuted=new Map<string,number>();
      for(const order of orders){
        const orderPayload={project_id:projectId,contract_id:contractId,work_order_number:order.number,work_order_date:order.startDate,work_order_end_date:order.endDate,duration_days:calculateDurationDays(order.startDate,order.endDate),title:`أمر عمل رقم ${order.number}`,status:'approved',contractor_name:data.project.contractorName||null,notes:'تم إدخال بيانات أمر العمل يدويًا أثناء الاستيراد.',source_file_name:fileName};
        const found=await supabase.from('work_orders').select('id').eq('project_id',projectId).eq('work_order_number',order.number).maybeSingle();if(found.error)throw found.error;
        let workOrderId=found.data?.id as string|undefined;if(workOrderId){const updated=await supabase.from('work_orders').update(orderPayload).eq('id',workOrderId);if(updated.error)throw updated.error;}else{const created=await supabase.from('work_orders').insert(orderPayload).select('id').single();if(created.error)throw created.error;workOrderId=created.data.id;}
        const clearSites=await supabase.from('work_order_sites').delete().eq('work_order_id',workOrderId);if(clearSites.error)throw clearSites.error;
        if(order.siteIds.length){const linked=await supabase.from('work_order_sites').insert(order.siteIds.map(siteId=>({work_order_id:workOrderId,site_id:siteId})));if(linked.error)throw linked.error;}
        for(const item of data.boqItems){const key=keyOf(item.itemNo,item.itemName);const quantity=Number(order.quantities[key])||0;if(quantity<=0)continue;const itemId=itemIds.get(key);if(!itemId)continue;const totalExecuted=(cumulativeExecuted.get(key)||0)+quantity;cumulativeExecuted.set(key,totalExecuted);const payload={work_order_id:workOrderId,site_id:null,item_id:itemId,boq_item_id:boqIds.get(key)||null,item_no:item.itemNo,unit:item.unit||null,quantity,executed_quantity:quantity,remaining_quantity:Math.max(0,item.contractQuantity-totalExecuted),unit_price:item.unitPrice,total_price:quantity*item.unitPrice,notes:`المواقع المختارة: ${order.siteIds.length}`,source_sheet:data.sheetName,source_row_number:item.rowNumber};
          const foundLine=await supabase.from('work_order_items').select('id').eq('work_order_id',workOrderId).eq('item_id',itemId).maybeSingle();if(foundLine.error)throw foundLine.error;if(foundLine.data?.id){const updated=await supabase.from('work_order_items').update(payload).eq('id',foundLine.data.id);if(updated.error)throw updated.error;}else{const created=await supabase.from('work_order_items').insert(payload);if(created.error)throw created.error;}lineCount+=1;}
      }
      const complete=await supabase.from('import_batches').update({import_status:'imported',imported_rows_count:lineCount,error_rows_count:0}).eq('id',batch.data.id);if(complete.error)throw complete.error;
      setDone(true);setStatus('تم اعتماد المشروع وأوامر العمل بنجاح.');
    }catch(e:any){setError(e?.message||'تعذر اعتماد الاستيراد.');setStatus('');}finally{setSaving(false);}
  }

  return <main className="page import-page manual-import-page">
    <section className="import-hero-pro"><div><span className="section-kicker">استيراد مضبوط</span><h1>المشروع والبنود من Excel</h1><p>يقرأ النظام بيانات المشروع وجدول الكميات فقط، ثم تستكمل أوامر العمل والمواقع يدويًا قبل الاعتماد.</p></div><div className="import-hero-shield"><span>✓</span><strong>لا حفظ قبل المراجعة</strong><small>أنت تتحكم في كل أمر عمل</small></div></section>
    <div className="manual-import-steps"><span className={data?'done':'active'}>1 رفع الملف</span><span className={data&&!orders.length?'active':orders.length?'done':''}>2 مراجعة المشروع والبنود</span><span className={orders.length&&!ready?'active':ready?'done':''}>3 إدخال أوامر العمل</span><span className={done?'done':ready?'active':''}>4 الاعتماد</span></div>
    <section className="import-item-cutoff"><div><span className="section-kicker">نطاق جدول الكميات</span><h2>اعتماد البنود من رقم</h2><p>سيقرأ النظام البند الذي يحمل هذا الرقم وجميع البنود التي تليه.</p></div><label><span>رقم بداية البنود</span><input inputMode="decimal" value={startItemNo} placeholder="مثال: 10" onChange={e=>{setStartItemNo(e.target.value);setData(null);setFileName('');setOrders([]);setDone(false)}}/></label></section>
    <section className={`import-drop-pro manual-file-drop ${!startItemNo.trim()?'is-disabled':''}`} onClick={()=>{if(startItemNo.trim())fileInput.current?.click();else setError('أدخل رقم بداية البنود أولًا.')}}><input ref={fileInput} type="file" accept=".xlsx,.xls" onChange={e=>{const file=e.target.files?.[0];if(file)void parseFile(file)}}/><span>XL</span><strong>{fileName||'اختر ملف المشروع'}</strong><small>{startItemNo.trim()?`سيتم جلب البنود من الرقم ${startItemNo} وما بعده`:'أدخل رقم بداية البنود لتفعيل رفع الملف'}</small></section>
    {status?<div className="notice">{status}</div>:null}{error?<div className="notice error-notice">{error}</div>:null}
    {data?<>
      <section className="manual-import-summary"><div><small>المشروع</small><h2>{data.project.name}</h2><p>{data.project.code||'بدون رقم'} · {data.project.contractorName||'المقاول غير مذكور'}</p></div><div><strong>{data.boqItems.length}</strong><span>بند من رقم {startItemNo}</span></div><div><strong>{data.project.contractValue.toLocaleString('en-US')}</strong><span>قيمة البنود المعتمدة</span></div></section>
      <section className="manual-orders-setup"><header><div><span className="section-kicker">الإدخال اليدوي</span><h2>كم عدد أوامر العمل؟</h2><p>بعد تحديد العدد سيظهر نموذج مستقل لكل أمر.</p></div><input type="number" min="0" max="50" value={orders.length||''} placeholder="0" onChange={e=>setOrderCount(Number(e.target.value))}/></header></section>
      {orders.length?<section className="manual-orders-workspace"><nav>{orders.map((order,index)=><button key={index} className={activeOrder===index?'active':''} onClick={()=>setActiveOrder(index)}><b>أمر {order.number}</b><small>{validation[index]?.ready?'مكتمل ✓':'يحتاج إدخال'}</small></button>)}</nav>{active?<div className="manual-order-editor"><div className="manual-order-fields"><label>رقم الأمر<input value={active.number} onChange={e=>updateOrder(activeOrder,{number:e.target.value})}/></label><label>تاريخ البداية<input type="date" value={active.startDate} onChange={e=>updateOrder(activeOrder,{startDate:e.target.value})}/></label><label>تاريخ النهاية<input type="date" value={active.endDate} onChange={e=>updateOrder(activeOrder,{endDate:e.target.value})}/></label><div className="manual-order-value"><small>قيمة التنفيذ المحسوبة</small><b>{activeValue.toLocaleString('en-US',{maximumFractionDigits:2})}</b></div></div>
        <div className="manual-sites-picker"><header><div><h3>المواقع المشمولة</h3><p>المواقع المتزامنة من نظام الري</p></div><b>{active.siteIds.length} مختارة</b></header>{sites.length?<div>{sites.map(site=><label className={active.siteIds.includes(site.id)?'selected':''} key={site.id}><input type="checkbox" checked={active.siteIds.includes(site.id)} onChange={()=>toggleSite(activeOrder,site.id)}/><span>✓</span><b>{site.name}</b><small>{site.area_name||'موقع متزامن'}</small></label>)}</div>:<div className="empty">لا توجد مواقع متزامنة نشطة. اربط المشروع في إدارة النظام أولًا.</div>}</div>
        <div className="manual-boq-entry"><header><div><h3>الكميات المنفذة</h3><p>أدخل الكمية فقط، وتُحسب القيمة تلقائيًا من سعر الوحدة.</p></div><b>{validation[activeOrder]?.lines||0} بنود منفذة</b></header><div className="manual-boq-list">{data.boqItems.map(item=>{const key=keyOf(item.itemNo,item.itemName);const qty=active.quantities[key]||'';return <div key={key}><span>{item.itemNo}</span><div><b>{item.itemName}</b><small>{item.unit||'بدون وحدة'} · سعر الوحدة {item.unitPrice.toLocaleString('en-US')}</small></div><label>الكمية المنفذة<input type="number" min="0" step="any" value={qty} onChange={e=>setQuantity(activeOrder,key,e.target.value)}/></label><strong>{((Number(qty)||0)*item.unitPrice).toLocaleString('en-US',{maximumFractionDigits:2})}</strong></div>})}</div></div>
      </div>:null}</section>:null}
      {orders.length?<section className="manual-import-approval"><div><span className="section-kicker">الاعتماد النهائي</span><h2>{ready?'البيانات جاهزة للاعتماد':'أكمل بيانات أوامر العمل'}</h2><p>{ready?`${orders.length} أوامر مكتملة، وسيتم إنشاء المشروع والبنود والعلاقات بعد التأكيد.`:'كل أمر يحتاج تاريخ بداية ونهاية، موقعًا واحدًا على الأقل، وكمية منفذة لبند واحد على الأقل.'}</p></div><button className="btn primary" disabled={!ready||saving||done} onClick={()=>void approve()}>{saving?'جاري الاعتماد...':done?'تم الاعتماد':'اعتماد استيراد المشروع'}</button></section>:null}
    </>:null}
  </main>;
}
