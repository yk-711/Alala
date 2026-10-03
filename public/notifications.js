(() => {
  const API='https://nesma-store.onrender.com';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  function show(list){
    if(!list?.length)return;
    const n=list[0],box=document.createElement('div');
    box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:9999;max-width:360px;background:#0b0b0b;color:#fff;border:1px solid #8b6b2e;border-radius:18px;padding:18px 42px 18px 18px;box-shadow:0 12px 40px rgba(0,0,0,.45);font-family:Tajawal,Arial,sans-serif';
    box.innerHTML=`<button aria-label="إغلاق" style="position:absolute;right:10px;top:8px;background:none;border:0;color:#d5b56e;font-size:22px;cursor:pointer">×</button><strong style="color:#d5b56e;display:block;margin-bottom:6px">${esc(n.title)}</strong><div style="line-height:1.8;color:#ddd">${esc(n.message)}</div>`;
    box.querySelector('button').onclick=()=>box.remove();document.body.appendChild(box);
  }
  document.addEventListener('DOMContentLoaded',async()=>{try{const r=await fetch(`${API}/api/notifications`);const d=await r.json();show(d.notifications||[]);}catch{}});
})();
