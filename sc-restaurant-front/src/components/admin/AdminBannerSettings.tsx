import React, { useMemo, useState } from "react";
import { api, resolveStaticImageUrl } from "../../api";
import {
  parseHomeBanners,
  serializeHomeBanners,
  type HomeBanner,
} from "../../bannerSettings";

interface Props {
  rawValue?: string;
  onChange: (value: string) => void;
}

const nextBannerId = (banners: HomeBanner[]) =>
  String(banners.length + 1).padStart(2, "0");

const createEmptyBanner = (banners: HomeBanner[]): HomeBanner => ({
  id: nextBannerId(banners),
  image_path: "",
});

const AdminBannerSettings: React.FC<Props> = ({ rawValue, onChange }) => {
  const banners = useMemo(
    () => parseHomeBanners(rawValue, { includeEmpty: true }),
    [rawValue]
  );
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const writeBanners = (next: HomeBanner[]) => {
    onChange(serializeHomeBanners(next));
  };

  const updateBanner = (index: number, patch: Partial<HomeBanner>) => {
    writeBanners(
      banners.map((banner, currentIndex) =>
        currentIndex === index ? { ...banner, ...patch } : banner
      )
    );
  };

  const moveBanner = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= banners.length) return;

    const next = [...banners];
    const [banner] = next.splice(index, 1);
    next.splice(nextIndex, 0, banner);
    writeBanners(next);
  };

  const removeBanner = (index: number) => {
    writeBanners(banners.filter((_, currentIndex) => currentIndex !== index));
  };

  const addBanner = () => {
    writeBanners([...banners, createEmptyBanner(banners)]);
  };

  const handleFileSelected = async (index: number, file?: File | null) => {
    if (!file) return;

    const banner = banners[index];
    if (!banner) return;

    try {
      setUploadError(null);
      setUploadingBannerId(banner.id);
      const result = await api.uploadImage(file);
      updateBanner(index, { image_path: result.filename });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Не удалось загрузить баннер."
      );
    } finally {
      setUploadingBannerId(null);
    }
  };

  return (
    <div className="admin-banner-stack">
      <div className="admin-banner-stack__header">
        <div>
          <h4>Баннеры на главной</h4>
          <p className="muted">
            Загружайте изображения для витрины. На сайте будут показаны только фото-баннеры.
          </p>
        </div>

        <div className="admin-banner-stack__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={addBanner}>
            Добавить баннер
          </button>
        </div>
      </div>


      {uploadError ? <div className="alert alert--error">{uploadError}</div> : null}

      <div className="admin-banner-list">
        {banners.map((banner, index) => {
          const isUploading = uploadingBannerId === banner.id;

          return (
            <article key={banner.id} className="admin-banner-card">
              <div className="admin-banner-card__preview-shell">
                <div className="admin-banner-card__frame">Баннер {index + 1}</div>
                <div className="admin-banner-card__image">
                  {banner.image_path ? (
                    <img src={resolveStaticImageUrl(banner.image_path)} alt="" />
                  ) : (
                    <div className="admin-banner-card__empty">Изображение не загружено</div>
                  )}
                </div>
                <div className="admin-banner-card__meta">
                  <div>
                    <strong>Файл</strong>
                    <span>{banner.image_path || "Не выбран"}</span>
                  </div>
                </div>
              </div>

              <div className="admin-banner-card__form">
                <div className="admin-banner-card__upload-row">
                  <label className="admin-banner-card__upload-button">
                    {isUploading
                      ? "Загрузка..."
                      : banner.image_path
                        ? "Заменить изображение"
                        : "Загрузить изображение"}
                    <input
                      className="admin-banner-card__file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      disabled={isUploading}
                      onChange={(event) => {
                        void handleFileSelected(index, event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>

                <div className="admin-banner-card__row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => moveBanner(index, -1)}
                    disabled={index === 0 || isUploading}
                  >
                    Влево
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => moveBanner(index, 1)}
                    disabled={index === banners.length - 1 || isUploading}
                  >
                    Вправо
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeBanner(index)}
                    disabled={isUploading}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default AdminBannerSettings;
