-- AlterTable
ALTER TABLE `customers` ADD COLUMN `address_line` VARCHAR(300) NULL,
    ADD COLUMN `city` VARCHAR(100) NULL,
    ADD COLUMN `last_login_at` TIMESTAMP(0) NULL,
    ADD COLUMN `postcode` VARCHAR(10) NULL,
    ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `state` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `completed_at` TIMESTAMP(0) NULL,
    ADD COLUMN `shipped_at` TIMESTAMP(0) NULL;

-- CreateIndex
CREATE INDEX `orders_customer_id_id_idx` ON `orders`(`customer_id`, `id`);

