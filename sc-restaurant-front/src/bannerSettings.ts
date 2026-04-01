export interface HomeBanner {
  id: string;
  image_path: string;
}

const normalizeId = (id: string | undefined, index: number) =>
  id?.trim() || String(index + 1).padStart(2, "0");

interface ParseOptions {
  fallbackToDefaults?: boolean;
  includeEmpty?: boolean;
}

const EMPTY_BANNERS: HomeBanner[] = [];

export const parseHomeBanners = (
  raw?: string | null,
  options: ParseOptions = {}
): HomeBanner[] => {
  const { fallbackToDefaults = false, includeEmpty = false } = options;

  if (!raw?.trim()) {
    return fallbackToDefaults ? EMPTY_BANNERS : [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallbackToDefaults ? EMPTY_BANNERS : [];
    }

    const banners = parsed
      .map((banner, index) => {
        if (!banner || typeof banner !== "object") return null;

        const imagePath =
          typeof banner.image_path === "string" && banner.image_path.trim()
            ? banner.image_path.trim()
            : "";

        if (!imagePath && !includeEmpty) return null;

        return {
          id: normalizeId(typeof banner.id === "string" ? banner.id : undefined, index),
          image_path: imagePath,
        } satisfies HomeBanner;
      })
      .filter(Boolean) as HomeBanner[];

    if (!banners.length) {
      return fallbackToDefaults ? EMPTY_BANNERS : [];
    }

    return banners;
  } catch {
    return fallbackToDefaults ? EMPTY_BANNERS : [];
  }
};

export const serializeHomeBanners = (banners: HomeBanner[]) =>
  JSON.stringify(
    banners.map((banner, index) => ({
      id: normalizeId(banner.id, index),
      image_path: banner.image_path.trim(),
    }))
  );
