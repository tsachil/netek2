-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "fullAccountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "operationRestrictions" TEXT,
    "currentBalance" DECIMAL(15,2) NOT NULL,
    "heldBalance" DECIMAL(15,2) NOT NULL,
    "fxSupplementaryAccounts" DECIMAL(15,2) NOT NULL,
    "loans" DECIMAL(15,2) NOT NULL,
    "deposits" DECIMAL(15,2) NOT NULL,
    "savingsPlans" DECIMAL(15,2) NOT NULL,
    "securities" DECIMAL(15,2) NOT NULL,
    "guarantees" DECIMAL(15,2) NOT NULL,
    "liens" DECIMAL(15,2) NOT NULL,
    "pledges" DECIMAL(15,2) NOT NULL,
    "annualDebitTurnover" DECIMAL(15,2) NOT NULL,
    "totalCreditLines" DECIMAL(15,2) NOT NULL,
    "nextVisaCharge" DECIMAL(15,2) NOT NULL,
    "visaDebt" DECIMAL(15,2) NOT NULL,
    "markers" TEXT,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "loadedDate" TIMESTAMP(3) NOT NULL,
    "branchCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountKey_branchCode_loadedDate_key" ON "Account"("accountKey", "branchCode", "loadedDate");

-- CreateIndex
CREATE INDEX "Account_branchCode_loadedDate_idx" ON "Account"("branchCode", "loadedDate");

-- CreateIndex
CREATE INDEX "Account_branchCode_accountKey_idx" ON "Account"("branchCode", "accountKey");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branchCode") ON DELETE RESTRICT ON UPDATE CASCADE;
