import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useCartStore } from "@/src/store/cart-store";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const DEFAULT_CAMERA = {
  lat: 52.7189,
  lng: 58.6654,
  zoom: 16,
};

const MAP_WRAPPER_URL = "https://sc-delivery.ru/mobile-yandex-map.html";
const DEFAULT_YANDEX_MAPS_API_KEY = "1aed26db-4993-4046-b16e-7cb6ceb0f884";

type AddressOrigin = "catalog" | "profile";
type AddressLabelPreset = "home" | "work" | "other";

type MapCamera = {
  lat: number;
  lng: number;
  zoom: number;
};

type MapSearchResult = {
  key: string;
  address: string;
  subtitle?: string;
  lat: number;
  lng: number;
};

type MapCommand =
  | {
      type: "moveTo";
      lat: number;
      lng: number;
      zoom: number;
      preserveZoom?: boolean;
    }
  | {
      type: "search";
      query: string;
      requestId: string;
    }
  | {
      type: "selectSearchResult";
      lat: number;
      lng: number;
      zoom: number;
      preserveZoom?: boolean;
      address: string;
    };

type MapBridgeMessage =
  | { type: "ready" }
  | { type: "cameraChanged"; lat: number; lng: number; zoom: number }
  | { type: "resolvedAddress"; address: string; lat: number; lng: number; zoom: number }
  | { type: "searchResults"; requestId?: string; items?: MapSearchResult[] }
  | { type: "error"; message?: string };

type DetailsState = {
  entrance: string;
  intercom: string;
  floor: string;
  apartment: string;
};

const emptyDetails: DetailsState = {
  entrance: "",
  intercom: "",
  floor: "",
  apartment: "",
};

const addressLabelOptions: {
  value: AddressLabelPreset;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "home", label: "Дом", icon: "home" },
  { value: "work", label: "Работа", icon: "briefcase" },
  { value: "other", label: "Другое", icon: "map-pin" },
];

function parseStoredAddress(value: string) {
  const [baseLine = "", detailLine = ""] = value.split(/\r?\n/);

  return {
    baseAddress: baseLine.trim(),
    details: {
      entrance: detailLine.match(/под[ъь]езд\s+([^,]+)/i)?.[1]?.trim() || "",
      intercom: detailLine.match(/домофон\s+([^,]+)/i)?.[1]?.trim() || "",
      floor: detailLine.match(/этаж\s+([^,]+)/i)?.[1]?.trim() || "",
      apartment: detailLine.match(/квартира\s+([^,]+)/i)?.[1]?.trim() || "",
    } satisfies DetailsState,
  };
}

function buildStoredAddress(baseAddress: string, details: DetailsState) {
  const normalizedBase = baseAddress.trim();
  const detailParts = [
    details.entrance.trim() ? `подъезд ${details.entrance.trim()}` : "",
    details.intercom.trim() ? `домофон ${details.intercom.trim()}` : "",
    details.floor.trim() ? `этаж ${details.floor.trim()}` : "",
    details.apartment.trim() ? `квартира ${details.apartment.trim()}` : "",
  ].filter(Boolean);

  const lines = [normalizedBase];
  if (detailParts.length) {
    lines.push(detailParts.join(", "));
  }

  return lines.filter(Boolean).join("\n");
}

function labelPresetFromValue(value?: string | null): AddressLabelPreset {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "дом") return "home";
  if (normalized === "работа") return "work";
  return "other";
}

function labelValueFromPreset(preset: AddressLabelPreset) {
  if (preset === "home") return "Дом";
  if (preset === "work") return "Работа";
  return "Другое";
}

function isValidCamera(value: unknown): value is MapCamera {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapCamera>;
  return (
    typeof candidate.lat === "number" &&
    typeof candidate.lng === "number" &&
    typeof candidate.zoom === "number"
  );
}

function buildMapSourceUri(camera: MapCamera, apiKey: string, cacheBust: number) {
  const params = new URLSearchParams({
    apikey: apiKey,
    lat: String(camera.lat),
    lng: String(camera.lng),
    zoom: String(camera.zoom),
    v: String(cacheBust),
  });

  return `${MAP_WRAPPER_URL}?${params.toString()}`;
}

export function AddressFormScreen({
  addressId,
  origin = "profile",
}: {
  addressId?: number | null;
  origin?: AddressOrigin;
}) {
  const user = useAuthStore((state) => state.user);
  const checkoutAddress = useCartStore((state) => state.checkoutDraft.address);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const insets = useSafeAreaInsets();
  const isEditing = typeof addressId === "number" && addressId > 0;
  const yandexMapsApiKey =
    process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY?.trim() || DEFAULT_YANDEX_MAPS_API_KEY;

  const webViewRef = useRef<WebView | null>(null);
  const sheetScrollRef = useRef<ScrollView | null>(null);
  const mapCameraRef = useRef<MapCamera>(DEFAULT_CAMERA);
  const commandQueueRef = useRef<MapCommand[]>([]);
  const bootstrapAddressQueryRef = useRef<string | null>(null);
  const activeSearchRequestIdRef = useRef<string | null>(null);
  const activeBootstrapRequestIdRef = useRef<string | null>(null);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldOffsetsRef = useRef<Record<keyof DetailsState, number>>({
    entrance: 0,
    intercom: 0,
    floor: 0,
    apartment: 0,
  });

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });

  const editingAddress = useMemo(
    () => (addressId ? addressesQuery.data?.find((item) => item.id === addressId) || null : null),
    [addressId, addressesQuery.data]
  );

  const [labelPreset, setLabelPreset] = useState<AddressLabelPreset>("home");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [details, setDetails] = useState<DetailsState>(emptyDetails);
  const [isDefault, setIsDefault] = useState(false);
  const [mapSourceCamera, setMapSourceCamera] = useState<MapCamera>(DEFAULT_CAMERA);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [suggestions, setSuggestions] = useState<MapSearchResult[]>([]);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const mapSource = useMemo(
    () => buildMapSourceUri(mapSourceCamera, yandexMapsApiKey, mapReloadToken),
    [mapReloadToken, mapSourceCamera, yandexMapsApiKey]
  );

  const setMapCameraState = useCallback((nextCamera: MapCamera) => {
    mapCameraRef.current = nextCamera;
  }, []);

  const sendMapCommandNow = useCallback((command: MapCommand) => {
    if (!webViewRef.current) {
      return;
    }

    webViewRef.current.injectJavaScript(
      `window.__SCMobileMapReceive && window.__SCMobileMapReceive(${JSON.stringify(command)}); true;`
    );
  }, []);

  const queueMapCommand = useCallback(
    (command: MapCommand) => {
      if (!mapReady) {
        commandQueueRef.current.push(command);
        return;
      }

      sendMapCommandNow(command);
    },
    [mapReady, sendMapCommandNow]
  );

  const flushCommandQueue = useCallback(() => {
    if (!mapReady || !commandQueueRef.current.length) {
      return;
    }

    const queued = [...commandQueueRef.current];
    commandQueueRef.current = [];
    queued.forEach((command) => sendMapCommandNow(command));
  }, [mapReady, sendMapCommandNow]);

  const runBootstrapAddressLookup = useCallback(() => {
    const query = bootstrapAddressQueryRef.current?.trim();
    if (!query) {
      return;
    }

    bootstrapAddressQueryRef.current = null;
    const requestId = `bootstrap:${Date.now()}`;
    activeBootstrapRequestIdRef.current = requestId;
    queueMapCommand({
      type: "search",
      query,
      requestId,
    });
  }, [queueMapCommand]);

  const handleBootstrapSelection = useCallback(
    (suggestion: MapSearchResult) => {
      const nextCamera = {
        lat: suggestion.lat,
        lng: suggestion.lng,
        zoom: DEFAULT_CAMERA.zoom,
      };

      setSelectedAddress(suggestion.address);
      setSearchQuery(suggestion.address);
      setMapCameraState(nextCamera);
      queueMapCommand({
        type: "selectSearchResult",
        lat: suggestion.lat,
        lng: suggestion.lng,
        zoom: DEFAULT_CAMERA.zoom,
        preserveZoom: false,
        address: suggestion.address,
      });
    },
    [queueMapCommand, setMapCameraState]
  );

  useEffect(() => {
    if (!user) {
      router.replace("/auth/sign-in");
    }
  }, [user]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      if (suggestionTimer.current) {
        clearTimeout(suggestionTimer.current);
      }
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isEditing && addressesQuery.isLoading) return;

    let cancelled = false;

    const bootstrap = async () => {
      if (editingAddress) {
        const parsed = parseStoredAddress(editingAddress.address);
        setLabelPreset(labelPresetFromValue(editingAddress.label));
        setSelectedAddress(parsed.baseAddress);
        setSearchQuery(parsed.baseAddress);
        setDetails(parsed.details);
        setIsDefault(editingAddress.is_default);
        bootstrapAddressQueryRef.current = parsed.baseAddress || null;
      }

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (editingAddress || !permission.granted) {
          if (mapReady) {
            runBootstrapAddressLookup();
          }
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        const nextCamera = {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          zoom: DEFAULT_CAMERA.zoom,
        };

        setMapSourceCamera(nextCamera);
        setMapCameraState(nextCamera);
        queueMapCommand({
          type: "moveTo",
          lat: nextCamera.lat,
          lng: nextCamera.lng,
          zoom: nextCamera.zoom,
          preserveZoom: false,
        });
      } catch {
        if (!cancelled && mapReady) {
          runBootstrapAddressLookup();
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    addressesQuery.isLoading,
    editingAddress,
    isEditing,
    mapReady,
    queueMapCommand,
    runBootstrapAddressLookup,
    setMapCameraState,
    user,
  ]);

  useEffect(() => {
    if (mapReady) {
      flushCommandQueue();
      runBootstrapAddressLookup();
    }
  }, [flushCommandQueue, mapReady, runBootstrapAddressLookup]);

  useEffect(() => {
    if (!searchMode || !mapReady) {
      if (suggestionTimer.current) {
        clearTimeout(suggestionTimer.current);
      }
      setSuggestions([]);
      setSearchingSuggestions(false);
      return;
    }

    const query = searchQuery.trim();
    if (!query || query.length < 3 || query.toLowerCase() === selectedAddress.trim().toLowerCase()) {
      if (suggestionTimer.current) {
        clearTimeout(suggestionTimer.current);
      }
      setSuggestions([]);
      setSearchingSuggestions(false);
      return;
    }

    if (suggestionTimer.current) {
      clearTimeout(suggestionTimer.current);
    }

    suggestionTimer.current = setTimeout(() => {
      const requestId = `search:${Date.now()}`;
      activeSearchRequestIdRef.current = requestId;
      setSearchingSuggestions(true);
      queueMapCommand({
        type: "search",
        query,
        requestId,
      });
    }, 260);

    return () => {
      if (suggestionTimer.current) {
        clearTimeout(suggestionTimer.current);
      }
    };
  }, [mapReady, queueMapCommand, searchMode, searchQuery, selectedAddress]);

  const handleLocateMe = async () => {
    try {
      setLocating(true);
      setError("");

      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        setError("Разрешите геолокацию, чтобы выбрать адрес на карте.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextCamera = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        zoom: mapCameraRef.current.zoom || DEFAULT_CAMERA.zoom,
      };

      setMapCameraState(nextCamera);
      queueMapCommand({
        type: "moveTo",
        lat: nextCamera.lat,
        lng: nextCamera.lng,
        zoom: nextCamera.zoom,
        preserveZoom: true,
      });
    } catch {
      setError("Не удалось определить текущее местоположение.");
    } finally {
      setLocating(false);
    }
  };

  const openSearchMode = () => {
    if (!mapReady) {
      setError("Карта ещё загружается. Попробуйте через пару секунд.");
      return;
    }

    setSearchQuery(selectedAddress);
    setSuggestions([]);
    setSearchMode(true);
    setError("");
  };

  const closeSearchMode = () => {
    setSearchMode(false);
    setSearchQuery(selectedAddress);
    setSuggestions([]);
    setSearchingSuggestions(false);
  };

  const handleSelectSuggestion = (suggestion: MapSearchResult) => {
    const nextCamera = {
      lat: suggestion.lat,
      lng: suggestion.lng,
      zoom: mapCameraRef.current.zoom || DEFAULT_CAMERA.zoom,
    };

    setSelectedAddress(suggestion.address);
    setSearchQuery(suggestion.address);
    setSuggestions([]);
    setSearchMode(false);
    setMapCameraState(nextCamera);
    queueMapCommand({
      type: "selectSearchResult",
      lat: suggestion.lat,
      lng: suggestion.lng,
      zoom: nextCamera.zoom,
      preserveZoom: true,
      address: suggestion.address,
    });
    setError("");
  };

  const updateDetail = (key: keyof DetailsState, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const registerFieldOffset =
    (key: keyof DetailsState) =>
    (event: LayoutChangeEvent) => {
      fieldOffsetsRef.current[key] = event.nativeEvent.layout.y;
    };

  const focusField =
    (key: keyof DetailsState) =>
    () => {
      const nextY = Math.max(0, fieldOffsetsRef.current[key] - spacing.lg);

      setTimeout(() => {
        sheetScrollRef.current?.scrollTo({
          y: nextY,
          animated: true,
        });
      }, 120);
    };

  const handleSave = async () => {
    const normalizedBase = selectedAddress.trim();
    const normalizedQuery = searchQuery.trim();

    if (!normalizedBase) {
      setError("Выберите адрес перед сохранением.");
      return;
    }

    if (
      searchMode &&
      normalizedQuery &&
      normalizedQuery.toLowerCase() !== normalizedBase.toLowerCase()
    ) {
      setError("Выберите адрес из списка подсказок или укажите его на карте.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const previousAddress = editingAddress?.address?.trim() || "";
      const nextAddress = buildStoredAddress(normalizedBase, details);
      const nextLabel = labelValueFromPreset(labelPreset);

      if (editingAddress) {
        await mobileApi.updateAddress(editingAddress.id, {
          label: nextLabel,
          address: nextAddress,
          is_default: isDefault,
        });
      } else {
        await mobileApi.createAddress({
          label: nextLabel,
          address: nextAddress,
          is_default: isDefault,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["addresses"] });

      if (origin === "catalog" || (previousAddress && previousAddress === checkoutAddress.trim())) {
        updateCheckoutDraft({
          deliveryMethod: "delivery",
          address: nextAddress,
        });
      }

      pushToast({
        tone: "success",
        title: editingAddress ? "Адрес обновлён" : "Адрес добавлен",
        description: "Изменения сохранены.",
      });
      router.back();
    } catch (err: any) {
      setError(err?.message || "Не удалось сохранить адрес.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!editingAddress) return;

    Alert.alert("Удалить адрес?", "Это действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await mobileApi.deleteAddress(editingAddress.id);
            await queryClient.invalidateQueries({ queryKey: ["addresses"] });
            if (checkoutAddress.trim() === editingAddress.address.trim()) {
              updateCheckoutDraft({ address: "" });
            }
            pushToast({
              tone: "info",
              title: "Адрес удалён",
            });
            router.back();
          } catch (err: any) {
            setError(err?.message || "Не удалось удалить адрес.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleRetryMap = () => {
    setMapLoading(true);
    setMapReady(false);
    setMapError("");
    setSearchMode(false);
    setSuggestions([]);
    setSearchingSuggestions(false);
    commandQueueRef.current = [];
    setMapSourceCamera(mapCameraRef.current);
    setMapReloadToken((current) => current + 1);
  };

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: MapBridgeMessage | null = null;

      try {
        payload = JSON.parse(event.nativeEvent.data) as MapBridgeMessage;
      } catch {
        return;
      }

      if (!payload) {
        return;
      }

      if (payload.type === "ready") {
        setMapLoading(false);
        setMapReady(true);
        setMapError("");
        return;
      }

      if (payload.type === "cameraChanged" && isValidCamera(payload)) {
        setMapCameraState(payload);
        return;
      }

      if (payload.type === "resolvedAddress" && isValidCamera(payload)) {
        setMapCameraState(payload);
        if (payload.address?.trim()) {
          setSelectedAddress(payload.address.trim());
          if (!searchMode) {
            setSearchQuery(payload.address.trim());
          }
          setError("");
        }
        return;
      }

      if (payload.type === "searchResults") {
        const items = Array.isArray(payload.items) ? payload.items : [];

        if (payload.requestId && payload.requestId === activeBootstrapRequestIdRef.current) {
          activeBootstrapRequestIdRef.current = null;
          if (items.length) {
            handleBootstrapSelection(items[0]);
          }
          return;
        }

        if (payload.requestId && activeSearchRequestIdRef.current !== payload.requestId) {
          return;
        }

        setSearchingSuggestions(false);
        setSuggestions(items);
        return;
      }

      if (payload.type === "error") {
        const message = payload.message?.trim() || "Не удалось загрузить карту.";

        if (!mapReady) {
          setMapLoading(false);
          setMapError(message);
        } else {
          setSearchingSuggestions(false);
          setError(message);
        }
      }
    },
    [handleBootstrapSelection, mapReady, searchMode, setMapCameraState]
  );

  const submitLabel = isEditing ? "Сохранить" : "Доставить сюда";
  const submitDisabled = loading || !selectedAddress.trim();

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View style={styles.root}>
        <View style={styles.mapArea}>
          <WebView
            ref={(instance) => {
              webViewRef.current = instance;
            }}
            key={`yandex-map:${mapReloadToken}`}
            bounces={false}
            cacheEnabled={false}
            domStorageEnabled
            javaScriptEnabled
            onError={() => {
              setMapLoading(false);
              setMapReady(false);
              setMapError("Не удалось загрузить карту. Проверьте соединение и повторите попытку.");
            }}
            onHttpError={() => {
              setMapLoading(false);
              setMapReady(false);
              setMapError("Не удалось открыть карту с сервера.");
            }}
            onMessage={handleWebMessage}
            originWhitelist={["*"]}
            setSupportMultipleWindows={false}
            source={{ uri: mapSource }}
            style={styles.map}
          />

          <View pointerEvents="none" style={styles.mapPinWrap}>
            <View style={styles.mapPinStem} />
            <View style={styles.mapPinHead} />
          </View>

          <View style={[styles.mapTopBar, { paddingTop: insets.top + spacing.md }]}>
            <Pressable onPress={() => router.back()} style={styles.topIconButton}>
              <Feather color={colors.text} name="x" size={22} />
            </Pressable>
          </View>

          <Pressable onPress={handleLocateMe} style={styles.locateButton}>
            {locating ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Feather color={colors.text} name="navigation" size={18} />
            )}
          </Pressable>

          {mapLoading ? (
            <View style={styles.mapOverlay}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.mapOverlayText}>Загружаем карту…</Text>
            </View>
          ) : null}

          {mapError ? (
            <View style={styles.mapOverlay}>
              <View style={styles.mapErrorCard}>
                <Text style={styles.mapErrorTitle}>Карта не загрузилась</Text>
                <Text style={styles.mapErrorText}>{mapError}</Text>
                <View style={styles.mapErrorActions}>
                  <MeatButton onPress={handleRetryMap} variant="primary">
                    Повторить
                  </MeatButton>
                  <MeatButton onPress={() => router.back()} variant="secondary">
                    Назад
                  </MeatButton>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.sheet,
            keyboardHeight > 0
              ? {
                  marginBottom: Math.max(0, keyboardHeight - insets.bottom),
                }
              : null,
          ]}
        >
          <ScrollView
            ref={(instance) => {
              sheetScrollRef.current = instance;
            }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHandle} />

            <Pressable onPress={openSearchMode} style={styles.addressSummary}>
              <View style={styles.addressSummaryCopy}>
                <Text style={styles.addressSummaryLabel}>Город, улица и дом</Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.addressSummaryValue,
                    !selectedAddress ? styles.addressSummaryValueMuted : null,
                  ]}
                >
                  {selectedAddress || "Передвиньте карту или найдите адрес"}
                </Text>
              </View>
              {mapLoading ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Feather color={colors.muted} name="search" size={18} />
              )}
            </Pressable>

            <View style={styles.labelRow}>
              {addressLabelOptions.map((option) => {
                const active = option.value === labelPreset;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setLabelPreset(option.value)}
                    style={[styles.labelChip, active ? styles.labelChipActive : null]}
                  >
                    <Feather
                      color={active ? colors.surfaceStrong : colors.text}
                      name={option.icon}
                      size={15}
                    />
                    <Text style={[styles.labelChipText, active ? styles.labelChipTextActive : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.detailGrid}>
              <View onLayout={registerFieldOffset("entrance")} style={styles.detailField}>
                <TextField
                  containerStyle={styles.detailFieldInner}
                  onFocus={focusField("entrance")}
                  placeholder="Подъезд"
                  value={details.entrance}
                  onChangeText={(value) => updateDetail("entrance", value)}
                />
              </View>
              <View onLayout={registerFieldOffset("intercom")} style={styles.detailField}>
                <TextField
                  containerStyle={styles.detailFieldInner}
                  onFocus={focusField("intercom")}
                  placeholder="Домофон"
                  value={details.intercom}
                  onChangeText={(value) => updateDetail("intercom", value)}
                />
              </View>
            </View>

            <View style={styles.detailGrid}>
              <View onLayout={registerFieldOffset("floor")} style={styles.detailField}>
                <TextField
                  containerStyle={styles.detailFieldInner}
                  onFocus={focusField("floor")}
                  placeholder="Этаж"
                  value={details.floor}
                  onChangeText={(value) => updateDetail("floor", value)}
                />
              </View>
              <View onLayout={registerFieldOffset("apartment")} style={styles.detailField}>
                <TextField
                  containerStyle={styles.detailFieldInner}
                  onFocus={focusField("apartment")}
                  placeholder="Квартира"
                  value={details.apartment}
                  onChangeText={(value) => updateDetail("apartment", value)}
                />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {isEditing ? (
              <Pressable hitSlop={10} onPress={handleDelete} style={styles.deleteInline}>
                <Text style={styles.deleteInlineText}>Удалить адрес</Text>
              </Pressable>
            ) : null}

            <View
              style={[
                styles.footer,
                {
                  paddingBottom: Math.max(
                    insets.bottom,
                    keyboardHeight > 0 ? spacing.sm : spacing.lg
                  ),
                },
              ]}
            >
              <MeatButton fullWidth disabled={submitDisabled} loading={loading} onPress={handleSave} size="cta">
                {submitLabel}
              </MeatButton>
            </View>
          </ScrollView>
        </View>

        {searchMode ? (
          <Modal
            animationType="fade"
            onRequestClose={closeSearchMode}
            statusBarTranslucent={Platform.OS === "android"}
            visible
          >
            <View style={styles.searchOverlay}>
              <View
                style={[
                  styles.searchOverlayContent,
                  {
                    paddingTop: insets.top + spacing.md,
                    paddingBottom: Math.max(insets.bottom, keyboardHeight),
                  },
                ]}
              >
                <View style={styles.searchHeader}>
                  <Text style={styles.searchTitle}>Поиск адреса</Text>
                  <Pressable hitSlop={10} onPress={closeSearchMode}>
                    <Text style={styles.searchCancel}>Готово</Text>
                  </Pressable>
                </View>

                <TextField
                  autoFocus
                  placeholder="Введите город, улицу или дом"
                  selectTextOnFocus
                  value={searchQuery}
                  onChangeText={(value) => {
                    setSearchQuery(value);
                    setError("");
                  }}
                  trailing={
                    searchingSuggestions ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : searchQuery ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          setSearchQuery("");
                          setSuggestions([]);
                          setError("");
                        }}
                      >
                        <Feather color={colors.muted} name="x-circle" size={16} />
                      </Pressable>
                    ) : (
                      <Feather color={colors.muted} name="search" size={16} />
                    )
                  }
                />

                {searchingSuggestions ? (
                  <Text style={styles.searchHint}>Ищем подходящие адреса…</Text>
                ) : null}

                {suggestions.length ? (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={styles.searchResultScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.searchResultList}>
                      {suggestions.map((item) => (
                        <Pressable
                          key={item.key}
                          onPress={() => handleSelectSuggestion(item)}
                          style={({ pressed }) => [
                            styles.suggestionItem,
                            pressed ? styles.suggestionItemPressed : null,
                          ]}
                        >
                          <Feather color={colors.accent} name="map-pin" size={15} />
                          <View style={styles.suggestionCopy}>
                            <Text style={styles.suggestionText}>{item.address}</Text>
                            {item.subtitle ? (
                              <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                ) : searchQuery.trim().length >= 3 && !searchingSuggestions ? (
                  <Text style={styles.searchHint}>Попробуйте уточнить запрос.</Text>
                ) : null}
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapArea: {
    position: "relative",
    flex: 1,
    minHeight: 320,
    backgroundColor: colors.surfaceMuted,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  topIconButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  locateButton: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  mapPinWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 32,
    height: 56,
    marginLeft: -16,
    marginTop: -34,
  },
  mapPinHead: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.52)",
    ...shadows.soft,
  },
  mapPinStem: {
    position: "absolute",
    top: 24,
    left: 14,
    width: 4,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: spacing.xl,
  },
  mapOverlayText: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  mapErrorCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  mapErrorTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  mapErrorText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 21,
  },
  mapErrorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    marginBottom: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.28)",
  },
  addressSummary: {
    minHeight: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  addressSummaryCopy: {
    flex: 1,
    gap: 4,
  },
  addressSummaryLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  addressSummaryValue: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
  },
  addressSummaryValueMuted: {
    color: colors.muted,
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  labelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTint,
  },
  labelChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  labelChipText: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  labelChipTextActive: {
    color: colors.surfaceStrong,
  },
  detailGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  detailField: {
    flex: 1,
  },
  detailFieldInner: {
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  deleteInline: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  deleteInlineText: {
    color: colors.danger,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  footer: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  searchOverlay: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  searchOverlayContent: {
    flex: 1,
    gap: spacing.md,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  searchTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  searchCancel: {
    color: colors.accent,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  searchHint: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  searchResultScroll: {
    flex: 1,
  },
  searchResultList: {
    gap: spacing.xs,
    paddingBottom: spacing.xxxl,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  suggestionItemPressed: {
    backgroundColor: colors.accentSoft,
  },
  suggestionCopy: {
    flex: 1,
    gap: 2,
  },
  suggestionText: {
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 19,
  },
  suggestionSubtitle: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
