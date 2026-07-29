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
  family: {
    maxDeputies: parseInt(process.env.FAMILY_MAX_DEPUTIES || '2', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  firebase: {
    // Base64 của file service-account JSON. Rỗng = tắt kênh FCM (dev không cần Firebase).
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  },
  storage: {
    // Cloudflare R2 (S3-compatible) — lưu ảnh/file chat + album. DB chỉ lưu URL.
    r2Endpoint: process.env.R2_ENDPOINT || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2Bucket: process.env.R2_BUCKET || '',
    // Public dev URL (https://pub-xxx.r2.dev) hoặc custom domain của bucket.
    r2PublicUrl: process.env.R2_PUBLIC_URL || '',
    signedUrlTtlSeconds: parseInt(
      process.env.R2_SIGNED_URL_TTL_SECONDS || '600',
      10,
    ),
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    aiModel:
      process.env.CLOUDFLARE_AI_MODEL ||
      '@cf/meta/llama-3.2-11b-vision-instruct',
    aiTimeoutMs: parseInt(process.env.CLOUDFLARE_AI_TIMEOUT_MS || '30000', 10),
    queueId: process.env.CLOUDFLARE_QUEUE_ID || '',
    queueApiToken: process.env.CLOUDFLARE_QUEUE_API_TOKEN || '',
  },
  openai: {
    // Trợ lý AI (module ai-chatbot). Rỗng = tắt tính năng (request trả 503).
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxToolRounds: parseInt(process.env.OPENAI_MAX_TOOL_ROUNDS || '5', 10),
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10),
    maxHistoryMessages: parseInt(
      process.env.AI_CHAT_MAX_HISTORY_MESSAGES || '20',
      10,
    ),
    actionExpiresMinutes: parseInt(
      process.env.AI_ACTION_EXPIRES_MINUTES || '15',
      10,
    ),
  },
  albumModeration: {
    consumerEnabled: process.env.ALBUM_MODERATION_CONSUMER_ENABLED === 'true',
    recoveryEnabled: process.env.ALBUM_MODERATION_RECOVERY_ENABLED !== 'false',
    recoveryBatchSize: parseInt(
      process.env.ALBUM_MODERATION_RECOVERY_BATCH_SIZE || '20',
      10,
    ),
    pollIntervalMs: parseInt(
      process.env.ALBUM_MODERATION_POLL_INTERVAL_MS || '5000',
      10,
    ),
    batchSize: parseInt(process.env.ALBUM_MODERATION_BATCH_SIZE || '2', 10),
    visibilityTimeoutMs: parseInt(
      process.env.ALBUM_MODERATION_VISIBILITY_TIMEOUT_MS || '180000',
      10,
    ),
    maxAttempts: parseInt(process.env.ALBUM_MODERATION_MAX_ATTEMPTS || '3', 10),
    retryDelaySeconds: parseInt(
      process.env.ALBUM_MODERATION_RETRY_DELAY_SECONDS || '60',
      10,
    ),
    staleProcessingMinutes: parseInt(
      process.env.ALBUM_MODERATION_STALE_PROCESSING_MINUTES || '10',
      10,
    ),
    reviewThreshold: parseFloat(
      process.env.ALBUM_MODERATION_REVIEW_THRESHOLD || '0.45',
    ),
    flagThreshold: parseFloat(
      process.env.ALBUM_MODERATION_FLAG_THRESHOLD || '0.80',
    ),
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    videoFrameIntervalSeconds: parseInt(
      process.env.ALBUM_VIDEO_FRAME_INTERVAL_SECONDS || '5',
      10,
    ),
    videoMaxFrames: parseInt(process.env.ALBUM_VIDEO_MAX_FRAMES || '12', 10),
    videoFrameConcurrency: parseInt(
      process.env.ALBUM_VIDEO_FRAME_CONCURRENCY || '1',
      10,
    ),
  },
  albumCleanup: {
    enabled: process.env.ALBUM_CLEANUP_ENABLED !== 'false',
    batchSize: parseInt(process.env.ALBUM_CLEANUP_BATCH_SIZE || '10', 10),
    maxAttempts: parseInt(process.env.ALBUM_CLEANUP_MAX_ATTEMPTS || '5', 10),
    retryDelaySeconds: parseInt(
      process.env.ALBUM_CLEANUP_RETRY_DELAY_SECONDS || '60',
      10,
    ),
  },
  faceAi: {
    baseUrl: process.env.FACE_AI_BASE_URL || 'http://face-ai-service:8000',
    timeoutMs: parseInt(process.env.FACE_AI_TIMEOUT_MS || '30000', 10),
  },
  faceEmbedding: {
    encryptionKey: process.env.FACE_EMBEDDING_ENCRYPTION_KEY || '',
  },
  faceScan: {
    maxFaces: parseInt(process.env.FACE_SCAN_MAX_FACES || '20', 10),
    minSimilarity: parseFloat(process.env.FACE_MATCH_MIN_SIMILARITY || '0.55'),
    singleCandidateMinSimilarity: parseFloat(
      process.env.FACE_MATCH_SINGLE_CANDIDATE_MIN_SIMILARITY || '0.75',
    ),
    minMargin: parseFloat(process.env.FACE_MATCH_MIN_MARGIN || '0.08'),
    maxAttempts: parseInt(process.env.FACE_SCAN_MAX_ATTEMPTS || '3', 10),
    staleMinutes: parseInt(process.env.FACE_SCAN_STALE_MINUTES || '10', 10),
    consumerEnabled: process.env.FACE_SCAN_CONSUMER_ENABLED === 'true',
  },
});
