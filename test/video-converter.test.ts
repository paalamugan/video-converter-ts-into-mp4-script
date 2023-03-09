import { getVideoFileDownloader } from '../src';

describe('video-converter', () => {
  it('getVideoFileDownloader', () => {
    expect(
      getVideoFileDownloader('https://example.com/video.ts', './video.ts')
    ).toBeDefined();
  });
});
