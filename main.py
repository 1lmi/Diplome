from typing import List, Optional

import sqlite3
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DB_PATH = "meatpoint.db"

app = FastAPI(title="Meat Point API")


# --- CORS (чтобы фронт из браузера мог ходить к API) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # сюда можно поставить адрес фронта
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Подключение к БД как зависимость FastAPI ---

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        conn.close()


# --- Pydantic-модели (схемы запросов/ответов) ---

class Category(BaseModel):
    id: int
    name: str
    description: Optional[str] = None


class MenuItem(BaseModel):
    id: int
    category_id: int
    name: str
    price: int
    description: Optional[str] = None
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None


class CustomerIn(BaseModel):
    name: Optional[str] = None
    phone: str
    address: Optional[str] = None


class OrderItemIn(BaseModel):
    product_size_id: int
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer: CustomerIn
    comment: Optional[str] = None
    items: List[OrderItemIn]


class OrderItemOut(BaseModel):
    product_size_id: int
    product_name: str
    size_name: Optional[str]
    price: int
    quantity: int
    line_total: int


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
    items: List[OrderItemOut]


class OrderStatusUpdate(BaseModel):
    status_code: str  # 'new', 'cooking', 'on_way', 'done', 'canceled'


# --- Хелперы работы с заказом ---

def fetch_order(db: sqlite3.Connection, order_id: int) -> OrderOut:
    row = db.execute(
        """
        SELECT o.id,
               o.comment,
               o.total_price,
               o.created_at,
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

    items_rows = db.execute(
        """
        SELECT
            oi.product_size_id,
            oi.quantity,
            oi.price,
            p.name AS product_name,
            s.name AS size_name
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
            )
        )

    return OrderOut(
        id=row["id"],
        status=row["status"],
        status_name=row["status_name"],
        created_at=datetime.fromisoformat(row["created_at"]),
        comment=row["comment"],
        total_price=row["total_price"],
        customer_name=row["customer_name"],
        customer_phone=row["customer_phone"],
        customer_address=row["customer_address"],
        items=items,
    )


# === ЭНДПОИНТЫ ДЛЯ МЕНЮ ===

@app.get("/categories", response_model=List[Category])
def list_categories(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, name, description FROM categories ORDER BY id"
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/menu", response_model=List[MenuItem])
def list_menu(
    category_id: Optional[int] = None,
    db: sqlite3.Connection = Depends(get_db),
):
    if category_id is None:
        rows = db.execute(
            """
            SELECT id, category_id, name, price, description,
                   calories, protein, fat, carbs
            FROM v_menu_items
            ORDER BY category_id, name
            """
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, category_id, name, price, description,
                   calories, protein, fat, carbs
            FROM v_menu_items
            WHERE category_id = ?
            ORDER BY name
            """,
            (category_id,),
        ).fetchall()

    return [dict(r) for r in rows]


@app.get("/menu/{item_id}", response_model=MenuItem)
def get_menu_item(
    item_id: int, db: sqlite3.Connection = Depends(get_db)
):
    row = db.execute(
        """
        SELECT id, category_id, name, price, description,
               calories, protein, fat, carbs
        FROM v_menu_items
        WHERE id = ?
        """,
        (item_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Позиция меню не найдена")
    return dict(row)


# === ЭНДПОИНТЫ ДЛЯ ЗАКАЗОВ ===

@app.post("/orders", response_model=OrderOut, status_code=201)
def create_order(
    order: OrderCreate, db: sqlite3.Connection = Depends(get_db)
):
    if not order.items:
        raise HTTPException(status_code=400, detail="Заказ пустой")

    cur = db.cursor()

    # статус "new"
    status_row = cur.execute(
        "SELECT id FROM order_statuses WHERE code = 'new'"
    ).fetchone()
    if status_row is None:
        raise HTTPException(
            status_code=500,
            detail="В БД не настроен статус 'new'",
        )
    status_id = status_row["id"]

    # создаём клиента
    cur.execute(
        """
        INSERT INTO customers(name, phone, address)
        VALUES (?, ?, ?)
        """,
        (order.customer.name, order.customer.phone, order.customer.address),
    )
    customer_id = cur.lastrowid

    # считаем итоговую сумму на основании цен из БД
    total_price = 0
    prices: dict[int, int] = {}
    for item in order.items:
        row = cur.execute(
            "SELECT price FROM product_sizes WHERE id = ?",
            (item.product_size_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=400,
                detail=f"product_size_id {item.product_size_id} не найден",
            )
        price = row["price"]
        prices[item.product_size_id] = price
        total_price += price * item.quantity

    # создаём заказ
    cur.execute(
        """
        INSERT INTO orders(customer_id, status_id, comment, total_price)
        VALUES (?, ?, ?, ?)
        """,
        (customer_id, status_id, order.comment, total_price),
    )
    order_id = cur.lastrowid

    # позиции заказа
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

    # возвращаем заказ целиком
    return fetch_order(db, order_id)


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: sqlite3.Connection = Depends(get_db)):
    return fetch_order(db, order_id)


@app.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    db: sqlite3.Connection = Depends(get_db),
):
    cur = db.cursor()

    status_row = cur.execute(
        "SELECT id FROM order_statuses WHERE code = ?",
        (body.status_code,),
    ).fetchone()
    if status_row is None:
        raise HTTPException(status_code=400, detail="Некорректный статус")

    cur.execute(
        "UPDATE orders SET status_id = ? WHERE id = ?",
        (status_row["id"], order_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    db.commit()
    return fetch_order(db, order_id)
