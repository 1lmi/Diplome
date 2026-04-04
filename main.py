from __future__ import annotations

import base64
import hashlib
import json
import logging
import mimetypes
import re
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DB_PATH = Path("sc-restaurant.db")
UPLOAD_DIR = Path("uploads")
TOKEN_TTL_DAYS = 30
DEFAULT_IMAGE_NAME = "default.png"
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

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

    ensure_column(conn, "categories", "sort_order", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "categories", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "products", "sort_order", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "products", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(
        conn,
        "products",
        "image_path",
        f"TEXT NOT NULL DEFAULT '{DEFAULT_IMAGE_NAME}'",
    )
    relax_products_category_nullable(conn)
    ensure_column(conn, "product_sizes", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "orders", "user_id", "INTEGER REFERENCES users(id)")
    ensure_column(conn, "orders", "delivery_method", "TEXT")
    ensure_column(conn, "orders", "delivery_time", "TEXT")
    ensure_column(conn, "orders", "payment_method", "TEXT")
    ensure_column(conn, "orders", "cash_change_from", "INTEGER")
    ensure_column(conn, "orders", "do_not_call", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "users", "first_name", "TEXT")
    ensure_column(conn, "users", "last_name", "TEXT")
    ensure_column(conn, "users", "login", "TEXT")
    ensure_column(conn, "users", "birth_date", "TEXT")
    ensure_column(conn, "users", "gender", "TEXT")
    ensure_column(conn, "sizes", "amount", "INTEGER")
    ensure_column(conn, "sizes", "unit", "TEXT")
    conn.execute(
        "UPDATE sizes SET amount = COALESCE(amount, gram_weight) WHERE amount IS NULL AND gram_weight IS NOT NULL"
    )
    conn.execute(
        "UPDATE sizes SET unit = COALESCE(unit, 'грамм') WHERE unit IS NULL AND gram_weight IS NOT NULL"
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

# --- helpers -----------------------------------------------------------------

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
    }


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
               o.delivery_method,
               o.delivery_time,
               o.payment_method,
               o.cash_change_from,
               o.do_not_call,
               os.code AS status,
               os.name AS status_name,
               c.name  AS customer_name,
               c.phone AS customer_phone,
               c.address AS customer_address
        FROM orders o
        JOIN order_statuses os ON os.id = o.status_id
        LEFT JOIN customers c ON c.id = o.customer_id
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
            SELECT ps.price, ps.is_hidden, p.is_active
            FROM product_sizes ps
            JOIN products p ON p.id = ps.product_id
            WHERE ps.id = ?
            """,
            (item.product_size_id,),
        ).fetchone()
        if row is None or row["is_hidden"] or not row["is_active"]:
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
    if target_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Недопустимый переход статуса")
    if status_row is None:
        raise HTTPException(status_code=400, detail="Неизвестный статус")

    cur.execute(
        "UPDATE orders SET status_id = ? WHERE id = ?",
        (status_row["id"], order_id),
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
# --- Auth --------------------------------------------------------------------

def issue_token(db: sqlite3.Connection, user: sqlite3.Row) -> AuthResponse:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)).isoformat()
    db.execute(
        "INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user["id"], expires_at),
    )
    db.commit()
    return AuthResponse(token=token, user=UserOut(**serialize_user(user)))


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
def me(current_user: sqlite3.Row = Depends(get_current_user)):
    return UserOut(**serialize_user(current_user))


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
    return UserOut(**serialize_user(updated))

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
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
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
        "SELECT * FROM products WHERE id = ?", (product_id,)
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
    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return build_admin_product(db, updated, request)


@app.delete("/admin/products/{product_id}")
def delete_product(
    product_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    cur = db.execute(
        "UPDATE products SET is_hidden = 1 WHERE id = ?", (product_id,)
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
