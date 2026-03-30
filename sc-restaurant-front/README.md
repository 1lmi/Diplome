# SC restaurant Frontend

Frontend-часть проекта SC restaurant на `React + TypeScript + Vite`.

## Что делает

- Показывает публичное меню с категориями.
- Позволяет добавить товары в корзину и оформить заказ.
- Поддерживает регистрацию/логин и личный кабинет.
- Показывает историю и детали заказов.
- Отображает админ-панель для пользователей с `is_admin=true`.

## Запуск

```bash
cd c:\Users\mg853\VSCode_prodj\Diplome\sc-restaurant-front
npm ci
npm run dev -- --host --port 5173
```

Приложение откроется по адресу из консоли Vite (обычно `http://localhost:5173`).

## Важная настройка API

Базовый URL backend задан в `src/api.ts`:

```ts
const API_BASE = "http://localhost:8000";
```

Если backend запущен на другом хосте/порту, обновите это значение.

## Скрипты

- `npm run dev` - запуск dev-сервера.
- `npm run build` - production-сборка.
- `npm run preview` - локальный просмотр production-сборки.
- `npm run lint` - проверка ESLint.

## Структура

- `src/App.tsx` - роутинг и основные экраны.
- `src/api.ts` - HTTP-клиент для backend.
- `src/authContext.tsx` - состояние авторизации.
- `src/cartContext.tsx` - состояние корзины.
- `src/components/` - UI-компоненты, включая админку.
