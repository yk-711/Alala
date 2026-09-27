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
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());
const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${port}`;
app.use(cors({ origin: frontendUrl, credentials: true }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } });

function isAdmin(req) {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(adminEmail && req.user?.email && String(req.user.email).toLowerCase() === adminEmail);
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
    badges, active: body.active !== false, selected: body.selected === true, sort_order: Number(body.sort_order || 0)
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
  const result = await query(`SELECT id,title,description,category,category_slugs,audience,image_url,old_price,price,rating,reviews,tags,prep_time,badges,active,selected,sort_order,created_at,updated_at FROM products ORDER BY sort_order ASC, created_at DESC`);
  const categories = await query(`SELECT id,name,slug,image_url,active,sort_order FROM categories ORDER BY sort_order ASC, name ASC`);
  const payload = { version: 1, generated_at: new Date().toISOString(), categories: categories.rows, products: result.rows };
  await githubPutFile(cfg.pathName, Buffer.from(JSON.stringify(payload, null, 2), "utf8"), "تحديث منتجات متجر سطول");
  return { path: cfg.pathName, products: result.rows.length, categories: categories.rows.length };
}

app.get("/api/health", async (_req, res) => { try { await query("SELECT 1"); res.json({ ok: true, database: "connected", github: githubConfig().enabled }); } catch { res.status(503).json({ ok: false, database: "unavailable", github: githubConfig().enabled }); } });
app.get("/api/auth/google", googleStart); app.get("/api/auth/google/callback", googleCallback);
app.post("/api/auth/register", authLimiter, register); app.post("/api/auth/login", authLimiter, login); app.post("/api/auth/logout", logout); app.get("/api/auth/me", authenticate, me); app.post("/api/auth/forgot-password", authLimiter, forgotPassword); app.post("/api/auth/reset-password", authLimiter, resetPassword);
app.get("/api/admin/me", authenticate, (req, res) => isAdmin(req) ? res.json({ ok: true, user: req.user }) : res.status(403).json({ message: "غير مصرح." }));

app.get("/api/products", async (_req, res, next) => { try { const r = await query(`SELECT id,title,description,category,category_slugs,audience,image_url,old_price,price,rating,reviews,tags,prep_time,badges,COALESCE(badges[1], badge) AS badge,active,selected,sort_order,created_at,updated_at FROM products WHERE active=true ORDER BY sort_order ASC,created_at DESC`); res.json({ products: r.rows }); } catch (e) { next(e); } });
app.get("/api/categories", async (_req, res, next) => { try { const r = await query(`SELECT * FROM categories WHERE active=true ORDER BY sort_order ASC,name ASC`); res.json({ categories: r.rows }); } catch (e) { next(e); } });

app.get("/api/admin/products", authenticate, requireAdmin, async (_req, res, next) => { try { const r = await query(`SELECT * FROM products ORDER BY sort_order ASC,created_at DESC`); res.json({ products: r.rows }); } catch (e) { next(e); } });
app.get("/api/admin/categories", authenticate, requireAdmin, async (_req, res, next) => { try { const r = await query(`SELECT * FROM categories ORDER BY sort_order ASC,name ASC`); res.json({ categories: r.rows }); } catch (e) { next(e); } });
app.post("/api/admin/categories", authenticate, requireAdmin, async (req,res,next)=>{try{const name=String(req.body.name||"").trim();const slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");if(!name||!slug)return res.status(400).json({message:"أدخل اسم القسم."});const r=await query(`INSERT INTO categories(name,slug,image_url,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0)]);res.status(201).json({category:r.rows[0]});}catch(e){next(e)}});
app.put("/api/admin/categories/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const name=String(req.body.name||"").trim();const slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");const r=await query(`UPDATE categories SET name=$1,slug=$2,image_url=$3,active=$4,sort_order=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0),req.params.id]);if(!r.rowCount)return res.status(404).json({message:"القسم غير موجود."});res.json({category:r.rows[0]});}catch(e){next(e)}});
app.delete("/api/admin/categories/:id", authenticate, requireAdmin, async (req,res,next)=>{try{await query("DELETE FROM categories WHERE id=$1",[req.params.id]);res.json({message:"تم حذف القسم."});}catch(e){next(e)}});

app.post("/api/admin/products", authenticate, requireAdmin, async (req,res,next)=>{try{const p=cleanProduct(req.body);if(!p.title||!p.price)return res.status(400).json({message:"أدخل اسم المنتج والسعر."});if(!p.image_url&&req.body.image_data){p.image_url=await saveImageToGitHub(req.body.image_data,p.title);}if(!p.image_url)return res.status(400).json({message:"أضف صورة للمنتج."});const r=await query(`INSERT INTO products(title,description,category,category_slugs,audience,image_url,old_price,price,rating,reviews,tags,prep_time,badges,active,selected,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[p.title,p.description,p.category,p.category_slugs,p.audience,p.image_url,p.old_price,p.price,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order]);await publishToGitHub();res.status(201).json({product:r.rows[0],message:"تم نشر المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.put("/api/admin/products/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const p=cleanProduct(req.body);if(!p.title||!p.price)return res.status(400).json({message:"أدخل اسم المنتج والسعر."});if(req.body.image_data)p.image_url=await saveImageToGitHub(req.body.image_data,p.title);const r=await query(`UPDATE products SET title=$1,description=$2,category=$3,category_slugs=$4,audience=$5,image_url=COALESCE(NULLIF($6,''),image_url),old_price=$7,price=$8,rating=$9,reviews=$10,tags=$11,prep_time=$12,badges=$13,active=$14,selected=$15,sort_order=$16,updated_at=NOW() WHERE id=$17 RETURNING *`,[p.title,p.description,p.category,p.category_slugs,p.audience,p.image_url,p.old_price,p.price,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order,req.params.id]);if(!r.rowCount)return res.status(404).json({message:"المنتج غير موجود."});await publishToGitHub();res.json({product:r.rows[0],message:"تم تحديث المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.delete("/api/admin/products/:id", authenticate, requireAdmin, async (req,res,next)=>{try{const r=await query("DELETE FROM products WHERE id=$1 RETURNING id",[req.params.id]);if(!r.rowCount)return res.status(404).json({message:"المنتج غير موجود."});await publishToGitHub();res.json({message:"تم حذف المنتج وتحديث GitHub."});}catch(e){next(e)}});
app.post("/api/admin/github/publish", authenticate, requireAdmin, async (_req,res,next)=>{try{res.json({message:"تم نشر البيانات في GitHub.",github:await publishToGitHub()});}catch(e){next(e)}});
app.get("/api/admin/github/status", authenticate, requireAdmin, async (_req,res)=>{const c=githubConfig();res.json({connected:c.enabled,repository:c.enabled?`${c.owner}/${c.repo}`:"",branch:c.branch,path:c.pathName});});

async function saveImageToGitHub(dataUrl,title){const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);if(!m)throw new Error("صورة المنتج غير صالحة.");const ext=m[1].split("/")[1].replace("jpeg","jpg");const filePath=`public/images/products/${safeFileName(title)}-${Date.now()}.${ext}`;await githubPutFile(filePath,Buffer.from(m[2],"base64"),`إضافة صورة المنتج: ${title}`);const c=githubConfig();return `/${filePath.replace(/^public\//,"")}`;}

app.use(express.static(path.join(__dirname,"..","public")));
app.get("/{*splat}",(_req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({message:err.message||"حدث خطأ في الخادم."});});

async function ensureProductTable(){
  await query(`CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title VARCHAR(200) NOT NULL,description TEXT NOT NULL DEFAULT '',category VARCHAR(100) NOT NULL DEFAULT 'عام',category_slugs TEXT[] NOT NULL DEFAULT ARRAY['عام'],audience VARCHAR(20) NOT NULL DEFAULT 'women',image_url TEXT NOT NULL,old_price NUMERIC(12,2),price NUMERIC(12,2) NOT NULL DEFAULT 0,rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,reviews INTEGER NOT NULL DEFAULT 0,tags TEXT NOT NULL DEFAULT '',prep_time INTEGER NOT NULL DEFAULT 10,badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],active BOOLEAN NOT NULL DEFAULT TRUE,selected BOOLEAN NOT NULL DEFAULT FALSE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT ARRAY['عام']`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`); await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS selected BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`UPDATE products SET category_slugs=ARRAY[category] WHERE category_slugs IS NULL OR cardinality(category_slugs)=0`);
  await query(`UPDATE products SET badges=CASE WHEN badge IS NOT NULL AND badge<>'' THEN ARRAY[badge] ELSE ARRAY[]::TEXT[] END WHERE cardinality(badges)=0 AND badge IS NOT NULL`);
  await query(`CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(100) NOT NULL,slug VARCHAR(120) UNIQUE NOT NULL,image_url TEXT NOT NULL DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const count=await query(`SELECT COUNT(*)::int AS count FROM categories`); if(!count.rows[0].count){for(const [i,name] of ["عبايات","وصل حديثاً","الأكثر مبيعاً","العروض","إكسسوارات","أطقم"].entries()) await query(`INSERT INTO categories(name,slug,sort_order) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING`,[name,name,i]);}
  await query(`CREATE INDEX IF NOT EXISTS products_active_idx ON products(active,sort_order,created_at DESC)`);
}

app.listen(port,async()=>{console.log(`Auth server running on http://localhost:${port}`);try{await ensureProductTable();console.log("Products/categories tables ready.")}catch(e){console.error("Database setup failed:",e.message);}});
