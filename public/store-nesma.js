(() => {
  const API = 'https://nesma-store.onrender.com';
  const accountBtn = document.getElementById('accountBtn');
  const currencySelect = document.getElementById('currencySelect');
  const currencyToggle = document.getElementById('currencyToggle');
  const currencyShort = document.getElementById('currencyShort');
  const cartFab = document.getElementById('cartFab');
  const navToggle = document.querySelector('.navbar-toggler');
  const navMenu = document.getElementById('navmenu');
  const navBackdrop = document.getElementById('navBackdrop');
  const search = document.getElementById('navSearchBtn');
  const overlay = document.getElementById('searchOv');
  const closeSearch = document.getElementById('searchClose');

  const referral=new URLSearchParams(location.search).get('ref'); if(referral&&/^NESMA-[A-Z0-9]+$/i.test(referral)) localStorage.setItem('nesma-referral-code',referral.toUpperCase());

  accountBtn?.addEventListener('click', async e => {
    e.preventDefault();
    try { const r = await fetch(`${API}/api/auth/me`, {credentials:'include'}); location.href = r.ok ? 'account.html' : 'login.html'; }
    catch { location.href = 'login.html'; }
  });
  cartFab?.addEventListener('click', () => { location.href = 'cart.html'; });

  const isHomePage = /(?:^|\/)index\.html?$/.test(location.pathname) || location.pathname.endsWith('/');
  const currencyRates = isHomePage ? { sar: 1, yer: 65, usd: 0.2667 } : { yer: 1, sar: 1/140, usd: 1/532 };
  const currencyLabels = { sar: 'ر.س', yer: 'ر.ي', usd: '$' };
  let activeCurrency = localStorage.getItem('nesma-currency') || (isHomePage ? 'sar' : 'yer');
  const numberPrice = value => { const m=String(value??'').replace(/,/g,'').match(/[0-9]+(?:\.[0-9]+)?/); return m?Number(m[0]):0; };
  const priceText = basePrice => { const v=numberPrice(basePrice)*currencyRates[activeCurrency]; return `${activeCurrency==='yer'?Math.round(v).toLocaleString('en-US'):v.toFixed(2)} ${currencyLabels[activeCurrency]}`; };
  function refreshPrices(){ document.querySelectorAll('.mcard').forEach(card=>{ const p=card.querySelector('.mprice'); if(p)p.textContent=priceText(card.dataset.price); const o=card.querySelector('.mold'); if(o&&card.dataset.old)o.textContent=priceText(card.dataset.old); }); }
  function syncCurrency(){ if(currencySelect)currencySelect.value=activeCurrency; if(currencyShort)currencyShort.textContent=currencyLabels[activeCurrency]; if(isHomePage)refreshPrices(); }
  currencySelect?.addEventListener('change',e=>{activeCurrency=e.target.value;localStorage.setItem('nesma-currency',activeCurrency);syncCurrency();});
  currencyToggle?.addEventListener('click',()=>{const order=isHomePage?['sar','yer','usd']:['yer','sar','usd'];activeCurrency=order[(order.indexOf(activeCurrency)+1)%order.length];localStorage.setItem('nesma-currency',activeCurrency);syncCurrency();});
  syncCurrency();

  function setMobileNav(open){ if(!navMenu||!navToggle||!navBackdrop)return; const next=window.innerWidth<992&&open; navMenu.classList.toggle('show',next);navMenu.classList.toggle('mobile-open',next);navBackdrop.classList.toggle('show',next);navBackdrop.setAttribute('aria-hidden',String(!next));navToggle.setAttribute('aria-expanded',String(next));document.body.classList.toggle('nav-locked',next); }
  navToggle?.setAttribute('aria-expanded','false'); navToggle?.addEventListener('click',e=>{e.preventDefault();setMobileNav(!navMenu?.classList.contains('mobile-open'));}); navBackdrop?.addEventListener('click',()=>setMobileNav(false)); navMenu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMobileNav(false))); window.addEventListener('resize',()=>{if(window.innerWidth>=992)setMobileNav(false);});
  search?.addEventListener('click',()=>{setMobileNav(false);overlay?.classList.add('open');}); closeSearch?.addEventListener('click',()=>overlay?.classList.remove('open'));

  // النقر على بطاقة المنتج يفتح صفحة التفاصيل الاحترافية، وليس نافذة منبثقة.
  function bindProductCards(){ document.querySelectorAll('.mcard').forEach(card=>{
    if(card.dataset.detailBound==='1')return; card.dataset.detailBound='1';
    const go=()=>{ const id=card.dataset.id || card.getAttribute('data-id'); if(id) location.href=`product.html?id=${encodeURIComponent(id)}`; };
    card.addEventListener('click',e=>{ if(e.target.closest('.fav-btn,button,a,input,select')) return; go(); });
    card.querySelector('.madd')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();go();});
  }); }
  document.querySelectorAll('.mcard').forEach((card,i)=>{ if(!card.dataset.id){ const title=card.dataset.title||''; card.dataset.id=card.dataset.id||card.getAttribute('data-product-id')||''; } });
  bindProductCards();

  const filterButtons=[...document.querySelectorAll('.filter-btn')],sortSelect=document.getElementById('sortSelect'),mgrid=document.getElementById('mgrid'),searchInput=document.getElementById('searchInput'),searchStatus=document.getElementById('searchStatus');
  let activeFilter='all',searchQuery='';
  function applyCatalogView(){ if(!mgrid)return; const items=[...mgrid.querySelectorAll('.mwrap')].map(wrapper=>({wrapper,card:wrapper.querySelector('.mcard')})).filter(x=>x.card); items.forEach(({wrapper,card})=>{const hay=`${card.dataset.title||''} ${card.dataset.cat||''} ${card.dataset.tags||''}`.toLocaleLowerCase();wrapper.style.display=(activeFilter==='all'||card.dataset.audience===activeFilter)&&(!searchQuery||hay.includes(searchQuery))?'':'none';}); const visible=items.filter(x=>x.wrapper.style.display!=='none'); const sort=sortSelect?.value||'default'; if(sort!=='default')visible.sort((a,b)=>{const d=numberPrice(a.card.dataset.price)-numberPrice(b.card.dataset.price);return sort==='low'?d:-d;}); visible.concat(items.filter(x=>x.wrapper.style.display==='none')).forEach(x=>mgrid.appendChild(x.wrapper)); if(searchStatus){searchStatus.textContent=searchQuery?`${visible.length} منتج مطابق للبحث`:'اكتبي اسم المنتج أو الفئة للبحث السريع';searchStatus.classList.toggle('empty',visible.length===0);} bindProductCards(); }
  filterButtons.forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter||'all';filterButtons.forEach(x=>x.classList.toggle('active',x===b));applyCatalogView();})); sortSelect?.addEventListener('change',applyCatalogView); searchInput?.addEventListener('input',()=>{searchQuery=searchInput.value.trim().toLocaleLowerCase();applyCatalogView();});
  document.querySelectorAll('.mcard').forEach(card=>{card.style.position='relative';if((card.dataset.tags||'').includes('جديد')&&!card.querySelector('.new-badge'))card.insertAdjacentHTML('afterbegin','<span class="new-badge">جديد</span>');if(!card.querySelector('.fav-btn')){const fav=document.createElement('button');fav.className='fav-btn';fav.type='button';fav.setAttribute('aria-label','إضافة إلى المفضلة');const key=`fav-${card.dataset.id||card.dataset.title}`;fav.textContent=localStorage.getItem(key)==='1'?'♥':'♡';fav.addEventListener('click',e=>{e.stopPropagation();const next=localStorage.getItem(key)==='1'?'0':'1';localStorage.setItem(key,next);fav.textContent=next==='1'?'♥':'♡';});card.prepend(fav);}});
  applyCatalogView();
})();
