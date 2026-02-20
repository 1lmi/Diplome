# Meat Point

Web-приложение для онлайн-меню и заказов еды.

- Backend: `FastAPI` + `SQLite`.
- Frontend: `React 19` + `TypeScript` + `Vite`.
- Авторизация: Bearer-токены (сессии в БД).
- Админка: управление категориями, меню, статусами заказов и настройками витрины.

## Что уже реализовано

- Публичное меню с категориями и карточками товаров.
- Корзина, оформление заказа, выбор `delivery`/`pickup`.
- Трекинг заказа по `order_id + phone`.
- Регистрация/логин пользователя, личный кабинет, история заказов.
- Админ-панель:
  - дашборд и базовые настройки витрины (`hero_title`, `hero_subtitle`, `contact_phone`, `delivery_hint`);
  - CRUD категорий и товаров (включая размеры/варианты);
  - загрузка изображений (`PNG/JPEG/WEBP`);
  - обновление статусов заказа.
- Автоматические миграции при старте backend.

## Стек и зависимости

### Backend

- Python 3.10+
- `fastapi`
- `uvicorn[standard]`
- `python-multipart`
- встроенный `sqlite3`

### Frontend

- Node.js 18+
- `react`, `react-dom`
- `react-router-dom`
- `recharts`
- `vite`, `typescript`, `eslint`

## Структура репозитория

- `main.py` - FastAPI приложение, миграции, API, раздача `/static`.
- `schema.sql` - схема БД.
- `init_db.py` - альтернативная инициализация БД и наполнение демо-меню.
- `uploads/` - загруженные картинки (создается `default.png` при первом старте).
- `meatpoint-front/` - клиентское приложение (Vite + React + TS).

## Быстрый старт

### 1. Backend

```bash
cd c:\Users\mg853\VSCode_prodj\Diplome
python -m venv .venv

# PowerShell
.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install fastapi "uvicorn[standard]" python-multipart

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

После запуска:

- Swagger UI: `http://127.0.0.1:8000/docs`
- Static-файлы: `http://127.0.0.1:8000/static/<filename>`

### 2. Frontend

```bash
cd c:\Users\mg853\VSCode_prodj\Diplome\meatpoint-front
npm ci
npm run dev -- --host --port 5173
```

По умолчанию фронт ожидает API на `http://localhost:8000` (см. `meatpoint-front/src/api.ts`, константа `API_BASE`).

### 3. Дефолтный админ

Если в БД нет администратора, backend создаст его автоматически:

- login: `admin`
- password: `admin1234`

## Инициализация данных

Основной сценарий: просто запустить `main.py` через `uvicorn` - миграции и базовые данные применяются автоматически.

Опционально можно прогнать начальное наполнение из `init_db.py`:

```bash
python init_db.py
```

Рекомендуется делать это на чистой БД (скрипт предназначен для первичного заполнения демо-меню).

## Ключевые API-эндпоинты

### Public

- `GET /settings`
- `GET /order-statuses`
- `GET /categories`
- `GET /menu`
- `GET /menu/{item_id}`
- `POST /orders`
- `GET /orders/track?order_id=...&phone=...`

### User/Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `PUT /me`
- `POST /auth/logout`
- `GET /me/orders`
- `GET /orders/{order_id}` (доступ по токену владельца/админа или по `phone`)

### Admin

- `GET /admin/menu`
- `POST /admin/categories`
- `PATCH /admin/categories/{category_id}`
- `DELETE /admin/categories/{category_id}`
- `POST /admin/products`
- `PATCH /admin/products/{product_id}`
- `DELETE /admin/products/{product_id}`
- `POST /admin/upload-image`
- `GET /admin/orders`
- `PATCH /orders/{order_id}/status`
- `PUT /admin/settings`

## Важные детали реализации

- Пароли хешируются через PBKDF2 (`sha256`, 120000 итераций).
- Политика пароля: минимум 8 символов, 1 заглавная буква и 1 цифра.
- Токены сессий хранятся в таблице `sessions`, TTL: 30 дней.
- CORS сейчас открыт (`allow_origins=["*"]`) для удобства разработки.
- Изображения лежат в `uploads/` и доступны по `/static/...`.

## Полезные команды

```bash
# frontend
cd meatpoint-front
npm run lint
npm run build
npm run preview
```

## Production notes

- Запускайте `uvicorn` без `--reload`.
- Настройте reverse proxy (Nginx/Caddy) перед backend.
- Ограничьте CORS под ваши домены.
- Смените дефолтный пароль админа сразу после первого запуска.

## Примечание по git

`*.db` и `uploads/` уже в `.gitignore`.
Если файлы были добавлены в индекс ранее, уберите их через `git rm --cached`.
