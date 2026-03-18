# Meat Point Mobile

Пользовательское мобильное приложение Meat Point на `Expo + React Native`.

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

- Android emulator: `http://10.0.2.2:8000`
- Expo Go в одной Wi-Fi сети с ПК: `http://<IP_компьютера>:8000`

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
