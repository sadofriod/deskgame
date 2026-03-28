-- CreateTable
CREATE TABLE "User" (
    "openId" VARCHAR(64) NOT NULL,
    "unionId" VARCHAR(64),
    "nickName" VARCHAR(64) NOT NULL,
    "avatarUrl" VARCHAR(256),
    "gender" INTEGER,
    "city" VARCHAR(64),
    "province" VARCHAR(64),
    "country" VARCHAR(64),
    "language" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("openId")
);

-- CreateIndex
CREATE INDEX "User_unionId_idx" ON "User"("unionId");
