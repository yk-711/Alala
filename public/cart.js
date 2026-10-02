
(() => {
  const list=document.getElementById("cartList"),total=document.getElementById("cartTotal"),count=document.getElementById("cartCountPage"),empty=document.getElementById("cartEmpty");
  function render(){
    const items=window.Nesma.cart();let sum=0;
    if(count)count.textContent=window.Nesma.cartCount();if(document.getElementById("summaryCount"))document.getElementById("summaryCount").textContent=String(window.Nesma.cartCount());
    if(!items.length){list.innerHTML=`<div class="cart-empty-card"><i class="fas fa-bag-shopping"></i><h2>سلتك بانتظار اختياراتك</h2><p>اكتشفي تشكيلات العبايات وأضيفي ما يناسبك.</p><a class="checkout" href="products-page.html">تصفح العبايات</a></div>`;if(total)total.textContent=window.Nesma.formatPrice(0);return;}
    list.innerHTML=items.map((x,i)=>`<article class="cart-row">
      <img src="${window.Nesma.escapeHtml(window.Nesma.imageUrl(x.image))}" alt="${window.Nesma.escapeHtml(x.title)}">
      <div class="cart-row-main"><h3>${window.Nesma.escapeHtml(x.title)}</h3>
      <div class="cart-options">${x.size?`<span>المقاس: ${window.Nesma.escapeHtml(x.size)}</span>`:""}${x.color?`<span>اللون: ${window.Nesma.escapeHtml(x.color)}</span>`:""}${x.fabric?`<span>القماش: ${window.Nesma.escapeHtml(x.fabric)}</span>`:""}</div>
      <strong data-price-yer="${Number(x.price_yer||0)}">${window.Nesma.formatPrice(x.price_yer)}</strong>
      <div class="qty"><button data-q="-" data-i="${i}">−</button><b>${x.qty}</b><button data-q="+" data-i="${i}">+</button><button class="remove" data-r="${i}">حذف</button></div></div>
      <strong class="cart-line-total" data-line="${Number(x.price_yer||0)*Number(x.qty||0)}">${window.Nesma.formatPrice(Number(x.price_yer||0)*Number(x.qty||0))}</strong>
    </article>`).join("");
    sum=window.Nesma.cartTotalYer();if(total)total.textContent=window.Nesma.formatPrice(sum);
    list.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{const x=window.Nesma.cart()[+b.dataset.i];if(x)window.Nesma.updateCart(+b.dataset.i,Number(x.qty)+(b.dataset.q==="+"?1:-1));render();});
    list.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{window.Nesma.removeCart(+b.dataset.r);render();});
    refresh();
  }
  function refresh(){const c=window.Nesma.getCurrency();document.querySelectorAll("[data-price-yer]").forEach(e=>e.textContent=window.Nesma.formatPrice(e.dataset.priceYer,c));if(total)total.textContent=window.Nesma.formatPrice(window.Nesma.cartTotalYer(),c);const s=document.getElementById("shopCurrency");if(s)s.value=c;}
  document.getElementById("shopCurrency")?.addEventListener("change",e=>{window.Nesma.setCurrency(e.target.value);refresh();});
  window.addEventListener("nesma-cart-updated",render);window.addEventListener("storage",render);
  render();
})();
