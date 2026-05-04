-- ============================================================
-- MachX Cycles — Database Schema
-- Database: machx_cycles (on existing brooklyn-bikery RDS instance)
-- MySQL 8.0 | InnoDB | utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS `machx_cycles`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `machx_cycles`;

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE `categories` (
  `id`          int          NOT NULL AUTO_INCREMENT,
  `name`        varchar(100) NOT NULL,           -- "Road", "Mountain", "Hybrid", "Cruiser", "Gravel", "E-Bike"
  `slug`        varchar(100) NOT NULL,           -- "road", "mountain", etc.
  `description` text,
  `image_url`   varchar(500),
  `sort_order`  int          DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- BIKES  (product-level info; stock is tracked on bike_variants)
-- ============================================================
CREATE TABLE `bikes` (
  `id`          int            NOT NULL AUTO_INCREMENT,
  `category_id` int            NOT NULL,
  `name`        varchar(255)   NOT NULL,           -- "MachX Aero Pro 2025"
  `slug`        varchar(255)   NOT NULL,           -- URL-friendly name
  `description` text,
  `base_price`  decimal(10,2)  NOT NULL,           -- base MSRP; variants can override
  `material`    varchar(50),                       -- "Carbon Fiber", "Aluminum", "Steel", "Titanium"
  `weight`      varchar(50),                       -- "7.8 kg / 17.2 lbs"
  `brand`       varchar(100)   DEFAULT 'MachX',
  `model_year`  int,
  `specs`       json,                              -- flexible: groupset, brakes, wheels, tires, etc.
  `featured`    tinyint(1)     DEFAULT 0,          -- show on homepage
  `is_active`   tinyint(1)     DEFAULT 1,          -- soft delete / hide
  `created_at`  datetime       DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  datetime       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bikes_slug` (`slug`),
  KEY `fk_bikes_category_id` (`category_id`),
  KEY `idx_bikes_featured_active` (`featured`, `is_active`),
  KEY `idx_bikes_material` (`material`),
  KEY `idx_bikes_price` (`base_price`),
  CONSTRAINT `fk_bikes_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- BIKE VARIANTS  (one row per purchasable SKU: size + color combo)
-- A "MachX Aero Pro" in 3 sizes × 2 colors = 6 rows.
-- A "1-of-1" custom bike = 1 row with stock_count = 1.
-- ============================================================
CREATE TABLE `bike_variants` (
  `id`             int           NOT NULL AUTO_INCREMENT,
  `bike_id`        int           NOT NULL,
  `sku`            varchar(50)   NOT NULL,           -- "MACHX-AERO-54-BLK"
  `frame_size`     varchar(20)   NOT NULL,           -- "48", "50", "52", "54", "56", "58" or "S", "M", "L", "XL"
  `color`          varchar(50)   NOT NULL,           -- "Matte Black", "Gloss Red"
  `price_override` decimal(10,2) DEFAULT NULL,       -- NULL = use bike.base_price
  `stock_count`    int           NOT NULL DEFAULT 0,
  `is_active`      tinyint(1)    DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_variants_sku` (`sku`),
  KEY `fk_variants_bike_id` (`bike_id`),
  KEY `idx_variants_stock` (`stock_count`),
  CONSTRAINT `fk_variants_bike` FOREIGN KEY (`bike_id`) REFERENCES `bikes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- BIKE IMAGES  (multiple images per bike; sort_order 0 = primary)
-- ============================================================
CREATE TABLE `bike_images` (
  `id`         int          NOT NULL AUTO_INCREMENT,
  `bike_id`    int          NOT NULL,
  `url`        varchar(500) NOT NULL,    -- S3/CloudFront URL
  `alt_text`   varchar(255),
  `sort_order` int          DEFAULT 0,
  `created_at` datetime     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_bike_images_bike_id` (`bike_id`),
  CONSTRAINT `fk_bike_images_bike` FOREIGN KEY (`bike_id`) REFERENCES `bikes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE `orders` (
  `id`                      int           NOT NULL AUTO_INCREMENT,
  `order_number`            varchar(20)   NOT NULL,    -- human-readable: "MX-20250219-0001"
  `customer_email`          varchar(255)  NOT NULL,
  `customer_name`           varchar(200)  NOT NULL,
  `customer_phone`          varchar(20),
  -- Fulfillment
  `fulfillment_type`        enum('ship','pickup')                                   NOT NULL,
  `payment_type`            enum('full','reservation')                              NOT NULL,
  `reservation_fee`         decimal(10,2),             -- amount paid as deposit (if reservation)
  `amount_due`              decimal(10,2),             -- remaining balance (if reservation)
  `shipping_address`        json,                      -- {street, city, state, zip} — required if ship
  `shipping_fee`            decimal(10,2)  DEFAULT 0.00,
  -- Pricing
  `subtotal`                decimal(10,2)  NOT NULL,
  `discount_amount`         decimal(10,2)  DEFAULT 0.00,
  `tax`                     decimal(10,2)  DEFAULT 0.00,
  `total`                   decimal(10,2)  NOT NULL,
  -- Stripe (PaymentIntent is the source of truth)
  `stripe_payment_intent_id` varchar(255),
  `stripe_latest_charge_id`  varchar(255),
  -- Payment status (tracks refund lifecycle separately from order status)
  `payment_status`          enum('unpaid','paid','refund_pending','refunded','refund_failed') NOT NULL DEFAULT 'unpaid',
  `refund_reason`           varchar(255),
  -- Order status
  `status`                  enum('pending','confirmed','processing','shipped','ready_for_pickup','completed','cancelled') DEFAULT 'pending',
  `notes`                   text,
  -- Idempotency — prevents duplicate orders on retry/double-click
  `idempotency_key`         varchar(64),
  `created_at`              datetime       DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              datetime       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_order_number` (`order_number`),
  UNIQUE KEY `uk_orders_idempotency_key` (`idempotency_key`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_payment_status` (`payment_status`),
  KEY `idx_orders_email` (`customer_email`),
  KEY `idx_orders_created` (`created_at`),
  KEY `idx_orders_stripe_pi` (`stripe_payment_intent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- ORDER ITEMS  (references variant to track exact SKU purchased)
-- ============================================================
CREATE TABLE `order_items` (
  `id`          int           NOT NULL AUTO_INCREMENT,
  `order_id`    int           NOT NULL,
  `bike_id`     int           NOT NULL,
  `variant_id`  int           NOT NULL,
  `quantity`    int           DEFAULT 1,
  `unit_price`  decimal(10,2) NOT NULL,    -- snapshot of price at time of order
  `frame_size`  varchar(20)   NOT NULL,    -- denormalized for easy display
  `color`       varchar(50)   NOT NULL,    -- denormalized for easy display
  PRIMARY KEY (`id`),
  KEY `fk_order_items_order_id` (`order_id`),
  KEY `fk_order_items_bike_id` (`bike_id`),
  KEY `fk_order_items_variant_id` (`variant_id`),
  CONSTRAINT `fk_order_items_order`   FOREIGN KEY (`order_id`)   REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_bike`    FOREIGN KEY (`bike_id`)    REFERENCES `bikes` (`id`),
  CONSTRAINT `fk_order_items_variant` FOREIGN KEY (`variant_id`) REFERENCES `bike_variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- PROMOTIONS / SALES
-- ============================================================
CREATE TABLE `promotions` (
  `id`               int            NOT NULL AUTO_INCREMENT,
  `name`             varchar(255)   NOT NULL,    -- "Summer Sale 2025", "Black Friday"
  `description`      text,
  `discount_type`    enum('percentage','fixed') NOT NULL,
  `discount_value`   decimal(10,2)  NOT NULL,    -- 15.00 = 15% OR $15 off
  `min_order_amount` decimal(10,2),
  `applies_to`       enum('all','category','bike') DEFAULT 'all',
  `category_id`      int            DEFAULT NULL,
  `bike_id`          int            DEFAULT NULL,
  `promo_code`       varchar(50),               -- optional coupon code
  `start_date`       datetime       NOT NULL,
  `end_date`         datetime       NOT NULL,
  `is_active`        tinyint(1)     DEFAULT 1,
  `created_at`       datetime       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_promotions_dates` (`start_date`, `end_date`, `is_active`),
  KEY `fk_promotions_category_id` (`category_id`),
  KEY `fk_promotions_bike_id` (`bike_id`),
  CONSTRAINT `fk_promotions_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_promotions_bike`     FOREIGN KEY (`bike_id`)     REFERENCES `bikes` (`id`)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- SHIPPING RATES
-- ============================================================
CREATE TABLE `shipping_rates` (
  `id`             int           NOT NULL AUTO_INCREMENT,
  `name`           varchar(100)  NOT NULL,    -- "Standard", "Express", "Local Delivery"
  `price`          decimal(10,2) NOT NULL,
  `estimated_days` varchar(50),              -- "5-7 business days"
  `is_active`      tinyint(1)    DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- SITE SETTINGS  (key-value store for configurable options)
-- ============================================================
CREATE TABLE `site_settings` (
  `key_name`   varchar(100) NOT NULL,
  `value`      text         NOT NULL,
  `updated_at` datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- ORDER EVENTS  (audit log — why is this order stuck at pending?)
-- ============================================================
CREATE TABLE `order_events` (
  `id`          int          NOT NULL AUTO_INCREMENT,
  `order_id`    int          NOT NULL,
  `event_type`  varchar(50)  NOT NULL,    -- "payment_intent.succeeded", "status_change", "refund", "webhook_received"
  `message`     text,                    -- human-readable: "Status changed from pending to confirmed"
  `metadata`    json,                    -- optional: stripe event id, admin user, etc.
  `created_at`  datetime     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_order_events_order_id` (`order_id`),
  KEY `idx_order_events_type` (`event_type`),
  CONSTRAINT `fk_order_events_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO `site_settings` (`key_name`, `value`) VALUES
  ('store_name',                 'MachX Cycles'),
  ('reservation_fee_percentage', '10'),
  ('tax_rate',                   '8.875'),
  ('store_address',              '{"street":"","city":"Brooklyn","state":"NY","zip":""}'),
  ('contact_email',              ''),
  ('contact_phone',              '');

INSERT INTO `shipping_rates` (`name`, `price`, `estimated_days`, `is_active`) VALUES
  ('Standard Shipping', 49.99, '5-7 business days', 1),
  ('Express Shipping',  99.99, '2-3 business days', 1),
  ('Local Delivery',    29.99, '1-2 business days', 1),
  ('In-Store Pickup',    0.00, 'Ready same day',    1);

INSERT INTO `categories` (`name`, `slug`, `description`, `sort_order`) VALUES
  ('Road',     'road',     'High-performance road bikes for speed and endurance',      1),
  ('Mountain', 'mountain', 'Built tough for trails, technical terrain, and adventure', 2),
  ('Hybrid',   'hybrid',   'Versatile bikes for commuting and recreational riding',    3),
  ('Cruiser',  'cruiser',  'Comfortable, stylish bikes for casual riding',             4),
  ('Gravel',   'gravel',   'Designed for mixed terrain and long-distance adventure',   5),
  ('E-Bike',   'e-bike',   'Electric-assist bikes for effortless riding',             6);
