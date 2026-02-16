-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('NONE', 'ADMIN', 'BRANCH_MANAGER', 'TELLER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DayState" AS ENUM ('CLOSED', 'LOADING', 'OPEN', 'CLOSING', 'RECONCILING');

-- CreateTable
CREATE TABLE "Branch" (
    "branchCode" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("branchCode")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'NONE',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "branchCode" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayCycle" (
    "businessDate" TIMESTAMP(3) NOT NULL,
    "state" "DayState" NOT NULL DEFAULT 'CLOSED',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "openedById" TEXT,
    "closedById" TEXT,
    "branchesLoaded" INTEGER NOT NULL DEFAULT 0,
    "totalAccountsLoaded" INTEGER NOT NULL DEFAULT 0,
    "ledgerRecordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayCycle_pkey" PRIMARY KEY ("businessDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branchCode") ON DELETE SET NULL ON UPDATE CASCADE;
