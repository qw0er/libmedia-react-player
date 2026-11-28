// Stand in for AVPlayer while keeping the React player, sessions and controls real.
const video = {
  id: 0,
  index: 0,
  mediaType: 'Video',
  codecName: 'h264',
  videoBitDepth: 8,
  codecparProxy: {
    width: 160,
    height: 90,
    framerate: { num: 10, den: 1 },
    bitrate: 0n,
  },
  metadata: {},
}
const audio = {
  id: 1,
  index: 1,
  mediaType: 'Audio',
  codecName: 'aac',
  codecparProxy: { sampleRate: 48000, chLayout: { nbChannels: 2 } },
  metadata: { language: 'jpn' },
}
const subtitle = {
  id: 2,
  index: 2,
  mediaType: 'Subtitle',
  codecName: 'subrip',
  codecparProxy: { codecId: 1 },
  metadata: { title: 'English', language: 'eng' },
}

type Stream = typeof video | typeof audio | typeof subtitle

export class TestPlayerRuntime {
  static async startAudioPipeline() {}

  currentTime = 0n
  private rate = 1
  private selectedAudio = audio.id
  private selectedSubtitle = subtitle.id
  private streams = [video, audio, subtitle]
  private events = new Map<string, (...args: unknown[]) => void>()
  private options: {
    findBestStream: (streams: Stream[], mediaType: number) => Stream | undefined
  }

  constructor(options: TestPlayerRuntime['options']) {
    this.options = options
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    this.events.set(event, callback)
    return this
  }

  async load() {}
  async destroy() {}

  async loadExternalSubtitle({ title, lang }: { title: string; lang: string }) {
    this.streams.push({
      ...subtitle,
      id: 3,
      index: 3,
      metadata: { title, language: lang },
    })
  }

  getStreams = () => this.streams
  getChapters = () => []
  getDuration = () => 12_000n
  getFormatName = () => 'mkv'
  getSelectedVideoStreamId = () => video.id
  getSelectedAudioStreamId = () => this.selectedAudio
  getSelectedSubtitleStreamId = () => this.selectedSubtitle
  getPlaybackRate = () => this.rate
  getStatus = () => 0
  getStats = () => ({
    audioPacketQueueLength: 0,
    audioEncodeFramerate: 0,
    videoPacketQueueLength: 0,
    videoEncodeFramerate: 0,
  })
  getVideoDecodeInfo = async () => null
  isLive = () => false
  isMSE = () => false
  isSuspended = () => false
  embeddedBitmapSubtitleFormat = () => undefined
  canLoadEmbeddedAss = () => false
  setSubtitleDelay() {}
  setVolume() {}

  setPlaybackRate(rate: number) {
    this.rate = rate
  }

  async play() {
    const { findBestStream } = this.options
    this.selectedAudio = findBestStream([audio], 1)?.id ?? audio.id
    this.selectedSubtitle =
      findBestStream(
        this.streams.filter((stream) => stream.mediaType === 'Subtitle'),
        3,
      )?.id ?? subtitle.id
    this.events.get('played')?.()
  }

  async pause() {
    this.events.get('paused')?.()
  }

  async seek(position: bigint) {
    this.currentTime = position
    return position
  }
}
