# Meat Point

Небольшое приложение для онлайн-меню и управления заказами: FastAPI на бэкенде, React/Vite на фронтенде, SQLite в качестве хранилища.

## Технологии
- Backend: Python 3.10+, FastAPI, Pydantic, SQLite3, `uvicorn` (ASGI), `python-multipart` для загрузки файлов.
- Frontend: React 19, TypeScript, Vite, React Router DOM, Recharts.
- Прочее: npm (или pnpm/yarn при желании), статические файлы из папки `uploads/`.

## Структура
- `main.py` — FastAPI-приложение, миграции/сидинг БД, статика `/static`.
- `schema.sql`, `meatpoint.db` — схема и файловая БД SQLite (создается/мигрируется автоматически).
- `uploads/` — изображения (первый запуск создаст `uploads/default.png`).
- `meatpoint-front/` — фронтенд на Vite/React/TS.

## Требования
- Python 3.10+ c `pip`.
- Node.js 18+ c `npm`.

## Установка и запуск
### 1) Backend (FastAPI)
```bash
cd c:\Users\mg853\VSCode_prodj\Diplome
python -m venv .venv
# PowerShell
.\.venv\Scripts\Activate.ps1
# (Linux/macOS: source .venv/bin/activate)

pip install --upgrade pip
pip install fastapi "uvicorn[standard]" python-multipart

# запуск dev-сервера (применит миграции, создаст БД/статические файлы)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- Документация API: `http://127.0.0.1:8000/docs`
- Статика: `http://127.0.0.1:8000/static/<filename>`
- Админ по умолчанию: логин `admin`, пароль `admin1234`.

### 2) Frontend (Vite/React)
```bash
cd c:\Users\mg853\VSCode_prodj\Diplome\meatpoint-front
npm ci          # или npm install
npm run dev -- --host --port 5173
```
- Открыть адрес из консоли (обычно `http://localhost:5173`).
- Фронт обращается к API по `http://localhost:8000` (см. `meatpoint-front/src/api.ts` переменная `API_BASE`); поменяйте при другом хосте/порту.
- Сборка и предпросмотр:
```bash
npm run build
npm run preview
```

## Примечания
- `meatpoint.db` и `uploads/` добавлены в корневой `.gitignore`; если уже отслеживаются, удалите из индекса через `git rm --cached`.
- При продакшн-развертывании запустите uvicorn/ASGI-сервер без `--reload`, настройте reverse-proxy к порту 8000 и раздачу статики из `uploads/` (смонтирована на `/static`).
