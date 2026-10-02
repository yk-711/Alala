
(() => {
  const API = window.Nesma?.API_BASE || "https://nesma-store.onrender.com";
  function ensureStyle(){
    if(document.getElementById("nesma-notification-style"))return;
    const s=document.createElement("style");s.id="nesma-notification-style";s.textContent=`.nesma-notification-overlay{position:fixed;inset:0;z-index:99999;background:rgba(8,7,5,.66);backdrop-filter:blur(8px);display:grid;place-items:center;padding:22px}.nesma-notification{position:relative;width:min(430px,100%);overflow:hidden;border:1px solid rgba(217,180,92,.42);border-radius:30px;background:linear-gradient(150deg,#15120d,#080807);color:#fff;box-shadow:0 30px 100px rgba(0,0,0,.5);text-align:center;padding:28px}.nesma-notification img{width:100%;height:190px;object-fit:cover;border-radius:20px;margin:-4px 0 20px}.nesma-notification span{color:#d9b45c;font-size:.75rem;letter-spacing:.2em}.nesma-notification h3{margin:8px 0;font-size:1.45rem}.nesma-notification p{color:#d6d0c6;line-height:1.9;margin:0 0 20px}.nesma-notification a{display:inline-block;padding:11px 24px;border-radius:999px;background:#d9b45c;color:#090806;text-decoration:none;font-weight:800}.nesma-notification-close{position:absolute;top:12px;left:12px;width:36px;height:36px;border:1px solid rgba(255,255,255,.15);border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:22px;z-index:2}`;
    document.head.appendChild(s);
  }
  async function loadNotifications() {
    try { ensureStyle();
      const r = await fetch(`${API}/api/notifications`);
      if (!r.ok) return;
      const {notifications=[]}=await r.json();
      if (!notifications.length || sessionStorage.getItem("nesma-notification-shown")) return;
      const n=notifications[0];
      const overlay=document.createElement("div");
      overlay.className="nesma-notification-overlay";
      overlay.innerHTML=`<div class="nesma-notification" role="dialog" aria-modal="true">
        <button class="nesma-notification-close" aria-label="إغلاق">×</button>
        ${n.image_url?`<img src="${window.Nesma.imageUrl(n.image_url)}" alt="">`:""}
        <span>نسمة</span><h3>${window.Nesma.escapeHtml(n.title)}</h3>
        <p>${window.Nesma.escapeHtml(n.message)}</p>
        ${n.link?`<a href="${window.Nesma.escapeHtml(n.link)}">اكتشفي الآن</a>`:""}
      </div>`;
      document.body.appendChild(overlay);
      const close=()=>{overlay.remove();sessionStorage.setItem("nesma-notification-shown","1");};
      overlay.querySelector(".nesma-notification-close").onclick=close;
      overlay.onclick=e=>{if(e.target===overlay)close();};
    } catch (_) {}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadNotifications);else loadNotifications();
})();
