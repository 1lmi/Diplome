import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { type Region } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useCartStore } from "@/src/store/cart-store";
import { colors, motion, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const DEFAULT_REGION: Region = {
  latitude: 52.7189,
  longitude: 58.6654,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

type AddressStep = "map" | "details";
type AddressOrigin = "catalog" | "profile";

type Suggestion = {
  key: string;
  address: string;
  region: Region;
};

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

function buildRegion(latitude: number, longitude: number): Region {
  return {
    latitude,
    longitude,
    latitudeDelta: DEFAULT_REGION.latitudeDelta,
    longitudeDelta: DEFAULT_REGION.longitudeDelta,
  };
}

function formatResolvedAddress(address?: Location.LocationGeocodedAddress | null) {
  if (!address) return "";

  const locality =
    address.city?.trim() ||
    address.district?.trim() ||
    address.subregion?.trim() ||
    address.region?.trim() ||
    "";
  const streetLine = address.street?.trim()
    ? [address.street.trim(), address.streetNumber?.trim()].filter(Boolean).join(", ")
    : address.name?.trim() || "";

  return [locality, streetLine].filter(Boolean).join(", ");
}

function parseStoredAddress(value: string) {
  const [baseLine = "", detailLine = ""] = value.split(/\r?\n/, 2);

  return {
    baseAddress: baseLine.trim(),
    details: {
      entrance: detailLine.match(/под[ъь]езд\s+([^,]+)/i)?.[1]?.trim() || "",
      floor: detailLine.match(/этаж\s+([^,]+)/i)?.[1]?.trim() || "",
      apartment: detailLine.match(/квартира\s+([^,]+)/i)?.[1]?.trim() || "",
      intercom: detailLine.match(/домофон\s+([^,]+)/i)?.[1]?.trim() || "",
    } satisfies DetailsState,
  };
}

function buildStoredAddress(baseAddress: string, details: DetailsState) {
  const detailParts = [
    details.entrance.trim() ? `подъезд ${details.entrance.trim()}` : "",
    details.intercom.trim() ? `домофон ${details.intercom.trim()}` : "",
    details.floor.trim() ? `этаж ${details.floor.trim()}` : "",
    details.apartment.trim() ? `квартира ${details.apartment.trim()}` : "",
  ].filter(Boolean);

  return detailParts.length ? `${baseAddress.trim()}\n${detailParts.join(", ")}` : baseAddress.trim();
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
  const mapRef = useRef<MapView | null>(null);
  const reverseGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });

  const editingAddress = useMemo(
    () => (addressId ? addressesQuery.data?.find((item) => item.id === addressId) || null : null),
    [addressId, addressesQuery.data]
  );

  const [step, setStep] = useState<AddressStep>("map");
  const [searchMode, setSearchMode] = useState(false);
  const [label, setLabel] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [details, setDetails] = useState<DetailsState>(emptyDetails);
  const [isDefault, setIsDefault] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stepProgress = useRef(new Animated.Value(0)).current;
  const searchProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user) {
      router.replace("/auth/sign-in");
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
      if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    };
  }, []);

  useEffect(() => {
    Animated.timing(stepProgress, {
      toValue: step === "details" ? 1 : 0,
      duration: motion.normal,
      useNativeDriver: true,
    }).start();
  }, [step, stepProgress]);

  useEffect(() => {
    Animated.timing(searchProgress, {
      toValue: searchMode ? 1 : 0,
      duration: motion.normal,
      useNativeDriver: true,
    }).start();
  }, [searchMode, searchProgress]);

  useEffect(() => {
    if (step !== "details") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep("map");
      return true;
    });

    return () => subscription.remove();
  }, [step]);

  useEffect(() => {
    if (!editingAddress) return;

    const parsed = parseStoredAddress(editingAddress.address);
    setLabel(editingAddress.label || "");
    setSelectedAddress(parsed.baseAddress);
    setDetails(parsed.details);
    setIsDefault(editingAddress.is_default);
  }, [editingAddress]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!user) return;
      if (isEditing && addressesQuery.isLoading) return;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermissionGranted(permission.granted);

      let nextRegion = DEFAULT_REGION;

      if (editingAddress?.address) {
        const parsed = parseStoredAddress(editingAddress.address);
        if (parsed.baseAddress) {
          try {
            const matches = await Location.geocodeAsync(parsed.baseAddress);
            if (!cancelled && matches[0]) {
              nextRegion = buildRegion(matches[0].latitude, matches[0].longitude);
            }
          } catch {
            // keep default region
          }
        }
      } else if (permission.granted) {
        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            nextRegion = buildRegion(current.coords.latitude, current.coords.longitude);
          }
        } catch {
          // keep default region
        }
      }

      if (cancelled) return;
      setMapRegion(nextRegion);

      if (!editingAddress?.address && permission.granted) {
        await resolveAddressAt(nextRegion.latitude, nextRegion.longitude, cancelled);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [addressesQuery.isLoading, editingAddress, isEditing, user]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchMode || !query || query.length < 3) {
      setSuggestions([]);
      setSearchingSuggestions(false);
      if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
      return;
    }

    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    suggestionTimer.current = setTimeout(() => {
      void loadSuggestions(query);
    }, 260);

    return () => {
      if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    };
  }, [permissionGranted, searchMode, searchQuery]);

  if (!user) return null;

  async function loadSuggestions(query: string) {
    try {
      setSearchingSuggestions(true);
      const points = await Location.geocodeAsync(query);
      const nextSuggestions: Suggestion[] = [];

      for (const point of points.slice(0, 6)) {
        const region = buildRegion(point.latitude, point.longitude);
        const [resolved] = await Location.reverseGeocodeAsync({
          latitude: point.latitude,
          longitude: point.longitude,
        });
        const formatted = formatResolvedAddress(resolved);
        if (!formatted) continue;
        if (nextSuggestions.some((item) => item.address.toLowerCase() === formatted.toLowerCase())) {
          continue;
        }
        nextSuggestions.push({
          key: `${point.latitude}:${point.longitude}:${formatted}`,
          address: formatted,
          region,
        });
      }

      setSuggestions(nextSuggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchingSuggestions(false);
    }
  }

  async function resolveAddressAt(latitude: number, longitude: number, cancelled = false) {
    try {
      setResolvingAddress(true);
      const [resolved] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (cancelled) return;

      const formatted = formatResolvedAddress(resolved);
      if (formatted) {
        setSelectedAddress(formatted);
        if (!searchMode) {
          setSearchQuery("");
        }
        setError("");
      }
    } catch {
      if (!cancelled) {
        setError("Не удалось определить адрес по карте.");
      }
    } finally {
      if (!cancelled) {
        setResolvingAddress(false);
      }
    }
  }

  const scheduleAddressResolve = (nextRegion: Region) => {
    setMapRegion(nextRegion);
    if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
    reverseGeocodeTimer.current = setTimeout(() => {
      void resolveAddressAt(nextRegion.latitude, nextRegion.longitude);
    }, 320);
  };

  const handleLocateMe = async () => {
    try {
      setLocating(true);
      setError("");
      const permission = await Location.requestForegroundPermissionsAsync();
      setPermissionGranted(permission.granted);

      if (!permission.granted) {
        setError("Разрешите геолокацию, чтобы выбирать адрес на карте.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextRegion = buildRegion(current.coords.latitude, current.coords.longitude);
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, motion.normal);
      await resolveAddressAt(nextRegion.latitude, nextRegion.longitude);
    } catch {
      setError("Не удалось определить текущее местоположение.");
    } finally {
      setLocating(false);
    }
  };

  const openSearchMode = () => {
    setSearchMode(true);
    setSearchQuery(selectedAddress);
    setSuggestions([]);
    setError("");
  };

  const closeSearchMode = () => {
    setSearchMode(false);
    setSearchQuery("");
    setSuggestions([]);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    setSelectedAddress(suggestion.address);
    setSuggestions([]);
    setSearchQuery("");
    setSearchMode(false);
    setMapRegion(suggestion.region);
    mapRef.current?.animateToRegion(suggestion.region, motion.normal);
    setError("");
  };

  const handleContinue = () => {
    if (!selectedAddress.trim()) {
      setError("Сначала выберите адрес на карте.");
      return;
    }
    if (searchMode && searchQuery.trim()) {
      setError("Выберите адрес из списка подсказок или закройте поиск.");
      return;
    }
    setStep("details");
  };

  const updateDetail = (key: keyof DetailsState, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    const normalizedBase = selectedAddress.trim();
    if (!normalizedBase) {
      setError("Выберите адрес перед сохранением.");
      setStep("map");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const previousAddress = editingAddress?.address?.trim() || "";
      const nextAddress = buildStoredAddress(normalizedBase, details);

      if (editingAddress) {
        await mobileApi.updateAddress(editingAddress.id, {
          label: label.trim() || null,
          address: nextAddress,
          is_default: isDefault,
        });
      } else {
        await mobileApi.createAddress({
          label: label.trim() || null,
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

  const mapLayerStyle = {
    opacity: stepProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.92],
    }),
    transform: [
      {
        translateX: stepProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -26],
        }),
      },
    ],
  };

  const detailsLayerStyle = {
    opacity: stepProgress,
    transform: [
      {
        translateX: stepProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [40, 0],
        }),
      },
    ],
  };

  const searchTopStyle = {
    opacity: searchProgress,
    transform: [
      {
        translateY: searchProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-14, 0],
        }),
      },
    ],
  };

  const bottomBarStyle = {
    opacity: searchProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        translateY: searchProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 22],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
      >
        <View style={styles.root}>
          <Animated.View
            pointerEvents={step === "map" ? "auto" : "none"}
            style={[styles.mapStep, mapLayerStyle]}
          >
            <MapView
              ref={mapRef}
              loadingEnabled
              region={mapRegion}
              showsMyLocationButton={false}
              showsUserLocation={permissionGranted === true}
              style={styles.map}
              onRegionChangeComplete={scheduleAddressResolve}
            />

            <View pointerEvents="none" style={styles.mapPinWrap}>
              <View style={styles.mapPinStem} />
              <View style={styles.mapPinHead} />
            </View>

            <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
              <Pressable onPress={() => router.back()} style={styles.closeButton}>
                <Text style={styles.closeText}>Закрыть</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleLocateMe}
              style={[
                styles.locateButton,
                {
                  bottom: searchMode ? spacing.xxxl + 250 : spacing.xxxl + 126,
                },
              ]}
            >
              <Feather color={colors.text} name="navigation" size={18} />
            </Pressable>

            <Animated.View
              pointerEvents={searchMode ? "auto" : "none"}
              style={[styles.searchOverlay, searchTopStyle, { paddingTop: insets.top + spacing.xxl }]}
            >
              <View style={styles.searchPanel}>
                <View style={styles.searchHeader}>
                  <Text style={styles.searchTitle}>Уточнить адрес</Text>
                  <Pressable hitSlop={10} onPress={closeSearchMode}>
                    <Text style={styles.searchCancel}>Готово</Text>
                  </Pressable>
                </View>

                <TextField
                  autoFocus={searchMode}
                  placeholder="Введите город, улицу или дом"
                  value={searchQuery}
                  onChangeText={(value) => {
                    setSearchQuery(value);
                    setError("");
                  }}
                  trailing={
                    searchQuery ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          setSearchQuery("");
                          setSuggestions([]);
                        }}
                      >
                        <Feather color={colors.muted} name="x-circle" size={16} />
                      </Pressable>
                    ) : null
                  }
                />

                {searchingSuggestions ? (
                  <Text style={styles.searchHint}>Ищем подходящие адреса…</Text>
                ) : null}

                {suggestions.length ? (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={styles.suggestionScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.suggestions}>
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
                          <Text style={styles.suggestionText}>{item.address}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                ) : searchQuery.trim().length >= 3 && !searchingSuggestions ? (
                  <Text style={styles.searchHint}>Попробуйте уточнить запрос.</Text>
                ) : null}
              </View>
            </Animated.View>

            <Animated.View
              pointerEvents={searchMode ? "none" : "auto"}
              style={[styles.bottomCardWrap, bottomBarStyle, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
            >
              <View style={styles.bottomCard}>
                <Pressable onPress={openSearchMode} style={styles.addressBar}>
                  <Text style={styles.addressBarLabel}>Адрес</Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.addressBarValue,
                      !selectedAddress ? styles.addressBarValueMuted : null,
                    ]}
                  >
                    {resolvingAddress
                      ? "Определяем адрес по карте…"
                      : selectedAddress || "Передвиньте карту или уточните адрес"}
                  </Text>
                </Pressable>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <MeatButton
                  fullWidth
                  disabled={!selectedAddress.trim() || locating}
                  onPress={handleContinue}
                  size="cta"
                >
                  Далее
                </MeatButton>
              </View>
            </Animated.View>
          </Animated.View>

          <Animated.View
            pointerEvents={step === "details" ? "auto" : "none"}
            style={[styles.detailsStep, detailsLayerStyle]}
          >
            <View style={[styles.detailsHeader, { paddingTop: insets.top + spacing.md }]}>
              <Pressable onPress={() => setStep("map")} style={styles.backButton}>
                <Feather color={colors.text} name="chevron-left" size={18} />
              </Pressable>
              <View style={styles.detailsHeaderCopy}>
                <Text style={styles.detailsTitle}>Детали адреса</Text>
                <Text numberOfLines={2} style={styles.detailsSubtitle}>
                  {selectedAddress}
                </Text>
              </View>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.detailsContent,
                { paddingBottom: Math.max(insets.bottom, spacing.xxxl) + 88 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <TextField
                placeholder="Название (необязательно)"
                value={label}
                onChangeText={setLabel}
              />

              <View style={styles.detailGrid}>
                <TextField
                  containerStyle={styles.detailField}
                  placeholder="Подъезд"
                  value={details.entrance}
                  onChangeText={(value) => updateDetail("entrance", value)}
                />
                <TextField
                  containerStyle={styles.detailField}
                  placeholder="Домофон"
                  value={details.intercom}
                  onChangeText={(value) => updateDetail("intercom", value)}
                />
              </View>

              <View style={styles.detailGrid}>
                <TextField
                  containerStyle={styles.detailField}
                  placeholder="Этаж"
                  value={details.floor}
                  onChangeText={(value) => updateDetail("floor", value)}
                />
                <TextField
                  containerStyle={styles.detailField}
                  placeholder="Квартира"
                  value={details.apartment}
                  onChangeText={(value) => updateDetail("apartment", value)}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {editingAddress ? (
                <Pressable hitSlop={10} onPress={handleDelete} style={styles.deleteInline}>
                  <Text style={styles.deleteInlineText}>Удалить адрес</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <View
              style={[
                styles.saveBar,
                {
                  paddingBottom: Math.max(insets.bottom, spacing.lg),
                },
              ]}
            >
              <MeatButton fullWidth loading={loading} onPress={handleSave} size="cta">
                Сохранить
              </MeatButton>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapStep: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceMuted,
  },
  detailsStep: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  closeButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    justifyContent: "center",
  },
  closeText: {
    color: colors.accent,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  locateButton: {
    position: "absolute",
    right: spacing.lg,
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    ...shadows.soft,
  },
  mapPinWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -16,
    marginTop: -34,
    alignItems: "center",
  },
  mapPinStem: {
    width: 4,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    marginTop: 18,
  },
  mapPinHead: {
    position: "absolute",
    top: 0,
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.48)",
    ...shadows.soft,
  },
  searchOverlay: {
    position: "absolute",
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
  },
  searchPanel: {
    maxHeight: "68%",
    borderRadius: 26,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
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
  suggestionScroll: {
    maxHeight: 320,
  },
  suggestions: {
    gap: spacing.xs,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  suggestionItemPressed: {
    backgroundColor: colors.accentSoft,
  },
  suggestionText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 19,
  },
  bottomCardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bottomCard: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  addressBar: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
  },
  addressBarLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  addressBarValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  addressBarValueMuted: {
    color: colors.muted,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTint,
  },
  detailsHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  detailsTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  detailsSubtitle: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  detailsContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  detailGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  detailField: {
    flex: 1,
  },
  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  deleteInline: {
    alignSelf: "center",
    paddingVertical: spacing.md,
  },
  deleteInlineText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
