-- AlterTable
ALTER TABLE `product_variants` ADD COLUMN `quick_qtys` JSON NULL;

-- CreateTable
CREATE TABLE `price_tiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `variant_id` INTEGER NOT NULL,
    `min_qty` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `price_tiers_variant_id_min_qty_key`(`variant_id`, `min_qty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `price_tiers` ADD CONSTRAINT `price_tiers_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

