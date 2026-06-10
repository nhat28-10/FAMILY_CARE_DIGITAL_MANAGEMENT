import {
  AccountStatus,
  PrismaClient,
  UserType,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seeds a single SYSTEM_ADMIN account from env vars so the admin APIs can be
 * used/tested. Idempotent: re-running upserts the same account by email.
 *
 *   ADMIN_EMAIL, ADMIN_PASSWORD   (required)
 *   BCRYPT_SALT_ROUNDS            (optional, default 10)
 */
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must be set (in .env) to seed an admin.',
    );
  }

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      userType: UserType.SYSTEM_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
    },
    create: {
      email,
      passwordHash,
      fullName: 'System Admin',
      userType: UserType.SYSTEM_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  console.log(`✔ Seeded SYSTEM_ADMIN: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
