-- CreateTable
CREATE TABLE "shop_groups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_group_members" (
    "groupId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,

    CONSTRAINT "shop_group_members_pkey" PRIMARY KEY ("groupId","shopId")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_groups_householdId_name_key" ON "shop_groups"("householdId", "name");

-- CreateIndex
CREATE INDEX "shop_group_members_shopId_idx" ON "shop_group_members"("shopId");

-- AddForeignKey
ALTER TABLE "shop_groups" ADD CONSTRAINT "shop_groups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_group_members" ADD CONSTRAINT "shop_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "shop_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_group_members" ADD CONSTRAINT "shop_group_members_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
