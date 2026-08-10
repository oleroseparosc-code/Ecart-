import { useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fitKey: string;
};

export function PharmacyAutoFitLabelContent({ children, fitKey }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const container = content?.parentElement;
    if (!content || !container) return;
    let frame = 0;
    const fit = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      if (!availableWidth || !availableHeight) return;
      content.style.fontSize = "";
      content.style.transform = "";
      content.style.transformOrigin = "";
      let fontSize = Number.parseFloat(window.getComputedStyle(content).fontSize);
      const overflows = () => content.scrollWidth > availableWidth + 1 || content.scrollHeight > availableHeight + 1;
      while (overflows() && fontSize > 4) {
        fontSize = Math.max(4, fontSize - 0.5);
        content.style.fontSize = `${fontSize}px`;
      }
      if (overflows()) {
        const scale = Math.max(0.1, Math.min(1, availableWidth / content.scrollWidth, availableHeight / content.scrollHeight));
        content.style.transform = `scale(${scale})`;
        content.style.transformOrigin = "center";
      }
    };
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    scheduleFit();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitKey]);

  return <div ref={contentRef} className="pharmacy-label-auto-fit">{children}</div>;
}
