export default () => ({
  app: {
    name: process.env.APP_NAME || 'Family Care API',
    env: process.env.APP_ENV || 'development',
    // Railway/Render/Heroku inject the listen port via PORT; APP_PORT is the
    // local fallback so dev keeps using the value from .env.
    port: parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10),
    prefix: process.env.APP_PREFIX || 'api/v1',
  },
  database: {
    // Prisma reads DATABASE_URL directly from env; exposed here for reference.
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },
  invitation: {
    expiresInDays: parseInt(process.env.INVITATION_EXPIRES_IN_DAYS || '7', 10),
  },
});
