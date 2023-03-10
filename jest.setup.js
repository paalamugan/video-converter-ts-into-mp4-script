jest.mock('@ffprobe-installer/ffprobe', () => ({
  __esModule: true,
  default: {
    path: 'ffprobe',
  },
}));
