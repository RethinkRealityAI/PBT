/**
 * Mounts the PBT keyframe stylesheet once into the document head.
 * Animation names match the prototype: pbtPulse, pbtFloat, pbtFadeUp,
 * pbtSlideIn, pbtTypingDot, pbtRingBreath, pbtBarWave.
 */
export function mountKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('pbt-kf')) return;
  const style = document.createElement('style');
  style.id = 'pbt-kf';
  style.textContent = `
@keyframes pbtPulse { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.06); opacity: 1; } }
@keyframes pbtFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes pbtFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pbtSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pbtTypingDot { 0%,80%,100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@keyframes pbtRingBreath { 0%,100% { transform: scale(1); opacity: .5; } 50% { transform: scale(1.2); opacity: 0; } }
@keyframes pbtRingExpand { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes pbtBarWave { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
.pbt-scroll::-webkit-scrollbar { width: 0; height: 0; }
.pbt-scroll { scrollbar-width: none; }
`;
  document.head.appendChild(style);
}
