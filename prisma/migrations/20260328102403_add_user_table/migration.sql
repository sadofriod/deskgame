-- CreateTable
CREATE TABLE "wechat_users" (
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

    CONSTRAINT "wechat_users_pkey" PRIMARY KEY ("openId")
);

-- CreateIndex
CREATE INDEX "wechat_users_unionId_idx" ON "wechat_users"("unionId");
