PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_hidden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sizes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    amount       INTEGER,
    unit         TEXT,
    gram_weight  INTEGER,
    UNIQUE(name, amount, unit)
);

CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id  INTEGER,
    name         TEXT NOT NULL,
    description  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    is_hidden    INTEGER NOT NULL DEFAULT 0,
    is_deleted   INTEGER NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    image_path   TEXT NOT NULL DEFAULT 'default.png',
    FOREIGN KEY (category_id) REFERENCES categories (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS product_sizes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    size_id    INTEGER,
    price      INTEGER NOT NULL,
    calories   REAL,
    protein    REAL,
    fat        REAL,
    carbs      REAL,
    is_hidden  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (size_id) REFERENCES sizes (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT,
    phone    TEXT NOT NULL,
    address  TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name    TEXT,
    last_name     TEXT,
    name          TEXT NOT NULL,
    login         TEXT UNIQUE,
    phone         TEXT UNIQUE,
    birth_date    TEXT,
    gender        TEXT,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_courier    INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login ON users(login);

CREATE TABLE IF NOT EXISTS courier_profiles (
    user_id     INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    phone       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    notes       TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_addresses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    label      TEXT,
    address    TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_addresses_default
    ON user_addresses(user_id)
    WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS push_devices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    platform   TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_statuses (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    code  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER,
    user_id      INTEGER,
    courier_id   INTEGER,
    status_id    INTEGER NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_at     DATETIME,
    claimed_at   DATETIME,
    started_delivery_at DATETIME,
    delivered_at DATETIME,
    comment      TEXT,
    delivery_method TEXT,
    delivery_time TEXT,
    payment_method TEXT,
    cash_change_from INTEGER,
    do_not_call INTEGER NOT NULL DEFAULT 0,
    total_price  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (user_id)     REFERENCES users (id),
    FOREIGN KEY (courier_id)  REFERENCES users (id),
    FOREIGN KEY (status_id)   REFERENCES order_statuses (id)
);

CREATE INDEX IF NOT EXISTS idx_orders_courier_id ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_ready_at ON orders(ready_at);

CREATE TABLE IF NOT EXISTS order_status_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    status_id  INTEGER NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment    TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (status_id) REFERENCES order_statuses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL,
    product_size_id INTEGER NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    price           INTEGER NOT NULL,
    FOREIGN KEY (order_id)        REFERENCES orders (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (product_size_id) REFERENCES product_sizes (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS site_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS v_menu_items AS
SELECT
    ps.id AS id,
    p.category_id,
    p.name AS product_name,
    s.name AS size_name,
    COALESCE(s.amount, s.gram_weight) AS size_amount,
    s.unit AS size_unit,
    TRIM(
        COALESCE(s.name, '') ||
        CASE
            WHEN s.name IS NOT NULL AND COALESCE(s.amount, s.gram_weight) IS NOT NULL THEN ', '
            ELSE ''
        END ||
        COALESCE(
            CASE
                WHEN COALESCE(s.amount, s.gram_weight) IS NOT NULL THEN
                    CAST(COALESCE(s.amount, s.gram_weight) AS TEXT) ||
                    CASE
                        WHEN s.unit IS NOT NULL AND s.unit != '' THEN ' ' || s.unit
                        ELSE ''
                    END
            END,
            ''
        )
    ) AS size_label,
    p.name ||
        CASE
            WHEN (s.name IS NOT NULL OR COALESCE(s.amount, s.gram_weight) IS NOT NULL) THEN
                ' (' ||
                TRIM(
                    COALESCE(s.name, '') ||
                    CASE
                        WHEN s.name IS NOT NULL AND COALESCE(s.amount, s.gram_weight) IS NOT NULL THEN ', '
                        ELSE ''
                    END ||
                    COALESCE(
                        CASE
                            WHEN COALESCE(s.amount, s.gram_weight) IS NOT NULL THEN
                                CAST(COALESCE(s.amount, s.gram_weight) AS TEXT) ||
                                CASE
                                    WHEN s.unit IS NOT NULL AND s.unit != '' THEN ' ' || s.unit
                                    ELSE ''
                                END
                        END,
                        ''
                    )
                ) || ')'
            ELSE ''
        END AS name,
    ps.price,
    p.description,
    ps.calories,
    ps.protein,
    ps.fat,
    ps.carbs,
    p.image_path,
    c.sort_order AS category_sort,
    p.sort_order AS product_sort
FROM product_sizes ps
JOIN products p ON p.id = ps.product_id
JOIN categories c ON c.id = p.category_id
LEFT JOIN sizes s ON s.id = ps.size_id
WHERE p.is_active = 1
  AND COALESCE(p.is_deleted, 0) = 0
  AND p.is_hidden = 0
  AND ps.is_hidden = 0
  AND c.is_hidden = 0;
