import {
  AccountStatus,
  FamilySubscriptionStatus,
  PrismaClient,
  SubscriptionPlanCode,
  UserType,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Base subscription tiers. Paid tiers get `stripePriceId` later (admin API). */
const BASE_PLANS = [
  {
    planCode: SubscriptionPlanCode.FREE,
    name: 'Gói Miễn phí',
    annualPrice: 0,
    maxMembers: 3,
    storageLimit: 1024,
  },
  {
    planCode: SubscriptionPlanCode.PLUS,
    name: 'Gói Plus',
    annualPrice: 990000,
    maxMembers: 10,
    storageLimit: 5120,
  },
  {
    planCode: SubscriptionPlanCode.PREMIUM,
    name: 'Gói Premium',
    annualPrice: 1990000,
    maxMembers: 20,
    storageLimit: 20480,
  },
];

/**
 * Seeds the data needed to use/test the platform. Idempotent — safe to re-run:
 *   - one SYSTEM_ADMIN account (from ADMIN_EMAIL / ADMIN_PASSWORD)
 *   - the FREE / PLUS / PREMIUM subscription plans
 *   - a FREE FamilySubscription for every family that doesn't have one yet
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

  await seedPlans();
  await backfillFreeSubscriptions();
}

/** Upsert the base plans by planCode (preserves any stripePriceId already set). */
async function seedPlans() {
  for (const plan of BASE_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: {
        name: plan.name,
        annualPrice: plan.annualPrice,
        maxMembers: plan.maxMembers,
        storageLimit: plan.storageLimit,
        isActive: true,
      },
      create: { ...plan, isActive: true },
    });
  }
  console.log(`✔ Seeded ${BASE_PLANS.length} subscription plans (FREE/PLUS/PREMIUM)`);
}

/** Give every family without a subscription a FREE one (status ACTIVE). */
async function backfillFreeSubscriptions() {
  const freePlan = await prisma.subscriptionPlan.findUnique({
    where: { planCode: SubscriptionPlanCode.FREE },
  });
  if (!freePlan) return;

  const families = await prisma.family.findMany({
    where: { subscription: { is: null } },
    select: { id: true },
  });

  for (const family of families) {
    await prisma.familySubscription.create({
      data: {
        familyId: family.id,
        planId: freePlan.id,
        status: FamilySubscriptionStatus.ACTIVE,
      },
    });
  }
  console.log(`✔ Backfilled FREE subscription for ${families.length} families`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
