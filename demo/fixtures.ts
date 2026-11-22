import type {
  ExternalSubtitleTrack,
  LibmediaRequestOptions,
} from '../src/player-api'

const mediaExtension =
  /\.(asf|avi|flac|flv|ivf|m2ts|m3u8|m4a|m4v|mkv|mov|mp3|mp4|mpd|mpeg|mpg|mts|oga|ogg|ogv|opus|ts|wav|webm|wmv)$/i
const textSubtitleExtension = /\.(ass|srt|ssa|ttml|vtt)$/i
const bitmapSubtitleExtension = /\.(mks|sup)$/i

const paths = Object.keys(
  import.meta.glob('/.temp/**/*', { query: '?url' }),
).sort()

function fixture(path: string) {
  return {
    name: path.slice('/.temp/'.length),
    url:
      import.meta.env.BASE_URL +
      path.slice(1).split('/').map(encodeURIComponent).join('/'),
  }
}

export const mediaFixtures = paths
  .filter((path) => mediaExtension.test(path))
  .map(fixture)
export const subtitleFixtures = paths
  .filter(
    (path) =>
      textSubtitleExtension.test(path) || bitmapSubtitleExtension.test(path),
  )
  .map(fixture)

export const finalCueTrack: ExternalSubtitleTrack = {
  content: new Blob([
    '1\n00:00:00,500 --> 00:00:02,000\nFirst cue\n\n2\n00:00:03,000 --> 00:00:06,500\nFinal cue',
  ]),
  format: 'srt',
  label: 'Demo final cue',
}

export function extension(name: string) {
  return name.match(/\.([^./]+)$/)?.[1].toLowerCase()
}

export function httpUrl(value: string) {
  const url = new URL(value, document.baseURI)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Enter an HTTP(S) URL or a relative path.')
  }
  return url
}

export function subtitleFromUrl(
  src: URL,
  label?: string,
): ExternalSubtitleTrack {
  const format = extension(src.pathname)
  if (format === 'sup' || format === 'mks') {
    return {
      src: src.href,
      renderer: 'bitmap',
      format: format === 'sup' ? 'pgs' : 'mks',
      label,
    }
  }
  return { src: src.href, label }
}

export function subtitlesFromFiles(
  files: File[],
  styled: boolean,
): ExternalSubtitleTrack[] {
  const fonts = files.filter((file) =>
    /\.(otf|ttc|ttf|woff2?)$/i.test(file.name),
  )
  return files.flatMap<ExternalSubtitleTrack>((content) => {
    const label = content.name
    const format = extension(label)
    if (format === 'ass' || format === 'ssa') {
      return [
        styled
          ? { content, format, label, renderer: 'styled', fonts }
          : { content, format, label },
      ]
    }
    if (format === 'sup' || format === 'mks') {
      return [
        {
          content,
          label,
          renderer: 'bitmap',
          format: format === 'sup' ? 'pgs' : 'mks',
        },
      ]
    }
    if (format === 'sub') {
      const index = files.find(
        (file) =>
          file.name.toLowerCase() ===
          label.toLowerCase().replace(/\.sub$/, '.idx'),
      )
      if (index)
        return [{ content, index, label, renderer: 'bitmap', format: 'vobsub' }]
    }
    return format && textSubtitleExtension.test(label)
      ? [{ content, format, label }]
      : []
  })
}

export function requestOptions(
  json: string,
  credentials: RequestCredentials,
): LibmediaRequestOptions {
  const input: unknown = JSON.parse(json.trim() || '{}')
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.values(input).some((value) => typeof value !== 'string')
  ) {
    throw new Error('Headers must be a JSON object with string values.')
  }
  const headers = new Headers(input as Record<string, string>)
  return { headers: Object.fromEntries(headers), credentials }
}
