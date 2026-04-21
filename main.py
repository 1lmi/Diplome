from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import logging
import mimetypes
import re
import secrets
import sqlite3
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request
from xml.etree import ElementTree as ET

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DB_PATH = Path("sc-restaurant.db")
SCHEMA_PATH = Path("schema.sql")
UPLOAD_DIR = Path("uploads")
INTEGRATION_DIR = UPLOAD_DIR / "integrations"
TOKEN_TTL_DAYS = 30
DEFAULT_IMAGE_NAME = "default.png"
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
DEFAULT_SOURCE_SYSTEM = "sc-restaurant"

mimetypes.add_type("image/avif", ".avif")

app = FastAPI(title="SC restaurant API")
logger = logging.getLogger("sc-restaurant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- security helpers --------------------------------------------------------

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, 120_000
    )
    return f"{salt_bytes.hex()}:{hashed.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split(":", 1)
    except ValueError:
        return False

    salt_bytes = bytes.fromhex(salt_hex)
    recalculated = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, 120_000
    ).hex()
    return secrets.compare_digest(recalculated, hash_hex)


def build_image_url(image_path: str, request: Optional[Request] = None) -> str:
    filename = image_path or DEFAULT_IMAGE_NAME
    if request is None:
        return f"/static/{filename}"
    base = str(request.base_url).rstrip("/")
    return f"{base}/static/{filename}"


ADMIN_PHONE = "+79374702232"
CANONICAL_PHONE_RE = re.compile(r"^\+7\d{10}$")


def validate_password_strength(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Пароль должен содержать минимум 6 символов.",
        )


def normalize_phone_login(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11 and digits.startswith("8"):
        digits = f"7{digits[1:]}"
    if len(digits) == 10:
        digits = f"7{digits}"
    normalized = f"+{digits}" if digits else ""
    if not CANONICAL_PHONE_RE.match(normalized):
        raise HTTPException(
            status_code=400,
            detail="Укажите номер телефона в формате +7 (xxx) xxx-xx-xx.",
        )
    return normalized

# --- migration helpers -------------------------------------------------------

def ensure_default_image_file() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    INTEGRATION_DIR.mkdir(parents=True, exist_ok=True)
    default_path = UPLOAD_DIR / DEFAULT_IMAGE_NAME
    if default_path.exists():
        return

    placeholder = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAnsB9pWSbS8AAAAASUVORK5CYII="
    )
    default_path.write_bytes(placeholder)


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    info = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in info)


def ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def model_dump_unset(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def relax_products_category_nullable(conn: sqlite3.Connection) -> None:
    info = conn.execute("PRAGMA table_info(products)").fetchall()
    if not info:
        return
    category_info = next((r for r in info if r["name"] == "category_id"), None)
    if not category_info or category_info["notnull"] == 0:
        return

    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'"
    ).fetchone()
    if not row or not row["sql"]:
        return

    create_sql = row["sql"]
    create_sql = re.sub(
        r"CREATE TABLE\s+products",
        "CREATE TABLE products_new",
        create_sql,
        flags=re.IGNORECASE,
    )
    create_sql = re.sub(
        r"category_id\s+INTEGER\s+NOT\s+NULL",
        "category_id INTEGER",
        create_sql,
        flags=re.IGNORECASE,
    )
    if create_sql == row["sql"]:
        return

    conn.execute("DROP VIEW IF EXISTS v_menu_items")
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("BEGIN")
    conn.execute(create_sql)
    columns = ", ".join([r["name"] for r in info])
    conn.execute(f"INSERT INTO products_new ({columns}) SELECT {columns} FROM products")
    conn.execute("DROP TABLE products")
    conn.execute("ALTER TABLE products_new RENAME TO products")
    conn.execute("COMMIT")
    conn.execute("PRAGMA foreign_keys = ON")


def seed_statuses(conn: sqlite3.Connection) -> None:
    statuses = [
        ("new", "Новый"),
        ("cooking", "Готовится"),
        ("ready", "Готов"),
        ("on_way", "В пути"),
        ("done", "Выдан"),
        ("canceled", "Отменён"),
    ]
    for code, name in statuses:
        row = conn.execute(
            "SELECT id, name FROM order_statuses WHERE code = ?", (code,)
        ).fetchone()
        if row:
            if row["name"] != name:
                conn.execute(
                    "UPDATE order_statuses SET name = ? WHERE id = ?",
                    (name, row["id"]),
                )
        else:
            conn.execute(
                "INSERT INTO order_statuses(code, name) VALUES (?, ?)", (code, name)
            )


TERMINAL_ORDER_STATUSES = {
    "done",
    "canceled",
    "cancelled",
    "delivered",
    "completed",
    "finished",
}


def get_effective_delivery_method(
    delivery_method: Optional[str], customer_address: Optional[str]
) -> str:
    normalized = (delivery_method or "").strip().lower()
    if normalized in ("delivery", "pickup"):
        return normalized
    return "delivery" if (customer_address and str(customer_address).strip()) else "pickup"


def get_allowed_status_transitions(current_status: Optional[str], delivery_method: str) -> set[str]:
    normalized = (current_status or "").strip().lower()
    if normalized in TERMINAL_ORDER_STATUSES:
        return set()
    if normalized == "new":
        return {"cooking", "canceled"}
    if normalized == "cooking":
        return {"ready", "canceled"}
    if normalized == "ready":
        return {"on_way", "canceled"} if delivery_method == "delivery" else {"done", "canceled"}
    if normalized == "on_way":
        return {"done", "canceled"}
    return {"canceled"}


def get_admin_allowed_status_transitions(
    current_status: Optional[str], delivery_method: str
) -> set[str]:
    normalized = (current_status or "").strip().lower()
    if normalized in TERMINAL_ORDER_STATUSES:
        return set()
    if normalized == "new":
        return {"cooking", "canceled"}
    if normalized == "cooking":
        return {"ready", "canceled"}
    if normalized == "ready":
        return {"done", "canceled"} if delivery_method == "pickup" else {"canceled"}
    if normalized == "on_way":
        return {"done", "canceled"}
    return {"canceled"}


def ensure_sort_order(conn: sqlite3.Connection, table: str) -> None:
    rows = conn.execute(f"SELECT id, sort_order FROM {table} ORDER BY id").fetchall()
    if rows and all(r["sort_order"] == 0 for r in rows):
        for idx, row in enumerate(rows):
            conn.execute(
                f"UPDATE {table} SET sort_order = ? WHERE id = ?", (idx, row["id"])
            )


def apply_migrations() -> None:
    ensure_default_image_file()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")

    required_tables = {"categories", "orders", "order_statuses", "products", "product_sizes"}
    existing_tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    if not required_tables.issubset(existing_tables):
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT,
            last_name TEXT,
            name TEXT NOT NULL,
            login TEXT UNIQUE,
            phone TEXT UNIQUE,
            birth_date TEXT,
            gender TEXT,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            is_courier INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_addresses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            label TEXT,
            address TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS courier_profiles (
            user_id INTEGER PRIMARY KEY,
            display_name TEXT NOT NULL,
            phone TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS push_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            platform TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS order_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            status_id INTEGER NOT NULL,
            changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            comment TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (status_id) REFERENCES order_statuses(id) ON DELETE CASCADE
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS integration_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            format TEXT NOT NULL,
            profile TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            requested_by INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME,
            summary_json TEXT,
            source_filename TEXT,
            artifact_path TEXT,
            artifact_filename TEXT,
            error_report_path TEXT,
            error_report_filename TEXT,
            FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS integration_job_errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            row_no INTEGER,
            entity_key TEXT,
            error_code TEXT,
            message TEXT NOT NULL,
            payload_json TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES integration_jobs(id) ON DELETE CASCADE
        )
        """
    )

    ensure_column(conn, "categories", "sort_order", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "categories", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "categories", "external_id", "TEXT")
    ensure_column(conn, "categories", "source_system", "TEXT")
    ensure_column(conn, "products", "sort_order", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "products", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "products", "is_deleted", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "products", "external_id", "TEXT")
    ensure_column(conn, "products", "source_system", "TEXT")
    ensure_column(
        conn,
        "products",
        "image_path",
        f"TEXT NOT NULL DEFAULT '{DEFAULT_IMAGE_NAME}'",
    )
    relax_products_category_nullable(conn)
    ensure_column(conn, "product_sizes", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "product_sizes", "external_id", "TEXT")
    ensure_column(conn, "product_sizes", "source_system", "TEXT")
    ensure_column(conn, "product_sizes", "sku", "TEXT")
    ensure_column(conn, "product_sizes", "barcode", "TEXT")
    ensure_column(conn, "sizes", "external_id", "TEXT")
    ensure_column(conn, "sizes", "source_system", "TEXT")
    ensure_column(conn, "customers", "external_id", "TEXT")
    ensure_column(conn, "customers", "source_system", "TEXT")
    ensure_column(conn, "orders", "user_id", "INTEGER REFERENCES users(id)")
    ensure_column(conn, "orders", "delivery_method", "TEXT")
    ensure_column(conn, "orders", "delivery_time", "TEXT")
    ensure_column(conn, "orders", "payment_method", "TEXT")
    ensure_column(conn, "orders", "cash_change_from", "INTEGER")
    ensure_column(conn, "orders", "do_not_call", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "orders", "courier_id", "INTEGER REFERENCES users(id)")
    ensure_column(conn, "orders", "ready_at", "DATETIME")
    ensure_column(conn, "orders", "claimed_at", "DATETIME")
    ensure_column(conn, "orders", "started_delivery_at", "DATETIME")
    ensure_column(conn, "orders", "delivered_at", "DATETIME")
    ensure_column(conn, "orders", "external_id", "TEXT")
    ensure_column(conn, "orders", "source_system", "TEXT")
    ensure_column(conn, "orders", "imported_at", "DATETIME")
    ensure_column(conn, "users", "first_name", "TEXT")
    ensure_column(conn, "users", "last_name", "TEXT")
    ensure_column(conn, "users", "login", "TEXT")
    ensure_column(conn, "users", "birth_date", "TEXT")
    ensure_column(conn, "users", "gender", "TEXT")
    ensure_column(conn, "users", "is_courier", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "sizes", "amount", "INTEGER")
    ensure_column(conn, "sizes", "unit", "TEXT")
    conn.execute(
        "UPDATE sizes SET amount = COALESCE(amount, gram_weight) WHERE amount IS NULL AND gram_weight IS NOT NULL"
    )
    conn.execute(
        "UPDATE sizes SET unit = COALESCE(unit, 'грамм') WHERE unit IS NULL AND gram_weight IS NOT NULL"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_categories_external_source ON categories(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_products_external_source ON products(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sizes_external_source ON sizes(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_sizes_external_source ON product_sizes(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_customers_external_source ON customers(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_external_source ON orders(source_system, external_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_integration_jobs_created_at ON integration_jobs(created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_integration_job_errors_job_id ON integration_job_errors(job_id)"
    )

    users_rows = conn.execute(
        "SELECT id, name, phone, first_name, last_name, login, birth_date, gender FROM users"
    ).fetchall()
    for user_row in users_rows:
        first_name = (user_row["first_name"] or "").strip()
        last_name = (user_row["last_name"] or "").strip()
        name = (user_row["name"] or "").strip()
        if (not first_name or not last_name) and name:
            parts = name.split(maxsplit=1)
            if not first_name and parts:
                first_name = parts[0]
            if not last_name and len(parts) > 1:
                last_name = parts[1]
        login_value = (user_row["login"] or user_row["phone"] or "").strip()
        if not login_value:
            login_value = name
        full_name = name or f"{first_name} {last_name}".strip()
        conn.execute(
            """
            UPDATE users
            SET first_name = COALESCE(NULLIF(first_name, ''), ?),
                last_name = COALESCE(NULLIF(last_name, ''), ?),
                login = COALESCE(NULLIF(login, ''), ?),
                name = COALESCE(NULLIF(name, ''), ?)
            WHERE id = ?
            """,
            (first_name, last_name, login_value, full_name, user_row["id"]),
    )

    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login ON users(login)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_courier_id ON orders(courier_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_ready_at ON orders(ready_at)"
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_addresses_default
        ON user_addresses(user_id)
        WHERE is_default = 1
        """
    )

    conn.executescript(
        f"""
        DROP VIEW IF EXISTS v_menu_items;
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
            COALESCE(p.image_path, '{DEFAULT_IMAGE_NAME}') AS image_path,
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
        """
    )

    conn.execute(
        "UPDATE products SET image_path = ? WHERE image_path IS NULL OR image_path = ''",
        (DEFAULT_IMAGE_NAME,),
    )

    seed_statuses(conn)
    ensure_sort_order(conn, "categories")
    ensure_sort_order(conn, "products")

    admin_row = conn.execute(
        "SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1"
    ).fetchone()
    if admin_row is None:
        password_hash = hash_password("admin1234")
        conn.execute(
            """
            INSERT INTO users(name, first_name, last_name, login, phone, password_hash, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            ("Admin", "Admin", "User", ADMIN_PHONE, ADMIN_PHONE, password_hash),
        )
    else:
        conn.execute(
            "UPDATE users SET login = ?, phone = ? WHERE id = ?",
            (ADMIN_PHONE, ADMIN_PHONE, admin_row["id"]),
        )

    default_settings = {
        "hero_title": "SC restaurant",
        "hero_subtitle": "Свежие блюда и десерты с быстрой доставкой.",
        "contact_phone": "+7 (900) 000-00-00",
        "delivery_hint": "Доставляем по городу с 10:00 до 23:00.",
    }
    for key, value in default_settings.items():
        row = conn.execute("SELECT 1 FROM site_settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO site_settings(key, value) VALUES (?, ?)", (key, value)
            )
    conn.execute(
        "UPDATE site_settings SET value = ? WHERE key = 'hero_title' AND value = 'Meat Point'",
        ("SC restaurant",),
    )

    conn.commit()
    conn.close()


apply_migrations()
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

# --- FastAPI DB dependency ---------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        conn.close()


def load_user_by_token(db: sqlite3.Connection, token: str) -> Optional[sqlite3.Row]:
    return db.execute(
        """
        SELECT u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
          AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
        """,
        (token,),
    ).fetchone()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    token = credentials.credentials
    user = load_user_by_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Сессия недействительна")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: sqlite3.Connection = Depends(get_db),
) -> Optional[sqlite3.Row]:
    if credentials is None:
        return None
    user = load_user_by_token(db, credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Сессия недействительна")
    return user


def require_admin(user: sqlite3.Row = Depends(get_current_user)) -> sqlite3.Row:
    if not bool(user["is_admin"]):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return user


def fetch_courier_profile_row(
    db: sqlite3.Connection, user_id: int
) -> Optional[sqlite3.Row]:
    return db.execute(
        """
        SELECT user_id, display_name, phone, is_active, notes, created_at, updated_at
        FROM courier_profiles
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()


def require_courier(
    user: sqlite3.Row = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    if not bool(user["is_courier"]):
        raise HTTPException(status_code=403, detail="Требуется доступ курьера")
    profile = fetch_courier_profile_row(db, user["id"])
    if profile is None or not bool(profile["is_active"]):
        raise HTTPException(status_code=403, detail="Курьерский доступ отключён")
    return user


# --- Pydantic models ---------------------------------------------------------

class Category(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sort_order: int
    is_hidden: bool = False


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0
    is_hidden: bool = False


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_hidden: Optional[bool] = None


class MenuItem(BaseModel):
    id: int
    category_id: int
    name: str
    price: int
    description: Optional[str] = None
    product_name: Optional[str] = None
    size_name: Optional[str] = None
    size_amount: Optional[int] = None
    size_unit: Optional[str] = None
    size_label: Optional[str] = None
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    image_path: str
    image_url: str


class CustomerIn(BaseModel):
    name: Optional[str] = None
    phone: str
    address: Optional[str] = None


class OrderItemIn(BaseModel):
    product_size_id: int
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer: CustomerIn
    delivery_method: Optional[str] = None
    delivery_time: Optional[str] = None
    payment_method: Optional[str] = None
    cash_change_from: Optional[int] = None
    do_not_call: bool = False
    comment: Optional[str] = None
    items: List[OrderItemIn]


class OrderItemOut(BaseModel):
    product_size_id: int
    product_name: str
    size_name: Optional[str]
    price: int
    quantity: int
    line_total: int
    image_url: Optional[str] = None


class OrderHistoryItem(BaseModel):
    status: str
    status_name: str
    changed_at: datetime
    comment: Optional[str] = None


class CourierProfileOut(BaseModel):
    display_name: str
    phone: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderOut(BaseModel):
    id: int
    status: str
    status_name: str
    created_at: datetime
    comment: Optional[str]
    total_price: int
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_address: Optional[str]
    delivery_method: Optional[str]
    delivery_time: Optional[str]
    payment_method: Optional[str]
    cash_change_from: Optional[int]
    do_not_call: bool = False
    courier_id: Optional[int] = None
    courier_name: Optional[str] = None
    courier_phone: Optional[str] = None
    ready_at: Optional[datetime] = None
    claimed_at: Optional[datetime] = None
    started_delivery_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    items: List[OrderItemOut]
    history: List[OrderHistoryItem] = []


class OrderStatusUpdate(BaseModel):
    status_code: str
    comment: Optional[str] = None


class OrderStatus(BaseModel):
    code: str
    name: str


class RegisterBody(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: Optional[str] = None
    login: str = Field(min_length=1)
    password: str = Field(min_length=6)
    birth_date: Optional[str] = None
    gender: Optional[str] = None


class LoginBody(BaseModel):
    login: str
    password: str


class UserOut(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    login: str
    full_name: str
    name: str
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    is_admin: bool
    is_courier: bool
    courier_profile: Optional[CourierProfileOut] = None


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None


class UserAddressCreate(BaseModel):
    label: Optional[str] = None
    address: str = Field(min_length=1)
    is_default: bool = False


class UserAddressUpdate(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = None
    is_default: Optional[bool] = None


class UserAddressOut(BaseModel):
    id: int
    label: Optional[str] = None
    address: str
    is_default: bool
    created_at: datetime


class PushTokenUpsert(BaseModel):
    token: str = Field(min_length=8)
    platform: Optional[str] = None


class PushTokenDelete(BaseModel):
    token: str = Field(min_length=8)


class OkResponse(BaseModel):
    ok: bool


class ProductSizePayload(BaseModel):
    id: Optional[int] = None
    size_name: Optional[str] = None
    amount: Optional[int] = None
    unit: Optional[str] = None
    grams: Optional[int] = None  # backward compatibility alias
    price: int
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    is_hidden: bool = False


class ProductSizeOut(BaseModel):
    id: int
    name: Optional[str]
    amount: Optional[int]
    unit: Optional[str]
    price: int
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    is_hidden: bool = False


class ProductCreate(BaseModel):
    category_id: int
    name: str
    description: Optional[str] = None
    image_path: Optional[str] = None
    is_hidden: bool = False
    is_active: bool = True
    sort_order: int = 0
    sizes: List[ProductSizePayload]


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    image_path: Optional[str] = None
    is_hidden: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    sizes: Optional[List[ProductSizePayload]] = None
    remove_size_ids: Optional[List[int]] = None


class AdminProductOut(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str]
    image_path: str
    image_url: str
    is_hidden: bool
    is_active: bool
    sort_order: int
    sizes: List[ProductSizeOut]


class SettingsUpdate(BaseModel):
    values: Dict[str, str]


class OrderShort(BaseModel):
    id: int
    status: str
    status_name: str
    created_at: datetime
    comment: Optional[str]
    total_price: int
    customer_name: Optional[str]
    customer_phone: Optional[str]


class AdminCourierCreate(BaseModel):
    display_name: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    password: str = Field(min_length=6)
    is_active: bool = True
    notes: Optional[str] = None


class AdminCourierUpdate(BaseModel):
    display_name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class AdminCourierOut(BaseModel):
    id: int
    login: str
    display_name: str
    phone: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    active_order_id: Optional[int] = None
    active_order_status: Optional[str] = None
    active_order_status_name: Optional[str] = None


class CourierBoardOut(BaseModel):
    cooking: List[OrderOut]
    ready: List[OrderOut]
    my_active: Optional[OrderOut] = None


class IntegrationJobOut(BaseModel):
    id: int
    direction: str
    entity_type: str
    format: str
    profile: str
    status: str
    requested_by: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    source_filename: Optional[str] = None
    artifact_filename: Optional[str] = None
    error_report_filename: Optional[str] = None
    artifact_url: Optional[str] = None
    error_report_url: Optional[str] = None
    summary: Dict[str, Any] = {}


class IntegrationJobErrorOut(BaseModel):
    id: int
    row_no: Optional[int] = None
    entity_key: Optional[str] = None
    error_code: Optional[str] = None
    message: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime


class ExportProductsRequest(BaseModel):
    format: str = "csv"
    mode: str = "variants"


class ExportCustomersRequest(BaseModel):
    format: str = "csv"
    scope: str = "all"
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class ExportSalesRequest(BaseModel):
    format: str = "csv"
    finalized_only: bool = True
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    statuses: List[str] = []

# --- helpers -----------------------------------------------------------------

def normalize_integration_format(value: Optional[str]) -> str:
    normalized = (value or "csv").strip().lower()
    if normalized in {"csv", "tabular", "table"}:
        return "csv"
    if normalized in {"1c", "commerceml", "xml"}:
        return "1c"
    raise HTTPException(status_code=400, detail="Поддерживаются только форматы CSV и 1C CommerceML.")


def normalize_product_exchange_mode(value: Optional[str]) -> str:
    normalized = (value or "variants").strip().lower()
    if normalized in {"flat", "simple", "without_sizes", "без размеров"}:
        return "flat"
    if normalized in {"variants", "with_sizes", "sizes", "с размерами"}:
        return "variants"
    raise HTTPException(status_code=400, detail="Режим товаров должен быть flat или variants.")


def normalize_customer_scope(value: Optional[str]) -> str:
    normalized = (value or "all").strip().lower()
    if normalized in {"all", "with_orders", "period"}:
        return normalized
    raise HTTPException(status_code=400, detail="Некорректный режим выгрузки покупателей.")


def parse_bool_form(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "да"}:
        return True
    if normalized in {"0", "false", "no", "off", "нет"}:
        return False
    return default


def sanitize_filename_part(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower())
    return normalized.strip("-._") or "artifact"


def now_stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def integration_artifact_path(job_id: int, filename: str) -> Path:
    safe_name = sanitize_filename_part(filename)
    return INTEGRATION_DIR / f"{job_id}-{safe_name}"


def maybe_indent_xml(root: ET.Element) -> None:
    if hasattr(ET, "indent"):
        ET.indent(root, space="  ")


def xml_text(parent: ET.Element, tag: str, value: Any) -> None:
    child = ET.SubElement(parent, tag)
    child.text = "" if value is None else str(value)


def parse_datetime_filter(value: Optional[str], field_name: str) -> Optional[str]:
    normalized = normalize_optional_text(value)
    if not normalized:
        return None
    try:
        if len(normalized) == 10:
            datetime.strptime(normalized, "%Y-%m-%d")
            return normalized
        datetime.fromisoformat(normalized)
        return normalized
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Некорректное значение {field_name}.") from exc


def build_date_range_sql(
    field_name: str, date_from: Optional[str], date_to: Optional[str]
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    normalized_from = parse_datetime_filter(date_from, "date_from")
    normalized_to = parse_datetime_filter(date_to, "date_to")
    if normalized_from:
        clauses.append(f"{field_name} >= ?")
        params.append(normalized_from)
    if normalized_to:
        boundary = normalized_to if len(normalized_to) > 10 else f"{normalized_to} 23:59:59"
        clauses.append(f"{field_name} <= ?")
        params.append(boundary)
    return (" AND ".join(clauses), params)

def serialize_user(row: sqlite3.Row) -> Dict[str, Any]:
    first_name = (row["first_name"] or "").strip()
    last_name = (row["last_name"] or "").strip()
    login = (row["login"] or row["phone"] or "").strip()
    full_name = (row["name"] or "").strip()
    birth_date = (row["birth_date"] or None) if row["birth_date"] else None
    gender = (row["gender"] or None) if row["gender"] else None
    if not full_name:
        full_name = f"{first_name} {last_name}".strip()
    if not first_name and full_name:
        parts = full_name.split(maxsplit=1)
        if parts:
            first_name = parts[0]
            if len(parts) > 1 and not last_name:
                last_name = parts[1]
    return {
        "id": row["id"],
        "first_name": first_name,
        "last_name": last_name,
        "login": login,
        "full_name": full_name,
        "name": full_name,
        "birth_date": birth_date,
        "gender": gender,
        "is_admin": bool(row["is_admin"]),
        "is_courier": bool(row["is_courier"]),
    }


def serialize_courier_profile(row: sqlite3.Row) -> CourierProfileOut:
    return CourierProfileOut(
        display_name=(row["display_name"] or "").strip(),
        phone=normalize_optional_text(row["phone"]),
        is_active=bool(row["is_active"]),
        notes=normalize_optional_text(row["notes"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def build_user_out(db: sqlite3.Connection, row: sqlite3.Row) -> UserOut:
    data = serialize_user(row)
    courier_profile = None
    if data["is_courier"]:
        profile_row = fetch_courier_profile_row(db, row["id"])
        if profile_row is not None:
            courier_profile = serialize_courier_profile(profile_row)
    return UserOut(**data, courier_profile=courier_profile)


def normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_required_text(value: Optional[str], detail: str) -> str:
    normalized = normalize_optional_text(value)
    if not normalized:
        raise HTTPException(status_code=400, detail=detail)
    return normalized


def serialize_user_address(row: sqlite3.Row) -> UserAddressOut:
    return UserAddressOut(
        id=row["id"],
        label=normalize_optional_text(row["label"]),
        address=(row["address"] or "").strip(),
        is_default=bool(row["is_default"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def normalize_push_token(value: str) -> str:
    token = (value or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Push token обязателен.")
    if not (
        token.startswith("ExponentPushToken[")
        or token.startswith("ExpoPushToken[")
    ):
        raise HTTPException(status_code=400, detail="Некорректный push token.")
    return token


def normalize_push_platform(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    if normalized in {"android", "ios"}:
        return normalized
    return "unknown"


def upsert_push_device(
    db: sqlite3.Connection, user_id: int, token: str, platform: Optional[str]
) -> None:
    db.execute(
        """
        INSERT INTO push_devices(user_id, token, platform, is_active, updated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(token) DO UPDATE SET
            user_id = excluded.user_id,
            platform = excluded.platform,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, token, platform),
    )


def deactivate_push_device(db: sqlite3.Connection, token: str, user_id: Optional[int] = None) -> None:
    if user_id is None:
        db.execute(
            """
            UPDATE push_devices
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE token = ?
            """,
            (token,),
        )
        return

    db.execute(
        """
        UPDATE push_devices
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE token = ? AND user_id = ?
        """,
        (token, user_id),
    )


def build_order_push_copy(order_id: int, status_code: str) -> tuple[str, str]:
    normalized = (status_code or "").strip().lower()
    title = f"Заказ №{order_id}"
    body_map = {
        "new": "принят",
        "cooking": "готовится",
        "ready": "готов",
        "on_way": "в пути",
        "done": "завершён",
        "canceled": "отменён",
        "cancelled": "отменён",
    }
    return title, f"Заказ №{order_id} {body_map.get(normalized, 'обновлён')}"


def send_expo_push_messages(messages: List[Dict[str, Any]]) -> List[str]:
    if not messages:
        return []

    request = urllib_request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.URLError:
        logger.exception("Failed to send Expo push notifications")
        return []
    except Exception:
        logger.exception("Unexpected Expo push notification error")
        return []

    invalid_tokens: List[str] = []
    results = payload.get("data")
    if not isinstance(results, list):
        return invalid_tokens

    for message, item in zip(messages, results):
        if not isinstance(item, dict):
            continue
        if item.get("status") != "error":
            continue
        details = item.get("details") or {}
        if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
            token = message.get("to")
            if isinstance(token, str) and token:
                invalid_tokens.append(token)
    return invalid_tokens


def notify_order_status_change(
    db: sqlite3.Connection,
    order_id: int,
    user_id: Optional[int],
    status_code: str,
    status_name: str,
) -> None:
    if not user_id:
        return

    rows = db.execute(
        """
        SELECT token
        FROM push_devices
        WHERE user_id = ? AND is_active = 1
        ORDER BY updated_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    if not rows:
        return

    title, body = build_order_push_copy(order_id, status_code)
    messages = [
        {
            "to": row["token"],
            "title": title,
            "body": body,
            "sound": "default",
            "data": {
                "orderId": order_id,
                "statusCode": status_code,
                "statusName": status_name,
                "screen": "order",
            },
        }
        for row in rows
    ]
    invalid_tokens = send_expo_push_messages(messages)
    if invalid_tokens:
        db.executemany(
            """
            UPDATE push_devices
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE token = ?
            """,
            [(token,) for token in invalid_tokens],
        )
        db.commit()


def list_user_address_rows(db: sqlite3.Connection, user_id: int) -> List[sqlite3.Row]:
    return db.execute(
        """
        SELECT id, user_id, label, address, is_default, created_at
        FROM user_addresses
        WHERE user_id = ?
        ORDER BY is_default DESC, datetime(created_at) DESC, id DESC
        """,
        (user_id,),
    ).fetchall()


def get_user_address_row_or_404(
    db: sqlite3.Connection, user_id: int, address_id: int
) -> sqlite3.Row:
    row = db.execute(
        """
        SELECT id, user_id, label, address, is_default, created_at
        FROM user_addresses
        WHERE id = ? AND user_id = ?
        """,
        (address_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    return row


def ensure_user_address_default(
    db: sqlite3.Connection, user_id: int, preferred_id: Optional[int] = None
) -> None:
    rows = list_user_address_rows(db, user_id)
    if not rows:
        return

    if preferred_id is None:
        preferred_id = next(
            (row["id"] for row in rows if bool(row["is_default"])),
            rows[0]["id"],
        )

    db.execute("UPDATE user_addresses SET is_default = 0 WHERE user_id = ?", (user_id,))
    db.execute(
        "UPDATE user_addresses SET is_default = 1 WHERE user_id = ? AND id = ?",
        (user_id, preferred_id),
    )


def ensure_size(
    db: sqlite3.Connection,
    name: Optional[str],
    amount: Optional[int],
    unit: Optional[str],
) -> Optional[int]:
    if name is None and amount is None and unit is None:
        return None

    trimmed_name = name.strip() if name else None
    normalized_unit = unit.strip() if unit else None
    normalized_amount = amount

    existing = db.execute(
        """
        SELECT id
        FROM sizes
        WHERE name IS ?
          AND amount IS ?
          AND unit IS ?
        """,
        (trimmed_name, normalized_amount, normalized_unit),
    ).fetchone()
    if existing:
        return existing["id"]

    if trimmed_name is not None:
        existing_by_name = db.execute(
            """
            SELECT id, amount, unit
            FROM sizes
            WHERE name = ?
            LIMIT 1
            """,
            (trimmed_name,),
        ).fetchone()
        if existing_by_name:
            if (
                existing_by_name["amount"] != normalized_amount
                or existing_by_name["unit"] != normalized_unit
            ):
                db.execute(
                    """
                    UPDATE sizes
                    SET amount = ?, unit = ?, gram_weight = ?
                    WHERE id = ?
                    """,
                    (
                        normalized_amount,
                        normalized_unit,
                        normalized_amount,
                        existing_by_name["id"],
                    ),
                )
            return existing_by_name["id"]

    cur = db.execute(
        """
        INSERT INTO sizes(name, amount, unit, gram_weight)
        VALUES (?, ?, ?, ?)
        """,
        (trimmed_name, normalized_amount, normalized_unit, normalized_amount),
    )
    return cur.lastrowid


def record_status_history(
    db: sqlite3.Connection, order_id: int, status_id: int, comment: Optional[str] = None
) -> None:
    db.execute(
        "INSERT INTO order_status_history(order_id, status_id, comment) VALUES (?, ?, ?)",
        (order_id, status_id, comment),
    )


def get_status_row_or_500(db: sqlite3.Connection, code: str) -> sqlite3.Row:
    row = db.execute(
        "SELECT id, code, name FROM order_statuses WHERE code = ?",
        (code,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail=f"Статус {code} не найден")
    return row


def get_active_courier_order_id(
    db: sqlite3.Connection, courier_id: int
) -> Optional[int]:
    row = db.execute(
        """
        SELECT o.id
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        WHERE o.courier_id = ?
          AND os.code IN ('ready', 'on_way')
        ORDER BY
            CASE os.code
                WHEN 'on_way' THEN 1
                WHEN 'ready' THEN 2
                ELSE 999
            END,
            COALESCE(o.started_delivery_at, o.claimed_at, o.created_at) ASC,
            o.id ASC
        LIMIT 1
        """,
        (courier_id,),
    ).fetchone()
    return row["id"] if row else None


def is_delivery_scope_clause() -> str:
    return """
        (
            LOWER(COALESCE(o.delivery_method, '')) = 'delivery'
            OR (
                TRIM(COALESCE(o.delivery_method, '')) = ''
                AND TRIM(COALESCE(c.address, '')) != ''
            )
        )
    """


def fetch_order(
    db: sqlite3.Connection,
    order_id: int,
    with_history: bool = True,
    request: Optional[Request] = None,
) -> tuple[sqlite3.Row, OrderOut]:
    row = db.execute(
        """
        SELECT o.id,
               o.comment,
               o.total_price,
               o.created_at,
               o.user_id,
               o.courier_id,
               o.ready_at,
               o.claimed_at,
               o.started_delivery_at,
               o.delivered_at,
               o.delivery_method,
               o.delivery_time,
               o.payment_method,
               o.cash_change_from,
               o.do_not_call,
               os.code AS status,
               os.name AS status_name,
               c.name  AS customer_name,
               c.phone AS customer_phone,
               c.address AS customer_address,
               cp.display_name AS courier_name,
               cp.phone AS courier_phone
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN courier_profiles cp ON cp.user_id = o.courier_id
        WHERE o.id = ?
        """,
        (order_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    delivery_method = get_effective_delivery_method(
        row["delivery_method"], row["customer_address"]
    )

    customer_address = row["customer_address"]
    if delivery_method == "pickup":
        customer_address = None

    payment_method = row["payment_method"]
    if payment_method:
        payment_method = str(payment_method).strip().lower()
    if payment_method not in ("cash", "card"):
        payment_method = None

    items_rows = db.execute(
        """
        SELECT
            oi.product_size_id,
            oi.quantity,
            oi.price,
            p.name AS product_name,
            s.name AS size_name,
            p.image_path AS image_path
        FROM order_items oi
        JOIN product_sizes ps ON ps.id = oi.product_size_id
        JOIN products p       ON p.id = ps.product_id
        LEFT JOIN sizes s     ON s.id = ps.size_id
        WHERE oi.order_id = ?
        """,
        (order_id,),
    ).fetchall()

    items: List[OrderItemOut] = []
    for r in items_rows:
        line_total = r["price"] * r["quantity"]
        items.append(
            OrderItemOut(
                product_size_id=r["product_size_id"],
                product_name=r["product_name"],
                size_name=r["size_name"],
                price=r["price"],
                quantity=r["quantity"],
                line_total=line_total,
                image_url=build_image_url(r["image_path"], request),
            )
        )

    history: List[OrderHistoryItem] = []
    if with_history:
        history_rows = db.execute(
            """
            SELECT os.code, os.name, h.changed_at, h.comment
            FROM order_status_history h
            JOIN order_statuses os ON os.id = h.status_id
            WHERE h.order_id = ?
            ORDER BY h.changed_at
            """,
            (order_id,),
        ).fetchall()
        for h in history_rows:
            history.append(
                OrderHistoryItem(
                    status=h["code"],
                    status_name=h["name"],
                    changed_at=datetime.fromisoformat(h["changed_at"]),
                    comment=h["comment"],
                )
            )

    order_out = OrderOut(
        id=row["id"],
        status=row["status"],
        status_name=row["status_name"],
        created_at=datetime.fromisoformat(row["created_at"]),
        comment=row["comment"],
        total_price=row["total_price"],
        customer_name=row["customer_name"],
        customer_phone=row["customer_phone"],
        customer_address=customer_address,
        delivery_method=delivery_method,
        delivery_time=row["delivery_time"],
        payment_method=payment_method,
        cash_change_from=row["cash_change_from"],
        do_not_call=bool(row["do_not_call"]),
        courier_id=row["courier_id"],
        courier_name=row["courier_name"],
        courier_phone=row["courier_phone"],
        ready_at=datetime.fromisoformat(row["ready_at"]) if row["ready_at"] else None,
        claimed_at=datetime.fromisoformat(row["claimed_at"]) if row["claimed_at"] else None,
        started_delivery_at=datetime.fromisoformat(row["started_delivery_at"])
        if row["started_delivery_at"]
        else None,
        delivered_at=datetime.fromisoformat(row["delivered_at"]) if row["delivered_at"] else None,
        items=items,
        history=history,
    )
    return row, order_out


def build_admin_product(
    db: sqlite3.Connection, product_row: sqlite3.Row, request: Request
) -> AdminProductOut:
    sizes_rows = db.execute(
        """
        SELECT
            ps.id,
            ps.price,
            ps.calories,
            ps.protein,
            ps.fat,
            ps.carbs,
            ps.is_hidden,
            s.name,
            COALESCE(s.amount, s.gram_weight) AS amount,
            s.unit
        FROM product_sizes ps
        LEFT JOIN sizes s ON s.id = ps.size_id
        WHERE ps.product_id = ?
        ORDER BY ps.id
        """,
        (product_row["id"],),
    ).fetchall()
    sizes = [
        ProductSizeOut(
            id=s["id"],
            name=s["name"],
            amount=s["amount"],
            unit=s["unit"],
            price=s["price"],
            calories=s["calories"],
            protein=s["protein"],
            fat=s["fat"],
            carbs=s["carbs"],
            is_hidden=bool(s["is_hidden"]),
        )
        for s in sizes_rows
    ]

    return AdminProductOut(
        id=product_row["id"],
        category_id=product_row["category_id"],
        name=product_row["name"],
        description=product_row["description"],
        image_path=product_row["image_path"],
        image_url=build_image_url(product_row["image_path"], request),
        is_hidden=bool(product_row["is_hidden"]),
        is_active=bool(product_row["is_active"]),
        sort_order=product_row["sort_order"],
        sizes=sizes,
    )


def find_row_by_external_id(
    db: sqlite3.Connection,
    table: str,
    external_id: Optional[str],
    source_system: Optional[str],
) -> Optional[sqlite3.Row]:
    normalized_external_id = normalize_optional_text(external_id)
    if not normalized_external_id:
        return None
    normalized_source = normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM
    return db.execute(
        f"SELECT * FROM {table} WHERE external_id = ? AND COALESCE(source_system, ?) = ? LIMIT 1",
        (normalized_external_id, normalized_source, normalized_source),
    ).fetchone()


def ensure_row_external_identity(
    db: sqlite3.Connection,
    table: str,
    row_id: int,
    external_id: Optional[str],
    source_system: Optional[str],
) -> tuple[str, str]:
    normalized_external_id = normalize_optional_text(external_id)
    normalized_source = normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM
    if normalized_external_id:
        if normalized_source != (source_system or normalized_source):
            db.execute(
                f"UPDATE {table} SET source_system = ? WHERE id = ?",
                (normalized_source, row_id),
            )
        return normalized_external_id, normalized_source

    generated_external_id = f"{DEFAULT_SOURCE_SYSTEM}:{table}:{row_id}"
    db.execute(
        f"UPDATE {table} SET external_id = COALESCE(external_id, ?), source_system = COALESCE(source_system, ?) WHERE id = ?",
        (generated_external_id, normalized_source, row_id),
    )
    return generated_external_id, normalized_source


def serialize_integration_job_row(
    row: sqlite3.Row, request: Optional[Request] = None
) -> IntegrationJobOut:
    artifact_url = None
    error_report_url = None
    if row["artifact_path"]:
        artifact_url = f"/admin/integrations/jobs/{row['id']}/artifact"
    if row["error_report_path"]:
        error_report_url = f"/admin/integrations/jobs/{row['id']}/errors/report"
    if request is not None:
        base = str(request.base_url).rstrip("/")
        if artifact_url:
            artifact_url = f"{base}{artifact_url}"
        if error_report_url:
            error_report_url = f"{base}{error_report_url}"
    summary = {}
    if row["summary_json"]:
        try:
            summary = json.loads(row["summary_json"])
        except json.JSONDecodeError:
            summary = {"raw": row["summary_json"]}
    return IntegrationJobOut(
        id=row["id"],
        direction=row["direction"],
        entity_type=row["entity_type"],
        format=row["format"],
        profile=row["profile"],
        status=row["status"],
        requested_by=row["requested_by"],
        created_at=datetime.fromisoformat(row["created_at"]),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
        source_filename=row["source_filename"],
        artifact_filename=row["artifact_filename"],
        error_report_filename=row["error_report_filename"],
        artifact_url=artifact_url,
        error_report_url=error_report_url,
        summary=summary,
    )


def create_integration_job(
    db: sqlite3.Connection,
    *,
    direction: str,
    entity_type: str,
    format_name: str,
    profile: str,
    requested_by: Optional[int],
    source_filename: Optional[str] = None,
) -> int:
    cur = db.execute(
        """
        INSERT INTO integration_jobs(
            direction, entity_type, format, profile, status, requested_by, started_at, source_filename
        )
        VALUES (?, ?, ?, ?, 'running', ?, CURRENT_TIMESTAMP, ?)
        """,
        (direction, entity_type, format_name, profile, requested_by, source_filename),
    )
    db.commit()
    return cur.lastrowid


def complete_integration_job(
    db: sqlite3.Connection,
    job_id: int,
    *,
    summary: Dict[str, Any],
    artifact_path: Optional[Path] = None,
    artifact_filename: Optional[str] = None,
    error_report_path: Optional[Path] = None,
    error_report_filename: Optional[str] = None,
    status: str = "completed",
) -> sqlite3.Row:
    db.execute(
        """
        UPDATE integration_jobs
        SET status = ?,
            finished_at = CURRENT_TIMESTAMP,
            summary_json = ?,
            artifact_path = ?,
            artifact_filename = ?,
            error_report_path = ?,
            error_report_filename = ?
        WHERE id = ?
        """,
        (
            status,
            json.dumps(summary, ensure_ascii=False),
            str(artifact_path) if artifact_path else None,
            artifact_filename,
            str(error_report_path) if error_report_path else None,
            error_report_filename,
            job_id,
        ),
    )
    db.commit()
    return db.execute("SELECT * FROM integration_jobs WHERE id = ?", (job_id,)).fetchone()


def fail_integration_job(
    db: sqlite3.Connection,
    job_id: int,
    *,
    message: str,
    error_report_path: Optional[Path] = None,
    error_report_filename: Optional[str] = None,
) -> sqlite3.Row:
    summary = {"errors": 1, "message": message}
    return complete_integration_job(
        db,
        job_id,
        summary=summary,
        error_report_path=error_report_path,
        error_report_filename=error_report_filename,
        status="failed",
    )


def store_job_errors(
    db: sqlite3.Connection, job_id: int, errors: List[Dict[str, Any]]
) -> None:
    for error_item in errors:
        db.execute(
            """
            INSERT INTO integration_job_errors(job_id, row_no, entity_key, error_code, message, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                error_item.get("row_no"),
                error_item.get("entity_key"),
                error_item.get("error_code"),
                error_item.get("message") or "Неизвестная ошибка",
                json.dumps(error_item.get("payload"), ensure_ascii=False)
                if error_item.get("payload") is not None
                else None,
            ),
        )


def build_error_report_bytes(errors: List[Dict[str, Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=["row_no", "entity_key", "error_code", "message", "payload"],
    )
    writer.writeheader()
    for error_item in errors:
        writer.writerow(
            {
                "row_no": error_item.get("row_no"),
                "entity_key": error_item.get("entity_key"),
                "error_code": error_item.get("error_code"),
                "message": error_item.get("message"),
                "payload": json.dumps(error_item.get("payload"), ensure_ascii=False)
                if error_item.get("payload") is not None
                else "",
            }
        )
    return buffer.getvalue().encode("utf-8")


def write_artifact_bytes(job_id: int, filename: str, content: bytes) -> Path:
    path = integration_artifact_path(job_id, filename)
    path.write_bytes(content)
    return path


def build_csv_bytes(fieldnames: List[str], rows: List[Dict[str, Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    return buffer.getvalue().encode("utf-8")


def build_zip_bytes(files: Dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    return buffer.getvalue()


def build_xml_bytes(root: ET.Element) -> bytes:
    maybe_indent_xml(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def fetch_or_create_category_for_import(
    db: sqlite3.Connection,
    *,
    name: Optional[str],
    external_id: Optional[str],
    source_system: Optional[str],
) -> int:
    existing = find_row_by_external_id(db, "categories", external_id, source_system)
    normalized_name = normalize_required_text(name, "Для товара требуется категория.")
    if existing is None:
        existing = db.execute(
            "SELECT * FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1",
            (normalized_name,),
        ).fetchone()
    if existing is not None:
        ensure_row_external_identity(
            db, "categories", existing["id"], existing["external_id"], existing["source_system"]
        )
        return existing["id"]

    sort_order_row = db.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM categories").fetchone()
    cur = db.execute(
        """
        INSERT INTO categories(name, sort_order, external_id, source_system)
        VALUES (?, ?, ?, ?)
        """,
        (
            normalized_name,
            int(sort_order_row["max_sort"]) + 1,
            normalize_optional_text(external_id),
            normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM,
        ),
    )
    category_id = cur.lastrowid
    ensure_row_external_identity(db, "categories", category_id, external_id, source_system)
    return category_id


def fetch_or_create_hidden_import_category(db: sqlite3.Connection) -> int:
    row = db.execute(
        "SELECT * FROM categories WHERE name = 'Импортированные продажи' LIMIT 1"
    ).fetchone()
    if row is not None:
        return row["id"]
    sort_order_row = db.execute("SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM categories").fetchone()
    cur = db.execute(
        """
        INSERT INTO categories(name, description, sort_order, is_hidden, external_id, source_system)
        VALUES (?, ?, ?, 1, ?, ?)
        """,
        (
            "Импортированные продажи",
            "Служебная категория для исторического импорта продаж.",
            int(sort_order_row["max_sort"]) + 1,
            f"{DEFAULT_SOURCE_SYSTEM}:categories:imported-sales",
            DEFAULT_SOURCE_SYSTEM,
        ),
    )
    return cur.lastrowid


def fetch_or_create_customer_for_import(
    db: sqlite3.Connection,
    *,
    external_id: Optional[str],
    source_system: Optional[str],
    name: Optional[str],
    phone: Optional[str],
    address: Optional[str],
    fallback_phone: bool = False,
) -> int:
    existing = find_row_by_external_id(db, "customers", external_id, source_system)
    normalized_phone = normalize_optional_text(phone)
    if existing is None and fallback_phone and normalized_phone:
        existing = db.execute(
            "SELECT * FROM customers WHERE phone = ? ORDER BY id LIMIT 1",
            (normalized_phone,),
        ).fetchone()

    payload_name = normalize_optional_text(name)
    payload_address = normalize_optional_text(address)
    if existing is not None:
        updates = {
            "name": payload_name if payload_name is not None else existing["name"],
            "phone": normalized_phone if normalized_phone is not None else existing["phone"],
            "address": payload_address if payload_address is not None else existing["address"],
        }
        db.execute(
            """
            UPDATE customers
            SET name = ?, phone = ?, address = ?, external_id = COALESCE(external_id, ?), source_system = COALESCE(source_system, ?)
            WHERE id = ?
            """,
            (
                updates["name"],
                updates["phone"] or existing["phone"] or f"{DEFAULT_SOURCE_SYSTEM}:customers:{existing['id']}",
                updates["address"],
                normalize_optional_text(external_id),
                normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM,
                existing["id"],
            ),
        )
        ensure_row_external_identity(
            db, "customers", existing["id"], existing["external_id"], existing["source_system"]
        )
        return existing["id"]

    safe_phone = normalized_phone or (
        f"{normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM}:{normalize_optional_text(external_id) or secrets.token_hex(4)}"
    )
    cur = db.execute(
        """
        INSERT INTO customers(name, phone, address, external_id, source_system)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            payload_name,
            safe_phone,
            payload_address,
            normalize_optional_text(external_id),
            normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM,
        ),
    )
    customer_id = cur.lastrowid
    ensure_row_external_identity(db, "customers", customer_id, external_id, source_system)
    return customer_id


def fetch_or_create_product_for_import(
    db: sqlite3.Connection,
    *,
    category_id: int,
    external_id: Optional[str],
    source_system: Optional[str],
    name: str,
    description: Optional[str],
    is_active: bool,
    is_hidden: bool,
    image_path: Optional[str] = None,
) -> tuple[int, bool]:
    existing = find_row_by_external_id(db, "products", external_id, source_system)
    if existing is None:
        existing = db.execute(
            """
            SELECT * FROM products
            WHERE LOWER(name) = LOWER(?)
              AND category_id IS ?
              AND COALESCE(is_deleted, 0) = 0
            LIMIT 1
            """,
            (name.strip(), category_id),
        ).fetchone()
    if existing is not None:
        db.execute(
            """
            UPDATE products
            SET category_id = ?, name = ?, description = ?, is_active = ?, is_hidden = ?, image_path = COALESCE(?, image_path),
                external_id = COALESCE(external_id, ?), source_system = COALESCE(source_system, ?)
            WHERE id = ?
            """,
            (
                category_id,
                name.strip(),
                normalize_optional_text(description),
                int(is_active),
                int(is_hidden),
                image_path,
                normalize_optional_text(external_id),
                normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM,
                existing["id"],
            ),
        )
        ensure_row_external_identity(
            db, "products", existing["id"], existing["external_id"], existing["source_system"]
        )
        return existing["id"], False

    sort_order_row = db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM products WHERE category_id IS ?",
        (category_id,),
    ).fetchone()
    cur = db.execute(
        """
        INSERT INTO products(category_id, name, description, is_active, is_hidden, image_path, sort_order, external_id, source_system)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            category_id,
            name.strip(),
            normalize_optional_text(description),
            int(is_active),
            int(is_hidden),
            image_path or DEFAULT_IMAGE_NAME,
            int(sort_order_row["max_sort"]) + 1,
            normalize_optional_text(external_id),
            normalize_optional_text(source_system) or DEFAULT_SOURCE_SYSTEM,
        ),
    )
    product_id = cur.lastrowid
    ensure_row_external_identity(db, "products", product_id, external_id, source_system)
    return product_id, True


def fetch_or_create_product_variant_for_import(
    db: sqlite3.Connection,
    *,
    product_id: int,
    variant_external_id: Optional[str],
    variant_source_system: Optional[str],
    size_name: Optional[str],
    size_amount: Optional[int],
    size_unit: Optional[str],
    price: int,
    sku: Optional[str],
    barcode: Optional[str],
    is_hidden: bool,
    calories: Optional[float] = None,
    protein: Optional[float] = None,
    fat: Optional[float] = None,
    carbs: Optional[float] = None,
) -> tuple[int, bool]:
    existing = find_row_by_external_id(
        db, "product_sizes", variant_external_id, variant_source_system
    )
    size_id = ensure_size(db, size_name, size_amount, size_unit)
    if existing is None and size_id is not None:
        existing = db.execute(
            """
            SELECT * FROM product_sizes
            WHERE product_id = ? AND size_id IS ?
            LIMIT 1
            """,
            (product_id, size_id),
        ).fetchone()
    if existing is not None:
        db.execute(
            """
            UPDATE product_sizes
            SET size_id = ?, price = ?, calories = ?, protein = ?, fat = ?, carbs = ?, is_hidden = ?,
                sku = COALESCE(?, sku), barcode = COALESCE(?, barcode),
                external_id = COALESCE(external_id, ?), source_system = COALESCE(source_system, ?)
            WHERE id = ?
            """,
            (
                size_id,
                price,
                calories,
                protein,
                fat,
                carbs,
                int(is_hidden),
                normalize_optional_text(sku),
                normalize_optional_text(barcode),
                normalize_optional_text(variant_external_id),
                normalize_optional_text(variant_source_system) or DEFAULT_SOURCE_SYSTEM,
                existing["id"],
            ),
        )
        ensure_row_external_identity(
            db,
            "product_sizes",
            existing["id"],
            existing["external_id"],
            existing["source_system"],
        )
        return existing["id"], False

    cur = db.execute(
        """
        INSERT INTO product_sizes(
            product_id, size_id, price, calories, protein, fat, carbs, is_hidden, sku, barcode, external_id, source_system
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            product_id,
            size_id,
            price,
            calories,
            protein,
            fat,
            carbs,
            int(is_hidden),
            normalize_optional_text(sku),
            normalize_optional_text(barcode),
            normalize_optional_text(variant_external_id),
            normalize_optional_text(variant_source_system) or DEFAULT_SOURCE_SYSTEM,
        ),
    )
    variant_id = cur.lastrowid
    ensure_row_external_identity(
        db, "product_sizes", variant_id, variant_external_id, variant_source_system
    )
    return variant_id, True


def collect_product_export_rows(db: sqlite3.Connection, mode: str) -> List[Dict[str, Any]]:
    rows = db.execute(
        """
        SELECT
            c.id AS category_id,
            c.name AS category_name,
            c.external_id AS category_external_id,
            c.source_system AS category_source_system,
            p.id AS product_id,
            p.name AS product_name,
            p.description AS product_description,
            p.is_active,
            p.is_hidden AS product_is_hidden,
            p.external_id AS product_external_id,
            p.source_system AS product_source_system,
            ps.id AS variant_id,
            ps.external_id AS variant_external_id,
            ps.source_system AS variant_source_system,
            ps.sku,
            ps.barcode,
            ps.price,
            ps.is_hidden AS variant_is_hidden,
            ps.calories,
            ps.protein,
            ps.fat,
            ps.carbs,
            s.id AS size_id,
            s.name AS size_name,
            COALESCE(s.amount, s.gram_weight) AS size_amount,
            s.unit AS size_unit
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN product_sizes ps ON ps.product_id = p.id
        LEFT JOIN sizes s ON s.id = ps.size_id
        WHERE COALESCE(p.is_deleted, 0) = 0
        ORDER BY c.sort_order, c.id, p.sort_order, p.id, ps.id
        """
    ).fetchall()

    product_groups: Dict[int, Dict[str, Any]] = {}
    variant_rows: List[Dict[str, Any]] = []
    for row in rows:
        category_external_id, category_source_system = ensure_row_external_identity(
            db,
            "categories",
            row["category_id"],
            row["category_external_id"],
            row["category_source_system"],
        ) if row["category_id"] else (None, None)
        product_external_id, product_source_system = ensure_row_external_identity(
            db,
            "products",
            row["product_id"],
            row["product_external_id"],
            row["product_source_system"],
        )
        product_group = product_groups.setdefault(
            row["product_id"],
            {
                "category_external_id": category_external_id,
                "category_source_system": category_source_system,
                "category_name": row["category_name"],
                "product_external_id": product_external_id,
                "product_source_system": product_source_system,
                "product_name": row["product_name"],
                "product_description": row["product_description"],
                "is_active": bool(row["is_active"]),
                "is_hidden": bool(row["product_is_hidden"]),
                "first_variant": None,
            },
        )
        if row["variant_id"] is None:
            continue
        variant_external_id, variant_source_system = ensure_row_external_identity(
            db,
            "product_sizes",
            row["variant_id"],
            row["variant_external_id"],
            row["variant_source_system"],
        )
        variant_payload = {
            **product_group,
            "variant_external_id": variant_external_id,
            "variant_source_system": variant_source_system,
            "size_name": row["size_name"],
            "size_amount": row["size_amount"],
            "size_unit": row["size_unit"],
            "price": row["price"],
            "sku": row["sku"],
            "barcode": row["barcode"],
            "variant_is_hidden": bool(row["variant_is_hidden"]),
            "calories": row["calories"],
            "protein": row["protein"],
            "fat": row["fat"],
            "carbs": row["carbs"],
        }
        variant_rows.append(variant_payload)
        if product_group["first_variant"] is None:
            product_group["first_variant"] = variant_payload

    if mode == "flat":
        flat_rows: List[Dict[str, Any]] = []
        for product_group in product_groups.values():
            first_variant = product_group.get("first_variant") or {}
            flat_rows.append(
                {
                    "category_external_id": product_group["category_external_id"],
                    "category_source_system": product_group["category_source_system"],
                    "category_name": product_group["category_name"],
                    "product_external_id": product_group["product_external_id"],
                    "product_source_system": product_group["product_source_system"],
                    "product_name": product_group["product_name"],
                    "product_description": product_group["product_description"],
                    "is_active": int(product_group["is_active"]),
                    "is_hidden": int(product_group["is_hidden"]),
                    "base_price": first_variant.get("price"),
                    "default_size_name": first_variant.get("size_name"),
                    "default_size_amount": first_variant.get("size_amount"),
                    "default_size_unit": first_variant.get("size_unit"),
                    "sku": first_variant.get("sku"),
                    "barcode": first_variant.get("barcode"),
                }
            )
        return flat_rows

    return variant_rows


def collect_customer_export_rows(
    db: sqlite3.Connection, scope: str, date_from: Optional[str], date_to: Optional[str]
) -> List[Dict[str, Any]]:
    where_clauses = ["1 = 1"]
    params: List[Any] = []
    if scope == "with_orders":
        where_clauses.append(
            "EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)"
        )
    elif scope == "period":
        date_clause, date_params = build_date_range_sql("o.created_at", date_from, date_to)
        if date_clause:
            where_clauses.append(
                f"EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND {date_clause})"
            )
            params.extend(date_params)
    rows = db.execute(
        f"""
        SELECT
            c.id,
            c.name,
            c.phone,
            c.address,
            c.external_id,
            c.source_system,
            COUNT(o.id) AS orders_count,
            MAX(o.created_at) AS last_order_at
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        WHERE {' AND '.join(where_clauses)}
        GROUP BY c.id
        ORDER BY c.id DESC
        """,
        params,
    ).fetchall()
    payload: List[Dict[str, Any]] = []
    for row in rows:
        external_id, source_system = ensure_row_external_identity(
            db, "customers", row["id"], row["external_id"], row["source_system"]
        )
        payload.append(
            {
                "external_id": external_id,
                "source_system": source_system,
                "name": row["name"],
                "phone": row["phone"],
                "address": row["address"],
                "orders_count": row["orders_count"],
                "last_order_at": row["last_order_at"],
            }
        )
    return payload


def collect_sales_export_rows(
    db: sqlite3.Connection,
    finalized_only: bool,
    date_from: Optional[str],
    date_to: Optional[str],
    statuses: List[str],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    where_clauses = ["1 = 1"]
    params: List[Any] = []
    if finalized_only:
        where_clauses.append("os.code IN ('done', 'canceled')")
    elif statuses:
        normalized_statuses = [status.strip().lower() for status in statuses if status.strip()]
        if normalized_statuses:
            placeholders = ",".join(["?"] * len(normalized_statuses))
            where_clauses.append(f"os.code IN ({placeholders})")
            params.extend(normalized_statuses)
    date_clause, date_params = build_date_range_sql("o.created_at", date_from, date_to)
    if date_clause:
        where_clauses.append(date_clause)
        params.extend(date_params)

    rows = db.execute(
        f"""
        SELECT
            o.id,
            o.created_at,
            o.comment,
            o.delivery_method,
            o.delivery_time,
            o.payment_method,
            o.cash_change_from,
            o.do_not_call,
            o.total_price,
            o.external_id AS order_external_id,
            o.source_system AS order_source_system,
            c.id AS customer_id,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.address AS customer_address,
            c.external_id AS customer_external_id,
            c.source_system AS customer_source_system,
            os.code AS status,
            os.name AS status_name
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY o.created_at DESC, o.id DESC
        """,
        params,
    ).fetchall()

    headers: List[Dict[str, Any]] = []
    lines: List[Dict[str, Any]] = []
    for row in rows:
        order_external_id, order_source_system = ensure_row_external_identity(
            db, "orders", row["id"], row["order_external_id"], row["order_source_system"]
        )
        customer_external_id = None
        customer_source_system = None
        if row["customer_id"]:
            customer_external_id, customer_source_system = ensure_row_external_identity(
                db,
                "customers",
                row["customer_id"],
                row["customer_external_id"],
                row["customer_source_system"],
            )
        headers.append(
            {
                "order_external_id": order_external_id,
                "source_system": order_source_system,
                "created_at": row["created_at"],
                "status": row["status"],
                "status_name": row["status_name"],
                "customer_external_id": customer_external_id,
                "customer_source_system": customer_source_system,
                "customer_name": row["customer_name"],
                "customer_phone": row["customer_phone"],
                "customer_address": row["customer_address"],
                "delivery_method": row["delivery_method"],
                "delivery_time": row["delivery_time"],
                "payment_method": row["payment_method"],
                "cash_change_from": row["cash_change_from"],
                "do_not_call": int(bool(row["do_not_call"])),
                "total_price": row["total_price"],
                "comment": row["comment"],
            }
        )
        item_rows = db.execute(
            """
            SELECT
                oi.id,
                oi.quantity,
                oi.price,
                p.id AS product_id,
                p.name AS product_name,
                p.external_id AS product_external_id,
                p.source_system AS product_source_system,
                ps.id AS variant_id,
                ps.external_id AS variant_external_id,
                ps.source_system AS variant_source_system,
                s.name AS size_name,
                COALESCE(s.amount, s.gram_weight) AS size_amount,
                s.unit AS size_unit
            FROM order_items oi
            JOIN product_sizes ps ON ps.id = oi.product_size_id
            JOIN products p ON p.id = ps.product_id
            LEFT JOIN sizes s ON s.id = ps.size_id
            WHERE oi.order_id = ?
            ORDER BY oi.id
            """,
            (row["id"],),
        ).fetchall()
        for idx, item_row in enumerate(item_rows, start=1):
            product_external_id, product_source_system = ensure_row_external_identity(
                db,
                "products",
                item_row["product_id"],
                item_row["product_external_id"],
                item_row["product_source_system"],
            )
            variant_external_id, variant_source_system = ensure_row_external_identity(
                db,
                "product_sizes",
                item_row["variant_id"],
                item_row["variant_external_id"],
                item_row["variant_source_system"],
            )
            line_total = item_row["quantity"] * item_row["price"]
            lines.append(
                {
                    "order_external_id": order_external_id,
                    "source_system": order_source_system,
                    "line_no": idx,
                    "product_external_id": product_external_id,
                    "product_source_system": product_source_system,
                    "product_name": item_row["product_name"],
                    "variant_external_id": variant_external_id,
                    "variant_source_system": variant_source_system,
                    "size_name": item_row["size_name"],
                    "size_amount": item_row["size_amount"],
                    "size_unit": item_row["size_unit"],
                    "quantity": item_row["quantity"],
                    "price": item_row["price"],
                    "line_total": line_total,
                }
            )
    return headers, lines


def build_products_csv_artifact(db: sqlite3.Connection, mode: str) -> tuple[bytes, str, Dict[str, Any]]:
    rows = collect_product_export_rows(db, mode)
    if mode == "flat":
        fieldnames = [
            "category_external_id",
            "category_source_system",
            "category_name",
            "product_external_id",
            "product_source_system",
            "product_name",
            "product_description",
            "is_active",
            "is_hidden",
            "base_price",
            "default_size_name",
            "default_size_amount",
            "default_size_unit",
            "sku",
            "barcode",
        ]
    else:
        fieldnames = [
            "category_external_id",
            "category_source_system",
            "category_name",
            "product_external_id",
            "product_source_system",
            "product_name",
            "product_description",
            "is_active",
            "is_hidden",
            "variant_external_id",
            "variant_source_system",
            "size_name",
            "size_amount",
            "size_unit",
            "price",
            "sku",
            "barcode",
            "variant_is_hidden",
            "calories",
            "protein",
            "fat",
            "carbs",
        ]
    return (
        build_csv_bytes(fieldnames, rows),
        f"products-{mode}-{now_stamp()}.csv",
        {"total": len(rows), "mode": mode},
    )


def build_products_1c_artifact(db: sqlite3.Connection, mode: str) -> tuple[bytes, str, Dict[str, Any]]:
    rows = collect_product_export_rows(db, mode)
    root = ET.Element("КоммерческаяИнформация", ВерсияСхемы="2.10", Формат="SC-Restaurant")
    catalog = ET.SubElement(root, "Каталог")
    xml_text(catalog, "Ид", f"{DEFAULT_SOURCE_SYSTEM}:catalog")
    xml_text(catalog, "Наименование", "Каталог ресторана")
    groups = ET.SubElement(catalog, "Группы")
    seen_groups: set[tuple[Optional[str], Optional[str], Optional[str]]] = set()
    for row in rows:
        group_key = (
            row.get("category_external_id"),
            row.get("category_source_system"),
            row.get("category_name"),
        )
        if group_key in seen_groups:
            continue
        seen_groups.add(group_key)
        group = ET.SubElement(groups, "Группа")
        xml_text(group, "Ид", row.get("category_external_id") or row.get("category_name"))
        xml_text(group, "Источник", row.get("category_source_system") or DEFAULT_SOURCE_SYSTEM)
        xml_text(group, "Наименование", row.get("category_name"))

    products_node = ET.SubElement(catalog, "Товары")
    offers_package = ET.SubElement(root, "ПакетПредложений")
    xml_text(offers_package, "Ид", f"{DEFAULT_SOURCE_SYSTEM}:offers")
    offers_node = ET.SubElement(offers_package, "Предложения")
    product_seen: set[str] = set()
    for row in rows:
        product_id = row["product_external_id"]
        if product_id not in product_seen:
            product_seen.add(product_id)
            product = ET.SubElement(products_node, "Товар")
            xml_text(product, "Ид", product_id)
            xml_text(product, "Источник", row["product_source_system"])
            xml_text(product, "Наименование", row["product_name"])
            xml_text(product, "Описание", row.get("product_description"))
            xml_text(product, "ГруппаИд", row.get("category_external_id"))
            xml_text(product, "Активен", int(bool(row.get("is_active"))))
            xml_text(product, "Скрыт", int(bool(row.get("is_hidden"))))
        offer = ET.SubElement(offers_node, "Предложение")
        offer_id = row.get("variant_external_id") or f"{product_id}:default"
        xml_text(offer, "Ид", offer_id)
        xml_text(offer, "Источник", row.get("variant_source_system") or row["product_source_system"])
        xml_text(offer, "ТоварИд", product_id)
        xml_text(offer, "Размер", row.get("size_name"))
        xml_text(offer, "Количество", row.get("size_amount"))
        xml_text(offer, "Единица", row.get("size_unit"))
        xml_text(offer, "Цена", row.get("price") or row.get("base_price"))
        xml_text(offer, "Артикул", row.get("sku"))
        xml_text(offer, "Штрихкод", row.get("barcode"))
        xml_text(offer, "Скрыт", int(bool(row.get("variant_is_hidden", False))))
    return (
        build_xml_bytes(root),
        f"products-{mode}-{now_stamp()}.xml",
        {"total": len(rows), "mode": mode},
    )


def build_customers_csv_artifact(
    db: sqlite3.Connection, scope: str, date_from: Optional[str], date_to: Optional[str]
) -> tuple[bytes, str, Dict[str, Any]]:
    rows = collect_customer_export_rows(db, scope, date_from, date_to)
    fieldnames = [
        "external_id",
        "source_system",
        "name",
        "phone",
        "address",
        "orders_count",
        "last_order_at",
    ]
    return (
        build_csv_bytes(fieldnames, rows),
        f"customers-{scope}-{now_stamp()}.csv",
        {"total": len(rows), "scope": scope},
    )


def build_customers_1c_artifact(
    db: sqlite3.Connection, scope: str, date_from: Optional[str], date_to: Optional[str]
) -> tuple[bytes, str, Dict[str, Any]]:
    rows = collect_customer_export_rows(db, scope, date_from, date_to)
    root = ET.Element("КоммерческаяИнформация", ВерсияСхемы="2.10", Формат="SC-Restaurant")
    counterparties = ET.SubElement(root, "Контрагенты")
    for row in rows:
        customer = ET.SubElement(counterparties, "Контрагент")
        xml_text(customer, "Ид", row["external_id"])
        xml_text(customer, "Источник", row["source_system"])
        xml_text(customer, "Наименование", row.get("name"))
        xml_text(customer, "Телефон", row.get("phone"))
        xml_text(customer, "Адрес", row.get("address"))
        xml_text(customer, "КоличествоЗаказов", row.get("orders_count"))
        xml_text(customer, "ДатаПоследнегоЗаказа", row.get("last_order_at"))
    return (
        build_xml_bytes(root),
        f"customers-{scope}-{now_stamp()}.xml",
        {"total": len(rows), "scope": scope},
    )


def build_sales_csv_artifact(
    db: sqlite3.Connection,
    finalized_only: bool,
    date_from: Optional[str],
    date_to: Optional[str],
    statuses: List[str],
) -> tuple[bytes, str, Dict[str, Any]]:
    headers, lines = collect_sales_export_rows(db, finalized_only, date_from, date_to, statuses)
    sales_csv = build_csv_bytes(
        [
            "order_external_id",
            "source_system",
            "created_at",
            "status",
            "status_name",
            "customer_external_id",
            "customer_source_system",
            "customer_name",
            "customer_phone",
            "customer_address",
            "delivery_method",
            "delivery_time",
            "payment_method",
            "cash_change_from",
            "do_not_call",
            "total_price",
            "comment",
        ],
        headers,
    )
    lines_csv = build_csv_bytes(
        [
            "order_external_id",
            "source_system",
            "line_no",
            "product_external_id",
            "product_source_system",
            "product_name",
            "variant_external_id",
            "variant_source_system",
            "size_name",
            "size_amount",
            "size_unit",
            "quantity",
            "price",
            "line_total",
        ],
        lines,
    )
    return (
        build_zip_bytes(
            {
                "sales.csv": sales_csv,
                "sales_lines.csv": lines_csv,
            }
        ),
        f"sales-{now_stamp()}.zip",
        {"orders": len(headers), "lines": len(lines)},
    )


def build_sales_1c_artifact(
    db: sqlite3.Connection,
    finalized_only: bool,
    date_from: Optional[str],
    date_to: Optional[str],
    statuses: List[str],
) -> tuple[bytes, str, Dict[str, Any]]:
    headers, lines = collect_sales_export_rows(db, finalized_only, date_from, date_to, statuses)
    lines_by_order: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for line in lines:
        key = (line["order_external_id"], line["source_system"])
        lines_by_order.setdefault(key, []).append(line)
    root = ET.Element("КоммерческаяИнформация", ВерсияСхемы="2.10", Формат="SC-Restaurant")
    documents = ET.SubElement(root, "Документы")
    for header in headers:
        document = ET.SubElement(documents, "Документ")
        xml_text(document, "Ид", header["order_external_id"])
        xml_text(document, "Источник", header["source_system"])
        xml_text(document, "Дата", header["created_at"])
        xml_text(document, "Статус", header["status"])
        xml_text(document, "Комментарий", header["comment"])
        xml_text(document, "Сумма", header["total_price"])
        customer = ET.SubElement(document, "Контрагент")
        xml_text(customer, "Ид", header.get("customer_external_id"))
        xml_text(customer, "Источник", header.get("customer_source_system"))
        xml_text(customer, "Наименование", header.get("customer_name"))
        xml_text(customer, "Телефон", header.get("customer_phone"))
        xml_text(customer, "Адрес", header.get("customer_address"))
        goods = ET.SubElement(document, "Товары")
        for line in lines_by_order.get((header["order_external_id"], header["source_system"]), []):
            item = ET.SubElement(goods, "Товар")
            xml_text(item, "Ид", line["variant_external_id"] or line["product_external_id"])
            xml_text(item, "ТоварИд", line["product_external_id"])
            xml_text(item, "Наименование", line["product_name"])
            xml_text(item, "Размер", line.get("size_name"))
            xml_text(item, "Количество", line["quantity"])
            xml_text(item, "Цена", line["price"])
            xml_text(item, "Сумма", line["line_total"])
    return (
        build_xml_bytes(root),
        f"sales-{now_stamp()}.xml",
        {"orders": len(headers), "lines": len(lines)},
    )


def parse_csv_bytes(content: bytes) -> List[Dict[str, str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [{key: value for key, value in row.items()} for row in reader]


def parse_sales_zip_bytes(content: bytes) -> tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
        names = {name.lower(): name for name in archive.namelist()}
        sales_name = names.get("sales.csv")
        lines_name = names.get("sales_lines.csv")
        if not sales_name or not lines_name:
            raise HTTPException(
                status_code=400,
                detail="Архив продаж должен содержать файлы sales.csv и sales_lines.csv.",
            )
        headers = parse_csv_bytes(archive.read(sales_name))
        lines = parse_csv_bytes(archive.read(lines_name))
    return headers, lines


def parse_1c_xml(content: bytes) -> ET.Element:
    try:
        return ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail="Некорректный XML файла 1C CommerceML.") from exc


def parse_optional_int(value: Any) -> Optional[int]:
    normalized = normalize_optional_text(str(value)) if value is not None else None
    if not normalized:
        return None
    return int(float(normalized))


def parse_required_int(value: Any, detail: str) -> int:
    parsed = parse_optional_int(value)
    if parsed is None:
        raise ValueError(detail)
    return parsed


def parse_optional_float(value: Any) -> Optional[float]:
    normalized = normalize_optional_text(str(value)) if value is not None else None
    if not normalized:
        return None
    return float(normalized)


def parse_bool_value(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return parse_bool_form(str(value), default=default)


def extract_products_import_records(
    format_name: str, mode: str, content: bytes
) -> List[Dict[str, Any]]:
    if format_name == "csv":
        return parse_csv_bytes(content)

    root = parse_1c_xml(content)
    products = []
    group_map: Dict[str, Dict[str, Optional[str]]] = {}
    for group in root.findall(".//Каталог/Группы/Группа"):
        group_id = normalize_optional_text(group.findtext("Ид"))
        if not group_id:
            continue
        group_map[group_id] = {
            "category_name": group.findtext("Наименование"),
            "category_source_system": group.findtext("Источник") or DEFAULT_SOURCE_SYSTEM,
        }
    product_nodes = root.findall(".//Каталог/Товары/Товар")
    offers = root.findall(".//ПакетПредложений/Предложения/Предложение")
    offers_by_product: Dict[str, List[ET.Element]] = {}
    for offer in offers:
        product_id = normalize_optional_text(offer.findtext("ТоварИд"))
        if product_id:
            offers_by_product.setdefault(product_id, []).append(offer)
    for product in product_nodes:
        base = {
            "product_external_id": product.findtext("Ид"),
            "product_source_system": product.findtext("Источник") or DEFAULT_SOURCE_SYSTEM,
            "product_name": product.findtext("Наименование"),
            "product_description": product.findtext("Описание"),
            "category_external_id": product.findtext("ГруппаИд"),
            "is_active": product.findtext("Активен") or "1",
            "is_hidden": product.findtext("Скрыт") or "0",
            "category_source_system": group_map.get(normalize_optional_text(product.findtext("ГруппаИд")) or "", {}).get("category_source_system")
            or DEFAULT_SOURCE_SYSTEM,
            "category_name": group_map.get(normalize_optional_text(product.findtext("ГруппаИд")) or "", {}).get("category_name"),
        }
        matched_offers = offers_by_product.get(base["product_external_id"] or "", [])
        if mode == "flat" or not matched_offers:
            first_offer = matched_offers[0] if matched_offers else None
            products.append(
                {
                    **base,
                    "base_price": first_offer.findtext("Цена") if first_offer is not None else None,
                    "default_size_name": first_offer.findtext("Размер") if first_offer is not None else None,
                    "default_size_amount": first_offer.findtext("Количество") if first_offer is not None else None,
                    "default_size_unit": first_offer.findtext("Единица") if first_offer is not None else None,
                    "sku": first_offer.findtext("Артикул") if first_offer is not None else None,
                    "barcode": first_offer.findtext("Штрихкод") if first_offer is not None else None,
                }
            )
            continue
        for offer in matched_offers:
            products.append(
                {
                    **base,
                    "variant_external_id": offer.findtext("Ид"),
                    "variant_source_system": offer.findtext("Источник") or base["product_source_system"],
                    "size_name": offer.findtext("Размер"),
                    "size_amount": offer.findtext("Количество"),
                    "size_unit": offer.findtext("Единица"),
                    "price": offer.findtext("Цена"),
                    "sku": offer.findtext("Артикул"),
                    "barcode": offer.findtext("Штрихкод"),
                    "variant_is_hidden": offer.findtext("Скрыт") or "0",
                }
            )
    return products


def extract_customer_import_records(format_name: str, content: bytes) -> List[Dict[str, Any]]:
    if format_name == "csv":
        return parse_csv_bytes(content)

    root = parse_1c_xml(content)
    customers = []
    for customer in root.findall(".//Контрагенты/Контрагент"):
        customers.append(
            {
                "external_id": customer.findtext("Ид"),
                "source_system": customer.findtext("Источник") or DEFAULT_SOURCE_SYSTEM,
                "name": customer.findtext("Наименование"),
                "phone": customer.findtext("Телефон"),
                "address": customer.findtext("Адрес"),
            }
        )
    return customers


def extract_sales_import_records(
    format_name: str, content: bytes
) -> tuple[List[Dict[str, Any]], Dict[tuple[str, str], List[Dict[str, Any]]]]:
    if format_name == "csv":
        headers, lines = parse_sales_zip_bytes(content)
    else:
        root = parse_1c_xml(content)
        headers = []
        lines = []
        for document in root.findall(".//Документы/Документ"):
            customer = document.find("Контрагент")
            header = {
                "order_external_id": document.findtext("Ид"),
                "source_system": document.findtext("Источник") or DEFAULT_SOURCE_SYSTEM,
                "created_at": document.findtext("Дата"),
                "status": document.findtext("Статус"),
                "customer_external_id": customer.findtext("Ид") if customer is not None else None,
                "customer_source_system": customer.findtext("Источник") if customer is not None else None,
                "customer_name": customer.findtext("Наименование") if customer is not None else None,
                "customer_phone": customer.findtext("Телефон") if customer is not None else None,
                "customer_address": customer.findtext("Адрес") if customer is not None else None,
                "comment": document.findtext("Комментарий"),
                "total_price": document.findtext("Сумма"),
                "delivery_method": None,
                "delivery_time": None,
                "payment_method": None,
                "cash_change_from": None,
                "do_not_call": "0",
            }
            headers.append(header)
            for idx, item in enumerate(document.findall("./Товары/Товар"), start=1):
                lines.append(
                    {
                        "order_external_id": header["order_external_id"],
                        "source_system": header["source_system"],
                        "line_no": idx,
                        "product_external_id": item.findtext("ТоварИд"),
                        "product_source_system": header["source_system"],
                        "product_name": item.findtext("Наименование"),
                        "variant_external_id": item.findtext("Ид"),
                        "variant_source_system": header["source_system"],
                        "size_name": item.findtext("Размер"),
                        "size_amount": None,
                        "size_unit": None,
                        "quantity": item.findtext("Количество"),
                        "price": item.findtext("Цена"),
                        "line_total": item.findtext("Сумма"),
                    }
                )

    lines_by_order: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for line in lines:
        key = (
            normalize_optional_text(line.get("order_external_id")) or "",
            normalize_optional_text(line.get("source_system")) or DEFAULT_SOURCE_SYSTEM,
        )
        lines_by_order.setdefault(key, []).append(line)
    return headers, lines_by_order


def import_products_records(
    db: sqlite3.Connection,
    *,
    records: List[Dict[str, Any]],
    mode: str,
    dry_run: bool,
    allow_price_updates: bool,
    preserve_existing_sizes: bool,
) -> Dict[str, Any]:
    summary = {"total": len(records), "created": 0, "updated": 0, "skipped": 0, "errors": 0}
    errors: List[Dict[str, Any]] = []
    for idx, record in enumerate(records, start=1):
        try:
            category_id = fetch_or_create_category_for_import(
                db,
                name=record.get("category_name") or "Без категории",
                external_id=record.get("category_external_id"),
                source_system=record.get("category_source_system"),
            )
            product_id, product_created = fetch_or_create_product_for_import(
                db,
                category_id=category_id,
                external_id=record.get("product_external_id"),
                source_system=record.get("product_source_system"),
                name=normalize_required_text(record.get("product_name"), "У товара должно быть имя."),
                description=record.get("product_description"),
                is_active=parse_bool_value(record.get("is_active"), default=True),
                is_hidden=parse_bool_value(record.get("is_hidden"), default=False),
            )
            if mode == "flat":
                existing_variant = db.execute(
                    "SELECT * FROM product_sizes WHERE product_id = ? ORDER BY id LIMIT 1",
                    (product_id,),
                ).fetchone()
                if existing_variant is not None and preserve_existing_sizes:
                    summary["updated" if not product_created else "created"] += 1
                    continue
                if not allow_price_updates and existing_variant is not None:
                    summary["skipped"] += 1
                    continue
                fetch_or_create_product_variant_for_import(
                    db,
                    product_id=product_id,
                    variant_external_id=record.get("variant_external_id")
                    or f"{record.get('product_external_id') or f'{DEFAULT_SOURCE_SYSTEM}:products:{product_id}'}:default",
                    variant_source_system=record.get("variant_source_system") or record.get("product_source_system"),
                    size_name=record.get("default_size_name"),
                    size_amount=parse_optional_int(record.get("default_size_amount")),
                    size_unit=record.get("default_size_unit"),
                    price=parse_required_int(record.get("base_price"), "Для товара без размеров требуется цена."),
                    sku=record.get("sku"),
                    barcode=record.get("barcode"),
                    is_hidden=parse_bool_value(record.get("is_hidden"), default=False),
                )
            else:
                if not allow_price_updates and record.get("price") not in (None, ""):
                    existing = find_row_by_external_id(
                        db,
                        "product_sizes",
                        record.get("variant_external_id"),
                        record.get("variant_source_system"),
                    )
                    if existing is not None:
                        summary["skipped"] += 1
                        continue
                fetch_or_create_product_variant_for_import(
                    db,
                    product_id=product_id,
                    variant_external_id=record.get("variant_external_id"),
                    variant_source_system=record.get("variant_source_system") or record.get("product_source_system"),
                    size_name=record.get("size_name"),
                    size_amount=parse_optional_int(record.get("size_amount")),
                    size_unit=record.get("size_unit"),
                    price=parse_required_int(record.get("price"), "Для варианта товара требуется цена."),
                    sku=record.get("sku"),
                    barcode=record.get("barcode"),
                    is_hidden=parse_bool_value(record.get("variant_is_hidden"), default=False),
                    calories=parse_optional_float(record.get("calories")),
                    protein=parse_optional_float(record.get("protein")),
                    fat=parse_optional_float(record.get("fat")),
                    carbs=parse_optional_float(record.get("carbs")),
                )
            summary["created" if product_created else "updated"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "row_no": idx,
                    "entity_key": record.get("product_external_id") or record.get("product_name"),
                    "error_code": "product_import_error",
                    "message": str(exc),
                    "payload": record,
                }
            )
            summary["errors"] += 1
    summary["dry_run"] = dry_run
    return {"summary": summary, "errors": errors}


def import_customer_records(
    db: sqlite3.Connection,
    *,
    records: List[Dict[str, Any]],
    dry_run: bool,
    fallback_phone: bool,
) -> Dict[str, Any]:
    summary = {"total": len(records), "created": 0, "updated": 0, "skipped": 0, "errors": 0}
    errors: List[Dict[str, Any]] = []
    for idx, record in enumerate(records, start=1):
        try:
            before = find_row_by_external_id(
                db, "customers", record.get("external_id"), record.get("source_system")
            )
            fetch_or_create_customer_for_import(
                db,
                external_id=record.get("external_id"),
                source_system=record.get("source_system"),
                name=record.get("name"),
                phone=record.get("phone"),
                address=record.get("address"),
                fallback_phone=fallback_phone,
            )
            summary["updated" if before is not None else "created"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "row_no": idx,
                    "entity_key": record.get("external_id") or record.get("phone"),
                    "error_code": "customer_import_error",
                    "message": str(exc),
                    "payload": record,
                }
            )
            summary["errors"] += 1
    summary["dry_run"] = dry_run
    return {"summary": summary, "errors": errors}


def map_imported_sale_status(status_code: Optional[str]) -> str:
    normalized = (status_code or "").strip().lower()
    if normalized in {"canceled", "cancelled"}:
        return "canceled"
    return "done"


def import_sales_records(
    db: sqlite3.Connection,
    *,
    headers: List[Dict[str, Any]],
    lines_by_order: Dict[tuple[str, str], List[Dict[str, Any]]],
    dry_run: bool,
) -> Dict[str, Any]:
    summary = {"total": len(headers), "created": 0, "updated": 0, "skipped": 0, "errors": 0}
    errors: List[Dict[str, Any]] = []
    import_category_id = fetch_or_create_hidden_import_category(db)
    for idx, header in enumerate(headers, start=1):
        try:
            order_external_id = normalize_required_text(
                header.get("order_external_id"), "Для продажи нужен order_external_id."
            )
            order_source_system = normalize_optional_text(header.get("source_system")) or DEFAULT_SOURCE_SYSTEM
            customer_id = fetch_or_create_customer_for_import(
                db,
                external_id=header.get("customer_external_id"),
                source_system=header.get("customer_source_system") or order_source_system,
                name=header.get("customer_name"),
                phone=header.get("customer_phone"),
                address=header.get("customer_address"),
                fallback_phone=True,
            )
            line_items = lines_by_order.get((order_external_id, order_source_system), [])
            if not line_items:
                raise ValueError("Для продажи не найдено ни одной строки товара.")
            status_code = map_imported_sale_status(header.get("status"))
            status_row = get_status_row_or_500(db, status_code)
            existing_order = find_row_by_external_id(
                db, "orders", order_external_id, order_source_system
            )
            line_payloads: List[tuple[int, int, int]] = []
            total_price = 0
            for line in line_items:
                product_name = normalize_required_text(
                    line.get("product_name"), "У строки продажи должно быть имя товара."
                )
                product_id, _ = fetch_or_create_product_for_import(
                    db,
                    category_id=import_category_id,
                    external_id=line.get("product_external_id"),
                    source_system=line.get("product_source_system") or order_source_system,
                    name=product_name,
                    description="Исторический импорт продаж",
                    is_active=False,
                    is_hidden=True,
                )
                variant_id, _ = fetch_or_create_product_variant_for_import(
                    db,
                    product_id=product_id,
                    variant_external_id=line.get("variant_external_id"),
                    variant_source_system=line.get("variant_source_system") or order_source_system,
                    size_name=line.get("size_name"),
                    size_amount=parse_optional_int(line.get("size_amount")),
                    size_unit=line.get("size_unit"),
                    price=parse_required_int(line.get("price"), "Для строки продажи требуется цена."),
                    sku=None,
                    barcode=None,
                    is_hidden=True,
                )
                quantity = parse_required_int(line.get("quantity"), "Для строки продажи требуется quantity.")
                price = parse_required_int(line.get("price"), "Для строки продажи требуется price.")
                total_price += quantity * price
                line_payloads.append((variant_id, quantity, price))

            if existing_order is None:
                cur = db.execute(
                    """
                    INSERT INTO orders(
                        customer_id, status_id, created_at, comment, delivery_method, delivery_time,
                        payment_method, cash_change_from, do_not_call, total_price, external_id,
                        source_system, imported_at
                    )
                    VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        customer_id,
                        status_row["id"],
                        header.get("created_at"),
                        normalize_optional_text(header.get("comment")),
                        normalize_optional_text(header.get("delivery_method")) or "pickup",
                        normalize_optional_text(header.get("delivery_time")),
                        normalize_optional_text(header.get("payment_method")),
                        parse_optional_int(header.get("cash_change_from")),
                        int(parse_bool_value(header.get("do_not_call"), default=False)),
                        parse_optional_int(header.get("total_price")) or total_price,
                        order_external_id,
                        order_source_system,
                    ),
                )
                order_id = cur.lastrowid
                db.execute(
                    """
                    INSERT INTO order_status_history(order_id, status_id, changed_at, comment)
                    VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
                    """,
                    (
                        order_id,
                        status_row["id"],
                        header.get("created_at"),
                        "Imported historical sale",
                    ),
                )
                created = True
            else:
                order_id = existing_order["id"]
                db.execute(
                    """
                    UPDATE orders
                    SET customer_id = ?, status_id = ?, comment = ?, delivery_method = ?, delivery_time = ?,
                        payment_method = ?, cash_change_from = ?, do_not_call = ?, total_price = ?, imported_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        customer_id,
                        status_row["id"],
                        normalize_optional_text(header.get("comment")),
                        normalize_optional_text(header.get("delivery_method")) or "pickup",
                        normalize_optional_text(header.get("delivery_time")),
                        normalize_optional_text(header.get("payment_method")),
                        parse_optional_int(header.get("cash_change_from")),
                        int(parse_bool_value(header.get("do_not_call"), default=False)),
                        parse_optional_int(header.get("total_price")) or total_price,
                        order_id,
                    ),
                )
                db.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
                created = False
            for variant_id, quantity, price in line_payloads:
                db.execute(
                    """
                    INSERT INTO order_items(order_id, product_size_id, quantity, price)
                    VALUES (?, ?, ?, ?)
                    """,
                    (order_id, variant_id, quantity, price),
                )
            summary["created" if created else "updated"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "row_no": idx,
                    "entity_key": header.get("order_external_id"),
                    "error_code": "sale_import_error",
                    "message": str(exc),
                    "payload": header,
                }
            )
            summary["errors"] += 1
    summary["dry_run"] = dry_run
    return {"summary": summary, "errors": errors}
# --- Public endpoints --------------------------------------------------------

@app.get("/settings")
def get_settings(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, str]:
    rows = db.execute("SELECT key, value FROM site_settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


@app.get("/order-statuses", response_model=List[OrderStatus])
def list_statuses(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """
        SELECT code, name
        FROM order_statuses
        ORDER BY
            CASE code
                WHEN 'new' THEN 1
                WHEN 'cooking' THEN 2
                WHEN 'ready' THEN 3
                WHEN 'on_way' THEN 4
                WHEN 'done' THEN 5
                WHEN 'canceled' THEN 6
                ELSE 999
            END,
            id
        """
    ).fetchall()
    return [OrderStatus(code=r["code"], name=r["name"]) for r in rows]


@app.get("/categories", response_model=List[Category])
def list_categories(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """
        SELECT id, name, description, sort_order
        FROM categories
        WHERE is_hidden = 0
        ORDER BY sort_order, id
        """
    ).fetchall()
    return [Category(**dict(r)) for r in rows]


@app.get("/menu", response_model=List[MenuItem])
def list_menu(
    request: Request,
    category_id: Optional[int] = None,
    db: sqlite3.Connection = Depends(get_db),
):
    base_query = """
        SELECT id, category_id, name, product_name, size_name, size_amount, size_unit, size_label, price, description,
               calories, protein, fat, carbs, image_path
        FROM v_menu_items
    """
    params: tuple[Any, ...] = ()
    if category_id is None:
        query = base_query + " ORDER BY category_sort, product_sort, name"
    else:
        query = (
            base_query
            + " WHERE category_id = ? ORDER BY category_sort, product_sort, name"
        )
        params = (category_id,)

    rows = db.execute(query, params).fetchall()
    result: List[MenuItem] = []
    for r in rows:
        data = dict(r)
        data["image_url"] = build_image_url(r["image_path"], request)
        result.append(MenuItem(**data))
    return result


@app.get("/menu/{item_id}", response_model=MenuItem)
def get_menu_item(
    item_id: int, request: Request, db: sqlite3.Connection = Depends(get_db)
):
    row = db.execute(
        """
        SELECT id, category_id, name, product_name, size_name, size_amount, size_unit, size_label, price, description,
               calories, protein, fat, carbs, image_path
        FROM v_menu_items
        WHERE id = ?
        """,
        (item_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    data = dict(row)
    data["image_url"] = build_image_url(row["image_path"], request)
    return MenuItem(**data)


# --- Orders ------------------------------------------------------------------

@app.post("/orders", response_model=OrderOut, status_code=201)
def create_order(
    order: OrderCreate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: Optional[sqlite3.Row] = Depends(get_optional_user),
):
    if not order.items:
        raise HTTPException(status_code=400, detail="Корзина пустая")

    cur = db.cursor()

    status_row = cur.execute(
        "SELECT id FROM order_statuses WHERE code = 'new'"
    ).fetchone()
    if status_row is None:
        raise HTTPException(status_code=500, detail="Статус new не найден")
    status_id = status_row["id"]

    customer_phone = normalize_phone_login(order.customer.phone)
    if False:  # normalize_phone_login already validates phone
        raise HTTPException(status_code=400, detail="Телефон обязателен")
    customer_name = (order.customer.name or "").strip() or None
    customer_address = (order.customer.address or "").strip() or None

    delivery_method = (order.delivery_method or "").strip().lower()
    if delivery_method not in ("delivery", "pickup"):
        delivery_method = (
            "delivery" if customer_address else "pickup"
        )
    if delivery_method == "delivery" and not customer_address:
        raise HTTPException(status_code=400, detail="Адрес доставки обязателен")

    delivery_time = (order.delivery_time or "").strip() or None

    payment_method = (order.payment_method or "cash").strip().lower()
    if payment_method not in ("cash", "card"):
        raise HTTPException(status_code=400, detail="Некорректный способ оплаты")

    cash_change_from = order.cash_change_from
    if payment_method != "cash" and cash_change_from is not None:
        raise HTTPException(
            status_code=400,
            detail="Сдача доступна только при оплате наличными",
        )
    if cash_change_from is not None and cash_change_from <= 0:
        raise HTTPException(
            status_code=400,
            detail="Сумма для сдачи должна быть больше нуля",
        )

    total_price = 0
    prices: dict[int, int] = {}
    for item in order.items:
        row = cur.execute(
            """
            SELECT
                ps.price,
                ps.is_hidden AS size_hidden,
                p.is_active,
                COALESCE(p.is_deleted, 0) AS product_deleted,
                p.is_hidden AS product_hidden,
                COALESCE(c.is_hidden, 1) AS category_hidden
            FROM product_sizes ps
            JOIN products p ON p.id = ps.product_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE ps.id = ?
            """,
            (item.product_size_id,),
        ).fetchone()
        if (
            row is None
            or row["size_hidden"]
            or row["product_deleted"]
            or row["product_hidden"]
            or row["category_hidden"]
            or not row["is_active"]
        ):
            raise HTTPException(
                status_code=400,
                detail=f"product_size_id {item.product_size_id} недоступен",
            )
        price = row["price"]
        prices[item.product_size_id] = price
        total_price += price * item.quantity

    if cash_change_from is not None and cash_change_from < total_price:
        raise HTTPException(
            status_code=400,
            detail="Сумма для сдачи не может быть меньше суммы заказа",
        )

    customer_row = cur.execute(
        "SELECT id FROM customers WHERE phone = ?", (customer_phone,)
    ).fetchone()
    if customer_row:
        cur.execute(
            "UPDATE customers SET name = COALESCE(?, name), address = COALESCE(?, address) WHERE id = ?",
            (customer_name, customer_address, customer_row["id"]),
        )
        customer_id = customer_row["id"]
    else:
        cur.execute(
            """
            INSERT INTO customers(name, phone, address)
            VALUES (?, ?, ?)
            """,
            (customer_name, customer_phone, customer_address),
        )
        customer_id = cur.lastrowid

    cur.execute(
        """
        INSERT INTO orders(
            customer_id,
            status_id,
            comment,
            total_price,
            user_id,
            delivery_method,
            delivery_time,
            payment_method,
            cash_change_from,
            do_not_call
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            customer_id,
            status_id,
            (order.comment or "").strip() or None,
            total_price,
            current_user["id"] if current_user else None,
            delivery_method,
            delivery_time,
            payment_method,
            cash_change_from,
            1 if order.do_not_call else 0,
        ),
    )
    order_id = cur.lastrowid
    record_status_history(db, order_id, status_id, "Создан заказ")

    for item in order.items:
        cur.execute(
            """
            INSERT INTO order_items(order_id, product_size_id, quantity, price)
            VALUES (?, ?, ?, ?)
            """,
            (
                order_id,
                item.product_size_id,
                item.quantity,
                prices[item.product_size_id],
            ),
        )

    db.commit()
    notify_order_status_change(
        db,
        order_id,
        current_user["id"] if current_user else None,
        "new",
        "Новый",
    )
    _, out = fetch_order(db, order_id, request=request)
    return out


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: Optional[sqlite3.Row] = Depends(get_optional_user),
    phone: Optional[str] = None,
):
    raw, out = fetch_order(db, order_id, request=request)
    if current_user and (current_user["is_admin"] or raw["user_id"] == current_user["id"]):
        return out
    if phone and raw["customer_phone"] and normalize_phone_login(phone) == raw["customer_phone"]:
        return out
    if not current_user:
        raise HTTPException(status_code=403, detail="Нужен номер телефона заказа")
    raise HTTPException(status_code=403, detail="Нет доступа к заказу")


@app.get("/orders/track", response_model=OrderOut)
def track_order(
    order_id: int,
    phone: str,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
):
    raw, out = fetch_order(db, order_id, request=request)
    if raw["customer_phone"] and raw["customer_phone"] == normalize_phone_login(phone):
        return out
    raise HTTPException(status_code=403, detail="Телефон не совпадает с заказом")


@app.get("/me/addresses", response_model=List[UserAddressOut])
def my_addresses(
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    rows = list_user_address_rows(db, current_user["id"])
    return [serialize_user_address(row) for row in rows]


@app.post("/me/addresses", response_model=UserAddressOut, status_code=201)
def create_my_address(
    body: UserAddressCreate,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    user_id = current_user["id"]
    label = normalize_optional_text(body.label)
    address = normalize_required_text(body.address, "Адрес обязателен")
    has_existing = db.execute(
        "SELECT 1 FROM user_addresses WHERE user_id = ? LIMIT 1",
        (user_id,),
    ).fetchone()
    has_default = db.execute(
        "SELECT 1 FROM user_addresses WHERE user_id = ? AND is_default = 1 LIMIT 1",
        (user_id,),
    ).fetchone()
    make_default = body.is_default or has_existing is None or has_default is None

    if make_default:
        db.execute("UPDATE user_addresses SET is_default = 0 WHERE user_id = ?", (user_id,))

    cur = db.execute(
        """
        INSERT INTO user_addresses(user_id, label, address, is_default)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, label, address, 1 if make_default else 0),
    )

    if make_default:
        ensure_user_address_default(db, user_id, cur.lastrowid)

    db.commit()
    row = get_user_address_row_or_404(db, user_id, cur.lastrowid)
    return serialize_user_address(row)


@app.patch("/me/addresses/{address_id}", response_model=UserAddressOut)
def update_my_address(
    address_id: int,
    body: UserAddressUpdate,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    user_id = current_user["id"]
    existing = get_user_address_row_or_404(db, user_id, address_id)
    payload = model_dump_unset(body)

    fields: List[str] = []
    params: List[Any] = []

    if "label" in payload:
        fields.append("label = ?")
        params.append(normalize_optional_text(payload["label"]))

    if "address" in payload:
        fields.append("address = ?")
        params.append(normalize_required_text(payload["address"], "Адрес обязателен"))

    if fields:
        params.append(address_id)
        params.append(user_id)
        db.execute(
            f"UPDATE user_addresses SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )

    if payload.get("is_default"):
        ensure_user_address_default(db, user_id, address_id)
    elif "is_default" in payload and bool(existing["is_default"]):
        replacement = db.execute(
            """
            SELECT id
            FROM user_addresses
            WHERE user_id = ? AND id != ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 1
            """,
            (user_id, address_id),
        ).fetchone()
        ensure_user_address_default(
            db,
            user_id,
            replacement["id"] if replacement is not None else address_id,
        )

    db.commit()
    row = get_user_address_row_or_404(db, user_id, address_id)
    return serialize_user_address(row)


@app.delete("/me/addresses/{address_id}")
def delete_my_address(
    address_id: int,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    user_id = current_user["id"]
    existing = get_user_address_row_or_404(db, user_id, address_id)
    db.execute("DELETE FROM user_addresses WHERE id = ? AND user_id = ?", (address_id, user_id))

    if bool(existing["is_default"]):
        replacement = db.execute(
            """
            SELECT id
            FROM user_addresses
            WHERE user_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        if replacement is not None:
            ensure_user_address_default(db, user_id, replacement["id"])

    db.commit()
    return {"ok": True}


@app.get("/me/orders", response_model=List[OrderOut])
def my_orders(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    orders_rows = db.execute(
        "SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC",
        (current_user["id"],),
    ).fetchall()
    results: List[OrderOut] = []
    for r in orders_rows:
        _, order_out = fetch_order(db, r["id"], request=request)
        results.append(order_out)
    return results


@app.put("/me/push-token", response_model=OkResponse)
def register_my_push_token(
    body: PushTokenUpsert,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    token = normalize_push_token(body.token)
    platform = normalize_push_platform(body.platform)
    upsert_push_device(db, current_user["id"], token, platform)
    db.commit()
    return OkResponse(ok=True)


@app.delete("/me/push-token", response_model=OkResponse)
def unregister_my_push_token(
    body: PushTokenDelete,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    token = normalize_push_token(body.token)
    deactivate_push_device(db, token, current_user["id"])
    db.commit()
    return OkResponse(ok=True)


@app.get("/admin/orders", response_model=List[OrderOut])
def admin_orders(
    request: Request,
    status: Optional[str] = None,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    query = """
        SELECT o.id,
               o.created_at,
               o.comment,
               o.total_price,
               os.code AS status,
               os.name AS status_name,
               c.name AS customer_name,
               c.phone AS customer_phone
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        LEFT JOIN customers c ON c.id = o.customer_id
    """
    params: tuple[Any, ...] = ()
    if status:
        query += " WHERE os.code = ?"
        params = (status,)
    query += " ORDER BY o.created_at DESC"

    rows = db.execute(query, params).fetchall()
    results: List[OrderOut] = []
    for r in rows:
        _, order_out = fetch_order(db, r["id"], with_history=False, request=request)
        results.append(order_out)
    return results


@app.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    cur = db.cursor()
    target_status = body.status_code.strip().lower()

    order_row = cur.execute(
        """
        SELECT o.id,
               o.user_id,
               o.delivery_method,
               os.code AS status,
               c.address AS customer_address
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ?
        """,
        (order_id,),
    ).fetchone()
    if order_row is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    status_row = cur.execute(
        "SELECT id FROM order_statuses WHERE code = ?",
        (target_status,),
    ).fetchone()
    delivery_method = get_effective_delivery_method(
        order_row["delivery_method"], order_row["customer_address"]
    )
    allowed_statuses = get_allowed_status_transitions(order_row["status"], delivery_method)
    allowed_statuses = get_admin_allowed_status_transitions(
        order_row["status"], delivery_method
    )
    if target_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Недопустимый переход статуса")
    if status_row is None:
        raise HTTPException(status_code=400, detail="Неизвестный статус")

    update_fields = ["status_id = ?"]
    params: list[Any] = [status_row["id"]]
    if target_status == "ready":
        update_fields.append("ready_at = CURRENT_TIMESTAMP")
    if target_status == "done" and order_row["status"] == "on_way":
        update_fields.append("delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)")

    params.append(order_id)
    cur.execute(
        f"UPDATE orders SET {', '.join(update_fields)} WHERE id = ?",
        params,
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    record_status_history(db, order_id, status_row["id"], body.comment)
    db.commit()
    notify_order_status_change(
        db,
        order_id,
        order_row["user_id"],
        target_status,
        db.execute(
            "SELECT name FROM order_statuses WHERE id = ?",
            (status_row["id"],),
        ).fetchone()["name"],
    )
    _, out = fetch_order(db, order_id, request=request)
    return out


def serialize_admin_courier(row: sqlite3.Row) -> AdminCourierOut:
    return AdminCourierOut(
        id=row["id"],
        login=(row["login"] or row["phone"] or "").strip(),
        display_name=(row["display_name"] or "").strip(),
        phone=normalize_optional_text(row["phone"]),
        is_active=bool(row["is_active"]),
        notes=normalize_optional_text(row["notes"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        active_order_id=row["active_order_id"],
        active_order_status=row["active_order_status"],
        active_order_status_name=row["active_order_status_name"],
    )


@app.get("/admin/couriers", response_model=List[AdminCourierOut])
def admin_couriers(
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    rows = db.execute(
        """
        SELECT
            u.id,
            u.login,
            cp.display_name,
            cp.phone,
            cp.is_active,
            cp.notes,
            cp.created_at,
            cp.updated_at,
            ao.id AS active_order_id,
            aos.code AS active_order_status,
            aos.name AS active_order_status_name
        FROM users u
        JOIN courier_profiles cp ON cp.user_id = u.id
        LEFT JOIN orders ao
            ON ao.courier_id = u.id
           AND ao.id = (
                SELECT o2.id
                FROM orders o2
                JOIN order_statuses os2 ON os2.id = o2.status_id
                WHERE o2.courier_id = u.id
                  AND os2.code IN ('ready', 'on_way')
                ORDER BY
                    CASE os2.code
                        WHEN 'on_way' THEN 1
                        WHEN 'ready' THEN 2
                        ELSE 999
                    END,
                    COALESCE(o2.started_delivery_at, o2.claimed_at, o2.created_at) ASC,
                    o2.id ASC
                LIMIT 1
           )
        LEFT JOIN order_statuses aos ON aos.id = ao.status_id
        WHERE u.is_courier = 1
        ORDER BY cp.is_active DESC, cp.display_name COLLATE NOCASE, u.id
        """
    ).fetchall()
    return [serialize_admin_courier(row) for row in rows]


@app.post("/admin/couriers", response_model=AdminCourierOut, status_code=201)
def create_admin_courier(
    body: AdminCourierCreate,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    display_name = normalize_required_text(body.display_name, "Имя курьера обязательно")
    phone = normalize_phone_login(body.phone)
    validate_password_strength(body.password)
    notes = normalize_optional_text(body.notes)

    existing = db.execute(
        "SELECT id FROM users WHERE login = ? OR phone = ?",
        (phone, phone),
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=400, detail="Такой номер телефона уже занят.")

    password_hash = hash_password(body.password)
    cur = db.execute(
        """
        INSERT INTO users(
            name, first_name, last_name, login, phone, password_hash, is_admin, is_courier
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        """,
        (display_name, display_name, None, phone, phone, password_hash),
    )
    user_id = cur.lastrowid
    db.execute(
        """
        INSERT INTO courier_profiles(user_id, display_name, phone, is_active, notes)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, display_name, phone, 1 if body.is_active else 0, notes),
    )
    db.commit()

    row = db.execute(
        """
        SELECT
            u.id,
            u.login,
            cp.display_name,
            cp.phone,
            cp.is_active,
            cp.notes,
            cp.created_at,
            cp.updated_at,
            NULL AS active_order_id,
            NULL AS active_order_status,
            NULL AS active_order_status_name
        FROM users u
        JOIN courier_profiles cp ON cp.user_id = u.id
        WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    return serialize_admin_courier(row)


@app.patch("/admin/couriers/{courier_id}", response_model=AdminCourierOut)
def update_admin_courier(
    courier_id: int,
    body: AdminCourierUpdate,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    courier = db.execute(
        """
        SELECT u.id, u.login, u.phone, u.is_courier, cp.user_id
        FROM users u
        LEFT JOIN courier_profiles cp ON cp.user_id = u.id
        WHERE u.id = ?
        """,
        (courier_id,),
    ).fetchone()
    if courier is None or not bool(courier["is_courier"]) or courier["user_id"] is None:
        raise HTTPException(status_code=404, detail="Курьер не найден")

    fields_user: list[str] = []
    user_params: list[Any] = []
    fields_profile: list[str] = []
    profile_params: list[Any] = []

    if body.phone is not None:
        phone = normalize_phone_login(body.phone)
        existing = db.execute(
            "SELECT id FROM users WHERE (login = ? OR phone = ?) AND id != ?",
            (phone, phone, courier_id),
        ).fetchone()
        if existing is not None:
            raise HTTPException(status_code=400, detail="Такой номер телефона уже занят.")
        fields_user.extend(["login = ?", "phone = ?"])
        user_params.extend([phone, phone])
        fields_profile.append("phone = ?")
        profile_params.append(phone)

    if body.display_name is not None:
        display_name = normalize_required_text(body.display_name, "Имя курьера обязательно")
        fields_user.extend(["name = ?", "first_name = ?", "last_name = ?"])
        user_params.extend([display_name, display_name, None])
        fields_profile.append("display_name = ?")
        profile_params.append(display_name)

    if body.password is not None:
        validate_password_strength(body.password)
        fields_user.append("password_hash = ?")
        user_params.append(hash_password(body.password))

    if body.is_active is not None:
        fields_profile.append("is_active = ?")
        profile_params.append(1 if body.is_active else 0)

    if body.notes is not None:
        fields_profile.append("notes = ?")
        profile_params.append(normalize_optional_text(body.notes))

    if fields_user:
        user_params.append(courier_id)
        db.execute(
            f"UPDATE users SET {', '.join(fields_user)} WHERE id = ?",
            user_params,
        )

    if fields_profile:
        profile_params.append(courier_id)
        db.execute(
            f"""
            UPDATE courier_profiles
            SET {', '.join(fields_profile)}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            profile_params,
        )

    db.commit()

    row = db.execute(
        """
        SELECT
            u.id,
            u.login,
            cp.display_name,
            cp.phone,
            cp.is_active,
            cp.notes,
            cp.created_at,
            cp.updated_at,
            ao.id AS active_order_id,
            aos.code AS active_order_status,
            aos.name AS active_order_status_name
        FROM users u
        JOIN courier_profiles cp ON cp.user_id = u.id
        LEFT JOIN orders ao
            ON ao.courier_id = u.id
           AND ao.id = (
                SELECT o2.id
                FROM orders o2
                JOIN order_statuses os2 ON os2.id = o2.status_id
                WHERE o2.courier_id = u.id
                  AND os2.code IN ('ready', 'on_way')
                ORDER BY
                    CASE os2.code
                        WHEN 'on_way' THEN 1
                        WHEN 'ready' THEN 2
                        ELSE 999
                    END,
                    COALESCE(o2.started_delivery_at, o2.claimed_at, o2.created_at) ASC,
                    o2.id ASC
                LIMIT 1
           )
        LEFT JOIN order_statuses aos ON aos.id = ao.status_id
        WHERE u.id = ?
        """,
        (courier_id,),
    ).fetchone()
    return serialize_admin_courier(row)


@app.get("/courier/orders", response_model=CourierBoardOut)
def courier_orders_board(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_courier),
):
    delivery_clause = is_delivery_scope_clause()
    cooking_ids = [
        row["id"]
        for row in db.execute(
            f"""
            SELECT o.id
            FROM orders o
            JOIN order_statuses os ON os.id = o.status_id
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE os.code = 'cooking'
              AND {delivery_clause}
            ORDER BY o.created_at ASC, o.id ASC
            """
        ).fetchall()
    ]
    ready_ids = [
        row["id"]
        for row in db.execute(
            f"""
            SELECT o.id
            FROM orders o
            JOIN order_statuses os ON os.id = o.status_id
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE os.code = 'ready'
              AND {delivery_clause}
              AND o.courier_id IS NULL
            ORDER BY COALESCE(o.ready_at, o.created_at) ASC, o.id ASC
            """
        ).fetchall()
    ]
    my_active_id = get_active_courier_order_id(db, current_user["id"])

    cooking_orders = [fetch_order(db, order_id, request=request)[1] for order_id in cooking_ids]
    ready_orders = [fetch_order(db, order_id, request=request)[1] for order_id in ready_ids]
    my_active = fetch_order(db, my_active_id, request=request)[1] if my_active_id else None

    return CourierBoardOut(cooking=cooking_orders, ready=ready_orders, my_active=my_active)


@app.get("/courier/orders/{order_id}", response_model=OrderOut)
def courier_order_details(
    order_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_courier),
):
    raw, out = fetch_order(db, order_id, request=request)
    delivery_method = get_effective_delivery_method(
        raw["delivery_method"], raw["customer_address"]
    )
    if delivery_method != "delivery":
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if raw["status"] not in {"cooking", "ready", "on_way"}:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if raw["courier_id"] not in (None, current_user["id"]):
        raise HTTPException(status_code=403, detail="Заказ уже закреплён за другим курьером")
    return out


@app.post("/courier/orders/{order_id}/claim", response_model=OrderOut)
def claim_courier_order(
    order_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_courier),
):
    active_order_id = get_active_courier_order_id(db, current_user["id"])
    if active_order_id is not None and active_order_id != order_id:
        raise HTTPException(
            status_code=409,
            detail="Сначала завершите или начните доставку текущего заказа.",
        )

    ready_status = get_status_row_or_500(db, "ready")
    raw, _ = fetch_order(db, order_id, request=request)
    delivery_method = get_effective_delivery_method(
        raw["delivery_method"], raw["customer_address"]
    )
    if delivery_method != "delivery" or raw["status"] != "ready":
        raise HTTPException(status_code=400, detail="Заказ нельзя взять в доставку")
    if raw["courier_id"] == current_user["id"]:
        _, out = fetch_order(db, order_id, request=request)
        return out

    cur = db.execute(
        """
        UPDATE orders
        SET courier_id = ?, claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
        WHERE id = ?
          AND courier_id IS NULL
          AND status_id = ?
        """,
        (current_user["id"], order_id, ready_status["id"]),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Этот заказ уже взял другой курьер")

    db.commit()
    _, out = fetch_order(db, order_id, request=request)
    return out


@app.post("/courier/orders/{order_id}/start-delivery", response_model=OrderOut)
def start_courier_delivery(
    order_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_courier),
):
    ready_status = get_status_row_or_500(db, "ready")
    on_way_status = get_status_row_or_500(db, "on_way")
    raw, _ = fetch_order(db, order_id, request=request)
    delivery_method = get_effective_delivery_method(
        raw["delivery_method"], raw["customer_address"]
    )
    if delivery_method != "delivery":
        raise HTTPException(status_code=400, detail="Только delivery-заказ можно отправить в путь")
    if raw["courier_id"] != current_user["id"] or raw["status"] != "ready":
        raise HTTPException(status_code=400, detail="Заказ ещё не закреплён за этим курьером")

    cur = db.execute(
        """
        UPDATE orders
        SET status_id = ?,
            started_delivery_at = COALESCE(started_delivery_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND courier_id = ? AND status_id = ?
        """,
        (on_way_status["id"], order_id, current_user["id"], ready_status["id"]),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Не удалось начать доставку")

    record_status_history(db, order_id, on_way_status["id"], "Курьер начал доставку")
    db.commit()
    notify_order_status_change(
        db,
        order_id,
        raw["user_id"],
        on_way_status["code"],
        on_way_status["name"],
    )
    _, out = fetch_order(db, order_id, request=request)
    return out


@app.post("/courier/orders/{order_id}/complete", response_model=OrderOut)
def complete_courier_delivery(
    order_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_courier),
):
    on_way_status = get_status_row_or_500(db, "on_way")
    done_status = get_status_row_or_500(db, "done")
    raw, _ = fetch_order(db, order_id, request=request)
    if raw["courier_id"] != current_user["id"] or raw["status"] != "on_way":
        raise HTTPException(status_code=400, detail="Заказ нельзя завершить")

    cur = db.execute(
        """
        UPDATE orders
        SET status_id = ?,
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND courier_id = ? AND status_id = ?
        """,
        (done_status["id"], order_id, current_user["id"], on_way_status["id"]),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Не удалось завершить заказ")

    record_status_history(db, order_id, done_status["id"], "Курьер подтвердил доставку")
    db.commit()
    notify_order_status_change(
        db,
        order_id,
        raw["user_id"],
        done_status["code"],
        done_status["name"],
    )
    _, out = fetch_order(db, order_id, request=request)
    return out
# --- Auth --------------------------------------------------------------------

def issue_token(db: sqlite3.Connection, user: sqlite3.Row) -> AuthResponse:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)).isoformat()
    db.execute(
        "INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user["id"], expires_at),
    )
    db.commit()
    return AuthResponse(token=token, user=build_user_out(db, user))


@app.post("/auth/register", response_model=AuthResponse)
def register(
    body: RegisterBody, db: sqlite3.Connection = Depends(get_db)
):
    first_name = body.first_name.strip()
    last_name = (body.last_name or "").strip()
    birth_date = (body.birth_date or "").strip() or None
    gender = (body.gender or "").strip() or None
    login_value = normalize_phone_login(body.login)
    if not first_name:
        raise HTTPException(status_code=400, detail="Имя обязательно.")
    validate_password_strength(body.password)

    existing = db.execute(
        "SELECT id FROM users WHERE login = ? OR phone = ?",
        (login_value, login_value),
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Такой номер телефона уже занят.")

    pwd_hash = hash_password(body.password)
    full_name = f"{first_name} {last_name}".strip() if last_name else first_name
    cur = db.execute(
        """
        INSERT INTO users(name, first_name, last_name, login, phone, birth_date, gender, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (full_name, first_name, last_name or None, login_value, login_value, birth_date, gender, pwd_hash),
    )
    user_row = db.execute(
        "SELECT * FROM users WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return issue_token(db, user_row)

@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginBody, db: sqlite3.Connection = Depends(get_db)):
    if not body.login.strip() or not body.password:
        raise HTTPException(status_code=400, detail="Номер телефона и пароль обязательны.")
    login_value = normalize_phone_login(body.login)
    user = db.execute(
        "SELECT * FROM users WHERE login = ? OR phone = ? LIMIT 1",
        (login_value, login_value),
    ).fetchone()
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный номер телефона или пароль.")
    return issue_token(db, user)

@app.get("/auth/me", response_model=UserOut)
def me(
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    if bool(current_user["is_courier"]):
        profile = fetch_courier_profile_row(db, current_user["id"])
        if profile is None or not bool(profile["is_active"]):
            raise HTTPException(status_code=403, detail="Курьерский доступ отключён")
    return build_user_out(db, current_user)


@app.put("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(get_current_user),
):
    fields: list[str] = []
    params: list[Any] = []

    def normalized(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        val = value.strip()
        return val or None

    for attr, column in (
        ("first_name", "first_name"),
        ("last_name", "last_name"),
        ("birth_date", "birth_date"),
        ("gender", "gender"),
    ):
        incoming = getattr(body, attr)
        if incoming is not None:
            fields.append(f"{column} = ?")
            params.append(normalized(incoming))

    if fields:
        params.append(current_user["id"])
        db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        db.commit()

    updated = db.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],)).fetchone()
    return build_user_out(db, updated)

@app.post("/auth/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: sqlite3.Connection = Depends(get_db),
):
    if credentials:
        db.execute("DELETE FROM sessions WHERE token = ?", (credentials.credentials,))
        db.commit()
    return {"ok": True}


# --- Admin: menu -------------------------------------------------------------

@app.get("/admin/menu")
def admin_menu(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    categories_rows = db.execute(
        """
        SELECT id, name, description, sort_order, is_hidden
        FROM categories
        ORDER BY sort_order, id
        """
    ).fetchall()

    data: List[Dict[str, Any]] = []
    for cat in categories_rows:
        products_rows = db.execute(
            """
            SELECT id, category_id, name, description, image_path,
                   is_hidden, is_active, sort_order
            FROM products
            WHERE category_id = ?
              AND COALESCE(is_deleted, 0) = 0
            ORDER BY sort_order, id
            """,
            (cat["id"],),
        ).fetchall()
        products = [build_admin_product(db, p, request) for p in products_rows]
        data.append(
            {
                "id": cat["id"],
                "name": cat["name"],
                "description": cat["description"],
                "sort_order": cat["sort_order"],
                "is_hidden": bool(cat["is_hidden"]),
                "products": products,
            }
        )
    return data


@app.post("/admin/categories", response_model=Category)
def create_category(
    body: CategoryCreate,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    cur = db.execute(
        """
        INSERT INTO categories(name, description, sort_order, is_hidden)
        VALUES (?, ?, ?, ?)
        """,
        (
            body.name.strip(),
            body.description,
            body.sort_order,
            int(body.is_hidden),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT id, name, description, sort_order, is_hidden FROM categories WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return Category(**dict(row))


@app.patch("/admin/categories/{category_id}", response_model=Category)
def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute(
        "SELECT id FROM categories WHERE id = ?", (category_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    fields: List[str] = []
    params: List[Any] = []
    if body.name is not None:
        fields.append("name = ?")
        params.append(body.name.strip())
    if body.description is not None:
        fields.append("description = ?")
        params.append(body.description)
    if body.sort_order is not None:
        fields.append("sort_order = ?")
        params.append(body.sort_order)
    if body.is_hidden is not None:
        fields.append("is_hidden = ?")
        params.append(int(body.is_hidden))

    if fields:
        params.append(category_id)
        db.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", params)
        db.commit()

    updated = db.execute(
        "SELECT id, name, description, sort_order, is_hidden FROM categories WHERE id = ?",
        (category_id,),
    ).fetchone()
    return Category(**dict(updated))


@app.delete("/admin/categories/{category_id}")
def delete_category(
    category_id: int,
    delete_products: bool = False,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    if delete_products:
        db.execute(
            "UPDATE products SET is_hidden = 1, is_active = 0, category_id = NULL WHERE category_id = ?",
            (category_id,),
        )
    else:
        db.execute(
            "UPDATE products SET is_hidden = 1, category_id = NULL WHERE category_id = ?",
            (category_id,),
        )
    db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    db.commit()
    return {"ok": True}


@app.post("/admin/products", response_model=AdminProductOut)
def create_product(
    body: ProductCreate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    product_cur = db.execute(
        """
        INSERT INTO products(category_id, name, description, is_active, is_hidden, sort_order, image_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            body.category_id,
            body.name.strip(),
            body.description,
            int(body.is_active),
            int(body.is_hidden),
            body.sort_order,
            body.image_path or DEFAULT_IMAGE_NAME,
        ),
    )
    product_id = product_cur.lastrowid

    for size in body.sizes:
        amount = size.amount if size.amount is not None else size.grams
        size_id = ensure_size(db, size.size_name, amount, size.unit)
        db.execute(
            """
            INSERT INTO product_sizes(product_id, size_id, price, calories, protein, fat, carbs, is_hidden)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_id,
                size_id,
                size.price,
                size.calories,
                size.protein,
                size.fat,
                size.carbs,
                int(size.is_hidden),
            ),
        )

    db.commit()
    row = db.execute(
        "SELECT * FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0",
        (product_id,),
    ).fetchone()
    return build_admin_product(db, row, request)


@app.patch("/admin/products/{product_id}", response_model=AdminProductOut)
def update_product(
    product_id: int,
    body: ProductUpdate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    existing = db.execute(
        "SELECT * FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0",
        (product_id,),
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="Товар не найден")

    fields: List[str] = []
    params: List[Any] = []
    if body.category_id is not None:
        fields.append("category_id = ?")
        params.append(body.category_id)
    if body.name is not None:
        fields.append("name = ?")
        params.append(body.name.strip())
    if body.description is not None:
        fields.append("description = ?")
        params.append(body.description)
    if body.image_path is not None:
        fields.append("image_path = ?")
        params.append(body.image_path or DEFAULT_IMAGE_NAME)
    if body.is_hidden is not None:
        fields.append("is_hidden = ?")
        params.append(int(body.is_hidden))
    if body.is_active is not None:
        fields.append("is_active = ?")
        params.append(int(body.is_active))
    if body.sort_order is not None:
        fields.append("sort_order = ?")
        params.append(body.sort_order)

    if fields:
        params.append(product_id)
        db.execute(f"UPDATE products SET {', '.join(fields)} WHERE id = ?", params)

    if body.remove_size_ids:
        db.execute(
            f"DELETE FROM product_sizes WHERE id IN ({','.join(['?']*len(body.remove_size_ids))})",
            tuple(body.remove_size_ids),
        )

    if body.sizes:
        for size in body.sizes:
            amount = size.amount if size.amount is not None else size.grams
            size_id = ensure_size(db, size.size_name, amount, size.unit)
            if size.id:
                db.execute(
                    """
                    UPDATE product_sizes SET
                        size_id = ?,
                        price = ?,
                        calories = ?,
                        protein = ?,
                        fat = ?,
                        carbs = ?,
                        is_hidden = ?
                    WHERE id = ?
                    """,
                    (
                        size_id,
                        size.price,
                        size.calories,
                        size.protein,
                        size.fat,
                        size.carbs,
                        int(size.is_hidden),
                        size.id,
                    ),
                )
            else:
                db.execute(
                    """
                    INSERT INTO product_sizes(product_id, size_id, price, calories, protein, fat, carbs, is_hidden)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        product_id,
                        size_id,
                        size.price,
                        size.calories,
                        size.protein,
                        size.fat,
                        size.carbs,
                        int(size.is_hidden),
                    ),
                )

    db.commit()
    updated = db.execute(
        "SELECT * FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0",
        (product_id,),
    ).fetchone()
    return build_admin_product(db, updated, request)


@app.delete("/admin/products/{product_id}")
def delete_product(
    product_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    cur = db.execute(
        """
        UPDATE products
        SET is_deleted = 1,
            is_hidden = 1,
            is_active = 0
        WHERE id = ?
          AND COALESCE(is_deleted, 0) = 0
        """,
        (product_id,),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Товар не найден")
    db.commit()
    return {"ok": True}


@app.post("/admin/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    allowed_types = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/avif": ".avif",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Допустимы PNG/JPEG/WEBP/AVIF")
    extension = Path(file.filename or "").suffix.lower()
    if not extension:
        extension = allowed_types[file.content_type]
    filename = f"{secrets.token_hex(8)}{extension}"
    target = UPLOAD_DIR / filename
    target.write_bytes(await file.read())
    return {"filename": filename, "url": build_image_url(filename)}


@app.put("/admin/settings")
def update_settings(
    body: SettingsUpdate,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    for key, value in body.values.items():
        db.execute(
            """
            INSERT INTO site_settings(key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )
    db.commit()
    return {"ok": True}


@app.get("/admin/integrations/jobs", response_model=List[IntegrationJobOut])
def list_integration_jobs(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    rows = db.execute(
        """
        SELECT *
        FROM integration_jobs
        ORDER BY id DESC
        LIMIT 100
        """
    ).fetchall()
    return [serialize_integration_job_row(row, request) for row in rows]


@app.get("/admin/integrations/jobs/{job_id}", response_model=IntegrationJobOut)
def get_integration_job(
    job_id: int,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute("SELECT * FROM integration_jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Операция импорта/экспорта не найдена.")
    return serialize_integration_job_row(row, request)


@app.get("/admin/integrations/jobs/{job_id}/errors", response_model=List[IntegrationJobErrorOut])
def list_integration_job_errors(
    job_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    rows = db.execute(
        """
        SELECT *
        FROM integration_job_errors
        WHERE job_id = ?
        ORDER BY id ASC
        """,
        (job_id,),
    ).fetchall()
    return [
        IntegrationJobErrorOut(
            id=row["id"],
            row_no=row["row_no"],
            entity_key=row["entity_key"],
            error_code=row["error_code"],
            message=row["message"],
            payload=json.loads(row["payload_json"]) if row["payload_json"] else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in rows
    ]


@app.get("/admin/integrations/jobs/{job_id}/artifact")
def download_integration_job_artifact(
    job_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute("SELECT artifact_path, artifact_filename FROM integration_jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None or not row["artifact_path"]:
        raise HTTPException(status_code=404, detail="Файл результата не найден.")
    path = Path(row["artifact_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл результата не найден.")
    return FileResponse(path, filename=row["artifact_filename"] or path.name)


@app.get("/admin/integrations/jobs/{job_id}/errors/report")
def download_integration_job_error_report(
    job_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute(
        "SELECT error_report_path, error_report_filename FROM integration_jobs WHERE id = ?",
        (job_id,),
    ).fetchone()
    if row is None or not row["error_report_path"]:
        raise HTTPException(status_code=404, detail="Файл ошибок не найден.")
    path = Path(row["error_report_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл ошибок не найден.")
    return FileResponse(path, filename=row["error_report_filename"] or path.name)


@app.post("/admin/export/products", response_model=IntegrationJobOut)
def export_products(
    body: ExportProductsRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    format_name = normalize_integration_format(body.format)
    mode = normalize_product_exchange_mode(body.mode)
    job_id = create_integration_job(
        db,
        direction="export",
        entity_type="products",
        format_name=format_name,
        profile=f"products:{mode}",
        requested_by=current_user["id"],
    )
    try:
        if format_name == "csv":
            artifact_bytes, filename, summary = build_products_csv_artifact(db, mode)
        else:
            artifact_bytes, filename, summary = build_products_1c_artifact(db, mode)
        artifact_path = write_artifact_bytes(job_id, filename, artifact_bytes)
        row = complete_integration_job(
            db,
            job_id,
            summary=summary,
            artifact_path=artifact_path,
            artifact_filename=filename,
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)


@app.post("/admin/export/customers", response_model=IntegrationJobOut)
def export_customers(
    body: ExportCustomersRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    format_name = normalize_integration_format(body.format)
    scope = normalize_customer_scope(body.scope)
    job_id = create_integration_job(
        db,
        direction="export",
        entity_type="customers",
        format_name=format_name,
        profile=f"customers:{scope}",
        requested_by=current_user["id"],
    )
    try:
        if format_name == "csv":
            artifact_bytes, filename, summary = build_customers_csv_artifact(
                db, scope, body.date_from, body.date_to
            )
        else:
            artifact_bytes, filename, summary = build_customers_1c_artifact(
                db, scope, body.date_from, body.date_to
            )
        artifact_path = write_artifact_bytes(job_id, filename, artifact_bytes)
        row = complete_integration_job(
            db,
            job_id,
            summary=summary,
            artifact_path=artifact_path,
            artifact_filename=filename,
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)


@app.post("/admin/export/sales", response_model=IntegrationJobOut)
def export_sales(
    body: ExportSalesRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    format_name = normalize_integration_format(body.format)
    statuses = [status.strip().lower() for status in body.statuses if status.strip()]
    job_id = create_integration_job(
        db,
        direction="export",
        entity_type="sales",
        format_name=format_name,
        profile="sales:historical",
        requested_by=current_user["id"],
    )
    try:
        if format_name == "csv":
            artifact_bytes, filename, summary = build_sales_csv_artifact(
                db, body.finalized_only, body.date_from, body.date_to, statuses
            )
        else:
            artifact_bytes, filename, summary = build_sales_1c_artifact(
                db, body.finalized_only, body.date_from, body.date_to, statuses
            )
        artifact_path = write_artifact_bytes(job_id, filename, artifact_bytes)
        row = complete_integration_job(
            db,
            job_id,
            summary=summary,
            artifact_path=artifact_path,
            artifact_filename=filename,
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)


@app.post("/admin/import/products", response_model=IntegrationJobOut)
async def import_products(
    request: Request,
    file: UploadFile = File(...),
    format_name: str = Form(..., alias="format"),
    mode: str = Form("variants"),
    dry_run: str = Form("true"),
    allow_price_updates: str = Form("true"),
    preserve_existing_sizes: str = Form("false"),
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    normalized_format = normalize_integration_format(format_name)
    normalized_mode = normalize_product_exchange_mode(mode)
    parsed_dry_run = parse_bool_form(dry_run, default=True)
    job_id = create_integration_job(
        db,
        direction="import",
        entity_type="products",
        format_name=normalized_format,
        profile=f"products:{normalized_mode}",
        requested_by=current_user["id"],
        source_filename=file.filename,
    )
    try:
        content = await file.read()
        records = extract_products_import_records(normalized_format, normalized_mode, content)
        db.execute("SAVEPOINT integration_import")
        result = import_products_records(
            db,
            records=records,
            mode=normalized_mode,
            dry_run=parsed_dry_run,
            allow_price_updates=parse_bool_form(allow_price_updates, default=True),
            preserve_existing_sizes=parse_bool_form(preserve_existing_sizes, default=False),
        )
        if parsed_dry_run or result["errors"]:
            db.execute("ROLLBACK TO integration_import")
        db.execute("RELEASE integration_import")
        error_path = None
        error_name = None
        if result["errors"]:
            store_job_errors(db, job_id, result["errors"])
            error_name = f"products-import-errors-{now_stamp()}.csv"
            error_path = write_artifact_bytes(job_id, error_name, build_error_report_bytes(result["errors"]))
        row = complete_integration_job(
            db,
            job_id,
            summary=result["summary"],
            error_report_path=error_path,
            error_report_filename=error_name,
            status="failed" if result["summary"].get("errors") else "completed",
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        try:
            db.execute("ROLLBACK TO integration_import")
            db.execute("RELEASE integration_import")
        except sqlite3.Error:
            pass
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)


@app.post("/admin/import/customers", response_model=IntegrationJobOut)
async def import_customers(
    request: Request,
    file: UploadFile = File(...),
    format_name: str = Form(..., alias="format"),
    dry_run: str = Form("true"),
    fallback_phone: str = Form("false"),
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    normalized_format = normalize_integration_format(format_name)
    parsed_dry_run = parse_bool_form(dry_run, default=True)
    job_id = create_integration_job(
        db,
        direction="import",
        entity_type="customers",
        format_name=normalized_format,
        profile="customers:upsert",
        requested_by=current_user["id"],
        source_filename=file.filename,
    )
    try:
        content = await file.read()
        records = extract_customer_import_records(normalized_format, content)
        db.execute("SAVEPOINT integration_import")
        result = import_customer_records(
            db,
            records=records,
            dry_run=parsed_dry_run,
            fallback_phone=parse_bool_form(fallback_phone, default=False),
        )
        if parsed_dry_run or result["errors"]:
            db.execute("ROLLBACK TO integration_import")
        db.execute("RELEASE integration_import")
        error_path = None
        error_name = None
        if result["errors"]:
            store_job_errors(db, job_id, result["errors"])
            error_name = f"customers-import-errors-{now_stamp()}.csv"
            error_path = write_artifact_bytes(job_id, error_name, build_error_report_bytes(result["errors"]))
        row = complete_integration_job(
            db,
            job_id,
            summary=result["summary"],
            error_report_path=error_path,
            error_report_filename=error_name,
            status="failed" if result["summary"].get("errors") else "completed",
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        try:
            db.execute("ROLLBACK TO integration_import")
            db.execute("RELEASE integration_import")
        except sqlite3.Error:
            pass
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)


@app.post("/admin/import/sales", response_model=IntegrationJobOut)
async def import_sales(
    request: Request,
    file: UploadFile = File(...),
    format_name: str = Form(..., alias="format"),
    dry_run: str = Form("true"),
    db: sqlite3.Connection = Depends(get_db),
    current_user: sqlite3.Row = Depends(require_admin),
):
    normalized_format = normalize_integration_format(format_name)
    parsed_dry_run = parse_bool_form(dry_run, default=True)
    job_id = create_integration_job(
        db,
        direction="import",
        entity_type="sales",
        format_name=normalized_format,
        profile="sales:historical",
        requested_by=current_user["id"],
        source_filename=file.filename,
    )
    try:
        content = await file.read()
        headers, lines_by_order = extract_sales_import_records(normalized_format, content)
        db.execute("SAVEPOINT integration_import")
        result = import_sales_records(
            db,
            headers=headers,
            lines_by_order=lines_by_order,
            dry_run=parsed_dry_run,
        )
        if parsed_dry_run or result["errors"]:
            db.execute("ROLLBACK TO integration_import")
        db.execute("RELEASE integration_import")
        error_path = None
        error_name = None
        if result["errors"]:
            store_job_errors(db, job_id, result["errors"])
            error_name = f"sales-import-errors-{now_stamp()}.csv"
            error_path = write_artifact_bytes(job_id, error_name, build_error_report_bytes(result["errors"]))
        row = complete_integration_job(
            db,
            job_id,
            summary=result["summary"],
            error_report_path=error_path,
            error_report_filename=error_name,
            status="failed" if result["summary"].get("errors") else "completed",
        )
        return serialize_integration_job_row(row, request)
    except Exception as exc:  # noqa: BLE001
        try:
            db.execute("ROLLBACK TO integration_import")
            db.execute("RELEASE integration_import")
        except sqlite3.Error:
            pass
        row = fail_integration_job(db, job_id, message=str(exc))
        return serialize_integration_job_row(row, request)
