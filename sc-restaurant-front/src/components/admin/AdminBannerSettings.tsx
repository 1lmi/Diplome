import React, { useMemo } from "react";
import {
  DEFAULT_HOME_BANNERS,
  parseHomeBanners,
  serializeHomeBanners,
  type HomeBanner,
  type HomeBannerTheme,
} from "../../bannerSettings";

interface Props {
  rawValue?: string;
  onChange: (value: string) => void;
}

const THEME_OPTIONS: Array<{ value: HomeBannerTheme; label: string }> = [
  { value: "sun", label: "Тёплый" },
  { value: "mist", label: "Светлый" },
  { value: "clay", label: "Нейтральный" },
];

const nextBannerId = (banners: HomeBanner[]) =>
  String(banners.length + 1).padStart(2, "0");

const AdminBannerSettings: React.FC<Props> = ({ rawValue, onChange }) => {
  const banners = useMemo(
    () => parseHomeBanners(rawValue, { fallbackToDefaults: true }),
    [rawValue]
  );

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
    const next = banners.filter((_, currentIndex) => currentIndex !== index);
    writeBanners(next.length ? next : DEFAULT_HOME_BANNERS);
  };

  const addBanner = () => {
    writeBanners([
      ...banners,
      {
        id: nextBannerId(banners),
        kicker: "SC restaurant",
        title: `Промо-баннер ${String(banners.length + 1).padStart(2, "0")}`,
        text: "Временная заглушка для будущей кампании.",
        theme: "sun",
      },
    ]);
  };

  return (
    <div className="admin-banner-stack">
      <div className="admin-banner-stack__header">
        <div>
          <h4>Баннеры на главной</h4>
          <p className="muted">
            Простые промо-слайды с заголовком, подписью и темой оформления.
          </p>
        </div>

        <div className="admin-banner-stack__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={addBanner}>
            Добавить баннер
          </button>
        </div>
      </div>

      <div className="admin-banner-list">
        {banners.map((banner, index) => (
          <article key={banner.id} className="admin-banner-card">
            <div className="admin-banner-card__preview-shell">
              <div className="admin-banner-card__frame">Баннер {index + 1}</div>
              <div className={`admin-banner-preview admin-banner-preview--${banner.theme}`}>
                <div className="admin-banner-preview__copy">
                  <span className="admin-banner-preview__kicker">{banner.kicker}</span>
                  <div>
                    <strong>{banner.title}</strong>
                    <p>{banner.text}</p>
                  </div>
                </div>
                <div className="admin-banner-preview__art" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>

            <div className="admin-banner-card__form">
              <label className="field">
                <span>Короткая подпись</span>
                <input
                  className="input"
                  value={banner.kicker}
                  onChange={(event) => updateBanner(index, { kicker: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Заголовок</span>
                <input
                  className="input"
                  value={banner.title}
                  onChange={(event) => updateBanner(index, { title: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Описание</span>
                <textarea
                  className="input textarea"
                  value={banner.text}
                  rows={3}
                  onChange={(event) => updateBanner(index, { text: event.target.value })}
                />
              </label>

              <div className="admin-banner-card__row">
                <label className="field" style={{ minWidth: 200 }}>
                  <span>Тема</span>
                  <select
                    className="input"
                    value={banner.theme}
                    onChange={(event) =>
                      updateBanner(index, { theme: event.target.value as HomeBannerTheme })
                    }
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => moveBanner(index, -1)}
                  disabled={index === 0}
                >
                  Влево
                </button>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => moveBanner(index, 1)}
                  disabled={index === banners.length - 1}
                >
                  Вправо
                </button>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => removeBanner(index)}
                >
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default AdminBannerSettings;
