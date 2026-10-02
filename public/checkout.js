
(() => {
  const items=window.Nesma.cart(),API=window.Nesma.API_BASE;
  const summary=document.getElementById("summaryItems"),total=document.getElementById("summaryTotal"),form=document.getElementById("checkoutForm"),err=document.getElementById("checkoutError"),success=document.getElementById("success");
  function refresh(){
    const c=window.Nesma.getCurrency();
    const current=window.Nesma.cart();
    summary.innerHTML=current.length?current.map(x=>`<div class="summary-item"><img src="${window.Nesma.escapeHtml(window.Nesma.imageUrl(x.image))}" alt=""><div><strong>${window.Nesma.escapeHtml(x.title)}</strong><small>${x.size?`المقاس: ${window.Nesma.escapeHtml(x.size)} · `:""}${x.color?`اللون: ${window.Nesma.escapeHtml(x.color)} · `:""}${x.fabric?`القماش: ${window.Nesma.escapeHtml(x.fabric)} · `:""}الكمية: ${x.qty}</small></div><b>${window.Nesma.formatPrice(Number(x.price_yer||0)*Number(x.qty||0),c)}</b></div>`).join(""):`<p>السلة فارغة. <a href="products-page.html">تصفحي العبايات</a></p>`;
    total.textContent=window.Nesma.formatPrice(window.Nesma.cartTotalYer(),c);
    const sel=document.getElementById("shopCurrency");if(sel)sel.value=c;
  }
  document.getElementById("shopCurrency")?.addEventListener("change",e=>{window.Nesma.setCurrency(e.target.value);refresh();});
  form.addEventListener("submit",async e=>{
    e.preventDefault();err.style.display="none";
    const cart=window.Nesma.cart();if(!cart.length){err.textContent="السلة فارغة.";err.style.display="block";return;}
    const payload={customer_name:document.getElementById("customerName").value.trim(),phone:document.getElementById("phone").value.trim(),city:document.getElementById("city").value.trim(),address:document.getElementById("address").value.trim(),notes:document.getElementById("notes").value.trim(),currency:window.Nesma.getCurrency(),items:cart.map(x=>({id:x.id,qty:x.qty,size:x.size||"",color:x.color||"",fabric:x.fabric||""}))};
    try{
      const r=await fetch(`${API}/api/orders`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.message||"تعذر حفظ الطلب.");
      const lines=cart.map(x=>`• ${x.title} — ${x.size?`المقاس ${x.size} — `:""}${x.color?`اللون ${x.color} — `:""}${x.fabric?`القماش ${x.fabric} — `:""}${x.qty} × ${window.Nesma.formatPrice(x.price_yer)}`);
      const msg=`مرحباً متجر نسمة، أريد تأكيد الطلب رقم ${d.order_id}\n\nالاسم: ${payload.customer_name}\nالهاتف: ${payload.phone}\nالمدينة: ${payload.city}\nالعنوان: ${payload.address}\n\nالمنتجات:\n${lines.join("\n")}\n\nالإجمالي: ${window.Nesma.formatPrice(d.total_yer,payload.currency)}\nملاحظات: ${payload.notes||"لا توجد"}`;
      window.open(`https://wa.me/967781797884?text=${encodeURIComponent(msg)}`,"_blank","noopener,noreferrer");
      localStorage.removeItem("nesma-cart");form.style.display="none";success.classList.add("show");document.getElementById("successText").textContent=`رقم طلبك: ${d.order_id}. تم حفظ الطلب ومنحك ${d.points||0} نقطة إذا كنت مسجلاً في حسابك.`;
    }catch(e){err.textContent=e.message;err.style.display="block";}
  });
  refresh();
})();
