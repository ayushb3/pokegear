import { describe, expect, it } from 'vitest';
import { bus } from './bus';
import { currentRoom, objects, onRoom, roomLabel } from './api';

describe('room api', () => {
  it('starts in the bedroom, lists its objects and names it', () => {
    expect(currentRoom()).toBe('bedroom');
    expect(roomLabel()).toBe("Ayush's room");
    expect(objects().map((o) => o.id)).toContain('pc');
  });
  it('a room event updates currentRoom and notifies subscribers once', () => {
    let n = 0;
    const off = onRoom(() => n++);
    bus.emit({ type: 'room', room: 'elsewhere' });
    bus.emit({ type: 'room', room: 'elsewhere' }); // same room: no change, no notification
    expect(currentRoom()).toBe('elsewhere');
    expect(n).toBe(1);
    off();
    bus.emit({ type: 'room', room: 'bedroom' });
    expect(n).toBe(1);
  });
});
