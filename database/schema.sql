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
-- BIKES  (each row is a unique 1-of-1 pre-owned bike)
-- ============================================================
CREATE TABLE `bikes` (
  `id`              int            NOT NULL AUTO_INCREMENT,
  `category_id`     int            NOT NULL,
  `name`            varchar(255)   NOT NULL,           -- "2019 Cannondale SuperSix Evo"
  `slug`            varchar(255)   NOT NULL,           -- URL-friendly slug
  `description`     text,
  `base_price`      decimal(10,2)  NOT NULL,           -- our asking price
  `msrp`            decimal(10,2),                     -- original retail (shown crossed out)
  `brand`           varchar(100),                      -- manufacturer: "Cannondale", "Trek", etc.
  `material`        varchar(50),                       -- "Carbon", "Aluminum", "Steel", "Titanium"
  `frame_size`      varchar(20),                       -- size code: "XS","S","S/M","M","L","L/XL","XL"
  `condition_grade` varchar(20),                       -- "excellent","very_good","good","fair"
  `weight`          varchar(50),                       -- "7.8 kg / 17.2 lbs"
  `model_year`      int,
  `specs`           json,                              -- flexible: groupset, brakes, wheels, tires, etc.
  -- 1-of-1 inventory state
  `sold`            tinyint(1)     NOT NULL DEFAULT 0, -- terminal: bike is sold
  `reservation_state`      enum('none','soft','pi_created','processing','sold') NOT NULL DEFAULT 'none',
  `reserved_until`         datetime DEFAULT NULL,       -- TTL for soft / pi_created
  `reservation_session_id` int      DEFAULT NULL,       -- which checkout_session holds the lock
  -- Catalog flags
  `featured`        tinyint(1)     DEFAULT 0,          -- shown on homepage
  `is_active`       tinyint(1)     DEFAULT 1,          -- soft delete / hide
  `created_at`      datetime       DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      datetime       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bikes_slug` (`slug`),
  KEY `fk_bikes_category_id` (`category_id`),
  KEY `idx_bikes_featured_active` (`featured`, `is_active`),
  KEY `idx_bikes_material` (`material`),
  KEY `idx_bikes_frame_size` (`frame_size`),
  KEY `idx_bikes_condition` (`condition_grade`),
  KEY `idx_bikes_price` (`base_price`),
  KEY `idx_bikes_reservation` (`reservation_state`, `reserved_until`),
  CONSTRAINT `fk_bikes_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- CHECKOUT SESSIONS  (in-flight checkouts; before payment confirms)
-- A session is materialized into a real `orders` row by stripe-webhook on
-- payment_intent.succeeded. Abandoned/expired sessions never become orders.
-- ============================================================
CREATE TABLE `checkout_sessions` (
  `id`                       int           NOT NULL AUTO_INCREMENT,
  `session_token`            varchar(64)   NOT NULL,
  `order_number`             varchar(30),                -- pre-generated; transfers to orders on materialization
  `buyer_token`              varchar(64),                -- localStorage UUID for same-buyer recognition
  `customer_email`           varchar(255)  NOT NULL,
  `customer_name`            varchar(200)  NOT NULL,
  `customer_phone`           varchar(20),
  `shipping_address`         json          NOT NULL,
  `shipping_rate_id`         int,
  `shipping_fee`             decimal(10,2) DEFAULT 0.00,
  `subtotal`                 decimal(10,2) NOT NULL,
  `discount_amount`          decimal(10,2) DEFAULT 0.00,
  `total`                    decimal(10,2) NOT NULL,
  `promo_code`               varchar(50),
  `items`                    json          NOT NULL,    -- [{bike_id, bike_name, quantity, unit_price}]
  `stripe_payment_intent_id` varchar(255),
  `status`                   enum('active','converted','abandoned','expired') DEFAULT 'active',
  `converted_to_order_id`    int,
  `expires_at`               datetime,
  `created_at`               datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_token` (`session_token`),
  UNIQUE KEY `uk_session_order_number` (`order_number`),
  KEY `idx_session_buyer_token` (`buyer_token`),
  KEY `idx_session_pi` (`stripe_payment_intent_id`),
  KEY `idx_session_status` (`status`),
  KEY `idx_session_expires` (`expires_at`)
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
-- Only contains real, paid orders. In-flight state lives in checkout_sessions.
CREATE TABLE `orders` (
  `id`                      int           NOT NULL AUTO_INCREMENT,
  `order_number`            varchar(30)   NOT NULL,    -- "MX-YYYYMMDD-XXXXXXXXXX" (10 hex)
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
  `quantity`    int           DEFAULT 1,
  `unit_price`  decimal(10,2) NOT NULL,    -- snapshot of price at time of order
  PRIMARY KEY (`id`),
  KEY `fk_order_items_order_id` (`order_id`),
  KEY `fk_order_items_bike_id` (`bike_id`),
  CONSTRAINT `fk_order_items_order`   FOREIGN KEY (`order_id`)   REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_bike`    FOREIGN KEY (`bike_id`)    REFERENCES `bikes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ============================================================
-- PROCESSED STRIPE EVENTS  (webhook idempotency)
-- ============================================================
CREATE TABLE `processed_stripe_events` (
  `event_id`     varchar(255) NOT NULL,
  `event_type`   varchar(100),
  `processed_at` datetime     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_processed_at` (`processed_at`)
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
