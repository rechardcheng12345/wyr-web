-- AlterTable
ALTER TABLE `stock_movements` ADD COLUMN `marketplace_order_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `marketplace_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` ENUM('shopee', 'lazada', 'tiktok') NOT NULL,
    `order_no` VARCHAR(80) NOT NULL,
    `bigseller_order_id` VARCHAR(80) NULL,
    `status` ENUM('unpaid', 'paid', 'shipped', 'completed', 'cancelled', 'returned') NOT NULL,
    `buyer_name` VARCHAR(150) NULL,
    `total` DECIMAL(10, 2) NULL,
    `ordered_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `marketplace_orders_platform_order_no_key`(`platform`, `order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marketplace_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `sku` VARCHAR(120) NOT NULL,
    `name` VARCHAR(255) NULL,
    `qty` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NULL,
    `variant_id` INTEGER NULL,
    `pack_qty` INTEGER NOT NULL DEFAULT 1,

    INDEX `marketplace_order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `stock_movements_marketplace_order_id_idx` ON `stock_movements`(`marketplace_order_id`);

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_marketplace_order_id_fkey` FOREIGN KEY (`marketplace_order_id`) REFERENCES `marketplace_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `marketplace_order_items` ADD CONSTRAINT `marketplace_order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `marketplace_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `marketplace_order_items` ADD CONSTRAINT `marketplace_order_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
