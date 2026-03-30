import sqlite3
from pathlib import Path

DB_PATH = Path("sc-restaurant.db")

SCHEMA_SQL = Path("schema.sql").read_text(encoding="utf-8")


# --- ОПИСАНИЕ МЕНЮ ---
# Сюда ты вписываешь ВСЁ меню с картинки.
# Я положу по одному примеру на каждую категорию.
# Остальные позиции просто добавляешь по аналогии.

MENU = [
    # ===== ШАУРМА =====
    {
        "category": "Шаурма",
        "name": "Классика",
        "description": "Курица, овощи, фирменный соус в лаваше",
        "sizes": [
            {"name": "260 г", "grams": 260, "price": 180},
            {"name": "340 г", "grams": 340, "price": 225},
        ],
    },
    {
        "category": "Шаурма",
        "name": "Как себе",
        "description": "Увеличенная порция курицы и овощей",
        "sizes": [
            {"name": "400 г", "grams": 400, "price": 270},
        ],
    },
    {
        "category": "Шаурма",
        "name": "С говядиной",
        "description": "Говядина, овощи, фирменный соус",
        "sizes": [
            {"name": "310 г", "grams": 310, "price": 300},
        ],
    },
    {
        "category": "Шаурма",
        "name": "Шримп ролл",
        "description": "Креветки, овощи, соус",
        "sizes": [
            {"name": "240 г", "grams": 240, "price": 260},
        ],
    },
    {
        "category": "Шаурма",
        "name": "Сырная",
        "description": "Курица, сыр, овощи, соус",
        "sizes": [
            {"name": "310 г", "grams": 310, "price": 210},
            {"name": "390 г", "grams": 390, "price": 245},
        ],
    },
    {
        "category": "Шаурма",
        "name": "Острая",
        "description": "Курица, овощи, острый соус",
        "sizes": [
            {"name": "310 г", "grams": 310, "price": 205},
            {"name": "370 г", "grams": 370, "price": 240},
        ],
    },

    # ===== ЗАКУСКИ (пример) =====
    {
        "category": "Закуски",
        "name": "Картофель фри",
        "description": "Обжаренный картофель",
        "sizes": [
            {"name": "Малый", "grams": None, "price": 145},
            {"name": "Большой", "grams": None, "price": 170},
        ],
    },
    {
        "category": "Закуски",
        "name": "Картофельные дольки",
        "description": "Картофель в дольках",
        "sizes": [
            {"name": "Порция", "grams": None, "price": 165},
            {"name": "Большая порция", "grams": None, "price": 180},
        ],
    },
    {
        "category": "Закуски",
        "name": "Наггетсы",
        "description": "Куриные наггетсы",
        "sizes": [
            {"name": "Порция", "grams": None, "price": 150},
        ],
    },
    {
        "category": "Закуски",
        "name": "Креветки",
        "description": "Жареные креветки",
        "sizes": [
            {"name": "Порция", "grams": None, "price": 260},
        ],
    },
    {
        "category": "Закуски",
        "name": "Сырные палочки",
        "description": "Жареные сырные палочки",
        "sizes": [
            {"name": "6 шт.", "grams": None, "price": 260},
        ],
    },
    {
        "category": "Закуски",
        "name": "Стрипсы",
        "description": "Куриные стрипсы",
        "sizes": [
            {"name": "5 шт.", "grams": None, "price": 250},
        ],
    },
    {
        "category": "Закуски",
        "name": "Крылья",
        "description": "Куриные крылья в соусе",
        "sizes": [
            {"name": "Порция", "grams": None, "price": 290},
        ],
    },

    # ===== ХОТ-ДОГИ (пример) =====
    {
        "category": "Хот-доги",
        "name": "Американский",
        "description": "Сосиска, соус, овощи",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 145},
        ],
    },
    {
        "category": "Хот-доги",
        "name": "Сырный",
        "description": "Сосиска, сырный соус",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 170},
        ],
    },
    {
        "category": "Хот-доги",
        "name": "Итальянский",
        "description": "Сосиска, овощи, соус песто (условно)",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 165},
        ],
    },
    {
        "category": "Хот-доги",
        "name": "Детский",
        "description": "Мягкий хот-дог для детей",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 155},
        ],
    },
    {
        "category": "Хот-доги",
        "name": "Грибной",
        "description": "Сосиска, грибы, соус",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 165},
        ],
    },
    {
        "category": "Хот-доги",
        "name": "Острый",
        "description": "Сосиска, острый соус",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 165},
        ],
    },

    # ===== МИТКУШ (пример) =====
    {
        "category": "Миткуш",
        "name": "Оригинальный",
        "description": "Мясо, овощи, лапша/рис (пример)",
        "sizes": [
            {"name": "Коробка", "grams": None, "price": 280},
        ],
    },
    {
        "category": "Миткуш",
        "name": "Овощной",
        "description": "Овощная коробка",
        "sizes": [
            {"name": "Коробка", "grams": None, "price": 300},
        ],
    },
    {
        "category": "Миткуш",
        "name": "Острый",
        "description": "Острая коробка",
        "sizes": [
            {"name": "Коробка", "grams": None, "price": 285},
        ],
    },
    {
        "category": "Миткуш",
        "name": "С говядиной",
        "description": "Говядина в коробке",
        "sizes": [
            {"name": "Коробка", "grams": None, "price": 360},
        ],
    },

    # ===== БУРГЕРЫ (пример) =====
    {
        "category": "Бургеры",
        "name": "Гамбургер",
        "description": "Классический бургер с говядиной",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 290},
        ],
    },
    {
        "category": "Бургеры",
        "name": "Чизбургер",
        "description": "Бургер с сыром",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 340},
        ],
    },
    {
        "category": "Бургеры",
        "name": "Двойной чиз",
        "description": "Две котлеты, сыр",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 410},
        ],
    },
    {
        "category": "Бургеры",
        "name": "Чикен",
        "description": "Куриный бургер",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 290},
        ],
    },
    {
        "category": "Бургеры",
        "name": "Острый",
        "description": "Острый бургер",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 360},
        ],
    },
    {
        "category": "Бургеры",
        "name": "Черный",
        "description": "Бургер в чёрной булке",
        "sizes": [
            {"name": "Стандарт", "grams": None, "price": 370},
        ],
    },

    # ===== ДЕТСКОЕ МЕНЮ =====
    {
        "category": "Детское меню",
        "name": "Happy Point",
        "description": "Мини-бургер, картофель фри, сок",
        "sizes": [
            {"name": "Набор", "grams": None, "price": 480},
        ],
    },

    # ===== ДЕСЕРТ =====
    {
        "category": "Десерты",
        "name": "Чизкейк классический",
        "description": "Порция чизкейка",
        "sizes": [
            {"name": "Порция", "grams": None, "price": 150},
        ],
    },

    # ===== НАПИТКИ =====
    {
        "category": "Напитки",
        "name": "Кофе зерновой",
        "description": "Горячий кофе",
        "sizes": [
            {"name": "Стакан", "grams": None, "price": 130},
        ],
    },
    {
        "category": "Напитки",
        "name": "Чай",
        "description": "Чай в ассортименте",
        "sizes": [
            {"name": "Стакан", "grams": None, "price": 40},
        ],
    },
    {
        "category": "Напитки",
        "name": "Молочный коктейль",
        "description": "Холодный молочный коктейль",
        "sizes": [
            {"name": "Стакан", "grams": None, "price": 150},
        ],
    },
]


ORDER_STATUSES = [
    ("new", "Новый"),
    ("cooking", "Готовится"),
    ("on_way", "В пути"),
    ("done", "Выполнен"),
    ("canceled", "Отменён"),
]


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_SQL)

    # Статусы заказа
    conn.executemany(
        "INSERT OR IGNORE INTO order_statuses(code, name) VALUES (?, ?)",
        ORDER_STATUSES,
    )

    # Категории
    category_ids: dict[str, int] = {}
    for item in MENU:
        cat_name = item["category"]
        if cat_name not in category_ids:
            conn.execute(
                "INSERT OR IGNORE INTO categories(name) VALUES (?)",
                (cat_name,),
            )
            row = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (cat_name,)
            ).fetchone()
            category_ids[cat_name] = row[0]

    # Размеры
    size_ids: dict[tuple[str, int | None, str | None], int] = {}
    for item in MENU:
        for s in item["sizes"]:
            grams = s.get("grams")
            unit = s.get("unit") or ("грамм" if grams else None)
            key = (s["name"], grams, unit)
            if key not in size_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO sizes(name, amount, unit, gram_weight) VALUES (?, ?, ?, ?)",
                    (s["name"], grams, unit, grams),
                )
                row = conn.execute(
                    "SELECT id FROM sizes WHERE name = ? AND amount IS ? AND unit IS ?",
                    (s["name"], grams, unit),
                ).fetchone()
                size_ids[key] = row[0]

    # Товары и связка с размерами
    for item in MENU:
        cat_id = category_ids[item["category"]]
        cur = conn.execute(
            "INSERT INTO products(category_id, name, description) VALUES (?, ?, ?)",
            (cat_id, item["name"], item.get("description")),
        )
        product_id = cur.lastrowid

        for s in item["sizes"]:
            grams = s.get("grams")
            unit = s.get("unit") or ("грамм" if grams else None)
            key = (s["name"], grams, unit)
            size_id = size_ids[key]
            conn.execute(
                """
                INSERT INTO product_sizes
                    (product_id, size_id, price, calories, protein, fat, carbs)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product_id,
                    size_id,
                    s["price"],
                    s.get("calories"),
                    s.get("protein"),
                    s.get("fat"),
                    s.get("carbs"),
                ),
            )

    conn.commit()
    conn.close()
    print(f"База {DB_PATH} создана и заполнена меню.")


if __name__ == "__main__":
    init_db()
