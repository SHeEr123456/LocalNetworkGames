/**
 * Canvas 高清适配（HiDPI Fit）
 * =========================================================
 * 解决的问题
 *   旧写法把画布位图固定为「逻辑尺寸 × dpr」，再用 CSS `width:100%` 缩放显示。
 *   当容器宽度 ≠ 逻辑尺寸时（例如 880px 的棋盘被塞进 780px 的容器），
 *   位图被浏览器做非整数降采样 → 整张画面和文字发虚。
 *
 * 正确做法
 *   位图尺寸 = 「CSS 显示尺寸 × devicePixelRatio」，
 *   再用 setTransform 把逻辑坐标系等比映射上去。
 *   这样 1 个位图像素 = 1 个物理像素，任何窗口宽度下都是像素级清晰。
 *
 * 用法
 *   const { scale } = fitCanvas(canvas, ctx, 880, 880);
 *   // 之后所有绘制仍使用 0..880 的逻辑坐标，无需改动
 */

/**
 * 按 CSS 实际显示尺寸重建位图并设置坐标变换。
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} logicalW 逻辑坐标系宽度
 * @param {number} logicalH 逻辑坐标系高度
 * @returns {{ dpr:number, cssW:number, cssH:number, scale:number }}
 */
export function fitCanvas(canvas, ctx, logicalW, logicalH) {
  const dpr = window.devicePixelRatio || 1;

  // clientWidth 不含边框（canvas 无 padding），与绘制区域精确对应
  let cssW = canvas.clientWidth;
  if (!cssW) {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width || logicalW;
  }
  const cssH = cssW * (logicalH / logicalW);

  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));

  // 仅在尺寸变化时重设，避免每帧清空画布导致闪烁
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  const scaleX = bw / logicalW;
  const scaleY = bh / logicalH;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  return { dpr, cssW, cssH, scale: scaleX };
}

/**
 * 绑定窗口尺寸变化（含跨屏 DPI 变化）自动重绘。
 * @param {() => void} redraw
 * @returns {() => void} 解绑函数
 */
export function onCanvasResize(redraw) {
  let raf = 0;
  const handler = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(redraw);
  };
  window.addEventListener("resize", handler);
  window.addEventListener("orientationchange", handler);
  if (window.matchMedia) {
    // 缩放 / 拖到不同 DPI 显示器时 dpr 会变，需要重绘
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.("change", handler);
  }
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
  };
}
