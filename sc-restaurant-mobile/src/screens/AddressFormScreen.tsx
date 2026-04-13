import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type AddressOrigin = "catalog" | "profile";
type AddressLabelPreset = "home" | "work" | "other";

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

const addressLabelOptions: {
  value: AddressLabelPreset;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "home", label: "Дом", icon: "home" },
  { value: "work", label: "Работа", icon: "briefcase" },
  { value: "other", label: "Другое", icon: "map-pin" },
];

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
  const mapRegionRef = useRef<Region>(DEFAULT_REGION);
  const searchModeRef = useRef(false);
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

  const [labelPreset, setLabelPreset] = useState<AddressLabelPreset>("home");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [searchMode, setSearchMode] = useState(false);
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

  useEffect(() => {
    searchModeRef.current = searchMode;
  }, [searchMode]);

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
    if (!editingAddress) return;

    const parsed = parseStoredAddress(editingAddress.address);
    setLabelPreset(labelPresetFromValue(editingAddress.label));
    setSelectedAddress(parsed.baseAddress);
    setSearchQuery(parsed.baseAddress);
    setDetails(parsed.details);
    setIsDefault(editingAddress.is_default);
  }, [editingAddress]);

  const resolveAddressAt = useCallback(async (latitude: number, longitude: number, cancelled = false) => {
    try {
      setResolvingAddress(true);
      const [resolved] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (cancelled) return;

      const formatted = formatResolvedAddress(resolved);
      if (formatted) {
        setSelectedAddress(formatted);
        if (!searchModeRef.current) {
          setSearchQuery(formatted);
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
  }, []);

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
      mapRegionRef.current = nextRegion;
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 0);

      if (!editingAddress?.address && permission.granted) {
        await resolveAddressAt(nextRegion.latitude, nextRegion.longitude, cancelled);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [addressesQuery.isLoading, editingAddress, isEditing, resolveAddressAt, user]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchMode || query.length < 3 || query.toLowerCase() === selectedAddress.trim().toLowerCase()) {
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
  }, [searchMode, searchQuery, selectedAddress]);

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

  const scheduleAddressResolve = (nextRegion: Region) => {
    mapRegionRef.current = nextRegion;
    if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
    reverseGeocodeTimer.current = setTimeout(() => {
      setMapRegion(nextRegion);
      void resolveAddressAt(nextRegion.latitude, nextRegion.longitude);
    }, 450);
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
      mapRegionRef.current = nextRegion;
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

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    const nextRegion: Region = {
      latitude: suggestion.region.latitude,
      longitude: suggestion.region.longitude,
      latitudeDelta:
        mapRegionRef.current.latitudeDelta || DEFAULT_REGION.latitudeDelta,
      longitudeDelta:
        mapRegionRef.current.longitudeDelta || DEFAULT_REGION.longitudeDelta,
    };

    setSelectedAddress(suggestion.address);
    setSearchQuery(suggestion.address);
    setSuggestions([]);
    setSearchMode(false);
    mapRegionRef.current = nextRegion;
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, motion.normal);
    setError("");
  };

  const updateDetail = (key: keyof DetailsState, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
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

  const submitLabel = isEditing ? "Сохранить" : "Доставить сюда";
  const submitDisabled = loading || !selectedAddress.trim();

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View style={styles.root}>
        <View style={styles.mapArea}>
          <MapView
            ref={mapRef}
            initialRegion={mapRegion}
            loadingEnabled
            showsMyLocationButton={false}
            showsUserLocation={permissionGranted === true}
            style={styles.map}
            onRegionChange={scheduleAddressResolve}
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
        </View>

        <View style={styles.sheet}>
          <ScrollView
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
              {resolvingAddress ? (
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

            {isEditing ? (
              <Pressable hitSlop={10} onPress={handleDelete} style={styles.deleteInline}>
                <Text style={styles.deleteInlineText}>Удалить адрес</Text>
              </Pressable>
            ) : null}
            <View
              style={[
                styles.footer,
                {
                  paddingBottom: Math.max(insets.bottom, spacing.lg),
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
          <View style={styles.searchOverlay}>
            <KeyboardAvoidingView
              style={styles.searchOverlayFlex}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={insets.top}
            >
              <View
                style={[
                  styles.searchOverlayContent,
                  { paddingTop: insets.top + spacing.md },
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
                          <Text style={styles.suggestionText}>{item.address}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                ) : searchQuery.trim().length >= 3 && !searchingSuggestions ? (
                  <Text style={styles.searchHint}>Попробуйте уточнить запрос.</Text>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </View>
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
  searchOverlayFlex: {
    flex: 1,
  },
  searchOverlayContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
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
    alignItems: "center",
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
  suggestionText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 19,
  },
});
