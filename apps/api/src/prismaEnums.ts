import {
  BranchStatus as PrismaBranchStatus,
  DayState as PrismaDayState,
  TransactionStatus as PrismaTransactionStatus,
  TransactionType as PrismaTransactionType,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus
} from "@prisma/client";

function withFallback<T extends Record<string, string>>(value: T | undefined, fallback: T): T {
  return (value ?? fallback) as T;
}

export const UserRole = withFallback(PrismaUserRole as any, {
  NONE: "NONE",
  ADMIN: "ADMIN",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  TELLER: "TELLER"
});
export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = withFallback(PrismaUserStatus as any, {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE"
});
export type UserStatusValue = (typeof UserStatus)[keyof typeof UserStatus];

export const BranchStatus = withFallback(PrismaBranchStatus as any, {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE"
});
export type BranchStatusValue = (typeof BranchStatus)[keyof typeof BranchStatus];

export const DayState = withFallback(PrismaDayState as any, {
  CLOSED: "CLOSED",
  LOADING: "LOADING",
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  RECONCILING: "RECONCILING"
});
export type DayStateValue = (typeof DayState)[keyof typeof DayState];

export const TransactionType = withFallback(PrismaTransactionType as any, {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL"
});
export type TransactionTypeValue = (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionStatus = withFallback(PrismaTransactionStatus as any, {
  COMPLETED: "COMPLETED",
  VOIDED: "VOIDED"
});
export type TransactionStatusValue = (typeof TransactionStatus)[keyof typeof TransactionStatus];
