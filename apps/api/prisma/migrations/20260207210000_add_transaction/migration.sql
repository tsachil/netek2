-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "branchCode" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balanceBefore" DECIMAL(15,2) NOT NULL,
    "balanceAfter" DECIMAL(15,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "voidReference" TEXT,
    "tellerUserId" TEXT NOT NULL,
    "referenceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionId_key" ON "Transaction"("transactionId");

-- CreateIndex
CREATE INDEX "Transaction_branchCode_businessDate_idx" ON "Transaction"("branchCode", "businessDate");

-- CreateIndex
CREATE INDEX "Transaction_accountId_businessDate_idx" ON "Transaction"("accountId", "businessDate");

-- CreateIndex
CREATE INDEX "Transaction_tellerUserId_businessDate_idx" ON "Transaction"("tellerUserId", "businessDate");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tellerUserId_fkey" FOREIGN KEY ("tellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
