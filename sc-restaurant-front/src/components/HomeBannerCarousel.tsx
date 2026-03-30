import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, TransitionEvent } from "react";
import type { HomeBanner } from "../bannerSettings";

interface Props {
  banners: HomeBanner[];
}

interface RenderedBanner extends HomeBanner {
  renderKey: string;
  sourceIndex: number;
}

const createRenderedBanners = (banners: HomeBanner[]): RenderedBanner[] => {
  if (banners.length <= 1) {
    return banners.map((banner, index) => ({
      ...banner,
      renderKey: `banner-${banner.id}-${index}`,
      sourceIndex: index,
    }));
  }

  return Array.from({ length: 3 }, (_, copyIndex) =>
    banners.map((banner, index) => ({
      ...banner,
      renderKey: `banner-${copyIndex}-${banner.id}-${index}`,
      sourceIndex: index,
    }))
  ).flat();
};

export const HomeBannerCarousel: React.FC<Props> = ({ banners }) => {
  const renderedBanners = useMemo(() => createRenderedBanners(banners), [banners]);
  const actualCount = banners.length;
  const [currentIndex, setCurrentIndex] = useState(actualCount > 1 ? actualCount : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(actualCount > 1);
  const [metrics, setMetrics] = useState({ viewportWidth: 0, slideWidth: 0, gap: 18 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sampleSlideRef = useRef<HTMLElement | null>(null);
  const interactionLockedRef = useRef(false);

  useEffect(() => {
    setCurrentIndex(actualCount > 1 ? actualCount : 0);
    setTransitionEnabled(actualCount > 1);
    interactionLockedRef.current = false;
  }, [actualCount, banners]);

  useEffect(() => {
    const measure = () => {
      if (!viewportRef.current || !trackRef.current || !sampleSlideRef.current) return;

      const viewportWidth = viewportRef.current.clientWidth;
      const slideWidth = sampleSlideRef.current.getBoundingClientRect().width;
      const styles = getComputedStyle(trackRef.current);
      const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;

      setMetrics((prev) => {
        if (
          prev.viewportWidth === viewportWidth &&
          prev.slideWidth === slideWidth &&
          prev.gap === gap
        ) {
          return prev;
        }

        return { viewportWidth, slideWidth, gap };
      });
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    if (sampleSlideRef.current) resizeObserver.observe(sampleSlideRef.current);

    return () => resizeObserver.disconnect();
  }, [renderedBanners.length]);

  useEffect(() => {
    if (transitionEnabled) return;

    const frameId = window.requestAnimationFrame(() => {
      setTransitionEnabled(true);
      interactionLockedRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [transitionEnabled]);

  const activeDotIndex =
    actualCount <= 1 ? 0 : ((currentIndex % actualCount) + actualCount) % actualCount;

  const translateX =
    metrics.viewportWidth > 0 && metrics.slideWidth > 0
      ? (metrics.viewportWidth - metrics.slideWidth) / 2 -
        currentIndex * (metrics.slideWidth + metrics.gap)
      : 0;

  const goToRenderedIndex = (target: number | ((index: number) => number)) => {
    if (actualCount <= 1 || interactionLockedRef.current) return;

    interactionLockedRef.current = true;
    setTransitionEnabled(true);
    setCurrentIndex((prev) => {
      const rawIndex = typeof target === "function" ? target(prev) : target;
      return Math.max(0, Math.min(renderedBanners.length - 1, rawIndex));
    });
  };

  const handlePrev = () => goToRenderedIndex((index) => index - 1);
  const handleNext = () => goToRenderedIndex((index) => index + 1);
  const handleDotClick = (index: number) =>
    goToRenderedIndex(actualCount > 1 ? actualCount + index : index);

  const handleTrackTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== trackRef.current || event.propertyName !== "transform") {
      return;
    }

    if (actualCount <= 1) return;

    if (currentIndex < actualCount) {
      setTransitionEnabled(false);
      setCurrentIndex((prev) => prev + actualCount);
      return;
    }

    if (currentIndex >= actualCount * 2) {
      setTransitionEnabled(false);
      setCurrentIndex((prev) => prev - actualCount);
      return;
    }

    interactionLockedRef.current = false;
  };

  const trackStyle = {
    transform: `translate3d(${Math.round(translateX)}px, 0, 0)`,
  } as CSSProperties;

  if (!renderedBanners.length) {
    return null;
  }

  return (
    <section className="placeholder-carousel" aria-label="Промо-блок">
      <div className="placeholder-carousel__stage">
        <button
          className="placeholder-carousel__arrow placeholder-carousel__arrow--prev"
          type="button"
          onClick={handlePrev}
          aria-label="Предыдущий слайд"
        >
          {"‹"}
        </button>

        <div ref={viewportRef} className="placeholder-carousel__viewport">
          <div
            ref={trackRef}
            className={
              "placeholder-carousel__track" +
              (transitionEnabled ? " placeholder-carousel__track--animated" : "")
            }
            style={trackStyle}
            onTransitionEnd={handleTrackTransitionEnd}
          >
            {renderedBanners.map((slide, index) => (
              <article
                key={slide.renderKey}
                ref={(element) => {
                  const sampleIndex = actualCount > 1 ? actualCount : 0;
                  if (index === sampleIndex && element) {
                    sampleSlideRef.current = element;
                  }
                }}
                className={
                  "placeholder-carousel__slide placeholder-carousel__slide--" +
                  slide.theme +
                  (slide.sourceIndex === activeDotIndex
                    ? " placeholder-carousel__slide--active"
                    : "")
                }
                aria-hidden={slide.sourceIndex !== activeDotIndex}
              >
                <div className="placeholder-carousel__copy">
                  <span className="placeholder-carousel__kicker">{slide.kicker}</span>
                  <div>
                    <strong className="placeholder-carousel__title">{slide.title}</strong>
                    <p className="placeholder-carousel__text">{slide.text}</p>
                  </div>
                </div>

                <div className="placeholder-carousel__art" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            ))}
          </div>
        </div>

        <button
          className="placeholder-carousel__arrow placeholder-carousel__arrow--next"
          type="button"
          onClick={handleNext}
          aria-label="Следующий слайд"
        >
          {"›"}
        </button>
      </div>

      <div className="placeholder-carousel__dots" aria-label="Навигация по слайдам">
        {banners.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={
              "placeholder-carousel__dot" +
              (index === activeDotIndex ? " placeholder-carousel__dot--active" : "")
            }
            onClick={() => handleDotClick(index)}
            aria-label={`Слайд ${index + 1}`}
            aria-pressed={index === activeDotIndex}
          />
        ))}
      </div>
    </section>
  );
};
