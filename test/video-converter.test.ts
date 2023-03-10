import { combineMultipleVideoIntoSingle } from '../src';

describe('video-converter', () => {
  it('combineMultipleVideoIntoSingle', () => {
    expect(
      combineMultipleVideoIntoSingle(
        'https://example.com/video.ts',
        './video.ts'
      )
    ).toBeDefined();
  });
});
