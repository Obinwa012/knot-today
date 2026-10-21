import * as Phaser from 'phaser';
import { PlayScene } from './scenes/PlayScene.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f3ebdd',
  // Portrait phone layout, scaled to fit any window.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 720, height: 1280 },
  render: { antialias: true },
  scene: [PlayScene],
});
