-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('LOCAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "providerName" "Provider" NOT NULL,
    "name" TEXT,
    "lastName" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "audience" INTEGER NOT NULL DEFAULT 0,
    "pictureId" TEXT,
    "providerId" TEXT,
    "timezone" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReadNotifications" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteId" TEXT,
    "activated" BOOLEAN NOT NULL DEFAULT true,
    "account" TEXT,
    "connectedAccount" BOOLEAN NOT NULL DEFAULT false,
    "lastOnline" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "agent" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
