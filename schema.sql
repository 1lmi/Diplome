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
    category_id  INTEGER NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    is_hidden    INTEGER NOT NULL DEFAULT 0,
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
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    status_id    INTEGER NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment      TEXT,
    total_price  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (user_id)     REFERENCES users (id),
    FOREIGN KEY (status_id)   REFERENCES order_statuses (id)
);

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
  AND p.is_hidden = 0
  AND ps.is_hidden = 0
  AND c.is_hidden = 0;
