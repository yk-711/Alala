CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'local',
  provider_id VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_provider_idx ON users (provider, provider_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id);


CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(100) NOT NULL DEFAULT 'عام',
  audience VARCHAR(20) NOT NULL DEFAULT 'women',
  image_url TEXT NOT NULL,
  images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  colors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  fabrics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  old_price NUMERIC(12,2),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  reviews INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  prep_time INTEGER NOT NULL DEFAULT 10,
  badge VARCHAR(100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_active_idx ON products(active, sort_order, created_at DESC);
