-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(60) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

