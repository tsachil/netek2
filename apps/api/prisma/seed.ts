import { PrismaClient, UserRole, UserStatus, BranchStatus } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const branchCode = process.env.ADMIN_BRANCH_CODE || "0001";
  const branchName = process.env.ADMIN_BRANCH_NAME || "Main Branch";
  const fullName = process.env.ADMIN_FULL_NAME || "Admin User";
  const employeeId = process.env.ADMIN_EMPLOYEE_ID || "0000";
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";

  await prisma.branch.upsert({
    where: { branchCode },
    update: { branchName, status: BranchStatus.ACTIVE },
    create: { branchCode, branchName, status: BranchStatus.ACTIVE }
  });

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: {
      fullName,
      employeeId,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      branchCode
    },
    create: {
      fullName,
      employeeId,
      username,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      branchCode
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
