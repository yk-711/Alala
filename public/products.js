
(() => {
  const API=window.Nesma?.API_BASE||"https://nesma-store.onrender.com";
  const esc=window.Nesma.escapeHtml, img=window.Nesma.imageUrl;
  let products=[], categories=[];
  function card(p,i=0){
    const images=window.Nesma.productImages(p);
    const badge=(p.badges||[])[0];
    return `<div class="col-sm-6 col-lg-4 mwrap" data-aos="fade-up" data-aos-delay="${(i%3)*80}">
      <div class="mcard" data-id="${p.id}" data-cat="${esc((p.category_slugs||[p.category])[0]||"عبايات")}" data-audience="women" data-desc="${esc(p.description||"")}" data-img="${esc(images[0]||"")}" data-price="${Number(p.price_yer||0)}" data-rating="${Number(p.rating||5)}" data-reviews="${Number(p.reviews||0)}" data-tags="${esc(p.tags||"")}" data-title="${esc(p.title)}">
        <div class="mimg"><img alt="${esc(p.title)}" src="${esc(images[0]||"")}" loading="lazy">
          ${badge?`<div class="mbdg new"><i class="fas fa-star"></i> ${esc(badge)}</div>`:""}
          <button class="mhrt" type="button" data-wish="${p.id}" aria-label="إضافة للمفضلة"><i class="${localStorage.getItem(`fav-${p.id}`)==="1"?"fas":"far"} fa-heart"></i></button>
        </div>
        <div class="mbody"><div class="mcat">${esc((p.category_slugs||[p.category])[0]||"عبايات")}</div>
          <div class="mtit">${esc(p.title)}</div><div class="mdesc">${esc(p.description||"")}</div>
          <div class="mfoot"><div><div class="mprice" data-price-yer="${Number(p.price_yer||0)}"></div><div class="mstars"><i class="fas fa-star"></i> <span style="color:#bbb;font-size:.7rem;">(${Number(p.reviews||0)})</span></div></div>
          <button class="madd" type="button" title="تفاصيل المنتج"><i class="fas fa-plus"></i></button></div>
        </div>
      </div>
    </div>`;
  }
  function renderCategories(){
    const home=document.getElementById("homeCategories"),filters=document.getElementById("homeCategoryFilters");
    if(home) home.innerHTML=categories.map((c,i)=>`<div class="col-6 col-sm-4 col-md-3 col-lg-2" data-aos="zoom-in" data-aos-delay="${i*60}">
      <a class="catcard ${i===0?"active":""}" href="products-page.html?category=${encodeURIComponent(c.slug)}">
        ${c.image_url?`<img class="catimg" src="${img(c.image_url)}" alt="">`:`<div class="catimg" style="display:grid;place-items:center;background:#111;color:#d9b45c;font-size:32px"><i class="fas fa-gem"></i></div>`}
        <div class="catnm">${esc(c.name)}</div><div class="catct">استكشفي القسم</div>
      </a></div>`).join("") || `<div class="empty">لا توجد أقسام حالياً.</div>`;
    if(filters) filters.innerHTML=`<button class="filtbtn active" data-category="all">الكل</button>`+categories.map(c=>`<button class="filtbtn" data-category="${esc(c.slug)}">${esc(c.name)}</button>`).join("");
    if(filters) filters.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{filters.querySelectorAll(".filtbtn").forEach(x=>x.classList.remove("active"));b.classList.add("active");const cat=b.dataset.category;document.querySelectorAll("#mgrid .mwrap").forEach(w=>{const p=w.querySelector(".mcard");w.style.display=cat==="all"||p.dataset.cat===cat?"":"none";});});
  }
  function render(){
    const grid=document.getElementById("mgrid");if(!grid)return;
    grid.innerHTML=products.length?products.map(card).join(""):`<div class="empty" style="grid-column:1/-1;padding:45px">لا توجد منتجات منشورة حالياً. أضيفي المنتجات من لوحة الإدارة.</div>`;
    grid.querySelectorAll(".mcard").forEach(c=>c.addEventListener("click",e=>{if(!e.target.closest("button"))window.NesmaOpenProduct?.(products.find(p=>String(p.id)===String(c.dataset.id)));}));
    grid.querySelectorAll("[data-wish]").forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.wish,key=`fav-${id}`,next=localStorage.getItem(key)==="1"?"0":"1";localStorage.setItem(key,next);b.innerHTML=`<i class="${next==="1"?"fas":"far"} fa-heart"></i>`;});
    grid.querySelectorAll(".madd").forEach(b=>b.onclick=e=>{e.stopPropagation();const c=b.closest(".mcard");window.NesmaOpenProduct?.(products.find(p=>String(p.id)===String(c.dataset.id)));});
    document.dispatchEvent(new Event("nesma-products-rendered"));
  }
  async function load(){
    try{
      const [pr,cr]=await Promise.all([fetch(`${API}/api/products`).then(r=>r.json()),fetch(`${API}/api/categories`).then(r=>r.json())]);
      products=pr.products||[];categories=cr.categories||[];
      renderCategories();render();
      const sort=document.getElementById("sortSelect"); sort?.addEventListener("change",()=>{const mode=sort.value,grid=document.getElementById("mgrid");if(!grid)return;const items=[...grid.querySelectorAll(".mwrap")];items.sort((a,b)=>{const pa=Number(a.querySelector(".mcard")?.dataset.price||0),pb=Number(b.querySelector(".mcard")?.dataset.price||0);return mode==="low"?pa-pb:mode==="high"?pb-pa:0;});items.forEach(x=>grid.appendChild(x));});
      document.dispatchEvent(new CustomEvent("nesma-home-ready",{detail:{products,categories}}));
    }catch(e){console.error(e);const grid=document.getElementById("mgrid");if(grid)grid.innerHTML=`<div class="empty" style="grid-column:1/-1">تعذر تحميل المنتجات حالياً.</div>`;}
  }
  window.NesmaProducts={get:()=>products,load,render};
  document.addEventListener("DOMContentLoaded",load);
})();
