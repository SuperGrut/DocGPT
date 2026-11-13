/*
  Warnings:

  - You are about to drop the column `userId` on the `Document` table. All the data in the column will be lost.
  - Added the required column `orgId` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userId_fkey";

-- DropIndex
DROP INDEX "Document_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "userId",
ADD COLUMN     "orgId" TEXT NOT NULL,
ADD COLUMN     "uploadedById" TEXT;

-- CreateIndex
CREATE INDEX "Document_orgId_createdAt_idx" ON "Document"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
