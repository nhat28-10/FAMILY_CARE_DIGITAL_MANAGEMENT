import {
  AccountStatus,
  FamilySubscriptionStatus,
  PrismaClient,
  UserType,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Base subscription tiers. Paid tiers get `stripePriceId` later (admin API). */
const BASE_PLANS = [
  {
    planCode: 'FREE',
    name: 'Gói miễn phí',
    annualPrice: 0,
    maxMembers: 3,
    storageLimit: 1024,
    featureAccess: {
      maxFamilies: 1,
      aiEnabled: false,
      advancedFinance: false,
    },
  },
  {
    planCode: 'MONTHLY',
    name: 'Gói tháng',
    annualPrice: 99000,
    maxMembers: 10,
    storageLimit: 5120,
    featureAccess: {
      maxFamilies: 3,
      aiEnabled: true,
      advancedFinance: true,
    },
  },
  {
    planCode: 'YEARLY',
    name: 'Gói năm',
    annualPrice: 990000,
    maxMembers: 10,
    storageLimit: 5120,
    featureAccess: {
      maxFamilies: 3,
      aiEnabled: true,
      advancedFinance: true,
    },
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

/**
 * Stripe recurring Price id for a paid plan, read from env. Lets teammates
 * sharing one Stripe test account configure plans via `.env` + `npm run seed`
 * instead of PATCHing each DB by hand:
 *   STRIPE_PRICE_PLUS, STRIPE_PRICE_PREMIUM
 */
function stripePriceIdFor(planCode: string): string | undefined {
  if (planCode === 'MONTHLY') return process.env.STRIPE_PRICE_MONTHLY;
  if (planCode === 'YEARLY') return process.env.STRIPE_PRICE_YEARLY;
  return undefined;
}

/**
 * Upsert the base plans by planCode. `stripePriceId` is set from env when
 * provided; when the env var is absent the existing value is left untouched
 * (so re-running seed without the vars won't wipe an already-configured price).
 */
async function seedPlans() {
  for (const plan of BASE_PLANS) {
    const stripePriceId = stripePriceIdFor(plan.planCode);
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: {
        name: plan.name,
        annualPrice: plan.annualPrice,
        maxMembers: plan.maxMembers,
        storageLimit: plan.storageLimit,
        isActive: true,
        ...(stripePriceId ? { stripePriceId } : {}),
      },
      create: { ...plan, isActive: true, stripePriceId: stripePriceId ?? null },
    });
  }

  const configured = BASE_PLANS.filter((p) => stripePriceIdFor(p.planCode)).length;
  console.log(
    `✔ Seeded ${BASE_PLANS.length} subscription plans ` +
    `(${configured} paid plan(s) linked to Stripe price)`,
  );
}

/** Give every family without a subscription a FREE one (status ACTIVE). */
async function backfillFreeSubscriptions() {
  const freePlan = await prisma.subscriptionPlan.findUnique({
    where: { planCode: 'FREE' },
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
