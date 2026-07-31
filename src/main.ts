import { mountStage } from './app/stage';

const root = document.querySelector<HTMLDivElement>('#app');

if (root) {
  mountStage(root);
}
