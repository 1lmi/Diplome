import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, TransitionEvent } from "react";
import { resolveStaticImageUrl } from "../api";
import type { HomeBanner } from "../bannerSettings";

interface Props {
  banners: HomeBanner[];
}

interface RenderedBanner extends HomeBanner {
  renderKey: string;
  sourceIndex: number;
}

const AUTOPLAY_DELAY_MS = 8_000;

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
  const [autoplayPaused, setAutoplayPaused] = useState(false);
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

  useEffect(() => {
    if (actualCount <= 1 || autoplayPaused) return;

    const intervalId = window.setInterval(() => {
      if (interactionLockedRef.current) return;

      interactionLockedRef.current = true;
      setTransitionEnabled(true);
      setCurrentIndex((prev) => Math.min(renderedBanners.length - 1, prev + 1));
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, [actualCount, autoplayPaused, currentIndex, renderedBanners.length]);

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

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
      return;
    }
    setAutoplayPaused(false);
  };

  const trackStyle = {
    transform: `translate3d(${Math.round(translateX)}px, 0, 0)`,
  } as CSSProperties;

  if (!renderedBanners.length) {
    return null;
  }

  return (
    <section
      className="placeholder-carousel"
      aria-label="Промо-блок"
      onMouseEnter={() => setAutoplayPaused(true)}
      onMouseLeave={() => setAutoplayPaused(false)}
      onFocusCapture={() => setAutoplayPaused(true)}
      onBlurCapture={handleBlurCapture}
    >
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
                  "placeholder-carousel__slide" +
                  (slide.sourceIndex === activeDotIndex
                    ? " placeholder-carousel__slide--active"
                    : "")
                }
                aria-hidden={slide.sourceIndex !== activeDotIndex}
              >
                <img
                  className="placeholder-carousel__image"
                  src={resolveStaticImageUrl(slide.image_path)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                />
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

    </section>
  );
};
