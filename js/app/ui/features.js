import { state } from '../state.js';

export function applyFeatureUI(dom) {
  dom?.gridBtn?.classList.toggle('active', state.featureState.gridEnabled);
  dom?.gridOverlay?.classList.toggle('active', state.featureState.gridEnabled);
  dom?.levelBtn?.classList.toggle('active', state.featureState.levelEnabled);
  dom?.levelIndicator?.classList.toggle('active', state.featureState.levelEnabled);
  dom?.burstBtn?.classList.toggle('active', state.featureState.burstMode);
  dom?.burstIndicator?.classList.toggle('active', state.featureState.burstMode);
}
