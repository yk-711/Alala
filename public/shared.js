
(() => {
  const API_BASE = "https://nesma-store.onrender.com";
  const RATES_TO_YER = { yer: 1, sar: 140, usd: 532 };
  const CURRENCY_LABELS = { yer: "ر.ي", sar: "ر.س", usd: "$" };
  const currencyOrder = ["yer", "sar", "usd"];

  function getCurrency() {
    const saved = localStorage.getItem("nesma-currency");
    return RATES_TO_YER[saved] ? saved : "yer";
  }
  function setCurrency(code) {
    const value = RATES_TO_YER[code] ? code : "yer";
    localStorage.setItem("nesma-currency", value);
    return value;
  }
  function formatPrice(priceYer, currency = getCurrency()) {
    const yer = Number(priceYer || 0);
    const value = yer / RATES_TO_YER[currency];
    if (currency === "yer") return `${Math.round(value).toLocaleString("ar-YE")} ${CURRENCY_LABELS[currency]}`;
    return `${value.toFixed(2)} ${CURRENCY_LABELS[currency]}`;
  }
  function nextCurrency() {
    const current = getCurrency();
    return setCurrency(currencyOrder[(currencyOrder.indexOf(current) + 1) % currencyOrder.length]);
  }
  function imageUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (value.startsWith("/")) return value;
    try {
      const u = new URL(value, location.href);
      if (u.origin === location.origin) return u.href;
      const allowed = ["images.pexels.com", "images.unsplash.com", "i.imgur.com"];
      if (allowed.includes(u.hostname)) return `${API_BASE}/api/image?url=${encodeURIComponent(u.href)}`;
    } catch (_) {}
    return value;
  }
  function productImages(product) {
    const list = Array.isArray(product?.images) ? product.images : [];
    const all = [product?.image_url, ...list].filter(Boolean).map(imageUrl);
    return [...new Set(all)];
  }
  function cart() {
    try { return JSON.parse(localStorage.getItem("nesma-cart") || "[]"); } catch (_) { return []; }
  }
  function saveCart(items) { localStorage.setItem("nesma-cart", JSON.stringify(items)); window.dispatchEvent(new Event("nesma-cart-updated")); }
  function addCart(item) {
    const items = cart();
    const key = [item.id, item.size || "", item.color || "", item.fabric || ""].join("|");
    const old = items.find(x => x.key === key);
    if (old) old.qty = Math.min(99, Number(old.qty || 1) + Number(item.qty || 1));
    else items.push({ ...item, key, qty: Math.min(99, Number(item.qty || 1)) });
    saveCart(items);
    return items;
  }
  function removeCart(index) { const items = cart(); items.splice(index, 1); saveCart(items); return items; }
  function updateCart(index, qty) { const items = cart(); if (items[index]) items[index].qty = Math.max(1, Math.min(99, Number(qty) || 1)); saveCart(items); return items; }
  function cartCount() { return cart().reduce((sum, x) => sum + Number(x.qty || 0), 0); }
  function cartTotalYer() { return cart().reduce((sum, x) => sum + Number(x.price_yer || x.price || 0) * Number(x.qty || 0), 0); }
  function escapeHtml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }

  window.Nesma = { API_BASE, RATES_TO_YER, CURRENCY_LABELS, getCurrency, setCurrency, formatPrice, nextCurrency, imageUrl, productImages, cart, saveCart, addCart, removeCart, updateCart, cartCount, cartTotalYer, escapeHtml };
})();
