'use strict';
// Configuration lue dans les variables d'environnement (voir .env.example).

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return /^(1|true|oui|yes)$/i.test(String(v));
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

const config = {
  port: Number(env.PORT) || 3000,
  isProd,
  databaseUrl: env.DATABASE_URL || 'postgres://localhost:5432/biosaveur',
  databaseSsl: bool(env.DATABASE_SSL, isProd),
  jwtSecret: env.JWT_SECRET || (isProd ? '' : 'dev-secret-a-changer'),
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),

  admin: {
    phone: env.ADMIN_PHONE || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Administrateur BIOSAVEUR',
  },

  shop: {
    deliveryFee: Number(env.DELIVERY_FEE) || 1000,
    chickenPrice: Number(env.CHICKEN_PRICE) || 5000,
    referralPoints: Number(env.REFERRAL_POINTS) || 500,
    slots: ['08h – 10h', '10h – 12h', '14h – 16h', '17h – 19h'],
    depot: {
      name: env.DEPOT_NAME || 'Entrepôt BIOSAVEUR',
      lat: Number(env.DEPOT_LAT) || 5.3478,
      lng: Number(env.DEPOT_LNG) || -4.0236,
    },
  },

  cinetpay: {
    apiKey: env.CINETPAY_API_KEY || '',
    siteId: env.CINETPAY_SITE_ID || '',
    secretKey: env.CINETPAY_SECRET_KEY || '',
    baseUrl: (env.CINETPAY_BASE_URL || 'https://api-checkout.cinetpay.com/v2').replace(/\/$/, ''),
    // Mode simulation : utile tant que CinetPay n'est pas opérationnel.
    simulate: bool(env.CINETPAY_SIMULATE, !isProd),
  },

  map: {
    tiles: env.MAP_TILES_URL || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: env.MAP_TILES_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  },

  seedDemo: bool(env.SEED_DEMO, !isProd),
};

config.cinetpay.configured = Boolean(config.cinetpay.apiKey && config.cinetpay.siteId);

if (isProd && !config.jwtSecret) {
  throw new Error('JWT_SECRET est obligatoire en production.');
}

module.exports = config;
