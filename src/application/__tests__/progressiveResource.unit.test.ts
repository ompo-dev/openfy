import { createProgressiveResource } from '../progressiveResource';

it('replays cached partial data and stops notifying departed pages', () => {
  const resource = createProgressiveResource<string>('partial');
  resource.publish('artist', 'header');
  const listener = jest.fn();
  const unsubscribe = resource.subscribe('artist', listener);
  expect(listener).toHaveBeenLastCalledWith('header');
  resource.publish('artist', 'first songs');
  expect(listener).toHaveBeenLastCalledWith('first songs');
  unsubscribe();
  resource.publish('artist', 'full catalog');
  expect(listener).toHaveBeenCalledTimes(2);
  expect(resource.peek('artist')).toBe('full catalog');
});

it('does not let a failed observer interrupt the request or other pages', () => {
  const resource = createProgressiveResource<string>('isolated');
  resource.subscribe('key', () => { throw new Error('unmounted view'); });
  const listener = jest.fn();
  resource.subscribe('key', listener);
  expect(() => resource.publish('key', 'tracks')).not.toThrow();
  expect(listener).toHaveBeenCalledWith('tracks');
});
