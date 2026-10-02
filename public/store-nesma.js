
(() => {
  const $=id=>document.getElementById(id);
  const esc=window.Nesma.escapeHtml;
  let selectedProduct=null, selectedImageIndex=0, quantity=1;

  const currencySelect=$("currencySelect"),currencyToggle=$("currencyToggle"),currencyShort=$("currencyShort");
  function refreshCurrency(){
    const c=window.Nesma.getCurrency();
    if(currencySelect)currencySelect.value=c;
    if(currencyShort)currencyShort.textContent=window.Nesma.CURRENCY_LABELS[c];
    document.querySelectorAll("[data-price-yer]").forEach(el=>el.textContent=window.Nesma.formatPrice(el.dataset.priceYer,c)); if(selectedProduct&&$("mpPrice"))$("mpPrice").textContent=window.Nesma.formatPrice(selectedProduct.price_yer,c);
  }
  currencySelect?.addEventListener("change",e=>{window.Nesma.setCurrency(e.target.value);refreshCurrency();});
  currencyToggle?.addEventListener("click",()=>{window.Nesma.nextCurrency();refreshCurrency();});
  window.addEventListener("nesma-products-rendered",refreshCurrency);
  refreshCurrency();

  function ensureOptions(){
    const body=document.querySelector("#menuPop .mpbody"); if(!body)return;
    let el=$("mpOptions");
    if(!el){el=document.createElement("div");el.id="mpOptions";el.className="mp-options";body.insertBefore(el,$("mpStars"));}
    return el;
  }
  function optionGroup(label,key,values){
    if(!values?.length)return "";
    return `<div class="mp-option-group"><span>${label}</span><div class="mp-option-list">${values.map((v,i)=>`<button type="button" class="mp-option ${i===0?"selected":""}" data-option="${key}" data-value="${esc(v)}">${esc(v)}</button>`).join("")}</div></div>`;
  }
  function openProduct(product){
    if(!product)return;
    selectedProduct=product;selectedImageIndex=0;quantity=1;
    const images=window.Nesma.productImages(product);
    $("mpImg").src=images[0]||"";$("mpTitle").textContent=product.title;
    $("mpCat").textContent=(product.category_slugs||[product.category])[0]||"عبايات";
    $("mpDesc").textContent=product.description||"";
    $("mpPrice").textContent=window.Nesma.formatPrice(product.price_yer);
    $("mpStars").innerHTML=`<i class="fas fa-star"></i> ${Number(product.rating||5).toFixed(1)} <span>(${Number(product.reviews||0)})</span>`;
    $("mpTags").innerHTML=(product.badges||[]).map(x=>`<span>${esc(x)}</span>`).join("");
    $("mpQnum").textContent="1";$("mpQty").value="1";
    const gallery=$("mpGallery");gallery.innerHTML=images.map((src,i)=>`<button type="button" class="mpthumb ${i===0?"active":""}" data-index="${i}"><img src="${esc(src)}" alt=""></button>`).join("");
    gallery.querySelectorAll("[data-index]").forEach(b=>b.onclick=()=>{selectedImageIndex=Number(b.dataset.index);$("mpImg").src=images[selectedImageIndex];gallery.querySelectorAll(".mpthumb").forEach(x=>x.classList.remove("active"));b.classList.add("active");});
    const opt=ensureOptions();
    opt.innerHTML=optionGroup("المقاس","size",product.sizes||[])+optionGroup("اللون","color",product.colors||[])+optionGroup("القماش","fabric",product.fabrics||[]);
    opt.querySelectorAll(".mp-option").forEach(b=>b.onclick=()=>{opt.querySelectorAll(`[data-option="${b.dataset.option}"]`).forEach(x=>x.classList.remove("selected"));b.classList.add("selected");});
    const sizeWrap=document.querySelector(".mpsizes");if(sizeWrap)sizeWrap.style.display="none";
    $("menuPop").classList.add("open");
    refreshCurrency();
  }
  function selectedOption(key){return document.querySelector(`#mpOptions [data-option="${key}"].selected`)?.dataset.value||"";}
  function clamp(n){return Math.max(1,Math.min(99,Math.round(Number(n)||1)));}
  $("mpQtyMinus")?.addEventListener("click",()=>{$("mpQty").value=clamp(Number($("mpQty").value)-1);$("mpQnum").textContent=$("mpQty").value;});
  $("mpQtyPlus")?.addEventListener("click",()=>{$("mpQty").value=clamp(Number($("mpQty").value)+1);$("mpQnum").textContent=$("mpQty").value;});
  $("mpQty")?.addEventListener("change",()=>{$("mpQty").value=clamp($("mpQty").value);$("mpQnum").textContent=$("mpQty").value;});
  $("mpMinus")?.addEventListener("click",()=>{$("mpQty").value=clamp(Number($("mpQty").value)-1);$("mpQnum").textContent=$("mpQty").value;});
  $("mpPlus")?.addEventListener("click",()=>{$("mpQty").value=clamp(Number($("mpQty").value)+1);$("mpQnum").textContent=$("mpQty").value;});
  const cartFab=$("cartFab"); cartFab?.addEventListener("click",()=>location.href="cart.html");
  function refreshCartCount(){const el=$("cartCount");if(el)el.textContent=window.Nesma.cartCount();} window.addEventListener("nesma-cart-updated",refreshCartCount); refreshCartCount();
  $("mpAddCart")?.addEventListener("click",()=>{
    if(!selectedProduct)return;
    const images=window.Nesma.productImages(selectedProduct);
    const size=selectedOption("size"),color=selectedOption("color"),fabric=selectedOption("fabric");
    window.Nesma.addCart({id:selectedProduct.id,title:selectedProduct.title,price_yer:Number(selectedProduct.price_yer||0),image:images[0]||"",size,color,fabric,qty:clamp($("mpQty").value)});
    $("menuPop").classList.remove("open");location.href="cart.html";
  });
  $("mpClose")?.addEventListener("click",()=>$("menuPop").classList.remove("open"));
  $("menuPop")?.addEventListener("click",e=>{if(e.target===$("menuPop"))$("menuPop").classList.remove("open");});
  window.NesmaOpenProduct=openProduct;

  const navToggle=document.querySelector(".navbar-toggler"),navMenu=$("navmenu"),backdrop=$("navBackdrop");
  function nav(open){if(!navMenu||!navToggle)return;const ok=window.innerWidth<992,next=ok&&open;navMenu.classList.toggle("show",next);navMenu.classList.toggle("mobile-open",next);backdrop?.classList.toggle("show",next);navToggle.setAttribute("aria-expanded",String(next));document.body.classList.toggle("nav-locked",next);}
  navToggle?.addEventListener("click",e=>{e.preventDefault();nav(!navMenu.classList.contains("mobile-open"));});
  backdrop?.addEventListener("click",()=>nav(false));
  navMenu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>nav(false)));
  window.addEventListener("resize",()=>{if(innerWidth>=992)nav(false);});

  const search=$("navSearchBtn"),overlay=$("searchOv"),close=$("searchClose"),input=$("searchInput");
  search?.addEventListener("click",()=>overlay?.classList.add("open"));close?.addEventListener("click",()=>overlay?.classList.remove("open"));
  input?.addEventListener("input",()=>{const q=input.value.trim().toLowerCase();document.querySelectorAll("#mgrid .mwrap").forEach(w=>{const c=w.querySelector(".mcard");const hay=`${c?.dataset.title||""} ${c?.dataset.tags||""} ${c?.dataset.cat||""}`.toLowerCase();w.style.display=!q||hay.includes(q)?"":"none";});});

  // The old drawer cart is intentionally gone. The bottom cart now opens the standalone cart page.
  document.querySelector("#bottomCartButton")?.addEventListener("click",e=>{e.stopPropagation();});
  document.addEventListener("click",e=>{
    const link=e.target.closest('a[href="cart.html"]'); if(link) return;
  });
})();
