-- WYR website, MySQL 8 draft schema (v0.1)
CREATE TABLE stores (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL); -- WYR Technology, WYR Virtual Concept
CREATE TABLE categories (id INT PRIMARY KEY AUTO_INCREMENT, parent_id INT NULL, name VARCHAR(100), slug VARCHAR(120) UNIQUE, FOREIGN KEY (parent_id) REFERENCES categories(id));
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT, store_id INT NOT NULL, category_id INT,
  parent_sku VARCHAR(80) UNIQUE, name VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE,
  description TEXT, product_type ENUM('physical','digital') NOT NULL DEFAULT 'physical',
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id), FOREIGN KEY (category_id) REFERENCES categories(id));
CREATE TABLE product_variants (
  id INT PRIMARY KEY AUTO_INCREMENT, product_id INT NOT NULL, sku VARCHAR(80) UNIQUE NOT NULL,
  variation_name VARCHAR(150), price DECIMAL(10,2), special_price DECIMAL(10,2),
  weight_g INT, FOREIGN KEY (product_id) REFERENCES products(id));
CREATE TABLE product_images (id INT PRIMARY KEY AUTO_INCREMENT, product_id INT, variant_id INT NULL, url VARCHAR(500), sort_order INT DEFAULT 0, FOREIGN KEY (product_id) REFERENCES products(id));
-- Marketplace links for the "Buy where you like" strip, plus IDs for sync
CREATE TABLE marketplace_listings (
  id INT PRIMARY KEY AUTO_INCREMENT, product_id INT NOT NULL,
  platform ENUM('shopee','lazada','tiktok') NOT NULL, external_item_id VARCHAR(50), url VARCHAR(500),
  UNIQUE (product_id, platform), FOREIGN KEY (product_id) REFERENCES products(id));
-- Single source of truth for stock on the site; refreshed from BigSeller
CREATE TABLE inventory (
  variant_id INT PRIMARY KEY, available INT NOT NULL DEFAULT 0, reserved INT NOT NULL DEFAULT 0,
  safety_buffer INT NOT NULL DEFAULT 1, synced_at TIMESTAMP NULL, FOREIGN KEY (variant_id) REFERENCES product_variants(id));
CREATE TABLE customers (id INT PRIMARY KEY AUTO_INCREMENT, email VARCHAR(255) UNIQUE, name VARCHAR(150), phone VARCHAR(30), password_hash VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT, order_no VARCHAR(30) UNIQUE, customer_id INT,
  status ENUM('pending_payment','paid','sent_to_bigseller','shipped','completed','cancelled','refunded') DEFAULT 'pending_payment',
  subtotal DECIMAL(10,2), shipping_fee DECIMAL(10,2), total DECIMAL(10,2),
  ship_name VARCHAR(150), ship_phone VARCHAR(30), ship_address TEXT, ship_postcode VARCHAR(10), ship_state VARCHAR(50),
  courier VARCHAR(50), tracking_no VARCHAR(80), bigseller_order_id VARCHAR(80) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (customer_id) REFERENCES customers(id));
CREATE TABLE order_items (id INT PRIMARY KEY AUTO_INCREMENT, order_id INT, variant_id INT, qty INT, unit_price DECIMAL(10,2), customization JSON NULL, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (variant_id) REFERENCES product_variants(id));
CREATE TABLE payments (id INT PRIMARY KEY AUTO_INCREMENT, order_id INT, provider VARCHAR(30), provider_ref VARCHAR(100) UNIQUE, method VARCHAR(30), amount DECIMAL(10,2), status VARCHAR(20), raw_webhook JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES orders(id));
-- Use-case wizard
CREATE TABLE use_cases (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(150), description TEXT, recommended_chip VARCHAR(60), reason TEXT);
CREATE TABLE use_case_products (use_case_id INT, product_id INT, PRIMARY KEY (use_case_id, product_id));
-- Phase 3: hosted tap pages
CREATE TABLE tags (id INT PRIMARY KEY AUTO_INCREMENT, short_code VARCHAR(12) UNIQUE, customer_id INT, target_url VARCHAR(500), page_json JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE tap_events (id BIGINT PRIMARY KEY AUTO_INCREMENT, tag_id INT, tapped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, user_agent VARCHAR(300), country VARCHAR(2), INDEX (tag_id, tapped_at));
-- Cross-platform SKU mapping (Lazada SKUs often carry pack prefixes, e.g. wholesale3_black_nfcntag215 -> nfcntag215)
CREATE TABLE platform_skus (
  id INT PRIMARY KEY AUTO_INCREMENT, variant_id INT NOT NULL,
  platform ENUM('shopee','lazada') NOT NULL, platform_sku VARCHAR(120) NOT NULL,
  external_item_id VARCHAR(50), pack_qty INT NOT NULL DEFAULT 1,
  match_method ENUM('exact','prefix_rule','manual') DEFAULT 'exact', needs_review BOOLEAN DEFAULT FALSE,
  UNIQUE (platform, platform_sku), FOREIGN KEY (variant_id) REFERENCES product_variants(id));
