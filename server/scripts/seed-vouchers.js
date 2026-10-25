import "../src/env.js";
import { prisma } from "../src/db.js";
import { ensureSeedVouchers } from "../src/vouchers.js";

await ensureSeedVouchers();
const v = await prisma.voucher.findUnique({ where: { code: "WELCOME5" } });
console.log(`WELCOME5: ${v.type} ${v.value} active=${v.active} used=${v.usedCount}`);
await prisma.$disconnect();
