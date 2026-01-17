from __future__ import annotations

import base64
import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DB_PATH = Path("meatpoint.db")
UPLOAD_DIR = Path("uploads")
TOKEN_TTL_DAYS = 30
DEFAULT_IMAGE_NAME = "default.png"

app = FastAPI(title="Meat Point API")

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


PASSWORD_POLICY_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d).{8,}$")


def validate_password_strength(password: str) -> None:
    if not PASSWORD_POLICY_RE.match(password):
        raise HTTPException(
            status_code=400,
            detail="Пароль должен содержать минимум 8 символов, 1 заглавную букву и 1 цифру.",
        )


def build_image_url(image_path: str, request: Optional[Request] = None) -> str:
    filename = image_path or DEFAULT_IMAGE_NAME
    if request is None:
        return f"/static/{filename}"
    base = str(request.base_url).rstrip("/")
    return f"{base}/static/{filename}"

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


def seed_statuses(conn: sqlite3.Connection) -> None:
    statuses = [
        ("new", "Новый"),
        ("cooking", "Готовится"),
        ("on_way", "В пути"),
        ("done", "Готов"),
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
    ensure_column(conn, "product_sizes", "is_hidden", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "orders", "user_id", "INTEGER REFERENCES users(id)")
    ensure_column(conn, "orders", "delivery_method", "TEXT")
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

    admin_exists = conn.execute(
        "SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1"
    ).fetchone()
    if admin_exists is None:
        password_hash = hash_password("admin1234")
        conn.execute(
            """
            INSERT INTO users(name, first_name, last_name, login, phone, password_hash, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            ("Admin", "Admin", "User", "admin", "admin", password_hash),
        )

    default_settings = {
        "hero_title": "Meat Point",
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
    password: str = Field(min_length=8)
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

    delivery_method = row["delivery_method"]
    if delivery_method:
        delivery_method = delivery_method.strip().lower()
    if delivery_method not in ("delivery", "pickup"):
        delivery_method = (
            "delivery"
            if (row["customer_address"] and str(row["customer_address"]).strip())
            else "pickup"
        )

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
        customer_address=row["customer_address"],
        delivery_method=delivery_method,
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
    rows = db.execute("SELECT code, name FROM order_statuses ORDER BY id").fetchall()
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

    customer_phone = order.customer.phone.strip()
    customer_row = cur.execute(
        "SELECT id FROM customers WHERE phone = ?", (customer_phone,)
    ).fetchone()
    if customer_row:
        cur.execute(
            "UPDATE customers SET name = COALESCE(?, name), address = COALESCE(?, address) WHERE id = ?",
            (order.customer.name, order.customer.address, customer_row["id"]),
        )
        customer_id = customer_row["id"]
    else:
        cur.execute(
            """
            INSERT INTO customers(name, phone, address)
            VALUES (?, ?, ?)
            """,
            (order.customer.name, customer_phone, order.customer.address),
        )
        customer_id = cur.lastrowid

    delivery_method = (order.delivery_method or "").strip().lower()
    if delivery_method not in ("delivery", "pickup"):
        delivery_method = (
            "delivery" if (order.customer.address or "").strip() else "pickup"
        )

    total_price = 0
    prices: dict[int, int] = {}
    for item in order.items:
        row = cur.execute(
            "SELECT price, is_hidden FROM product_sizes WHERE id = ?",
            (item.product_size_id,),
        ).fetchone()
        if row is None or row["is_hidden"]:
            raise HTTPException(
                status_code=400,
                detail=f"product_size_id {item.product_size_id} недоступен",
            )
        price = row["price"]
        prices[item.product_size_id] = price
        total_price += price * item.quantity

    cur.execute(
        """
        INSERT INTO orders(customer_id, status_id, comment, total_price, user_id, delivery_method)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            customer_id,
            status_id,
            order.comment,
            total_price,
            current_user["id"] if current_user else None,
            delivery_method,
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
    if phone and raw["customer_phone"] and phone.strip() == raw["customer_phone"]:
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
    if raw["customer_phone"] and raw["customer_phone"] == phone.strip():
        return out
    raise HTTPException(status_code=403, detail="Телефон не совпадает с заказом")


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

    status_row = cur.execute(
        "SELECT id FROM order_statuses WHERE code = ?",
        (body.status_code,),
    ).fetchone()
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
    login_value = body.login.strip()
    if not first_name:
        raise HTTPException(status_code=400, detail="Имя обязательно.")
    if not login_value:
        raise HTTPException(status_code=400, detail="Логин обязателен.")
    validate_password_strength(body.password)

    existing = db.execute(
        "SELECT id FROM users WHERE login = ? OR phone = ?",
        (login_value, login_value),
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Такой логин уже занят.")

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
    login_value = body.login.strip()
    if not login_value or not body.password:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны.")
    user = db.execute(
        "SELECT * FROM users WHERE login = ? OR phone = ? LIMIT 1",
        (login_value, login_value),
    ).fetchone()
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль.")
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
        "SELECT id, name, description, sort_order FROM categories WHERE id = ?",
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
        "SELECT id, name, description, sort_order FROM categories WHERE id = ?",
        (category_id,),
    ).fetchone()
    return Category(**dict(updated))


@app.delete("/admin/categories/{category_id}")
def delete_category(
    category_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _: sqlite3.Row = Depends(require_admin),
):
    row = db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    # мягкое удаление: скрываем категорию и связанные товары
    db.execute("UPDATE categories SET is_hidden = 1 WHERE id = ?", (category_id,))
    db.execute("UPDATE products SET is_hidden = 1 WHERE category_id = ?", (category_id,))
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
    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="Допустимы PNG/JPEG/WEBP")
    extension = Path(file.filename or "").suffix.lower() or ".png"
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
