import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

export type ToastTone = "success" | "error" | "info";

interface ToastPayload {
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastItem extends ToastPayload {
  id: number;
}

interface ToastContextValue {
  pushToast(payload: ToastPayload): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { borderColor: string; badgeBg: string }> = {
  success: { borderColor: "rgba(31, 157, 104, 0.25)", badgeBg: "rgba(31, 157, 104, 0.14)" },
  error: { borderColor: "rgba(210, 74, 67, 0.22)", badgeBg: "rgba(210, 74, 67, 0.12)" },
  info: { borderColor: "rgba(230, 122, 46, 0.22)", badgeBg: "rgba(230, 122, 46, 0.14)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }

    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (payload: ToastPayload) => {
      const id = counterRef.current++;
      setToasts((current) => [{ id, ...payload }, ...current].slice(0, 3));
      timersRef.current[id] = setTimeout(() => dismissToast(id), 3600);
    },
    [dismissToast]
  );

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss(id: number): void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.viewport, { top: insets.top + spacing.md }]}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} onDismiss={onDismiss} toast={toast} />
      ))}
    </View>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss(id: number): void;
}) {
  const tone = toneStyles[toast.tone];
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderColor: tone.borderColor, opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable style={styles.toastPressable} onPress={() => onDismiss(toast.id)}>
        <View style={[styles.toastBadge, { backgroundColor: tone.badgeBg }]} />
        <View style={styles.toastContent}>
          <Text style={styles.toastTitle}>{toast.title}</Text>
          {toast.description ? (
            <Text style={styles.toastDescription}>{toast.description}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 50,
    gap: spacing.sm,
  },
  toast: {
    borderWidth: 1,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255, 253, 249, 0.98)",
    ...shadows.card,
  },
  toastPressable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  toastBadge: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  toastContent: {
    flex: 1,
    gap: 2,
  },
  toastTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  toastDescription: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
