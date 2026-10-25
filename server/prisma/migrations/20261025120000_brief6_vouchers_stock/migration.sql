-- AlterTable
ALTER TABLE `orders` ADD COLUMN `company_name` VARCHAR(150) NULL,
    ADD COLUMN `discount` DECIMAL(10, 2) NULL DEFAULT 0,
    ADD COLUMN `note` TEXT NULL,
    ADD COLUMN `voucher_code` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `display_name` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `type` ENUM('percent', 'fixed') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `min_spend` DECIMAL(10, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `starts_at` TIMESTAMP(0) NULL,
    `expires_at` TIMESTAMP(0) NULL,
    `usage_limit` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `vouchers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `variant_id` INTEGER NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `order_id` INTEGER NULL,
    `note` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `stock_movements_variant_id_created_at_idx`(`variant_id`, `created_at`),
    INDEX `stock_movements_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

