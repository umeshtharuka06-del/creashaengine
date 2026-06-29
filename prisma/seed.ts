import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@royal1.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe!2026";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { isAdmin: true },
    create: {
      email,
      username: "admin",
      passwordHash,
      isAdmin: true,
      clientSeed: crypto.randomBytes(8).toString("hex"),
      wallet: { create: { balance: 0 } },
    },
  });

  const welcomeTitle = "Welcome to Royal 1 🎉";
  const existing = await prisma.announcement.findFirst({
    where: { title: welcomeTitle },
  });
  if (!existing) {
    await prisma.announcement.create({
      data: {
        title: welcomeTitle,
        body: "Play Color Prediction and Crash. Deposit USDT (TRC20) to fund your wallet.",
        active: true,
      },
    });
  }

  console.log("✅ Seed complete.");
  console.log(`   Admin login: ${email} / ${password}`);
  console.log("   ⚠️  Change ADMIN_PASSWORD before any real deployment.");
  console.log(`   Admin id: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
