PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS sizes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,  -- '260 г', '340 г', 'Стандарт', '0,5 л'
    gram_weight  INTEGER
);

CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id  INTEGER NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS product_sizes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    size_id    INTEGER,
    price      INTEGER NOT NULL, -- рубли
    calories   REAL,
    protein    REAL,
    fat        REAL,
    carbs      REAL,
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

CREATE TABLE IF NOT EXISTS order_statuses (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    code  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER,
    status_id    INTEGER NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment      TEXT,
    total_price  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (status_id)   REFERENCES order_statuses (id)
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

CREATE VIEW IF NOT EXISTS v_menu_items AS
SELECT
    ps.id AS id,
    p.category_id,
    p.name ||
        CASE
            WHEN s.name IS NOT NULL THEN ' (' || s.name || ')'
            ELSE ''
        END AS name,
    ps.price,
    p.description,
    ps.calories,
    ps.protein,
    ps.fat,
    ps.carbs
FROM product_sizes ps
JOIN products p ON p.id = ps.product_id
LEFT JOIN sizes s ON s.id = ps.size_id
WHERE p.is_active = 1;
