/**
 * Visual tuning values the renderer needs, supplied by the caller.
 *
 * Nothing here has a default. Colours and opacities belong to the design layer
 * (`src/design/`), so the renderer takes them as an injected dependency rather
 * than hardcoding anything that a palette change would have to chase down.
 */
export interface SpritePalette {
  /**
   * Opacity for limbs on the far side of the body. Cheap depth cue that needs
   * no extra art and reads correctly in the strict side profile the art guide
   * mandates.
   */
  readonly farLimbAlpha: number;

  /** Multiplier applied to `pose.tintStrength` for the hit flash pass. */
  readonly hitFlashAlpha: number;

  /**
   * Canvas composite operation for the hit flash pass, e.g. `'lighter'`.
   *
   * The flash re-blits the sprite over itself, so it only ever touches pixels
   * the sprite already covers and cannot bleed onto neighbouring units. See
   * the note in `renderer.ts` about what this can and cannot express.
   */
  readonly hitFlashComposite: string;
}
