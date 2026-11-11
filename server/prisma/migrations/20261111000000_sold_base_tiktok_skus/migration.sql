-- AlterTable
ALTER TABLE `products` ADD COLUMN `sold_base` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `platform_skus` MODIFY `platform` ENUM('shopee', 'lazada', 'tiktok') NOT NULL;
