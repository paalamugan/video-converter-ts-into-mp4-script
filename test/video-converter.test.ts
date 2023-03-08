import { getVideoDownloadStream } from '../src';

describe('video-converter', () => {
  it('getVideoDownloadStream', () => {
    expect(
      getVideoDownloadStream('https://example.com/video.ts', 'video')
    ).toBeDefined();
  });
});
