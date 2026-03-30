export type HomeBannerTheme = "sun" | "mist" | "clay";

export interface HomeBanner {
  id: string;
  kicker: string;
  title: string;
  text: string;
  theme: HomeBannerTheme;
}

export const DEFAULT_HOME_BANNERS: HomeBanner[] = [
  {
    id: "01",
    kicker: "SC restaurant",
    title: "Промо-баннер 01",
    text: "Временная заглушка для будущей кампании.",
    theme: "sun",
  },
  {
    id: "02",
    kicker: "Новая подборка",
    title: "Промо-баннер 02",
    text: "Здесь будет основной визуал новой подборки.",
    theme: "mist",
  },
  {
    id: "03",
    kicker: "Сезонное",
    title: "Промо-баннер 03",
    text: "Место под сезонное предложение или спецпроект.",
    theme: "clay",
  },
];

const THEME_SET = new Set<HomeBannerTheme>(["sun", "mist", "clay"]);

const normalizeId = (id: string | undefined, index: number) =>
  id?.trim() || String(index + 1).padStart(2, "0");

interface ParseOptions {
  fallbackToDefaults?: boolean;
}

export const parseHomeBanners = (
  raw?: string | null,
  options: ParseOptions = {}
): HomeBanner[] => {
  const { fallbackToDefaults = false } = options;

  if (!raw?.trim()) {
    return fallbackToDefaults ? DEFAULT_HOME_BANNERS : [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallbackToDefaults ? DEFAULT_HOME_BANNERS : [];
    }

    const banners = parsed
      .map((banner, index) => {
        if (!banner || typeof banner !== "object") return null;

        const title = typeof banner.title === "string" ? banner.title.trim() : "";
        const text = typeof banner.text === "string" ? banner.text.trim() : "";
        if (!title || !text) return null;

        const theme =
          typeof banner.theme === "string" && THEME_SET.has(banner.theme as HomeBannerTheme)
            ? (banner.theme as HomeBannerTheme)
            : DEFAULT_HOME_BANNERS[index % DEFAULT_HOME_BANNERS.length]?.theme ?? "sun";

        return {
          id: normalizeId(typeof banner.id === "string" ? banner.id : undefined, index),
          kicker:
            typeof banner.kicker === "string" && banner.kicker.trim()
              ? banner.kicker.trim()
              : "SC restaurant",
          title,
          text,
          theme,
        } satisfies HomeBanner;
      })
      .filter(Boolean) as HomeBanner[];

    if (!banners.length) {
      return fallbackToDefaults ? DEFAULT_HOME_BANNERS : [];
    }

    return banners;
  } catch {
    return fallbackToDefaults ? DEFAULT_HOME_BANNERS : [];
  }
};

export const serializeHomeBanners = (banners: HomeBanner[]) =>
  JSON.stringify(
    banners.map((banner, index) => ({
      id: normalizeId(banner.id, index),
      kicker: banner.kicker.trim(),
      title: banner.title.trim(),
      text: banner.text.trim(),
      theme: banner.theme,
    }))
  );
