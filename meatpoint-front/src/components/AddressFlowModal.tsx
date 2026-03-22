import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  buildStoredAddress,
  parseStoredAddress,
  type AddressDetails,
} from "../addressFlow";
import { hasYandexMapsKey, loadYandexMaps } from "../yandexMaps";

type AddressStep = "map" | "details";

type AddressSuggestion = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
};

type SubmitPayload = {
  label: string | null;
  address: string;
  isDefault: boolean;
};

interface Props {
  title: string;
  initialAddress?: string | null;
  initialLabel?: string | null;
  initialIsDefault?: boolean;
  showDefaultToggle?: boolean;
  saveLabel?: string;
  submitting?: boolean;
  deleting?: boolean;
  onClose: () => void;
  onSubmit: (payload: SubmitPayload) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

const DEFAULT_CENTER = {
  latitude: 52.7189,
  longitude: 58.6654,
  zoom: 17,
};

function extractAddressText(geoObject: any) {
  const directText =
    geoObject?.getAddressLine?.() ||
    geoObject?.properties?.get?.("text") ||
    geoObject?.properties?.get?.("name") ||
    "";
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const meta = geoObject?.properties?.get?.("metaDataProperty")?.GeocoderMetaData;
  const components = meta?.Address?.Components ?? [];
  const pick = (kinds: string[]) =>
    components.find((item: any) => kinds.includes(item.kind))?.name?.trim() || "";

  const locality =
    pick(["locality", "province", "area", "district"]) ||
    geoObject?.properties?.get?.("description")?.trim?.() ||
    "";
  const street = pick(["street"]);
  const house = pick(["house"]);
  const formatted = [locality, [street, house].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");

  return formatted || meta?.Address?.formatted || meta?.text || "";
}

function extractSuggestion(geoObject: any): AddressSuggestion | null {
  const coords = geoObject?.geometry?.getCoordinates?.();
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const latitude = Number(coords[0]);
  const longitude = Number(coords[1]);
  const address = extractAddressText(geoObject);

  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    id: `${latitude}:${longitude}:${address}`,
    address,
    latitude,
    longitude,
  };
}

function extractSuggestions(response: any): AddressSuggestion[] {
  const collection = response?.geoObjects;
  if (!collection || typeof collection.getLength !== "function" || typeof collection.get !== "function") {
    return [];
  }

  const items: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < collection.getLength(); index += 1) {
    const suggestion = extractSuggestion(collection.get(index));
    if (!suggestion) continue;

    const key = suggestion.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(suggestion);
  }

  return items;
}

async function geocodeQuery(query: string, results = 6): Promise<AddressSuggestion[]> {
  const ymaps = await loadYandexMaps();
  const response = await ymaps.geocode(query, {
    results,
  });
  return extractSuggestions(response);
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const ymaps = await loadYandexMaps();
  const response = await ymaps.geocode([latitude, longitude], {
    results: 1,
  });
  const suggestion = extractSuggestions(response)[0];
  return suggestion?.address || "";
}

export const AddressFlowModal: React.FC<Props> = ({
  title,
  initialAddress,
  initialLabel,
  initialIsDefault = false,
  showDefaultToggle = true,
  saveLabel = "Сохранить",
  submitting = false,
  deleting = false,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const parsedInitial = useMemo(() => parseStoredAddress(initialAddress), [initialAddress]);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const reverseTimerRef = useRef<number | null>(null);
  const reverseRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);

  const [step, setStep] = useState<AddressStep>("map");
  const [searchMode, setSearchMode] = useState(false);
  const [label, setLabel] = useState(initialLabel || "");
  const [selectedAddress, setSelectedAddress] = useState(parsedInitial.baseAddress);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [details, setDetails] = useState<AddressDetails>(parsedInitial.details);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (step === "details") {
          setStep("map");
          return;
        }
        if (searchMode) {
          setSearchMode(false);
          setSearchQuery("");
          setSuggestions([]);
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, searchMode, step]);

  useEffect(() => {
    let active = true;

    const setupMap = async () => {
      if (!mapHostRef.current || !hasYandexMapsKey()) return;

      try {
        const ymaps = await loadYandexMaps();
        if (!active || !mapHostRef.current) return;

        const map = new ymaps.Map(
          mapHostRef.current,
          {
            center: [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude],
            zoom: DEFAULT_CENTER.zoom,
            controls: [],
          },
          {
            suppressMapOpenBlock: true,
            yandexMapDisablePoiInteractivity: true,
          }
        );

        const handleActionEnd = () => {
          const [latitude, longitude] = map.getCenter();
          if (reverseTimerRef.current) {
            window.clearTimeout(reverseTimerRef.current);
          }
          reverseTimerRef.current = window.setTimeout(() => {
            void resolveAddress(latitude, longitude);
          }, 260);
        };

        map.events.add("actionend", handleActionEnd);
        mapRef.current = map;

        const bootstrap = async () => {
          if (parsedInitial.baseAddress) {
            try {
              const results = await geocodeQuery(parsedInitial.baseAddress, 1);
              if (results[0]) {
                map.setCenter([results[0].latitude, results[0].longitude], DEFAULT_CENTER.zoom, {
                  duration: 250,
                });
                setSelectedAddress(results[0].address);
                return;
              }
            } catch {
              // ignore and fall back
            }
          }

          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!active || !mapRef.current) return;
                mapRef.current.setCenter(
                  [position.coords.latitude, position.coords.longitude],
                  DEFAULT_CENTER.zoom,
                  { duration: 250 }
                );
              },
              () => {
                void resolveAddress(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude);
              },
              {
                enableHighAccuracy: true,
                timeout: 8000,
              }
            );
          } else {
            await resolveAddress(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude);
          }
        };

        void bootstrap();

        return () => {
          map.events.remove("actionend", handleActionEnd);
        };
      } catch (setupError) {
        if (active) {
          setError(
            setupError instanceof Error && setupError.message
              ? setupError.message
              : "Не удалось загрузить карту."
          );
        }
      }
    };

    let removeListener: (() => void) | undefined;
    void setupMap().then((cleanup) => {
      removeListener = cleanup;
    });

    return () => {
      active = false;
      if (reverseTimerRef.current) {
        window.clearTimeout(reverseTimerRef.current);
      }
      removeListener?.();
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [parsedInitial.baseAddress]);

  useEffect(() => {
    if (!searchMode) return;
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearchingSuggestions(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setSearchingSuggestions(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const nextSuggestions = await geocodeQuery(query, 6);
        if (requestId !== searchRequestIdRef.current) return;
        setSuggestions(nextSuggestions);
      } catch {
        if (requestId !== searchRequestIdRef.current) return;
        setSuggestions([]);
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearchingSuggestions(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchMode, searchQuery]);

  const resolveAddress = async (latitude: number, longitude: number) => {
    const requestId = ++reverseRequestIdRef.current;
    setResolvingAddress(true);

    try {
      const nextAddress = await reverseGeocode(latitude, longitude);
      if (requestId !== reverseRequestIdRef.current) return;
      if (nextAddress) {
        setSelectedAddress(nextAddress);
        setError(null);
      }
    } catch {
      if (requestId !== reverseRequestIdRef.current) return;
      setError("Не удалось определить адрес по карте.");
    } finally {
      if (requestId === reverseRequestIdRef.current) {
        setResolvingAddress(false);
      }
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation || !mapRef.current) {
      setError("Браузер не поддерживает геолокацию.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mapRef.current) return;
        mapRef.current.setCenter(
          [position.coords.latitude, position.coords.longitude],
          DEFAULT_CENTER.zoom,
          { duration: 250 }
        );
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Не удалось определить текущее местоположение.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
      }
    );
  };

  const handleSuggestionSelect = (suggestion: AddressSuggestion) => {
    setSelectedAddress(suggestion.address);
    setSearchQuery("");
    setSuggestions([]);
    setSearchMode(false);
    setError(null);
    mapRef.current?.setCenter([suggestion.latitude, suggestion.longitude], DEFAULT_CENTER.zoom, {
      duration: 250,
    });
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
    setSearchMode(false);
    setError(null);
    setStep("details");
  };

  const updateDetail = (key: keyof AddressDetails, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    const baseAddress = selectedAddress.trim();
    if (!baseAddress) {
      setError("Выберите адрес перед сохранением.");
      setStep("map");
      return;
    }

    await onSubmit({
      label: label.trim() || null,
      address: buildStoredAddress(baseAddress, details),
      isDefault,
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop--address-flow" onClick={onClose}>
      <div
        className={`modal modal--wide address-flow-modal address-flow-modal--${step}${
          searchMode ? " address-flow-modal--search" : ""
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="address-flow-modal__track">
          <section className="address-flow-modal__pane address-flow-modal__pane--map">
            <div className="address-flow-modal__map-top">
              <button
                className="address-flow-modal__close-link"
                type="button"
                onClick={onClose}
              >
                Закрыть
              </button>
            </div>

            <div ref={mapHostRef} className="address-flow-modal__map" />
            {!hasYandexMapsKey() ? (
              <div className="address-flow-modal__map-fallback">
                <div className="alert alert--error">
                  Для карты нужен ключ <code>VITE_YANDEX_MAPS_API_KEY</code>.
                </div>
              </div>
            ) : null}

            <div className="address-flow-modal__map-pin" aria-hidden="true">
              <span className="address-flow-modal__map-pin-head" />
              <span className="address-flow-modal__map-pin-tail" />
            </div>

            <button
              className="address-flow-modal__locate"
              type="button"
              onClick={handleLocateMe}
              disabled={locating || !hasYandexMapsKey()}
              aria-label="Определить моё местоположение"
            >
              ↗
            </button>

            <div className="address-flow-modal__search-shell">
              <div className="address-flow-modal__search-panel">
                <div className="address-flow-modal__search-head">
                  <strong>Уточнить адрес</strong>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setSearchMode(false);
                      setSearchQuery("");
                      setSuggestions([]);
                    }}
                  >
                    Готово
                  </button>
                </div>
                <input
                  className="input"
                  autoFocus={searchMode}
                  placeholder="Город, улица или дом"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setError(null);
                  }}
                />

                {searchingSuggestions ? (
                  <p className="muted address-flow-modal__search-note">Ищем подходящие адреса...</p>
                ) : null}

                {!searchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 3 ? (
                  <p className="muted address-flow-modal__search-note">
                    Попробуйте уточнить запрос или передвиньте карту.
                  </p>
                ) : null}

                {suggestions.length > 0 ? (
                  <div className="address-flow-modal__suggestions">
                    {suggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="address-flow-modal__suggestion"
                        onClick={() => handleSuggestionSelect(item)}
                      >
                        {item.address}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="address-flow-modal__bottom">
              <div className="address-flow-modal__bottom-card">
                <button
                  className="address-flow-modal__address-bar"
                  type="button"
                  onClick={() => {
                    setSearchMode(true);
                    setSearchQuery(selectedAddress);
                    setSuggestions([]);
                    setError(null);
                  }}
                  disabled={!hasYandexMapsKey()}
                >
                  <span className="address-flow-modal__address-label">Адрес</span>
                  <strong className={!selectedAddress ? "muted" : undefined}>
                    {resolvingAddress
                      ? "Определяем адрес по карте..."
                      : selectedAddress || "Передвиньте карту или уточните адрес"}
                  </strong>
                </button>

                {error ? <div className="alert alert--error">{error}</div> : null}

                <button
                  type="button"
                  className="btn btn--primary btn--full"
                  onClick={handleContinue}
                  disabled={!selectedAddress.trim() || locating || !hasYandexMapsKey()}
                >
                  Далее
                </button>
              </div>
            </div>
          </section>

          <section className="address-flow-modal__pane address-flow-modal__pane--details">
            <div className="address-flow-modal__details-head">
              <button
                type="button"
                className="address-flow-modal__back"
                onClick={() => setStep("map")}
              >
                ←
              </button>
              <div className="address-flow-modal__details-copy">
                <p className="eyebrow">Адрес</p>
                <h3>{title}</h3>
                <p className="muted">{selectedAddress}</p>
              </div>
            </div>

            <div className="address-flow-modal__details-body">
              <label className="field">
                <span>Название (необязательно)</span>
                <input
                  className="input"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Дом, работа или другое"
                />
              </label>

              <div className="address-flow-modal__details-grid">
                <label className="field">
                  <span>Подъезд</span>
                  <input
                    className="input"
                    value={details.entrance}
                    onChange={(event) => updateDetail("entrance", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Домофон</span>
                  <input
                    className="input"
                    value={details.intercom}
                    onChange={(event) => updateDetail("intercom", event.target.value)}
                  />
                </label>
              </div>

              <div className="address-flow-modal__details-grid">
                <label className="field">
                  <span>Этаж</span>
                  <input
                    className="input"
                    value={details.floor}
                    onChange={(event) => updateDetail("floor", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Квартира</span>
                  <input
                    className="input"
                    value={details.apartment}
                    onChange={(event) => updateDetail("apartment", event.target.value)}
                  />
                </label>
              </div>

              {showDefaultToggle ? (
                <label className="checkbox profile-checkbox">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(event) => setIsDefault(event.target.checked)}
                  />
                  <span>Использовать как основной адрес</span>
                </label>
              ) : null}

              {onDelete ? (
                <button
                  type="button"
                  className="address-flow-modal__delete"
                  onClick={() => void onDelete()}
                  disabled={deleting || submitting}
                >
                  {deleting ? "Удаляем..." : "Удалить адрес"}
                </button>
              ) : null}
            </div>

            <div className="address-flow-modal__save">
              <button
                type="button"
                className={`btn btn--primary btn--full${submitting ? " btn--loading" : ""}`}
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="btn__spinner" />
                    Сохраняем...
                  </>
                ) : (
                  saveLabel
                )}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddressFlowModal;
