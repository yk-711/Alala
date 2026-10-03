import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import "dotenv/config";

import { query } from "./db.js";
import { register, login, logout, me, forgotPassword, resetPassword, authenticate, googleStart, googleCallback } from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3000);
app.disable("x-powered-by");
app.use(express.json({ limit: "24mb" }));
app.use(cookieParser());
const configuredFrontend = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
const allowedOrigins = new Set([
  "https://nesma-store.pages.dev",
  "https://nesma-store.com",
  "https://www.nesma-store.com",
  "https://yk-711.github.io",
  configuredFrontend,
  `http://localhost:${port}`,
  "http://127.0.0.1:" + port
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed."));
  },
  credentials: true
}));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } });

function isAdmin(req) {
  const configured = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminEmail = "younesalkiser712@gmail.com";
  return Boolean(req.user?.email && String(req.user.email).trim().toLowerCase() === adminEmail);
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "يجب تسجيل الدخول أولاً." });
  if (!isAdmin(req)) return res.status(403).json({ message: "هذه الصفحة مخصصة لمدير المتجر." });
  next();
}
function arr(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v || "").split(",").map(x => x.trim()).filter(Boolean);
}
function cleanProduct(body) {
  const categorySlugs = arr(body.category_slugs || body.categories);
  const badges = arr(body.badges || body.badge);
  return {
    title: String(body.title || "").trim().slice(0, 200),
    description: String(body.description || "").trim(),
    category: String(body.category || categorySlugs[0] || "عام").trim().slice(0, 100),
    category_slugs: categorySlugs.length ? categorySlugs : [String(body.category || "عام").trim()],
    audience: ["women", "kids"].includes(body.audience) ? body.audience : "women",
    image_url: String(body.image_url || "").trim(),
    old_price: body.old_price === "" || body.old_price == null ? null : Number(body.old_price),
    price: Number(body.price || 0), rating: Number(body.rating || 5), reviews: Number(body.reviews || 0),
    tags: String(body.tags || "").trim(), prep_time: Number(body.prep_time || 10),
    badges,
    sizes: arr(body.sizes || body.available_sizes),
    colors: arr(body.colors || body.available_colors),
    fabrics: arr(body.fabrics || body.fabric || body.available_fabrics),
    images: arr(body.images || body.gallery || body.image_urls),
    active: body.active !== false, selected: body.selected === true, sort_order: Number(body.sort_order || 0)
  };
}
function githubConfig() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.GITHUB_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO || "").trim();
  const branch = String(process.env.GITHUB_BRANCH || "main").trim();
  const pathName = String(process.env.GITHUB_PRODUCTS_PATH || "public/data/products.json").trim();
  return { token, owner, repo, branch, pathName, enabled: !!(token && owner && repo) };
}
async function githubRequest(endpoint, options = {}) {
  const cfg = githubConfig();
  if (!cfg.enabled) throw new Error("ربط GitHub غير مكتمل. أضف GITHUB_TOKEN وGITHUB_OWNER وGITHUB_REPO في إعدادات الخادم.");
  const r = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${cfg.token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `GitHub API ${r.status}`);
  return data;
}
function safeFileName(name) {
  return String(name || "product").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
}
async function githubPutFile(filePath, contentBuffer, message, sha = null) {
  const cfg = githubConfig();
  let existingSha = sha;
  if (!existingSha) {
    try { existingSha = (await githubRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`)).sha; } catch (e) { if (!String(e.message).includes("Not Found")) throw e; }
  }
  const body = { message, content: contentBuffer.toString("base64"), branch: cfg.branch };
  if (existingSha) body.sha = existingSha;
  return githubRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}`, { method: "PUT", body: JSON.stringify(body) });
}
async function publishToGitHub() {
  const cfg = githubConfig();
  if (!cfg.enabled) throw new Error("GitHub غير مربوط بعد.");
  const result = await query(`SELECT id,title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,old_price,price,rating,reviews,tags,prep_time,badges,active,selected,sort_order,created_at,updated_at FROM products ORDER BY sort_order ASC, created_at DESC`);
  const categories = await query(`SELECT id,name,slug,image_url,active,sort_order FROM categories ORDER BY sort_order ASC, name ASC`);
  const payload = { version: 1, generated_at: new Date().toISOString(), categories: categories.rows, products: result.rows };
  await githubPutFile(cfg.pathName, Buffer.from(JSON.stringify(payload, null, 2), "utf8"), "تحديث منتجات متجر نسمة");
  return { path: cfg.pathName, products: result.rows.length, categories: categories.rows.length };
}


function normalizeImageUrl(value) {
  return String(value || '').trim();
}
function uniqueStrings(values) { return [...new Set(arr(values))]; }
async function saveImageListToGitHub(dataUrls, title) {
  const saved = [];
  for (const dataUrl of (Array.isArray(dataUrls) ? dataUrls : [])) {
    saved.push(await saveImageToGitHub(dataUrl, title));
  }
  return saved;
}
function parseCartItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('السلة فارغة.');
  return items.map((x) => ({
    product_id: x.product_id || x.id || null,
    name: String(x.name || x.title || '').trim().slice(0, 200),
    image_url: normalizeImageUrl(x.image_url || x.image),
    price_yer: Number(x.price_yer ?? x.price ?? 0),
    quantity: Math.max(1, Math.min(99, Number(x.quantity ?? x.qty ?? 1))),
    size: String(x.size || '').trim().slice(0, 100),
    color: String(x.color || '').trim().slice(0, 100),
    fabric: String(x.fabric || '').trim().slice(0, 100)
  })).filter(x => x.name && Number.isFinite(x.price_yer) && x.price_yer >= 0);
}
async function awardOrderPoints(orderId) {
  const order = await query(`SELECT id,user_id,total_yer,referral_user_id,status FROM orders WHERE id=$1`, [orderId]);
  if (!order.rowCount || order.rows[0].status !== 'completed') return { buyer: 0, referral: 0 };
  const o = order.rows[0];
  let buyer = 0, referral = 0;
  if (o.user_id) {
    buyer = Math.floor(Number(o.total_yer) / 1000);
    if (buyer > 0) {
      const r = await query(`INSERT INTO points_ledger(user_id,points,reason,order_id,referral_user_id) VALUES($1,$2,'order_purchase',$3,$4) ON CONFLICT DO NOTHING RETURNING points`, [o.user_id, buyer, o.id, o.referral_user_id]);
      if (r.rowCount) await query(`UPDATE users SET points=points+$1,updated_at=NOW() WHERE id=$2`, [buyer, o.user_id]); else buyer = 0;
    }
  }
  if (o.referral_user_id) {
    referral = Math.floor(Number(o.total_yer) / 2000);
    if (referral > 0) {
      const r = await query(`INSERT INTO points_ledger(user_id,points,reason,order_id,referral_user_id) VALUES($1,$2,'referral_purchase',$3,$4) ON CONFLICT DO NOTHING RETURNING points`, [o.referral_user_id, referral, o.id, o.user_id]);
      if (r.rowCount) await query(`UPDATE users SET points=points+$1,updated_at=NOW() WHERE id=$2`, [referral, o.referral_user_id]); else referral = 0;
    }
  }
  return { buyer, referral };
}

app.get("/api/health", async (_req, res) => { try { const c=await query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders'`); res.json({ ok: true, database: "connected", github: githubConfig().enabled, orders: { referral_code: c.rows.some(r=>r.column_name==='referral_code'), referral_user_id: c.rows.some(r=>r.column_name==='referral_user_id') } }); } catch (e) { res.status(503).json({ ok: false, database: "unavailable", error: e.message }); } });
app.get("/api/auth/google", googleStart); app.get("/api/auth/google/callback", googleCallback);
app.post("/api/auth/register", authLimiter, register); app.post("/api/auth/login", authLimiter, login); app.post("/api/auth/logout", logout); app.get("/api/auth/me", authenticate, me); app.post("/api/auth/forgot-password", authLimiter, forgotPassword); app.post("/api/auth/reset-password", authLimiter, resetPassword);
app.get("/api/admin/me", authenticate, (req, res) => isAdmin(req) ? res.json({ ok: true, user: req.user }) : res.status(403).json({ message: "غير مصرح." }));

app.get("/api/products", async (_req, res, next) => { try { const r = await query(`SELECT id,title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,old_price,price,rating,reviews,tags,prep_time,badges,COALESCE(badges[1], badge) AS badge,active,selected,sort_order,created_at,updated_at FROM products WHERE active=true ORDER BY sort_order ASC,created_at DESC`); res.json({ products: r.rows }); } catch (e) { next(e); } });
app.get("/api/categories", async (_req, res, next) => { try { const r = await query(`SELECT * FROM categories WHERE active=true ORDER BY sort_order ASC,name ASC`); res.json({ categories: r.rows }); } catch (e) { next(e); } });
app.get("/api/notifications", async (_req,res,next)=>{try{const r=await query(`SELECT id,title,message,type,created_at FROM notifications WHERE active=true ORDER BY created_at DESC LIMIT 10`);res.json({notifications:r.rows});}catch(e){next(e)}});
app.get("/api/account/summary", authenticate, async (req,res,next)=>{try{const u=await query(`SELECT id,name,email,provider,email_verified,created_at,referral_code,points FROM users WHERE id=$1`,[req.user.id]);const orders=await query(`SELECT o.id,o.status,o.total_yer,o.currency,o.created_at,COALESCE(json_agg(json_build_object('name',i.name,'quantity',i.quantity,'size',i.size,'color',i.color,'fabric',i.fabric)) FILTER (WHERE i.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC`,[req.user.id]);const code=u.rows[0]?.referral_code||'';res.json({user:u.rows[0],referralLink:`https://nesma-store.pages.dev/?ref=${encodeURIComponent(code)}`,orders:orders.rows});}catch(e){next(e)}});
let orderSchemaReady;
async function ensureOrderSchema() {
  if (!orderSchemaReady) {
    orderSchemaReady = (async () => {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code) WHERE referral_code IS NOT NULL`);
      await query(`CREATE TABLE IF NOT EXISTS orders(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        customer_name VARCHAR(150) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        city VARCHAR(100) NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        currency VARCHAR(3) NOT NULL DEFAULT 'YER',
        total_yer NUMERIC(14,2) NOT NULL DEFAULT 0,
        referral_code VARCHAR(32),
        referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
      await query(`CREATE TABLE IF NOT EXISTS order_items(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        name VARCHAR(200) NOT NULL,
        image_url TEXT NOT NULL DEFAULT '',
        price_yer NUMERIC(12,2) NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        size VARCHAR(100) NOT NULL DEFAULT '',
        color VARCHAR(100) NOT NULL DEFAULT '',
        fabric VARCHAR(100) NOT NULL DEFAULT ''
      )`);
      // Migrate legacy order_items tables created by older versions of the store.
      // CREATE TABLE IF NOT EXISTS does not modify an existing table, so every
      // column used by checkout/account/admin must also be added explicitly.
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS title VARCHAR(200)`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name VARCHAR(200) NOT NULL DEFAULT ''`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
      // Keep compatibility with legacy order_items where title is NOT NULL and
      // newer code uses name. Fill both fields and make title safe for future inserts.
      await query(`UPDATE order_items SET title=COALESCE(NULLIF(title,''),NULLIF(name,''),'منتج') WHERE title IS NULL OR title=''`);
      await query(`UPDATE order_items SET name=COALESCE(NULLIF(name,''),NULLIF(title,''),'منتج') WHERE name IS NULL OR name=''`);
      await query(`ALTER TABLE order_items ALTER COLUMN title SET DEFAULT 'منتج'`);
      await query(`ALTER TABLE order_items ALTER COLUMN name SET DEFAULT 'منتج'`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_yer NUMERIC(12,2) NOT NULL DEFAULT 0`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(100) NOT NULL DEFAULT ''`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color VARCHAR(100) NOT NULL DEFAULT ''`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fabric VARCHAR(100) NOT NULL DEFAULT ''`);
      await query(`CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)`);
    })().catch(error => {
      orderSchemaReady = null;
      throw error;
    });
  }
  return orderSchemaReady;
}

app.post("/api/orders", async (req,res,next)=>{
  try {
    try { await ensureOrderSchema(); } catch (schemaError) {
      console.error("Order schema migration warning:", schemaError);
      // Continue: the INSERT below detects the columns that actually exist.
      // This keeps guest checkout working on older/read-only PostgreSQL deployments.
    }
    const items=parseCartItems(req.body.items);
    if (!String(req.body.name||'').trim() || !String(req.body.phone||'').trim() || !String(req.body.city||'').trim() || !String(req.body.address||'').trim()) {
      return res.status(400).json({message:'أكمل الاسم ورقم الهاتف والمدينة والعنوان.'});
    }
    for(const x of items){
      if(!x.product_id) throw new Error('بيانات المنتج غير صالحة.');
      const pr=await query(`SELECT id,title,image_url,price FROM products WHERE id=$1 AND active=true LIMIT 1`,[x.product_id]);
      if(!pr.rowCount) throw new Error('أحد المنتجات لم يعد متاحاً.');
      x.price_yer=Number(pr.rows[0].price); x.name=pr.rows[0].title; x.image_url=pr.rows[0].image_url||x.image_url;
    }
    const total=items.reduce((sum,x)=>sum+x.price_yer*x.quantity,0);
    if(!Number.isFinite(total)||total<=0) return res.status(400).json({message:'إجمالي الطلب غير صالح.'});
    const referralCode=String(req.body.referral_code||'').trim().toUpperCase()||null;
    let referralUserId=null;
    if(referralCode){
      try { const rr=await query(`SELECT id FROM users WHERE referral_code=$1 LIMIT 1`,[referralCode]); if(rr.rowCount) referralUserId=rr.rows[0].id; } catch (_) {}
    }
    let userId=null;
    const authToken=req.cookies?.auth_token;
    if(authToken){try{const jwt=(await import('jsonwebtoken')).default;const payload=jwt.verify(authToken,process.env.JWT_SECRET);userId=payload.sub||null;}catch{}}

    // Some older PostgreSQL deployments may not permit ALTER TABLE during a request.
    // Detect the actual columns and insert with only columns that exist, while the startup migration
    // continues to add the referral fields whenever the database user has permission.
    const cols = await query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders'`);
    const hasReferralCode = cols.rows.some(r=>r.column_name==='referral_code');
    const hasReferralUser = cols.rows.some(r=>r.column_name==='referral_user_id');
    const baseValues=[userId,'pending',String(req.body.name||'').trim().slice(0,150),String(req.body.phone||'').trim().slice(0,50),String(req.body.city||'').trim().slice(0,100),String(req.body.address||'').trim(),String(req.body.notes||'').trim(),'YER',total];
    let o;
    if(hasReferralCode && hasReferralUser){
      o=await query(`INSERT INTO orders(user_id,status,customer_name,phone,city,address,notes,currency,total_yer,referral_code,referral_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status,total_yer,created_at`,[...baseValues,referralCode,referralUserId]);
    } else if(hasReferralCode){
      o=await query(`INSERT INTO orders(user_id,status,customer_name,phone,city,address,notes,currency,total_yer,referral_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status,total_yer,created_at`,[...baseValues,referralCode]);
    } else {
      o=await query(`INSERT INTO orders(user_id,status,customer_name,phone,city,address,notes,currency,total_yer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status,total_yer,created_at`,baseValues);
    }
    if(!o.rows[0]?.id) throw new Error('تعذر إنشاء الطلب.');
    for(const x of items) {
      const itemName = String(x.name || x.title || 'منتج').trim() || 'منتج';
      const itemImage = String(x.image_url || '').trim();
      const itemPrice = Number(x.price_yer || x.price || 0) || 0;
      const itemQty = Math.max(1, Number.parseInt(x.quantity, 10) || 1);
      const itemSize = String(x.size || '').trim();
      const itemColor = String(x.color || '').trim();
      const itemFabric = String(x.fabric || '').trim();
      await query(
        `INSERT INTO order_items(order_id,product_id,title,name,image_url,price_yer,quantity,size,color,fabric)
         VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.rows[0].id,x.product_id || null,itemName,itemImage,itemPrice,itemQty,itemSize,itemColor,itemFabric]
      );
    }
    res.status(201).json({order:o.rows[0],message:'تم حفظ الطلب بنجاح.'});
  }catch(e){next(e)}
});

app.get("/api/admin/products", authenticate, requireAdmin, async (_req, res, next) => { try { const r = await query(`SELECT * FROM products ORDER BY sort_order ASC,created_at DESC`); res.json({ products: r.rows }); } catch (e) { next(e); } });
app.get("/api/admin/categories", authenticate, requireAdmin, async (_req, res, next) => { try { const r = await query(`SELECT * FROM categories ORDER BY sort_order ASC,name ASC`); res.json({ categories: r.rows }); } catch (e) { next(e); } });
app.post("/api/admin/categories", authenticate, requireAdmin, async (req,res,next)=>{try{const name=String(req.body.name||"").trim();const slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");if(!name||!slug)return res.status(400).json({message:"أدخل اسم القسم."});const r=await query(`INSERT INTO categories(name,slug,image_url,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0)]);res.status(201).json({category:r.rows[0]});}catch(e){next(e)}});
app.put("/api/admin/categories/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const name=String(req.body.name||"").trim();const slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");const r=await query(`UPDATE categories SET name=$1,slug=$2,image_url=$3,active=$4,sort_order=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0),req.params.id]);if(!r.rowCount)return res.status(404).json({message:"القسم غير موجود."});res.json({category:r.rows[0]});}catch(e){next(e)}});
app.delete("/api/admin/categories/:id", authenticate, requireAdmin, async (req,res,next)=>{try{await query("DELETE FROM categories WHERE id=$1",[req.params.id]);res.json({message:"تم حذف القسم."});}catch(e){next(e)}});

app.get("/api/admin/orders", authenticate, requireAdmin, async (_req,res,next)=>{try{const r=await query(`SELECT o.*,COALESCE(json_agg(json_build_object('id',i.id,'product_id',i.product_id,'name',i.name,'price_yer',i.price_yer,'quantity',i.quantity,'size',i.size,'color',i.color,'fabric',i.fabric,'image_url',i.image_url)) FILTER (WHERE i.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`);res.json({orders:r.rows});}catch(e){next(e)}});
app.put("/api/admin/orders/:id/status", authenticate, requireAdmin, async (req,res,next)=>{try{const status=String(req.body.status||'').trim();if(!['pending','confirmed','completed','cancelled'].includes(status))return res.status(400).json({message:'حالة الطلب غير صالحة.'});const old=await query(`SELECT status FROM orders WHERE id=$1`,[req.params.id]);if(!old.rowCount)return res.status(404).json({message:'الطلب غير موجود.'});const r=await query(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[status,req.params.id]);let points={buyer:0,referral:0};if(status==='completed'&&old.rows[0].status!=='completed')points=await awardOrderPoints(req.params.id);res.json({order:r.rows[0],points});}catch(e){next(e)}});
app.get("/api/admin/notifications", authenticate, requireAdmin, async (_req,res,next)=>{try{const r=await query(`SELECT * FROM notifications ORDER BY created_at DESC`);res.json({notifications:r.rows});}catch(e){next(e)}});
app.post("/api/admin/notifications", authenticate, requireAdmin, async (req,res,next)=>{try{const r=await query(`INSERT INTO notifications(title,message,type,active) VALUES($1,$2,$3,$4) RETURNING *`,[String(req.body.title||'').trim(),String(req.body.message||'').trim(),String(req.body.type||'info'),req.body.active!==false]);res.status(201).json({notification:r.rows[0]});}catch(e){next(e)}});
app.put("/api/admin/notifications/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const r=await query(`UPDATE notifications SET title=$1,message=$2,type=$3,active=$4,updated_at=NOW() WHERE id=$5 RETURNING *`,[String(req.body.title||'').trim(),String(req.body.message||'').trim(),String(req.body.type||'info'),req.body.active!==false,req.params.id]);if(!r.rowCount)return res.status(404).json({message:'الإشعار غير موجود.'});res.json({notification:r.rows[0]});}catch(e){next(e)}});
app.delete("/api/admin/notifications/:id", authenticate, requireAdmin, async (req,res,next)=>{try{await query(`DELETE FROM notifications WHERE id=$1`,[req.params.id]);res.json({message:'تم حذف الإشعار.'});}catch(e){next(e)}});
app.post("/api/admin/products/:id/images", authenticate, requireAdmin, async (req,res,next)=>{try{const p=await query(`SELECT id,title,image_url,images FROM products WHERE id=$1`,[req.params.id]);if(!p.rowCount)return res.status(404).json({message:'المنتج غير موجود.'});const urls=await saveImageListToGitHub(req.body.image_data_list||[],p.rows[0].title);if(!urls.length)return res.status(400).json({message:'لم تصل صور جديدة.'});const images=uniqueStrings([...(p.rows[0].images||[]),...urls]);await query(`UPDATE products SET images=$1,updated_at=NOW() WHERE id=$2`,[images,req.params.id]);await publishToGitHub();res.json({images});}catch(e){next(e)}});
app.delete("/api/admin/products/:id/images", authenticate, requireAdmin, async (req,res,next)=>{try{const p=await query(`SELECT id,image_url,images FROM products WHERE id=$1`,[req.params.id]);if(!p.rowCount)return res.status(404).json({message:'المنتج غير موجود.'});const target=String(req.body.url||'');if(!target)return res.status(400).json({message:'حدد الصورة.'});let primary=p.rows[0].image_url, images=(p.rows[0].images||[]).filter(x=>x!==target);if(primary===target){primary=images.shift()||'';}if(!primary)return res.status(400).json({message:'يجب أن يبقى للمنتج صورة رئيسية.'});await query(`UPDATE products SET image_url=$1,images=$2,updated_at=NOW() WHERE id=$3`,[primary,images,req.params.id]);await publishToGitHub();res.json({image_url:primary,images});}catch(e){next(e)}});
app.post("/api/admin/products/repair-images", authenticate, requireAdmin, async (_req,res,next)=>{try{const r=await query(`SELECT id,title,image_url,images FROM products ORDER BY created_at ASC`);const report=[];for(const p of r.rows){const all=uniqueStrings([p.image_url,...(p.images||[])]);const replacements=new Map();for(const url of all){if(!/^https?:\/\//i.test(String(url||'')))continue;try{const rr=await fetch(url,{redirect:'follow'});if(!rr.ok)throw new Error(`HTTP ${rr.status}`);const ct=rr.headers.get('content-type')||'image/jpeg';if(!ct.startsWith('image/'))throw new Error('الرابط ليس صورة');const buf=Buffer.from(await rr.arrayBuffer());const ext=(ct.split('/')[1]||'jpeg').replace('jpeg','jpg').split(';')[0];const pathName=`public/images/products/${safeFileName(p.title)}-repair-${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;await githubPutFile(pathName,buf,`إصلاح صورة منتج: ${p.title}`);replacements.set(url,`/images/products/${pathName.split('/').pop()}`);}catch(e){report.push({product_id:p.id,url,status:'failed',error:e.message});}}
if(replacements.size){const primary=replacements.get(p.image_url)||p.image_url;const images=(p.images||[]).map(x=>replacements.get(x)||x);await query(`UPDATE products SET image_url=$1,images=$2,updated_at=NOW() WHERE id=$3`,[primary,images,p.id]);report.push({product_id:p.id,status:'repaired',count:replacements.size});}}
await publishToGitHub();res.json({message:'اكتملت محاولة إصلاح الصور.',report});}catch(e){next(e)}});

app.post("/api/admin/products", authenticate, requireAdmin, async (req,res,next)=>{try{const p=cleanProduct(req.body);if(!p.title||!p.price)return res.status(400).json({message:"أدخل اسم المنتج والسعر."});if(!p.image_url&&req.body.image_data){p.image_url=await saveImageToGitHub(req.body.image_data,p.title);}if(req.body.image_data_list?.length){p.images=uniqueStrings([...(p.images||[]),...(await saveImageListToGitHub(req.body.image_data_list,p.title))]);}if(!p.image_url)return res.status(400).json({message:"أضف صورة للمنتج."});const r=await query(`INSERT INTO products(title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,old_price,price,rating,reviews,tags,prep_time,badges,active,selected,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,[p.title,p.description,p.category,p.category_slugs,p.audience,p.image_url,p.images,p.sizes,p.colors,p.fabrics,p.old_price,p.price,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order]);await publishToGitHub();res.status(201).json({product:r.rows[0],message:"تم نشر المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.put("/api/admin/products/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const p=cleanProduct(req.body);if(!p.title||!p.price)return res.status(400).json({message:"أدخل اسم المنتج والسعر."});if(req.body.image_data)p.image_url=await saveImageToGitHub(req.body.image_data,p.title);if(req.body.image_data_list?.length){const oldImages=await query(`SELECT images FROM products WHERE id=$1`,[req.params.id]);p.images=uniqueStrings([...(oldImages.rows[0]?.images||[]),...(p.images||[]),...(await saveImageListToGitHub(req.body.image_data_list,p.title))]);}const r=await query(`UPDATE products SET title=$1,description=$2,category=$3,category_slugs=$4,audience=$5,image_url=COALESCE(NULLIF($6,''),image_url),images=$7,sizes=$8,colors=$9,fabrics=$10,old_price=$11,price=$12,rating=$13,reviews=$14,tags=$15,prep_time=$16,badges=$17,active=$18,selected=$19,sort_order=$20,updated_at=NOW() WHERE id=$21 RETURNING *`,[p.title,p.description,p.category,p.category_slugs,p.audience,p.image_url,p.images,p.sizes,p.colors,p.fabrics,p.old_price,p.price,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order,req.params.id]);if(!r.rowCount)return res.status(404).json({message:"المنتج غير موجود."});await publishToGitHub();res.json({product:r.rows[0],message:"تم تحديث المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.delete("/api/admin/products/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const r=await query("DELETE FROM products WHERE id=$1 RETURNING id",[req.params.id]);if(!r.rowCount)return res.status(404).json({message:"المنتج غير موجود."});await publishToGitHub();res.json({message:"تم حذف المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.post("/api/admin/github/publish", authenticate, requireAdmin, async (_req,res,next)=>{try{res.json({message:"تم نشر البيانات في GitHub.",github:await publishToGitHub()});}catch(e){next(e)}});
app.get("/api/admin/github/status", authenticate, requireAdmin, async (_req,res)=>{const c=githubConfig();res.json({connected:c.enabled,repository:c.enabled?`${c.owner}/${c.repo}`:"",branch:c.branch,path:c.pathName});});

async function saveImageToGitHub(dataUrl,title){const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);if(!m)throw new Error("صورة المنتج غير صالحة.");const ext=m[1].split("/")[1].replace("jpeg","jpg");const filePath=`public/images/products/${safeFileName(title)}-${Date.now()}.${ext}`;await githubPutFile(filePath,Buffer.from(m[2],"base64"),`إضافة صورة المنتج: ${title}`);const c=githubConfig();return `/${filePath.replace(/^public\//,"")}`;}

app.use(express.static(path.join(__dirname,"..","public")));
app.get("/{*splat}",(_req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({message:err.message||"حدث خطأ في الخادم."});});

async function ensureCoreAuthTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`CREATE TABLE IF NOT EXISTS users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    provider VARCHAR(20) NOT NULL DEFAULT 'local',
    provider_id VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    referral_code VARCHAR(32),
    points INTEGER NOT NULL DEFAULT 0
  )`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code) WHERE referral_code IS NOT NULL`);
  await query(`CREATE TABLE IF NOT EXISTS password_reset_tokens(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function ensureProductTable(){
  await query(`CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title VARCHAR(200) NOT NULL,description TEXT NOT NULL DEFAULT '',category VARCHAR(100) NOT NULL DEFAULT 'عام',category_slugs TEXT[] NOT NULL DEFAULT ARRAY['عام'],audience VARCHAR(20) NOT NULL DEFAULT 'women',image_url TEXT NOT NULL,images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],colors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],fabrics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],old_price NUMERIC(12,2),price NUMERIC(12,2) NOT NULL DEFAULT 0,rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,reviews INTEGER NOT NULL DEFAULT 0,tags TEXT NOT NULL DEFAULT '',prep_time INTEGER NOT NULL DEFAULT 10,badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],active BOOLEAN NOT NULL DEFAULT TRUE,selected BOOLEAN NOT NULL DEFAULT FALSE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(100)`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT ARRAY['عام']`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS fabrics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS selected BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`UPDATE products SET category_slugs=ARRAY[category] WHERE category_slugs IS NULL OR cardinality(category_slugs)=0`);
  await query(`UPDATE products SET badges=CASE WHEN badge IS NOT NULL AND badge<>'' THEN ARRAY[badge] ELSE ARRAY[]::TEXT[] END WHERE cardinality(badges)=0 AND badge IS NOT NULL`);
  await query(`CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(100) NOT NULL,slug VARCHAR(120) UNIQUE NOT NULL,image_url TEXT NOT NULL DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const count=await query(`SELECT COUNT(*)::int AS count FROM categories`); if(!count.rows[0].count){for(const [i,name] of ["عبايات","وصل حديثاً","الأكثر مبيعاً","العروض","إكسسوارات","أطقم"].entries()) await query(`INSERT INTO categories(name,slug,sort_order) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING`,[name,name,i]);}
  await query(`CREATE INDEX IF NOT EXISTS products_active_idx ON products(active,sort_order,created_at DESC)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)`); await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`); await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code) WHERE referral_code IS NOT NULL`);
  await query(`CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE SET NULL,status VARCHAR(30) NOT NULL DEFAULT 'pending',customer_name VARCHAR(150) NOT NULL,phone VARCHAR(50) NOT NULL,city VARCHAR(100) NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',currency VARCHAR(3) NOT NULL DEFAULT 'YER',total_yer NUMERIC(14,2) NOT NULL DEFAULT 0,referral_code VARCHAR(32),referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
  await query(`CREATE TABLE IF NOT EXISTS order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,product_id UUID REFERENCES products(id) ON DELETE SET NULL,name VARCHAR(200) NOT NULL,image_url TEXT NOT NULL DEFAULT '',price_yer NUMERIC(12,2) NOT NULL DEFAULT 0,quantity INTEGER NOT NULL DEFAULT 1,size VARCHAR(100) NOT NULL DEFAULT '',color VARCHAR(100) NOT NULL DEFAULT '',fabric VARCHAR(100) NOT NULL DEFAULT '')`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name VARCHAR(200) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_yer NUMERIC(12,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fabric VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)`);
  await query(`CREATE TABLE IF NOT EXISTS points_ledger(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,points INTEGER NOT NULL,reason VARCHAR(100) NOT NULL,order_id UUID REFERENCES orders(id) ON DELETE SET NULL,referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_order_reason_idx ON points_ledger(user_id,order_id,reason) WHERE order_id IS NOT NULL`);
  await query(`CREATE TABLE IF NOT EXISTS notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title VARCHAR(200) NOT NULL,message TEXT NOT NULL DEFAULT '',type VARCHAR(30) NOT NULL DEFAULT 'info',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // Upgrade notification tables created by older versions. CREATE TABLE IF NOT EXISTS
  // does not add missing columns to an existing table.
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(200)`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'info'`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`UPDATE notifications SET title=COALESCE(NULLIF(title,''),'إشعار') WHERE title IS NULL OR title=''`);
  await query(`UPDATE notifications SET message=COALESCE(message,'') WHERE message IS NULL`);
  await query(`UPDATE notifications SET type=COALESCE(NULLIF(type,''),'info') WHERE type IS NULL OR type=''`);
  await query(`UPDATE users SET referral_code='NESMA-'||UPPER(SUBSTRING(REPLACE(id::text,'-',''),1,6)) WHERE referral_code IS NULL`);
}

app.listen(port,async()=>{console.log(`Auth server running on http://localhost:${port}`);try{await ensureCoreAuthTables();await ensureProductTable();await ensureOrderSchema();console.log("Database auth/products/orders schema ready.")}catch(e){console.error("Database setup failed:",e);}});
