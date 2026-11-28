import type {
  LibmediaControlLabels,
  LibmediaErrorReason,
  LibmediaLocale,
} from './player-api'

const en = {
  labels: {
    player: 'Video player',
    play: 'Play',
    pause: 'Pause',
    replay: 'Replay',
    nextEpisode: 'Next episode',
    skipBackward: 'Skip backward 5 seconds',
    skipForward: 'Skip forward 5 seconds',
    seek: 'Seek',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    live: 'Live',
    subtitles: 'Subtitles',
    settings: 'Settings',
    mediaInfo: 'Media info',
    container: 'Container',
    duration: 'Duration',
    videoCodec: 'Video codec',
    resolution: 'Resolution',
    frameRate: 'Frame rate',
    bitDepth: 'Bit depth',
    videoBitRate: 'Video bit rate',
    videoDecoder: 'Video decoder',
    sampleRate: 'Sample rate',
    channels: 'Channels',
    waitingForPlayback: 'Waiting for playback',
    unavailable: 'Unavailable',
    mseDecoder: 'Browser (MSE)',
    wasmDecoder: 'WASM (software)',
    webCodecsPreferHardware: 'WebCodecs (prefer hardware)',
    webCodecsPreferSoftware: 'WebCodecs (prefer software)',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    windowFullscreen: 'Window fullscreen',
    exitWindowFullscreen: 'Exit window fullscreen',
    audio: 'Audio',
    playbackSpeed: 'Playback speed',
    chapters: 'Chapters',
    previousChapter: 'Previous chapter',
    nextChapter: 'Next chapter',
    closeMenu: 'Close menu',
    backToSettings: 'Back to settings',
    off: 'Off',
    subtitleDelay: 'Subtitle delay',
    decreaseSubtitleDelay: 'Decrease subtitle delay',
    increaseSubtitleDelay: 'Increase subtitle delay',
  } satisfies Required<LibmediaControlLabels>,
  notices: {
    autoplayBlocked: 'Automatic playback was blocked. Select Play to continue.',
    playFailed: 'Could not start playback.',
    pauseFailed: 'Could not pause playback.',
    seekFailed: 'Could not seek.',
    audioSelectionFailed: 'Could not select the requested audio stream.',
    subtitleSelectionFailed: 'Could not switch subtitle tracks.',
    audioUnavailable: 'The requested audio stream is unavailable.',
    bitmapSubtitleFailed: 'Could not render the bitmap subtitle track.',
    styledSubtitleFallback:
      'Could not render styled subtitles. Using libmedia subtitles for this track.',
    initialPositionFailed: 'Could not restore the initial position.',
  },
  playbackFailed: 'Playback failed.',
  failureReasons: {
    network:
      'Playback failed due to a network error. Check your connection and try again.',
    server: 'The video server is temporarily unavailable. Try again later.',
    credentials: 'Authentication is required to play this video.',
    forbidden: 'Access to this video was denied.',
    'not-found': 'The video could not be found.',
    unavailable: 'The video is currently unavailable.',
    engine: 'Playback failed. The video format or codec may not be supported.',
    unknown: 'Playback failed.',
  } satisfies Record<Exclude<LibmediaErrorReason, 'aborted'>, string>,
  fullscreenFailed: 'Could not enter or exit fullscreen.',
  exitFullscreenFailed: 'Could not exit fullscreen.',
  audioTrack: (number: number) => `Audio ${number}`,
  subtitleTrack: (number: number) => `Subtitle ${number}`,
  chapter: (number: number) => `Chapter ${number}`,
  duplicateTitle: (title: string, track: string) => `${title} (${track})`,
  externalSubtitleFailed: (number: number) =>
    `Could not load external subtitle track ${number}.`,
}

type PlayerLocaleText = typeof en & { labels: Required<LibmediaControlLabels> }

const zhCN = {
  labels: {
    player: '视频播放器',
    play: '播放',
    pause: '暂停',
    replay: '重播',
    nextEpisode: '下一集',
    skipBackward: '后退 5 秒',
    skipForward: '前进 5 秒',
    seek: '调整播放进度',
    mute: '静音',
    unmute: '取消静音',
    volume: '音量',
    live: '直播',
    subtitles: '字幕',
    settings: '设置',
    mediaInfo: '媒体信息',
    container: '封装格式',
    duration: '时长',
    videoCodec: '视频编码',
    resolution: '分辨率',
    frameRate: '帧率',
    bitDepth: '位深',
    videoBitRate: '视频码率',
    videoDecoder: '视频解码器',
    sampleRate: '采样率',
    channels: '声道',
    waitingForPlayback: '等待播放',
    unavailable: '不可用',
    mseDecoder: '浏览器（MSE）',
    wasmDecoder: 'WASM（软件解码）',
    webCodecsPreferHardware: 'WebCodecs（优先硬件解码）',
    webCodecsPreferSoftware: 'WebCodecs（优先软件解码）',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    windowFullscreen: '窗口全屏',
    exitWindowFullscreen: '退出窗口全屏',
    audio: '音轨',
    playbackSpeed: '播放速度',
    chapters: '章节',
    previousChapter: '上一章',
    nextChapter: '下一章',
    closeMenu: '关闭菜单',
    backToSettings: '返回设置',
    off: '关闭',
    subtitleDelay: '字幕延迟',
    decreaseSubtitleDelay: '减小字幕延迟',
    increaseSubtitleDelay: '增大字幕延迟',
  },
  notices: {
    autoplayBlocked: '自动播放已被阻止，请选择播放以继续。',
    playFailed: '无法开始播放。',
    pauseFailed: '无法暂停播放。',
    seekFailed: '无法调整播放进度。',
    audioSelectionFailed: '无法选择指定音轨。',
    subtitleSelectionFailed: '无法切换字幕轨。',
    audioUnavailable: '指定音轨不可用。',
    bitmapSubtitleFailed: '无法渲染图形字幕。',
    styledSubtitleFallback: '无法渲染样式字幕，已改用 libmedia 渲染此字幕轨。',
    initialPositionFailed: '无法恢复初始播放位置。',
  },
  playbackFailed: '播放失败。',
  failureReasons: {
    network: '网络连接异常或不稳定，请检查网络后重试。',
    server: '视频服务暂时不可用，请稍后重试。',
    credentials: '需要身份验证才能播放此视频。',
    forbidden: '没有权限访问此视频。',
    'not-found': '找不到该视频资源。',
    unavailable: '该视频当前不可用。',
    engine: '无法播放此视频，当前格式或编码可能不受支持。',
    unknown: '播放失败。',
  },
  fullscreenFailed: '无法进入或退出全屏。',
  exitFullscreenFailed: '无法退出全屏。',
  audioTrack: (number) => `音轨 ${number}`,
  subtitleTrack: (number) => `字幕 ${number}`,
  chapter: (number) => `章节 ${number}`,
  duplicateTitle: (title, track) => `${title}（${track}）`,
  externalSubtitleFailed: (number) => `无法加载外挂字幕轨 ${number}。`,
} satisfies PlayerLocaleText

export const playerLocales: Record<LibmediaLocale, PlayerLocaleText> = {
  en,
  'zh-CN': zhCN,
}

export type PlaybackNotice =
  | keyof PlayerLocaleText['notices']
  | { externalSubtitleTrack: number }

export function formatPlaybackFailure(
  text: PlayerLocaleText,
  reason: LibmediaErrorReason | undefined,
) {
  if (!reason || reason === 'aborted') return text.playbackFailed
  return text.failureReasons[reason]
}

export function formatPlaybackNotice(
  text: PlayerLocaleText,
  notice: PlaybackNotice,
) {
  return typeof notice === 'string'
    ? text.notices[notice]
    : text.externalSubtitleFailed(notice.externalSubtitleTrack)
}

interface MediaTitle {
  title: string
  number?: number
}

export function formatMediaTitle(
  text: PlayerLocaleText,
  kind: 'audioTrack' | 'subtitleTrack' | 'chapter',
  media: MediaTitle,
) {
  if (media.number === undefined) return media.title
  const numberedTitle = text[kind](media.number)
  return media.title
    ? text.duplicateTitle(media.title, numberedTitle)
    : numberedTitle
}
