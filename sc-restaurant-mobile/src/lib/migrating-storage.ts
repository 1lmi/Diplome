import AsyncStorage from "@react-native-async-storage/async-storage";

export function createMigratingAsyncStorage(
  storageKey: string,
  legacyKeys: string[] = []
) {
  return {
    async getItem(name: string) {
      const current = await AsyncStorage.getItem(name);
      if (current !== null) {
        return current;
      }

      for (const legacyKey of legacyKeys) {
        const legacyValue = await AsyncStorage.getItem(legacyKey);
        if (legacyValue !== null) {
          await AsyncStorage.setItem(storageKey, legacyValue);
          await AsyncStorage.removeItem(legacyKey);
          return legacyValue;
        }
      }

      return null;
    },
    async setItem(name: string, value: string) {
      await AsyncStorage.setItem(name, value);
      for (const legacyKey of legacyKeys) {
        if (legacyKey !== name) {
          await AsyncStorage.removeItem(legacyKey);
        }
      }
    },
    async removeItem(name: string) {
      await AsyncStorage.removeItem(name);
      for (const legacyKey of legacyKeys) {
        await AsyncStorage.removeItem(legacyKey);
      }
    },
  };
}
