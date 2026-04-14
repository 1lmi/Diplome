# SC restaurant Mobile

Пользовательское мобильное приложение SC restaurant на `Expo + React Native`.

## Запуск

1. Установите зависимости:

```bash
npm install
```

2. Укажите API:

```bash
copy .env.example .env
```

В `.env` задайте `EXPO_PUBLIC_API_BASE_URL`:

- production server: `https://sc-delivery.ru/api`
- Android emulator for local backend: `http://10.0.2.2:8000`
- device in one Wi-Fi with your PC: `http://<IP_компьютера>:8000`

3. Запуск:

```bash
npm run start:lan
```

или сразу из корня репозитория через `start-project.bat`.

## Проверки

```bash
npm run typecheck
npm run export:android
```

## Стек

- `expo-router`
- `@tanstack/react-query`
- `zustand`
- `expo-secure-store`
- `@react-native-async-storage/async-storage`
- `react-native-reanimated`
- `moti`

## EAS Android build

For Android APK builds with the address map screen, use these environment variables:

- `EXPO_PUBLIC_API_BASE_URL=https://sc-delivery.ru/api`
- `EXPO_PUBLIC_YANDEX_MAPS_API_KEY=1aed26db-4993-4046-b16e-7cb6ceb0f884`

The mobile address screen now uses a hosted Yandex Maps wrapper page:

- `https://sc-delivery.ru/mobile-yandex-map.html`
