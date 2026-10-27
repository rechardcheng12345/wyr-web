-- AlterTable
ALTER TABLE `product_variants` ADD COLUMN `height_cm` DECIMAL(6, 1) NULL,
    ADD COLUMN `length_cm` DECIMAL(6, 1) NULL,
    ADD COLUMN `width_cm` DECIMAL(6, 1) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `ai_notes` TEXT NULL,
    ADD COLUMN `brand` VARCHAR(100) NULL,
    ADD COLUMN `compatibility` TEXT NULL,
    ADD COLUMN `in_the_box` TEXT NULL,
    ADD COLUMN `keywords` TEXT NULL,
    ADD COLUMN `model` VARCHAR(100) NULL,
    ADD COLUMN `origin` VARCHAR(80) NULL,
    ADD COLUMN `specs` TEXT NULL,
    ADD COLUMN `warranty` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `product_faqs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `answer` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_faqs_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_videos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `title` VARCHAR(200) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_videos_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_faqs` ADD CONSTRAINT `product_faqs_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_videos` ADD CONSTRAINT `product_videos_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

