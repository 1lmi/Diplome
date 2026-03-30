import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { TrackingRecord } from "@/src/api/types";
import { createMigratingAsyncStorage } from "@/src/lib/migrating-storage";

const TRACKING_STORAGE_KEY = "sc-restaurant-mobile-tracking";
const LEGACY_TRACKING_STORAGE_KEYS = ["meatpoint-mobile-tracking"];

interface TrackingState {
  items: TrackingRecord[];
  save(orderId: number, phone: string): void;
  remove(orderId: number): void;
}

export const useTrackingStore = create<TrackingState>()(
  persist(
    (set) => ({
      items: [],
      save(orderId, phone) {
        const normalizedPhone = phone.trim();
        if (!normalizedPhone) return;

        set((state) => {
          const next = state.items.filter((item) => item.orderId !== orderId);
          next.unshift({
            orderId,
            phone: normalizedPhone,
            savedAt: Date.now(),
          });
          return { items: next.slice(0, 6) };
        });
      },
      remove(orderId) {
        set((state) => ({
          items: state.items.filter((item) => item.orderId !== orderId),
        }));
      },
    }),
    {
      name: TRACKING_STORAGE_KEY,
      storage: createJSONStorage(() =>
        createMigratingAsyncStorage(TRACKING_STORAGE_KEY, LEGACY_TRACKING_STORAGE_KEYS)
      ),
    }
  )
);
