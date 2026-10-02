
(() => {
  const state={products:[],categories:[],wish:new Set(JSON.parse(localStorage.getItem("nesma-wishlist")||"[]"))};
  const esc=window.Nesma.escapeHtml;
  function saveWish(){localStorage.setItem("nesma-wishlist",JSON.stringify([...state.wish]));}
  function card(p){
    const images=window.Nesma.productImages(p),d=p.old_price_yer&&Number(p.old_price_yer)>Number(p.price_yer)?Math.round((Number(p.old_price_yer)-Number(p.price_yer))/Number(p.old_price_yer)*100):0;
    return `<article class="shop-card"><div class="shop-img"><img src="${esc(images[0]||"")}" alt="${esc(p.title)}" loading="lazy"><div class="shop-badges">${(p.badges||[]).map((b,i)=>`<span class="shop-badge ${i?"limit":""}">${esc(b)}</span>`).join("")}</div><button class="shop-heart ${state.wish.has(String(p.id))?"active":""}" data-wish="${p.id}" type="button">${state.wish.has(String(p.id))?"♥":"♡"}</button></div><div class="shop-body"><div class="shop-cat">${esc((p.category_slugs||[p.category])[0]||"عبايات")}</div><div class="shop-title">${esc(p.title)}</div><div class="shop-price"><strong data-price-yer="${Number(p.price_yer||0)}">${window.Nesma.formatPrice(p.price_yer)}</strong>${p.old_price_yer?`<span class="shop-old" data-price-yer="${Number(p.old_price_yer)}">${window.Nesma.formatPrice(p.old_price_yer)}</span>`:""}${d?`<span class="shop-discount">خصم ${d}%</span>`:""}</div><div class="shop-actions"><button class="shop-add" data-open="${p.id}">اختيار التفاصيل</button></div></div></article>`;
  }
  function bind(root){
    root.querySelectorAll("[data-wish]").forEach(b=>b.onclick=()=>{const id=String(b.dataset.wish);state.wish.has(id)?state.wish.delete(id):state.wish.add(id);saveWish();b.classList.toggle("active");b.textContent=state.wish.has(id)?"♥":"♡";});
    root.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>location.href=`product.html?id=${encodeURIComponent(b.dataset.open)}`);
  }
  function renderGrid(id,items){const el=document.getElementById(id);if(!el)return;el.innerHTML=items.length?items.map(card).join(""):'<div class="empty">لا توجد عبايات في هذا القسم حالياً.</div>';bind(el);refreshPrices();}
  function refreshPrices(){const c=window.Nesma.getCurrency();document.querySelectorAll("[data-price-yer]").forEach(e=>e.textContent=window.Nesma.formatPrice(e.dataset.priceYer,c));const sel=document.getElementById("shopCurrency");if(sel)sel.value=c;}
  async function load(){
    const [p,c]=await Promise.all([fetch(`${window.Nesma.API_BASE}/api/products`).then(r=>r.json()),fetch(`${window.Nesma.API_BASE}/api/categories`).then(r=>r.json())]);
    state.products=p.products||[];state.categories=c.categories||[];
    document.dispatchEvent(new CustomEvent("nesma:data-ready",{detail:state}));
    refreshPrices();
  }
  window.NesmaShop={state,load,renderGrid,renderWishlist:()=>renderGrid("wishlistGrid",state.products.filter(p=>state.wish.has(String(p.id))) )};
  document.addEventListener("DOMContentLoaded",async()=>{try{await load();window.NesmaShop.renderWishlist();}catch(e){console.error(e);}});
  document.addEventListener("change",e=>{if(e.target.id==="shopCurrency"){window.Nesma.setCurrency(e.target.value);refreshPrices();}});
  window.addEventListener("storage",refreshPrices);
})();
