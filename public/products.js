(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('mgrid');
    if (!grid) return;
    try {
      const response = await fetch('/api/products', { credentials: 'include' });
      if (!response.ok) return;
      const { products } = await response.json();
      if (!Array.isArray(products) || !products.length) return;
      const categoryMap = { 'للسيدات':'burgers','للأطفال':'pizza','فساتين':'chicken','أطقم':'wraps','عروض خاصة':'desserts','إكسسوارات':'pasta' };
      grid.innerHTML = products.map((p, i) => {
        const old = p.old_price ? `<small>${Number(p.old_price).toFixed(0)} ر.س</small>` : '';
        const badge = p.badge ? `<div class="mbdg new"><i class="fas fa-star"></i> ${escapeHtml(p.badge)}</div>` : '';
        return `<div class="col-sm-6 col-lg-4 mwrap" data-aos="fade-up" data-aos-delay="${(i%3)*80}" data-c="${categoryMap[p.category]||'burgers'}">
          <div class="mcard" data-cal="0" data-cat="${escapeHtml(p.category)}" data-audience="${escapeHtml(p.audience)}" data-desc="${escapeHtml(p.description||'')}" data-img="${escapeHtml(p.image_url)}" data-old="${p.old_price ? Number(p.old_price).toFixed(0)+' ر.س':''}" data-price="${Number(p.price).toFixed(2)} ر.س" data-rating="${Number(p.rating||5)}" data-reviews="${Number(p.reviews||0)}" data-tags="${escapeHtml(p.tags||'')}" data-time="${Number(p.prep_time||10)}" data-title="${escapeHtml(p.title)}">
            <div class="mimg"><img alt="${escapeHtml(p.title)}" src="${escapeHtml(p.image_url)}" loading="lazy">${badge}<div class="mhrt"><i class="far fa-heart"></i></div></div>
            <div class="mbody"><div class="mcat">${escapeHtml(p.category)}</div><div class="mtit">${escapeHtml(p.title)}</div><div class="mdesc">${escapeHtml(p.description||'')}</div><div class="mfoot"><div><div class="mprice">${Number(p.price).toFixed(0)} ر.س ${old}</div><div class="mstars"><i class="fas fa-star"></i> <span style="color:#bbb;font-size:.7rem;">(${Number(p.reviews||0)})</span></div></div><button class="madd" title="تفاصيل المنتج"><i class="fas fa-plus"></i></button></div></div>
          </div></div>`;
      }).join('');
    } catch (e) { console.warn('Products API unavailable; showing built-in products.', e); }
  });
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
})();
