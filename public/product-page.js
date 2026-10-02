
(() => {
  const id=new URLSearchParams(location.search).get("id"),root=document.getElementById("detail");
  let product=null,qty=1;
  function optionGroup(label,key,values){if(!values?.length)return "";return `<div class="detail-options"><h4>${label}</h4><div>${values.map((v,i)=>`<button class="detail-option ${i===0?"selected":""}" data-key="${key}" data-value="${window.Nesma.escapeHtml(v)}">${window.Nesma.escapeHtml(v)}</button>`).join("")}</div></div>`;}
  function render(p){
    product=p;const images=window.Nesma.productImages(p);
    root.innerHTML=`<div class="detail-layout"><div class="detail-gallery"><div class="detail-main"><img id="detailMain" src="${window.Nesma.escapeHtml(images[0]||"")}" alt="${window.Nesma.escapeHtml(p.title)}"></div><div class="detail-thumbs">${images.map((x,i)=>`<button class="${i===0?"active":""}" data-i="${i}"><img src="${window.Nesma.escapeHtml(x)}" alt=""></button>`).join("")}</div></div><div class="detail-info"><span class="shop-cat">${window.Nesma.escapeHtml((p.category_slugs||[p.category])[0]||"عبايات")}</span><h1>${window.Nesma.escapeHtml(p.title)}</h1><div class="detail-rating">★ ${Number(p.rating||5).toFixed(1)} <small>(${Number(p.reviews||0)} تقييم)</small></div><p>${window.Nesma.escapeHtml(p.description||"")}</p><div class="detail-price" id="detailPrice">${window.Nesma.formatPrice(p.price_yer)}</div><div id="detailOptions">${optionGroup("المقاس","size",p.sizes)+optionGroup("اللون","color",p.colors)+optionGroup("القماش","fabric",p.fabrics)}</div><div class="detail-qty"><button id="minus">−</button><b id="qty">1</b><button id="plus">+</button></div><button id="addDetail" class="shop-add detail-add">أضيفي إلى السلة</button></div></div>`;
    root.querySelectorAll(".detail-thumbs button").forEach(b=>b.onclick=()=>{root.querySelector("#detailMain").src=images[+b.dataset.i];root.querySelectorAll(".detail-thumbs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");});
    root.querySelectorAll(".detail-option").forEach(b=>b.onclick=()=>{root.querySelectorAll(`[data-key="${b.dataset.key}"]`).forEach(x=>x.classList.remove("selected"));b.classList.add("selected");});
    root.querySelector("#minus").onclick=()=>{qty=Math.max(1,qty-1);root.querySelector("#qty").textContent=qty;};
    root.querySelector("#plus").onclick=()=>{qty=Math.min(99,qty+1);root.querySelector("#qty").textContent=qty;};
    root.querySelector("#addDetail").onclick=()=>{const get=k=>root.querySelector(`[data-key="${k}"].selected`)?.dataset.value||"";window.Nesma.addCart({id:p.id,title:p.title,price_yer:Number(p.price_yer),image:images[0]||"",size:get("size"),color:get("color"),fabric:get("fabric"),qty});location.href="cart.html";};
  }
  async function load(){try{const r=await fetch(`${window.Nesma.API_BASE}/api/products`),d=await r.json();product=d.products?.find(x=>String(x.id)===String(id));if(!product){root.innerHTML='<div class="empty">العباية غير موجودة.</div>';return;}render(product);}catch(e){root.innerHTML='<div class="empty">تعذر تحميل المنتج.</div>';}}
  document.addEventListener("DOMContentLoaded",load);
  document.addEventListener("change",e=>{if(e.target.id==="shopCurrency"){window.Nesma.setCurrency(e.target.value);if(product)document.getElementById("detailPrice").textContent=window.Nesma.formatPrice(product.price_yer);}});
})();
