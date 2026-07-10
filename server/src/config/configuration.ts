export default () => ({
  app: {
    name: process.env.APP_NAME || 'Family Care API',
    env: process.env.APP_ENV || 'development',
    // Railway/Render/Heroku inject the listen port via PORT; APP_PORT is the
    // local fallback so dev keeps using the value from .env.
    port: parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10),
    prefix: process.env.APP_PREFIX || 'api/v1',
  },
  cors: {
    origins:
      process.env.CORS_ORIGINS ||
      'http://localhost:5173,http://localhost:8081,http://localhost:19006',
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
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
  mail: {
    // '' = tự dò (RESEND_API_KEY → resend; BREVO_API_KEY → brevo; SMTP_HOST → smtp).
    // Ép kênh: 'resend' | 'brevo' | 'smtp'.
    provider: process.env.MAIL_PROVIDER || '',
    from: process.env.MAIL_FROM || 'Family Care <onboarding@resend.dev>',
    // Resend HTTP API (cổng 443) — dùng cho VPS chặn cổng SMTP.
    resendApiKey: process.env.RESEND_API_KEY || '',
    // Brevo HTTP API (cổng 443) — lựa chọn thay thế.
    brevoApiKey: process.env.BREVO_API_KEY || '',
    // SMTP (nodemailer) — tiện cho dev local.
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  emailVerification: {
    otpExpiresMinutes: parseInt(
      process.env.EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES || '10',
      10,
    ),
    resendCooldownSeconds: parseInt(
      process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS || '60',
      10,
    ),
    maxAttempts: parseInt(
      process.env.EMAIL_VERIFICATION_MAX_ATTEMPTS || '5',
      10,
    ),
  },
  passwordReset: {
    otpExpiresMinutes: parseInt(
      process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || '10',
      10,
    ),
    resendCooldownSeconds: parseInt(
      process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS || '60',
      10,
    ),
    maxAttempts: parseInt(process.env.PASSWORD_RESET_MAX_ATTEMPTS || '5', 10),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // Stripe Checkout redirect targets. `{CHECKOUT_SESSION_ID}` is substituted
    // by Stripe; the frontend confirms status via webhook, not these URLs.
    checkoutSuccessUrl:
      process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
      'http://localhost:5173/subscription/success',
    checkoutCancelUrl:
      process.env.STRIPE_CHECKOUT_CANCEL_URL ||
      'http://localhost:5173/subscription/cancel',
  },
  throttle: {
    // TTL tính bằng GIÂY trong ENV; module sẽ nhân 1000 sang ms.
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  storage: {
    // Cloudflare R2 (S3-compatible) — lưu ảnh/file chat + album. DB chỉ lưu URL.
    r2Endpoint: process.env.R2_ENDPOINT || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2Bucket: process.env.R2_BUCKET || '',
    // Public dev URL (https://pub-xxx.r2.dev) hoặc custom domain của bucket.
    r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  },
});
