import {
  AccountStatus,
  BillingPeriod,
  FamilySubscriptionStatus,
  PrismaClient,
  UserType,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Base subscription tiers. Paid tiers get `stripePriceId` later. */
const BASE_PLANS = [
  {
    planCode: 'FREE',
    name: 'Gói miễn phí',
    annualPrice: 0,
    billingPeriod: BillingPeriod.FREE,
    monthlyPrice: null,
    yearlyPrice: null,
    maxMembers: 3,
    storageLimit: 1024,
    featureAccess: {
      'calendar.enabled': true,
      'calendar.reminders': false,
      'calendar.recurringEvents': false,
      'album.faceSuggestions': false,
    },
  },
  {
    planCode: 'MONTHLY',
    name: 'Gói tháng',
    annualPrice: 99000,
    billingPeriod: BillingPeriod.MONTHLY,
    monthlyPrice: 99000,
    yearlyPrice: null,
    maxMembers: 10,
    storageLimit: 5120,
    featureAccess: {
      'calendar.enabled': true,
      'calendar.reminders': true,
      'calendar.recurringEvents': true,
      'album.faceSuggestions': true,
    },
  },
  {
    planCode: 'YEARLY',
    name: 'Gói năm',
    annualPrice: 990000,
    billingPeriod: BillingPeriod.YEARLY,
    monthlyPrice: null,
    yearlyPrice: 990000,
    maxMembers: 10,
    storageLimit: 5120,
    featureAccess: {
      'calendar.enabled': true,
      'calendar.reminders': true,
      'calendar.recurringEvents': true,
      'album.faceSuggestions': true,
    },
  },
];

/**
 * Seeds the data needed to use/test the platform. Idempotent and safe to rerun:
 *   - one SYSTEM_ADMIN account (from ADMIN_EMAIL / ADMIN_PASSWORD)
 *   - the FREE / MONTHLY / YEARLY subscription plans
 *   - a FREE FamilySubscription for every family that does not have one yet
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

  console.log(`Seeded SYSTEM_ADMIN: ${admin.email} (id=${admin.id})`);

  await seedPlans();
  await backfillFreeSubscriptions();
}

function stripePriceIdFor(planCode: string): string | undefined {
  if (planCode === 'MONTHLY') return process.env.STRIPE_PRICE_MONTHLY;
  if (planCode === 'YEARLY') return process.env.STRIPE_PRICE_YEARLY;
  return undefined;
}

async function seedPlans() {
  for (const plan of BASE_PLANS) {
    const stripePriceId = stripePriceIdFor(plan.planCode);
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: {
        name: plan.name,
        annualPrice: plan.annualPrice,
        billingPeriod: plan.billingPeriod,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        maxMembers: plan.maxMembers,
        storageLimit: plan.storageLimit,
        featureAccess: plan.featureAccess,
        isActive: true,
        ...(stripePriceId ? { stripePriceId } : {}),
      },
      create: { ...plan, isActive: true, stripePriceId: stripePriceId ?? null },
    });
  }

  const configured = BASE_PLANS.filter((p) =>
    stripePriceIdFor(p.planCode),
  ).length;
  console.log(
    `Seeded ${BASE_PLANS.length} subscription plans ` +
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
  console.log(`Backfilled FREE subscription for ${families.length} families`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
