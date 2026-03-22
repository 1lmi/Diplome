declare global {
  interface Window {
    ymaps?: any;
    __meatPointYandexMapsPromise?: Promise<any>;
  }
}

const YANDEX_MAPS_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() || "";
const YANDEX_MAPS_SRC = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${YANDEX_MAPS_API_KEY}`;

export function hasYandexMapsKey() {
  return Boolean(YANDEX_MAPS_API_KEY);
}

export function getYandexMapsApiKey() {
  return YANDEX_MAPS_API_KEY;
}

export function loadYandexMaps(): Promise<any> {
  if (!YANDEX_MAPS_API_KEY) {
    return Promise.reject(
      new Error("Для карты нужен ключ VITE_YANDEX_MAPS_API_KEY.")
    );
  }

  if (window.ymaps) {
    return new Promise((resolve) => {
      window.ymaps.ready(() => resolve(window.ymaps));
    });
  }

  if (window.__meatPointYandexMapsPromise) {
    return window.__meatPointYandexMapsPromise;
  }

  window.__meatPointYandexMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-yandex-maps="true"]'
    );

    const handleReady = () => {
      if (!window.ymaps) {
        reject(new Error("Не удалось загрузить API Яндекс Карт."));
        return;
      }

      window.ymaps.ready(() => resolve(window.ymaps));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleReady, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Не удалось загрузить API Яндекс Карт.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = YANDEX_MAPS_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.yandexMaps = "true";
    script.addEventListener("load", handleReady, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Не удалось загрузить API Яндекс Карт.")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return window.__meatPointYandexMapsPromise;
}
