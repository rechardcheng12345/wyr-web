-- AlterTable
ALTER TABLE `orders` ADD COLUMN `email` VARCHAR(255) NULL,
    ADD COLUMN `expires_at` TIMESTAMP(0) NULL,
    ADD COLUMN `paid_at` TIMESTAMP(0) NULL,
    ADD COLUMN `ship_city` VARCHAR(100) NULL;

-- CreateIndex
CREATE INDEX `orders_status_expires_at_idx` ON `orders`(`status`, `expires_at`);

