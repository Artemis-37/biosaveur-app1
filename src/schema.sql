-- BIOSAVEUR Molo Molo — schéma PostgreSQL (idempotent, rejoué à chaque démarrage)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  role          TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client','livreur','admin')),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  commune       TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  landmark      TEXT NOT NULL DEFAULT '',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  referral_code TEXT UNIQUE,
  referred_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  old_price   INTEGER,
  weight      TEXT NOT NULL DEFAULT '',
  options     TEXT[] NOT NULL DEFAULT ARRAY['Entier'],
  tag         TEXT NOT NULL DEFAULT '',
  flash       BOOLEAN NOT NULL DEFAULT FALSE,
  image_url   TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  threshold   INTEGER NOT NULL DEFAULT 5,
  supplier    TEXT NOT NULL DEFAULT '',
  lead_time   TEXT NOT NULL DEFAULT '',
  -- traçabilité BIOSAVEUR TRACE
  lot_code    TEXT NOT NULL DEFAULT '',
  farm        TEXT NOT NULL DEFAULT '',
  feed        TEXT NOT NULL DEFAULT '',
  vet         TEXT NOT NULL DEFAULT '',
  slaughter_date DATE,
  cold_chain  TEXT NOT NULL DEFAULT '',
  halal       TEXT NOT NULL DEFAULT '',
  visible     BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cotisations (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chickens      INTEGER NOT NULL CHECK (chickens > 0),
  unit_price    INTEGER NOT NULL CHECK (unit_price > 0),
  paid          INTEGER NOT NULL DEFAULT 0 CHECK (paid >= 0),
  delivery_day  TEXT NOT NULL DEFAULT 'Samedi',
  auto_renew    BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','livree','annulee')),
  order_id      INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cotisations_user ON cotisations(user_id);

CREATE TABLE IF NOT EXISTS cotisation_payments (
  id            SERIAL PRIMARY KEY,
  cotisation_id INTEGER NOT NULL REFERENCES cotisations(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL,
  reference     TEXT NOT NULL DEFAULT '',
  recorded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'commande' CHECK (kind IN ('commande','cotisation')),
  day          DATE NOT NULL,
  slot         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmee' CHECK (status IN ('attente_paiement','confirmee','preparee','en_route','livree','annulee')),
  pay_method   TEXT NOT NULL CHECK (pay_method IN ('livraison','cinetpay','cotisation')),
  paid         BOOLEAN NOT NULL DEFAULT FALSE,
  subtotal     INTEGER NOT NULL DEFAULT 0,
  fee          INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  qr_code      TEXT NOT NULL,
  driver_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- adresse figée au moment de la commande
  address      TEXT NOT NULL DEFAULT '',
  commune      TEXT NOT NULL DEFAULT '',
  landmark     TEXT NOT NULL DEFAULT '',
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_day ON orders(day);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  option     TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_team  BOOLEAN NOT NULL,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);

-- transactions CinetPay
CREATE TABLE IF NOT EXISTS payments (
  id             SERIAL PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  purpose        TEXT NOT NULL CHECK (purpose IN ('commande','versement','test')),
  ref_id         INTEGER,
  amount         INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING',
  method         TEXT NOT NULL DEFAULT '',
  payment_url    TEXT NOT NULL DEFAULT '',
  message        TEXT NOT NULL DEFAULT '',
  applied        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;
