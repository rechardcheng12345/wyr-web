-- AlterTable
ALTER TABLE `stock_movements` ADD COLUMN `document_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `clients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `address` TEXT NULL,
    `attention` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `clients_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('quotation', 'invoice', 'delivery_order') NOT NULL,
    `year` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `doc_no` VARCHAR(30) NOT NULL,
    `status` ENUM('draft', 'issued', 'void') NOT NULL DEFAULT 'issued',
    `doc_date` DATE NOT NULL,
    `client_id` INTEGER NULL,
    `bill_to_name` VARCHAR(200) NOT NULL,
    `bill_to_address` TEXT NULL,
    `attention` VARCHAR(150) NULL,
    `customer_ref` VARCHAR(100) NULL,
    `valid_until` DATE NULL,
    `other_label` VARCHAR(100) NULL,
    `other_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `paid_at` DATE NULL,
    `issued_at` TIMESTAMP(0) NULL,
    `source_id` INTEGER NULL,
    `order_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `documents_doc_no_key`(`doc_no`),
    INDEX `documents_type_doc_date_idx`(`type`, `doc_date`),
    INDEX `documents_order_id_idx`(`order_id`),
    UNIQUE INDEX `documents_type_year_seq_key`(`type`, `year`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `variant_id` INTEGER NULL,
    `sku` VARCHAR(80) NULL,
    `description` TEXT NOT NULL,
    `note` VARCHAR(500) NULL,
    `qty` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

