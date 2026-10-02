
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { query, pool } from "./db.js";
import { register, login, logout, me, forgotPassword, resetPassword, authenticate } from "./auth.js";
import { googleStart, googleCallback } from "./auth.js";

const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express();
app.set("trust proxy",1);
app.disable("x-powered-by");
const port=Number(process.env.PORT||3000);
app.use(express.json({limit:"30mb"}));
app.use(cookieParser());

const configuredFrontend=String(process.env.FRONTEND_URL||"").trim().replace(/\/$/,"");
const allowedOrigins=new Set(["https://nesma-store.pages.dev",configuredFrontend,`http://localhost:${port}`,`http://127.0.0.1:${port}`].filter(Boolean));
app.use(cors({
  origin(origin,cb){ if(!origin||allowedOrigins.has(origin))return cb(null,true); return cb(new Error("CORS origin not allowed.")); },
  credentials:true
}));

const authLimiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:"draft-8",legacyHeaders:false,message:{message:"محاولات كثيرة. حاول مرة أخرى بعد قليل."}});

function isAdmin(req){const email=String(process.env.ADMIN_EMAIL||"").trim().toLowerCase();return Boolean(email&&req.user?.email&&String(req.user.email).toLowerCase()===email);}
function requireAdmin(req,res,next){if(!req.user)return res.status(401).json({message:"يجب تسجيل الدخول أولاً."});if(!isAdmin(req))return res.status(403).json({message:"هذه الصفحة مخصصة لمدير المتجر."});next();}
function arr(v){if(Array.isArray(v))return v.map(x=>String(x).trim()).filter(Boolean);return String(v||"").split(",").map(x=>x.trim()).filter(Boolean);}
function safeNum(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function cleanProduct(body){
  const categorySlugs=arr(body.category_slugs||body.categories), badges=arr(body.badges||body.badge);
  return {
    title:String(body.title||"").trim().slice(0,200), description:String(body.description||"").trim(),
    category:String(body.category||categorySlugs[0]||"عبايات").trim().slice(0,100),
    category_slugs:categorySlugs.length?categorySlugs:["عبايات"],
    audience:"women",
    image_url:String(body.image_url||"").trim(),
    images:Array.isArray(body.images)?body.images.map(x=>String(x).trim()).filter(Boolean):[],
    sizes:arr(body.sizes),colors:arr(body.colors),fabrics:arr(body.fabrics),
    old_price_yer:body.old_price_yer===""||body.old_price_yer==null?null:safeNum(body.old_price_yer,null),
    price_yer:safeNum(body.price_yer,0),
    rating:safeNum(body.rating,5),reviews:Math.max(0,Math.round(safeNum(body.reviews,0))),
    tags:String(body.tags||"").trim(),prep_time:Math.max(0,Math.round(safeNum(body.prep_time,10))),
    badges,active:body.active!==false,selected:body.selected===true,sort_order:Math.round(safeNum(body.sort_order,0))
  };
}

function githubConfig(){
  const token=String(process.env.GITHUB_TOKEN||"").trim(),owner=String(process.env.GITHUB_OWNER||"").trim(),repo=String(process.env.GITHUB_REPO||"").trim();
  return {token,owner,repo,branch:String(process.env.GITHUB_BRANCH||"main").trim(),pathName:String(process.env.GITHUB_PRODUCTS_PATH||"public/data/products.json").trim(),enabled:!!(token&&owner&&repo)};
}
async function githubRequest(endpoint,options={}){
  const cfg=githubConfig(); if(!cfg.enabled)throw new Error("ربط GitHub غير مكتمل.");
  const r=await fetch(`https://api.github.com${endpoint}`,{...options,headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${cfg.token}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json",...(options.headers||{})}});
  const data=await r.json().catch(()=>({})); if(!r.ok)throw new Error(data.message||`GitHub API ${r.status}`); return data;
}
function safeFileName(name){return String(name||"product").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,70)||"product";}
async function githubPutFile(filePath,buffer,message){
  const cfg=githubConfig();let sha=null;
  try{sha=(await githubRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${encodeURIComponent(cfg.branch)}`)).sha;}catch(e){if(!String(e.message).includes("Not Found"))throw e;}
  const body={message,content:buffer.toString("base64"),branch:cfg.branch};if(sha)body.sha=sha;
  return githubRequest(`/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}`,{method:"PUT",body:JSON.stringify(body)});
}
async function saveImagesToGitHub(dataUrls,title){
  const out=[];
  for(let i=0;i<dataUrls.length&&i<8;i++){
    const m=String(dataUrls[i]||"").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if(!m)throw new Error("إحدى الصور غير صالحة.");
    const ext=m[1].split("/")[1].replace("jpeg","jpg"),filePath=`public/images/products/${safeFileName(title)}-${Date.now()}-${i}.${ext}`;
    await githubPutFile(filePath,Buffer.from(m[2],"base64"),`إضافة صورة المنتج: ${title}`);
    out.push(`/${filePath.replace(/^public\//,"")}`);
  }
  return out;
}
async function publishToGitHub(){
  const cfg=githubConfig();if(!cfg.enabled)throw new Error("GitHub غير مربوط بعد.");
  const [products,categories]=await Promise.all([
    query(`SELECT id,title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,price_yer,old_price_yer,rating,reviews,tags,prep_time,badges,active,selected,sort_order,created_at,updated_at FROM products ORDER BY sort_order ASC,created_at DESC`),
    query(`SELECT id,name,slug,image_url,active,sort_order FROM categories ORDER BY sort_order ASC,name ASC`)
  ]);
  const payload={version:2,generated_at:new Date().toISOString(),base_currency:"YER",exchange_rates:{yer:1,sar:140,usd:532},categories:categories.rows,products:products.rows};
  await githubPutFile(cfg.pathName,Buffer.from(JSON.stringify(payload,null,2),"utf8"),"تحديث منتجات متجر نسمة");
  return {path:cfg.pathName,products:products.rows.length,categories:categories.rows.length};
}

app.get("/api/health",async(_req,res)=>{try{await query("SELECT 1");res.json({ok:true,database:"connected",github:githubConfig().enabled});}catch(e){res.status(503).json({ok:false,database:"unavailable",github:githubConfig().enabled});}});
app.get("/api/auth/google",googleStart);app.get("/api/auth/google/callback",googleCallback);
app.post("/api/auth/register",authLimiter,register);app.post("/api/auth/login",authLimiter,login);app.post("/api/auth/logout",logout);app.get("/api/auth/me",authenticate,me);app.post("/api/auth/forgot-password",authLimiter,forgotPassword);app.post("/api/auth/reset-password",authLimiter,resetPassword);

app.get("/api/products",async(_req,res,next)=>{try{const r=await query(`SELECT id,title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,price_yer,old_price_yer,rating,reviews,tags,prep_time,badges,active,selected,sort_order,created_at,updated_at FROM products WHERE active=true ORDER BY sort_order ASC,created_at DESC`);res.json({base_currency:"YER",exchange_rates:{yer:1,sar:140,usd:532},products:r.rows});}catch(e){next(e);}});
app.get("/api/categories",async(_req,res,next)=>{try{const r=await query(`SELECT * FROM categories WHERE active=true ORDER BY sort_order ASC,name ASC`);res.json({categories:r.rows});}catch(e){next(e);}});
app.get("/api/notifications",async(_req,res,next)=>{try{const r=await query(`SELECT id,title,message,link,image_url FROM notifications WHERE active=true AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) ORDER BY sort_order ASC,created_at DESC LIMIT 10`);res.json({notifications:r.rows});}catch(e){next(e);}});

app.get("/api/image",async(req,res)=>{
  try{
    const raw=String(req.query.url||"");const u=new URL(raw);
    const allowed=["images.pexels.com","images.unsplash.com","i.imgur.com"];
    if(u.protocol!=="https:"||!allowed.includes(u.hostname))return res.status(400).end();
    const r=await fetch(u,{headers:{"User-Agent":"Nesma-Store-Image-Proxy/1.0"}});
    if(!r.ok)return res.status(r.status).end();
    const type=r.headers.get("content-type")||"image/jpeg";if(!type.startsWith("image/"))return res.status(415).end();
    res.setHeader("Content-Type",type);res.setHeader("Cache-Control","public,max-age=86400,stale-while-revalidate=604800");
    res.send(Buffer.from(await r.arrayBuffer()));
  }catch{res.status(400).end();}
});

app.get("/api/admin/me",authenticate,(req,res)=>isAdmin(req)?res.json({ok:true,user:req.user}):res.status(403).json({message:"غير مصرح."}));
app.get("/api/account/summary",authenticate,async(req,res,next)=>{try{
  const [u,o,l]=await Promise.all([
    query("SELECT id,name,email,provider,referral_code,points FROM users WHERE id=$1",[req.user.id]),
    query("SELECT id,total_yer,status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",[req.user.id]),
    query("SELECT points,reason,created_at FROM points_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15",[req.user.id])
  ]);res.json({user:u.rows[0],orders:o.rows,ledger:l.rows});
}catch(e){next(e);}});

app.get("/api/admin/products",authenticate,requireAdmin,async(_req,res,next)=>{try{res.json({products:(await query("SELECT * FROM products ORDER BY sort_order ASC,created_at DESC")).rows});}catch(e){next(e);}});
app.get("/api/admin/categories",authenticate,requireAdmin,async(_req,res,next)=>{try{res.json({categories:(await query("SELECT * FROM categories ORDER BY sort_order ASC,name ASC")).rows});}catch(e){next(e);}});
app.post("/api/admin/categories",authenticate,requireAdmin,async(req,res,next)=>{try{
  const name=String(req.body.name||"").trim(),slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");
  if(!name||!slug)return res.status(400).json({message:"أدخل اسم القسم."});
  const r=await query(`INSERT INTO categories(name,slug,image_url,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0)]);
  await publishToGitHub();res.status(201).json({category:r.rows[0]});
}catch(e){next(e);}});
app.put("/api/admin/categories/:id",authenticate,requireAdmin,async(req,res,next)=>{try{
  const name=String(req.body.name||"").trim(),slug=String(req.body.slug||name).trim().toLowerCase().replace(/\s+/g,"-");
  const r=await query(`UPDATE categories SET name=$1,slug=$2,image_url=$3,active=$4,sort_order=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[name,slug,String(req.body.image_url||""),req.body.active!==false,Number(req.body.sort_order||0),req.params.id]);
  if(!r.rowCount)return res.status(404).json({message:"القسم غير موجود."});await publishToGitHub();res.json({category:r.rows[0]});
}catch(e){next(e);}});
app.delete("/api/admin/categories/:id",authenticate,requireAdmin,async(req,res,next)=>{try{await query("DELETE FROM categories WHERE id=$1",[req.params.id]);await publishToGitHub();res.json({message:"تم حذف القسم."});}catch(e){next(e);}});

app.get("/api/admin/notifications",authenticate,requireAdmin,async(_req,res,next)=>{try{res.json({notifications:(await query("SELECT * FROM notifications ORDER BY sort_order ASC,created_at DESC")).rows});}catch(e){next(e);}});
app.post("/api/admin/notifications",authenticate,requireAdmin,async(req,res,next)=>{try{const n=req.body;const r=await query(`INSERT INTO notifications(title,message,link,image_url,active,starts_at,ends_at,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[String(n.title||"").trim(),String(n.message||"").trim(),String(n.link||"").trim(),String(n.image_url||"").trim(),n.active!==false,n.starts_at||null,n.ends_at||null,Number(n.sort_order||0)]);res.status(201).json({notification:r.rows[0]});}catch(e){next(e);}});
app.put("/api/admin/notifications/:id",authenticate,requireAdmin,async(req,res,next)=>{try{const n=req.body;const r=await query(`UPDATE notifications SET title=$1,message=$2,link=$3,image_url=$4,active=$5,starts_at=$6,ends_at=$7,sort_order=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,[String(n.title||"").trim(),String(n.message||"").trim(),String(n.link||"").trim(),String(n.image_url||"").trim(),n.active!==false,n.starts_at||null,n.ends_at||null,Number(n.sort_order||0),req.params.id]);if(!r.rowCount)return res.status(404).json({message:"الإشعار غير موجود."});res.json({notification:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/admin/notifications/:id",authenticate,requireAdmin,async(req,res,next)=>{try{await query("DELETE FROM notifications WHERE id=$1",[req.params.id]);res.json({message:"تم حذف الإشعار."});}catch(e){next(e);}});

app.post("/api/admin/products",authenticate,requireAdmin,async(req,res,next)=>{try{
  const p=cleanProduct(req.body);if(!p.title||p.price_yer<=0)return res.status(400).json({message:"أدخل اسم المنتج وسعره بالريال اليمني."});
  if(Array.isArray(req.body.image_data_list)&&req.body.image_data_list.length){p.images=await saveImagesToGitHub(req.body.image_data_list,p.title);p.image_url=p.images[0];}
  else if(req.body.image_data&& !p.image_url){p.images=await saveImagesToGitHub([req.body.image_data],p.title);p.image_url=p.images[0];}
  if(!p.image_url)return res.status(400).json({message:"أضف صورة واحدة على الأقل للمنتج."});
  if(!p.images.length)p.images=[p.image_url];
  const r=await query(`INSERT INTO products(title,description,category,category_slugs,audience,image_url,images,sizes,colors,fabrics,price_yer,old_price_yer,price,old_price,rating,reviews,tags,prep_time,badges,active,selected,sort_order) VALUES($1,$2,$3,$4,'women',$5,$6,$7,$8,$9,$10,$11,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,[p.title,p.description,p.category,p.category_slugs,p.image_url,JSON.stringify(p.images),p.sizes,p.colors,p.fabrics,p.price_yer,p.old_price_yer,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order]);
  await publishToGitHub();res.status(201).json({product:r.rows[0],message:"تم حفظ المنتج ونشره."});
}catch(e){next(e);}});

app.put("/api/admin/products/:id",authenticate,requireAdmin,async(req,res,next)=>{try{
  const p=cleanProduct(req.body);if(!p.title||p.price_yer<=0)return res.status(400).json({message:"أدخل اسم المنتج وسعره بالريال اليمني."});
  let image_url=p.image_url,images=p.images;
  if(Array.isArray(req.body.image_data_list)&&req.body.image_data_list.length){images=await saveImagesToGitHub(req.body.image_data_list,p.title);image_url=images[0];}
  const current=await query("SELECT image_url,images FROM products WHERE id=$1",[req.params.id]);if(!current.rowCount)return res.status(404).json({message:"المنتج غير موجود."});
  if(!images.length)images=Array.isArray(current.rows[0].images)?current.rows[0].images:(current.rows[0].image_url?[current.rows[0].image_url]:[]);
  if(!image_url)image_url=images[0]||current.rows[0].image_url;
  const r=await query(`UPDATE products SET title=$1,description=$2,category=$3,category_slugs=$4,image_url=$5,images=$6,sizes=$7,colors=$8,fabrics=$9,price_yer=$10,old_price_yer=$11,price=$10,old_price=$11,rating=$12,reviews=$13,tags=$14,prep_time=$15,badges=$16,active=$17,selected=$18,sort_order=$19,updated_at=NOW() WHERE id=$20 RETURNING *`,[p.title,p.description,p.category,p.category_slugs,image_url,JSON.stringify(images),p.sizes,p.colors,p.fabrics,p.price_yer,p.old_price_yer,p.rating,p.reviews,p.tags,p.prep_time,p.badges,p.active,p.selected,p.sort_order,req.params.id]);
  await publishToGitHub();res.json({product:r.rows[0],message:"تم تحديث المنتج ونشره."});
}catch(e){next(e);}});
app.delete("/api/admin/products/:id",authenticate,requireAdmin,async(req,res,next)=>{try{const r=await query("DELETE FROM products WHERE id=$1 RETURNING id",[req.params.id]);if(!r.rowCount)return res.status(404).json({message:"المنتج غير موجود."});await publishToGitHub();res.json({message:"تم حذف المنتج ونشر التحديث."});}catch(e){next(e);}});
app.post("/api/admin/github/publish",authenticate,requireAdmin,async(_req,res,next)=>{try{res.json({message:"تم نشر البيانات في GitHub.",github:await publishToGitHub()});}catch(e){next(e);}});
app.get("/api/admin/github/status",authenticate,requireAdmin,async(_req,res)=>{const c=githubConfig();res.json({connected:c.enabled,repository:c.enabled?`${c.owner}/${c.repo}`:"",branch:c.branch,path:c.pathName});});

app.post("/api/orders",async(req,res,next)=>{try{
  const {customer_name,phone,city,address,notes,currency="yer",items=[]}=req.body;
  if(!String(customer_name||"").trim()||!String(phone||"").trim()||!Array.isArray(items)||!items.length)return res.status(400).json({message:"أكمل بيانات العميل وأضف منتجاً واحداً على الأقل."});
  const ids=[...new Set(items.map(x=>x.id).filter(Boolean))];const pr=await query("SELECT id,title,image_url,price_yer,sizes,colors,fabrics FROM products WHERE active=true AND id=ANY($1::uuid[])",[ids]);
  const map=new Map(pr.rows.map(x=>[String(x.id),x]));let total=0,normalized=[];
  for(const item of items){
    const p=map.get(String(item.id));if(!p)continue;const qty=Math.max(1,Math.min(99,Math.round(Number(item.qty)||1)));const unit=Number(p.price_yer||0);total+=unit*qty;
    normalized.push({p,qty,size:String(item.size||""),color:String(item.color||""),fabric:String(item.fabric||"")});
  }
  if(!normalized.length)return res.status(400).json({message:"المنتجات المحددة غير متاحة حالياً."});
  const userId=await getOptionalUserId(req);
  const order=await query(`INSERT INTO orders(user_id,customer_name,phone,city,address,notes,currency,total_yer) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,total_yer,created_at`,[userId,customer_name.trim(),phone.trim(),String(city||"").trim(),String(address||"").trim(),String(notes||"").trim(),["yer","sar","usd"].includes(currency)?currency:"yer",total]);
  for(const x of normalized)await query(`INSERT INTO order_items(order_id,product_id,title,image_url,unit_price_yer,qty,size,color,fabric) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[order.rows[0].id,x.p.id,x.p.title,x.p.image_url,x.p.price_yer,x.qty,x.size,x.color,x.fabric]);
  let points=0;
  if(userId){
    points=Math.floor(total/1000);
    if(points>0){await query("UPDATE users SET points=points+$1,updated_at=NOW() WHERE id=$2",[points,userId]);await query("INSERT INTO points_ledger(user_id,points,reason,order_id) VALUES($1,$2,$3,$4)",[userId,points,"نقاط شراء",order.rows[0].id]);}
    await query("UPDATE orders SET points_awarded=TRUE WHERE id=$1",[order.rows[0].id]);
  }
  res.status(201).json({order_id:order.rows[0].id,total_yer:total,points,display_total:total/({yer:1,sar:140,usd:532}[currency]||1)});
}catch(e){next(e);}});

async function getOptionalUserId(req){
  try{
    const token=req.cookies?.auth_token;if(!token)return null;
    const jwt=(await import("jsonwebtoken")).default;const p=jwt.verify(token,process.env.JWT_SECRET);return p.sub||null;
  }catch{return null;}
}

async function ensureDatabase(){
  const statements=[
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(40) UNIQUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT ARRAY['عبايات']`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS selected BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS fabrics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS price_yer NUMERIC(12,2)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price_yer NUMERIC(12,2)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price NUMERIC(12,2)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(100)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'women'`,
    `CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(100) NOT NULL,slug VARCHAR(120) UNIQUE NOT NULL,image_url TEXT NOT NULL DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title VARCHAR(160) NOT NULL,message TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',image_url TEXT NOT NULL DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,sort_order INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS points_ledger(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,points INTEGER NOT NULL,reason VARCHAR(160) NOT NULL,order_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,customer_name VARCHAR(120) NOT NULL,phone VARCHAR(40) NOT NULL,city VARCHAR(120) NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',currency VARCHAR(10) NOT NULL DEFAULT 'yer',total_yer NUMERIC(12,2) NOT NULL DEFAULT 0,status VARCHAR(30) NOT NULL DEFAULT 'pending',points_awarded BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,product_id UUID,title VARCHAR(200) NOT NULL,image_url TEXT NOT NULL DEFAULT '',unit_price_yer NUMERIC(12,2) NOT NULL DEFAULT 0,qty INTEGER NOT NULL DEFAULT 1,size VARCHAR(80) NOT NULL DEFAULT '',color VARCHAR(100) NOT NULL DEFAULT '',fabric VARCHAR(120) NOT NULL DEFAULT '')`
  ];
  for(const s of statements)await query(s);
  await query(`UPDATE products SET price_yer=COALESCE(price_yer,price*140),old_price_yer=CASE WHEN old_price_yer IS NULL AND old_price IS NOT NULL THEN old_price*140 ELSE old_price_yer END`);
  await query(`UPDATE products SET images=CASE WHEN images='[]'::jsonb AND image_url<>'' THEN jsonb_build_array(image_url) ELSE images END`);
  const users=await query("SELECT id FROM users WHERE referral_code IS NULL");for(const u of users.rows){let code=`NESMA-${u.id.replace(/-/g,"").slice(0,10).toUpperCase()}`;await query("UPDATE users SET referral_code=$1 WHERE id=$2",[code,u.id]);}
  const count=await query("SELECT COUNT(*)::int AS count FROM categories");if(!count.rows[0].count){
    const cats=[["عبايات","abayas"],["عبايات سوداء","black-abayas"],["عبايات ملونة","colored-abayas"],["وصل حديثاً","new-arrivals"],["الأكثر مبيعاً","best-sellers"],["العروض","offers"]];
    for(const [i,c] of cats.entries())await query("INSERT INTO categories(name,slug,sort_order) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING",[c[0],c[1],i]);
  }
}
app.use(express.static(path.join(__dirname,"..","public")));
app.get("/{*splat}",(_req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({message:err.message||"حدث خطأ في الخادم."});});
app.listen(port,async()=>{console.log(`Nesma server running on ${port}`);try{await ensureDatabase();console.log("Database ready.");}catch(e){console.error("Database setup failed:",e.message);}});
