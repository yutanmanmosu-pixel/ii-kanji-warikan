import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmountInput } from './components/AmountInput';
import { FixedSection } from './components/FixedSection';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { LevelCounters } from './components/LevelCounters';
import { ResultPanel } from './components/ResultPanel';
import { RoundingSelect } from './components/RoundingSelect';
import { UI } from './constants/messages';
import { useSplitForm } from './hooks/useSplitForm';
import { calculateSplit } from './lib/split';

export default function App() {
  const form = useSplitForm();
  const [hasCalculated, setHasCalculated] = useState(false);
  // 「割り勘する」を押すたびに増やし、結果が描画されてからスクロールするためのカウンタ
  const [scrollRequest, setScrollRequest] = useState(0);
  const resultRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLElement>(null);

  // 入力が変わるたびに再計算する。純粋関数で軽いので debounce は不要。
  const result = useMemo(
    () =>
      calculateSplit({
        total: form.total,
        unit: form.unit,
        counts: form.counts,
        weights: form.weights,
        fixed: form.fixed,
      }),
    [form.total, form.unit, form.counts, form.weights, form.fixed],
  );

  const scrollTo = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, []);

  // 結果が描画されたあとのタイミングで動かす
  useEffect(() => {
    if (scrollRequest === 0) return;
    scrollTo(resultRef.current);
  }, [scrollRequest, scrollTo]);

  const handleCalculate = useCallback(() => {
    setHasCalculated(true);
    setScrollRequest((count) => count + 1);
  }, []);

  const handleReset = useCallback(() => {
    form.reset();
    setHasCalculated(false);
    setScrollRequest(0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [form.reset]);

  return (
    <div className="page">
      <Hero />

      <main className="main">
        {/* ここから計算ボタンまでが、スマホ1画面に収まることを狙った範囲 */}
        <section className="section" aria-labelledby="step-amount" ref={inputRef}>
          <h2 className="section__title" id="step-amount">
            {UI.amount.heading}
          </h2>
          <AmountInput digits={form.totalDigits} onChange={form.setTotalDigits} />
        </section>

        <section className="section" aria-labelledby="step-people">
          <div className="sectionHead">
            <h2 className="section__title" id="step-people">
              {UI.counters.heading}
            </h2>
            <span className="sectionHead__meta">{UI.counters.totalCount(form.headcount)}</span>
          </div>
          <LevelCounters form={form} />
        </section>

        <section className="section section--tight" aria-labelledby="step-rounding">
          <h2 className="section__title section__title--sub" id="step-rounding">
            {UI.rounding.heading}
          </h2>
          <RoundingSelect unit={form.unit} onChange={form.setUnit} />
        </section>

        <FixedSection form={form} />

        <div className="cta">
          <button
            type="button"
            className="button button--primary button--large"
            onClick={handleCalculate}
            disabled={form.total <= 0}
          >
            {UI.cta.calculate}
          </button>
          {form.total <= 0 && <p className="cta__hint">{UI.cta.needAmount}</p>}
        </div>

        <section className="section section--result" aria-labelledby="step-result" ref={resultRef}>
          <h2 className="section__title" id="step-result">
            {UI.result.heading}
          </h2>
          {hasCalculated ? (
            <ResultPanel
              result={result}
              memos={form.memos}
              onEdit={() => scrollTo(inputRef.current)}
              onReset={handleReset}
            />
          ) : (
            <p className="section__hint">{UI.result.waiting}</p>
          )}
        </section>

        {/*
          将来の広告枠はこの下（結果とフッターの間）に置く。
          計算ボタンや結果の操作ボタンから離れているため誤タップしにくく、
          高さを固定すれば CLS も抑えられる。
        */}
      </main>

      <Footer />
    </div>
  );
}
