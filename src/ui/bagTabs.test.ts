import { describe, expect, it } from 'vitest';
import { stepRoom, tabKeyStep, tabText } from './bagTabs';

const ORDER = ['bedroom', 'downstairs', 'yard'] as const;

describe('bag room tabs', () => {
  it('the selected tab shows the location name, the others a short name', () => {
    expect(tabText('bedroom', "Ayush's room", true)).toBe("Ayush's room");
    expect(tabText('bedroom', "Ayush's room", false)).toBe('Bedroom');
    expect(tabText('downstairs', 'Downstairs', false)).toBe('Downstairs');
    expect(tabText('yard', 'Front yard', false)).toBe('Yard');
  });

  it('Q / PageUp are L, E / PageDown are R; the walking and A / B keys are not tab keys', () => {
    expect(tabKeyStep('KeyQ')).toBe(-1);
    expect(tabKeyStep('PageUp')).toBe(-1);
    expect(tabKeyStep('KeyE')).toBe(1);
    expect(tabKeyStep('PageDown')).toBe(1);
    for (const c of ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyX', 'Enter', 'Space', 'Escape', 'KeyM']) expect(tabKeyStep(c), c).toBe(0);
  });

  it('stepping wraps round both ways', () => {
    expect(stepRoom(ORDER, 'bedroom', 1)).toBe('downstairs');
    expect(stepRoom(ORDER, 'yard', 1)).toBe('bedroom');
    expect(stepRoom(ORDER, 'bedroom', -1)).toBe('yard');
    expect(stepRoom(ORDER, 'downstairs', -1)).toBe('bedroom');
  });
});
