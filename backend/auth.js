import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";
import { OAuth2Client } from "google-auth-library";

const PASSWORD_ROUNDS = 12;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    provider: user.provider,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    referralCode: user.referral_code || null,
    points: Number(user.points || 0)
  };
}

function makeReferralCode() {
  return `NESMA-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function register(req, res) {
  const { name, email, password } = req.body;
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);

  if (cleanName.length < 2 || cleanName.length > 100) {
    return res.status(400).json({ message: "الاسم غير صالح." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: "البريد الإلكتروني غير صالح." });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: "كلمة المرور يجب أن تكون بين 8 و128 حرفاً." });
  }

  const existing = await query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [cleanEmail]
  );

  if (existing.rowCount) {
    return res.status(409).json({ message: "هذا البريد الإلكتروني مستخدم بالفعل." });
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
  let result;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await query(
        `INSERT INTO users (name, email, password_hash, provider, referral_code)
         VALUES ($1, $2, $3, 'local', $4)
         RETURNING id, name, email, provider, email_verified, created_at, referral_code, points`,
        [cleanName, cleanEmail, passwordHash, makeReferralCode()]
      );
      break;
    } catch (e) {
      if (e.code !== '23505' || !String(e.detail || e.message).includes('referral')) throw e;
    }
  }

  return res.status(201).json({
    message: "تم إنشاء الحساب بنجاح.",
    user: publicUser(result.rows[0])
  });
}

export async function login(req, res) {
  const { email, password, remember } = req.body;
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || typeof password !== "string") {
    return res.status(400).json({ message: "أدخل البريد الإلكتروني وكلمة المرور." });
  }

  const result = await query(
    `SELECT id, name, email, password_hash, provider, email_verified, created_at, referral_code, points
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [cleanEmail]
  );

  if (!result.rowCount || !result.rows[0].password_hash) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
  }

  const expiresIn = remember ? "30d" : (process.env.JWT_EXPIRES_IN || "7d");

  const token = jwt.sign(
    { sub: user.id, type: "session" },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "none",
    maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });

  return res.json({
    message: "تم تسجيل الدخول بنجاح.",
    user: publicUser(user),
    redirect: isAdminUser(user) ? "/admin.html" : "/account.html"
  });
}

export async function logout(req, res) {
  res.clearCookie("auth_token", {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "none",
    path: "/"
  });
  return res.json({ message: "تم تسجيل الخروج." });
}

export async function me(req, res) {
  if (!req.user) return res.status(401).json({ message: "غير مسجل الدخول." });
  return res.json({ user: publicUser(req.user) });
}

const genericRecoveryMessage = "إذا كان البريد مرتبطاً بحساب، فستصلك تعليمات الاستعادة.";

export async function forgotPassword(req, res, next) {
  const email = normalizeEmail(req.body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ message: genericRecoveryMessage });
  }

  try {
    const result = await query(
      "SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    if (!result.rowCount) return res.json({ message: genericRecoveryMessage });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await query(
      `DELETE FROM password_reset_tokens WHERE user_id=$1 AND (used_at IS NOT NULL OR expires_at <= NOW())`,
      [result.rows[0].id]
    );
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [result.rows[0].id, tokenHash]
    );

    const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${frontendUrl}/reset-password.html?token=${rawToken}`;

    const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS;
    const mailFrom = process.env.MAIL_FROM || process.env.SMTP_USER;
    const senderName = process.env.SENDER_NAME || process.env.MAIL_FROM_NAME || "متجر أثير";

    if (apiKey) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: { name: senderName, email: mailFrom },
          to: [{ email: email }],
          subject: `إعادة تعيين كلمة المرور | ${senderName}`,
          htmlContent: `
            <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;background:#070707;color:#fff;padding:25px;border-radius:12px;border:1px solid #d9b45c;">
              <h2 style="color:#d9b45c;">إعادة تعيين كلمة المرور</h2>
              <p>أهلاً بك، اضغط على الزر أدناه لتعيين كلمة مرور جديدة لحسابك. الرابط صالح لمدة 30 دقيقة.</p>
              <p><a href="${resetUrl}" style="display:inline-block;padding:12px 22px;background:#d9b45c;color:#080808;text-decoration:none;border-radius:8px;font-weight:bold;">تعيين كلمة المرور</a></p>
            </div>
          `
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Brevo API Error:", errorData);
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.log("DEV password reset URL:", resetUrl);
    }

    return res.json({ message: genericRecoveryMessage });
  } catch (error) {
    return next(error);
  }
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;

  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "بيانات استعادة كلمة المرور غير صالحة." });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const result = await query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (!result.rowCount) {
    return res.status(400).json({ message: "الرابط غير صالح أو منتهي الصلاحية." });
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);

  await query("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2",
    [passwordHash, result.rows[0].user_id]);

  await query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1",
    [result.rows[0].id]);

  return res.json({ message: "تم تغيير كلمة المرور بنجاح." });
}

export function authenticate(req, res, next) {
  try {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ message: "غير مسجل الدخول." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    query(
      `SELECT id, name, email, provider, email_verified, created_at, referral_code, points
       FROM users WHERE id=$1 LIMIT 1`,
      [payload.sub]
    ).then(result => {
      if (!result.rowCount) return res.status(401).json({ message: "الحساب غير موجود." });
      req.user = result.rows[0];
      next();
    }).catch(next);
  } catch {
    return res.status(401).json({ message: "جلسة الدخول غير صالحة أو منتهية." });
  }
}

function googleClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  const GOOGLE_CALLBACK_URL = String(process.env.GOOGLE_CALLBACK_URL || "https://nesma-store.onrender.com/api/auth/google/callback").trim();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL);
}

function sessionCookie(res, user, remember = true) {
  const expiresIn = remember ? "30d" : (process.env.JWT_EXPIRES_IN || "7d");
  const token = jwt.sign(
    { sub: user.id, type: "session" },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "none",
    maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function frontendUrl(req) {
  const configured = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://nesma-store.pages.dev";
  return `${req.protocol}://${req.get("host")}`;
}

function isAdminUser(user) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  return Boolean(adminEmail && normalizeEmail(user?.email) === adminEmail);
}

function accountRedirectUrl(req) {
  return `${frontendUrl(req)}/account.html`;
}

function adminRedirectUrl(req) {
  return `${frontendUrl(req)}/admin.html`;
}

function loginRedirectUrl(req, error) {
  return `${frontendUrl(req)}/login.html?error=${encodeURIComponent(error)}`;
}

export function googleStart(req, res) {
  const client = googleClient();
  if (!client) {
    return res.status(503).send("تسجيل الدخول عبر Google غير مفعّل بعد.");
  }

  const state = randomBytes(32).toString("hex");
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "none",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  const url = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account"
  });
  res.redirect(url);
}

export async function googleCallback(req, res) {
  const client = googleClient();
  const stateCookie = req.cookies.google_oauth_state;
  const { code, state, error } = req.query;

  res.clearCookie("google_oauth_state", {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || "none",
    path: "/"
  });

  if (!client) return res.redirect(loginRedirectUrl(req, "google_not_configured"));
  if (error) return res.redirect(loginRedirectUrl(req, "google_cancelled"));
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return res.redirect(loginRedirectUrl(req, "google_state"));
  }

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error("Google did not return an ID token.");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    const googleId = payload?.sub;
    const email = normalizeEmail(payload?.email);
    const name = String(payload?.name || payload?.given_name || "مستخدم Google").trim().slice(0, 100);
    const emailVerified = payload?.email_verified === true;

    if (!googleId || !email || !emailVerified) {
      throw new Error("Google account email could not be verified.");
    }

    let result = await query(
      `SELECT id, name, email, password_hash, provider, provider_id, email_verified, created_at, referral_code, points
       FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [email]
    );

    let user;
    if (result.rowCount) {
      user = result.rows[0];
      await query(
        `UPDATE users
         SET provider='google', provider_id=$1, email_verified=$2, referral_code=COALESCE(referral_code,$4), updated_at=NOW()
         WHERE id=$3`,
        [googleId, emailVerified, user.id, makeReferralCode()]
      );
      user.provider = "google";
      user.provider_id = googleId;
      user.email_verified = emailVerified;
    } else {
      const created = await query(
        `INSERT INTO users (name,email,password_hash,provider,provider_id,email_verified,referral_code)
         VALUES ($1,$2,NULL,'google',$3,$4,$5)
         RETURNING id,name,email,password_hash,provider,provider_id,email_verified,created_at,referral_code,points`,
        [name, email, googleId, emailVerified, makeReferralCode()]
      );
      user = created.rows[0];
    }

    // Create the session before redirecting so /account.html can immediately
    // verify the authenticated user.
    sessionCookie(res, user, true);
    return res.redirect(isAdminUser(user) ? adminRedirectUrl(req) : accountRedirectUrl(req));
  } catch (error) {
    console.error("Google OAuth error:", error);
    return res.redirect(loginRedirectUrl(req, "google_failed"));
  }
}
