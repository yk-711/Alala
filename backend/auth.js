
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";
import { OAuth2Client } from "google-auth-library";

const PASSWORD_ROUNDS = 12;
const REFERRER_BONUS = Number(process.env.REFERRER_BONUS_POINTS || 100);
const NEW_MEMBER_BONUS = Number(process.env.NEW_MEMBER_BONUS_POINTS || 100);

function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function referralCode() { return `NESMA-${randomBytes(5).toString("hex").toUpperCase()}`; }
async function uniqueReferralCode() {
  for (let i = 0; i < 8; i++) {
    const code = referralCode();
    const exists = await query("SELECT 1 FROM users WHERE referral_code=$1 LIMIT 1", [code]);
    if (!exists.rowCount) return code;
  }
  throw new Error("تعذر إنشاء رمز الإحالة.");
}
function publicUser(user) {
  return { id:user.id, name:user.name, email:user.email, provider:user.provider, emailVerified:user.email_verified, createdAt:user.created_at };
}
function sessionCookie(res, user, remember=true) {
  const expiresIn = remember ? "30d" : (process.env.JWT_EXPIRES_IN || "7d");
  const token = jwt.sign({ sub:user.id, type:"session" }, process.env.JWT_SECRET, { expiresIn });
  res.cookie("auth_token", token, {
    httpOnly:true, secure:true, sameSite:"none",
    maxAge:remember ? 30*24*60*60*1000 : 7*24*60*60*1000, path:"/"
  });
}
function clearSession(res) {
  res.clearCookie("auth_token", { httpOnly:true, secure:true, sameSite:"none", path:"/" });
}

export async function register(req,res,next) {
  try {
    const { name,email,password,referral_code } = req.body;
    const cleanName=String(name||"").trim(), cleanEmail=normalizeEmail(email);
    if(cleanName.length<2||cleanName.length>100)return res.status(400).json({message:"الاسم غير صالح."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))return res.status(400).json({message:"البريد الإلكتروني غير صالح."});
    if(typeof password!=="string"||password.length<8||password.length>128)return res.status(400).json({message:"كلمة المرور يجب أن تكون بين 8 و128 حرفاً."});
    const existing=await query("SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",[cleanEmail]);
    if(existing.rowCount)return res.status(409).json({message:"هذا البريد الإلكتروني مستخدم بالفعل."});
    const refCode=String(referral_code||"").trim().toUpperCase();
    const ref=refCode?await query("SELECT id FROM users WHERE referral_code=$1 LIMIT 1",[refCode]):{rowCount:0};
    const passwordHash=await bcrypt.hash(password,PASSWORD_ROUNDS);
    const myCode=await uniqueReferralCode();
    const created=await query(
      `INSERT INTO users(name,email,password_hash,provider,referral_code,referred_by,points)
       VALUES($1,$2,$3,'local',$4,$5,$6)
       RETURNING id,name,email,provider,email_verified,created_at,referral_code,points`,
      [cleanName,cleanEmail,passwordHash,myCode,ref.rowCount?ref.rows[0].id:null,ref.rowCount?NEW_MEMBER_BONUS:0]
    );
    const user=created.rows[0];
    if(ref.rowCount){
      await query("UPDATE users SET points=points+$1,updated_at=NOW() WHERE id=$2",[REFERRER_BONUS,ref.rows[0].id]);
      await query("INSERT INTO points_ledger(user_id,points,reason) VALUES($1,$2,$3)",[user.id,NEW_MEMBER_BONUS,"مكافأة التسجيل عبر الإحالة"]);
      await query("INSERT INTO points_ledger(user_id,points,reason) VALUES($1,$2,$3)",[ref.rows[0].id,REFERRER_BONUS,"مكافأة إحالة عضو جديد"]);
    }
    sessionCookie(res,user,true);
    return res.status(201).json({message:"تم إنشاء الحساب وتسجيل الدخول بنجاح.",user:publicUser(user),redirect:"/account.html"});
  } catch(e){ next(e); }
}

export async function login(req,res) {
  const {email,password,remember}=req.body, cleanEmail=normalizeEmail(email);
  if(!cleanEmail||typeof password!=="string")return res.status(400).json({message:"أدخل البريد الإلكتروني وكلمة المرور."});
  const result=await query(`SELECT id,name,email,password_hash,provider,email_verified,created_at,referral_code,points FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,[cleanEmail]);
  if(!result.rowCount||!result.rows[0].password_hash)return res.status(401).json({message:"البريد الإلكتروني أو كلمة المرور غير صحيحة."});
  const user=result.rows[0], valid=await bcrypt.compare(password,user.password_hash);
  if(!valid)return res.status(401).json({message:"البريد الإلكتروني أو كلمة المرور غير صحيحة."});
  sessionCookie(res,user,remember!==false);
  return res.json({message:"تم تسجيل الدخول بنجاح.",user:publicUser(user),redirect:"/account.html"});
}

export async function logout(req,res){ clearSession(res); return res.json({message:"تم تسجيل الخروج."}); }

export async function me(req,res){ if(!req.user)return res.status(401).json({message:"غير مسجل الدخول."}); return res.json({user:publicUser(req.user)}); }

export async function forgotPassword(req,res,next) {
  const email=normalizeEmail(req.body.email), generic="إذا كان البريد مرتبطاً بحساب، فستصلك تعليمات الاستعادة.";
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.json({message:generic});
  try {
    const result=await query("SELECT id,email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",[email]);
    if(!result.rowCount)return res.json({message:generic});
    const raw=randomBytes(32).toString("hex"), hash=createHash("sha256").update(raw).digest("hex");
    await query("DELETE FROM password_reset_tokens WHERE user_id=$1 AND (used_at IS NOT NULL OR expires_at<=NOW())",[result.rows[0].id]);
    await query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[result.rows[0].id,hash]);
    const frontend=String(process.env.FRONTEND_URL||"https://nesma-store.pages.dev").replace(/\/$/,"");
    const resetUrl=`${frontend}/reset-password.html?token=${raw}`;
    const apiKey=process.env.BREVO_API_KEY||process.env.SMTP_PASS, mailFrom=process.env.MAIL_FROM||process.env.SMTP_USER;
    const senderName=process.env.SENDER_NAME||process.env.MAIL_FROM_NAME||"متجر نسمة";
    if(apiKey&&mailFrom){
      const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{accept:"application/json","api-key":apiKey,"content-type":"application/json"},body:JSON.stringify({sender:{name:senderName,email:mailFrom},to:[{email}],subject:`إعادة تعيين كلمة المرور | ${senderName}`,htmlContent:`<div dir="rtl" style="font-family:Arial;line-height:1.8"><h2>${senderName}</h2><p>اضغط على الزر لإعادة تعيين كلمة المرور.</p><a href="${resetUrl}">تعيين كلمة المرور</a></div>`})});
      if(!response.ok)console.error("Brevo API Error",await response.text());
    } else if(process.env.NODE_ENV!=="production") console.log("DEV reset URL:",resetUrl);
    return res.json({message:generic});
  } catch(e){next(e);}
}

export async function resetPassword(req,res) {
  const {token,password}=req.body;
  if(typeof token!=="string"||typeof password!=="string"||password.length<8)return res.status(400).json({message:"بيانات استعادة كلمة المرور غير صالحة."});
  const hash=createHash("sha256").update(token).digest("hex");
  const result=await query(`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() LIMIT 1`,[hash]);
  if(!result.rowCount)return res.status(400).json({message:"الرابط غير صالح أو منتهي الصلاحية."});
  const passwordHash=await bcrypt.hash(password,PASSWORD_ROUNDS);
  await query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[passwordHash,result.rows[0].user_id]);
  await query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1",[result.rows[0].id]);
  return res.json({message:"تم تغيير كلمة المرور بنجاح."});
}

export function authenticate(req,res,next) {
  try {
    const token=req.cookies.auth_token;
    if(!token)return res.status(401).json({message:"غير مسجل الدخول."});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    query(`SELECT id,name,email,provider,email_verified,created_at,referral_code,points FROM users WHERE id=$1 LIMIT 1`,[payload.sub]).then(r=>{
      if(!r.rowCount)return res.status(401).json({message:"الحساب غير موجود."});
      req.user=r.rows[0]; next();
    }).catch(next);
  } catch { return res.status(401).json({message:"جلسة الدخول غير صالحة أو منتهية."}); }
}

function googleClient() {
  const {GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_CALLBACK_URL}=process.env;
  if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!GOOGLE_CALLBACK_URL)return null;
  return new OAuth2Client(GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_CALLBACK_URL);
}
function frontendUrl(req){return String(process.env.FRONTEND_URL||"https://nesma-store.pages.dev").replace(/\/$/,"");}
function accountRedirectUrl(req){return `${frontendUrl(req)}/account.html`;}
function loginRedirectUrl(req,error){return `${frontendUrl(req)}/login.html?error=${encodeURIComponent(error)}`;}

export function googleStart(req,res) {
  const client=googleClient();
  if(!client)return res.status(503).send("تسجيل الدخول عبر Google غير مفعّل بعد.");
  const state=randomBytes(32).toString("hex");
  const ref=String(req.query.ref||"").trim().toUpperCase();
  res.cookie("google_oauth_state",state,{httpOnly:true,secure:true,sameSite:"none",maxAge:10*60*1000,path:"/"});
  if(ref)res.cookie("google_referral_code",ref,{httpOnly:true,secure:true,sameSite:"none",maxAge:10*60*1000,path:"/"});
  const url=client.generateAuthUrl({access_type:"online",scope:["openid","email","profile"],state,prompt:"select_account"});
  res.redirect(url);
}

export async function googleCallback(req,res) {
  const client=googleClient(), stateCookie=req.cookies.google_oauth_state, referral=req.cookies.google_referral_code, {code,state,error}=req.query;
  res.clearCookie("google_oauth_state",{httpOnly:true,secure:true,sameSite:"none",path:"/"});
  res.clearCookie("google_referral_code",{httpOnly:true,secure:true,sameSite:"none",path:"/"});
  if(!client)return res.redirect(loginRedirectUrl(req,"google_not_configured"));
  if(error)return res.redirect(loginRedirectUrl(req,"google_cancelled"));
  if(!code||!state||!stateCookie||state!==stateCookie)return res.redirect(loginRedirectUrl(req,"google_state"));
  try {
    const {tokens}=await client.getToken(code);
    if(!tokens.id_token)throw new Error("Google did not return an ID token.");
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID});
    const payload=ticket.getPayload(), googleId=payload?.sub, email=normalizeEmail(payload?.email), name=String(payload?.name||payload?.given_name||"مستخدم Google").trim().slice(0,100);
    if(!googleId||!email||payload?.email_verified!==true)throw new Error("Google account email could not be verified.");
    let result=await query(`SELECT id,name,email,password_hash,provider,provider_id,email_verified,created_at,referral_code,points FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,[email]);
    let user;
    if(result.rowCount){
      user=result.rows[0];
      await query(`UPDATE users SET provider='google',provider_id=$1,email_verified=TRUE,updated_at=NOW() WHERE id=$2`,[googleId,user.id]);
      user.provider="google"; user.provider_id=googleId; user.email_verified=true;
    } else {
      const ref=referral?await query("SELECT id FROM users WHERE referral_code=$1 LIMIT 1",[referral]):{rowCount:0};
      const myCode=await uniqueReferralCode();
      const created=await query(`INSERT INTO users(name,email,password_hash,provider,provider_id,email_verified,referral_code,referred_by,points) VALUES($1,$2,NULL,'google',$3,TRUE,$4,$5,$6) RETURNING id,name,email,provider,email_verified,created_at,referral_code,points`,[name,email,googleId,myCode,ref.rowCount?ref.rows[0].id:null,ref.rowCount?NEW_MEMBER_BONUS:0]);
      user=created.rows[0];
      if(ref.rowCount){
        await query("UPDATE users SET points=points+$1,updated_at=NOW() WHERE id=$2",[REFERRER_BONUS,ref.rows[0].id]);
        await query("INSERT INTO points_ledger(user_id,points,reason) VALUES($1,$2,$3)",[user.id,NEW_MEMBER_BONUS,"مكافأة التسجيل عبر الإحالة"]);
        await query("INSERT INTO points_ledger(user_id,points,reason) VALUES($1,$2,$3)",[ref.rows[0].id,REFERRER_BONUS,"مكافأة إحالة عضو جديد"]);
      }
    }
    sessionCookie(res,user,true);
    return res.redirect(accountRedirectUrl(req));
  } catch(e){console.error("Google OAuth error:",e);return res.redirect(loginRedirectUrl(req,"google_failed"));}
}
