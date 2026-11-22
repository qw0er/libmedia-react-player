import type { PlaybackSession } from './session'

export const autoplayBlockedMessage =
  'Automatic playback was blocked. Select Play to continue.'

export function isAutoplayBlocked(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

export async function startPlayback(
  playback: PlaybackSession,
  prepareAudio: () => Promise<void>,
  reloadSource: () => Promise<void>,
) {
  const { player, signal } = playback
  const checkAutoplay =
    !navigator.userActivation?.isActive &&
    Boolean(playback.media?.audio.length) &&
    playback.tracks.audible
  if (checkAutoplay) {
    // libmedia can start the video with a suspended audio context.
    // Check the context before starting so the prepared position stays intact.
    await prepareAudio()
    signal.throwIfAborted()
  }
  if (player.isSuspended()) {
    await player.resume()
    signal.throwIfAborted()
    if (checkAutoplay && player.isSuspended()) {
      throw new DOMException(autoplayBlockedMessage, 'NotAllowedError')
    }
  }
  const preparedStatus = player.getStatus()
  const preparedPosition = playback.progress().positionMs
  try {
    await player.play()
  } catch (error) {
    signal.throwIfAborted()
    if (
      playback.status === 'starting' &&
      isAutoplayBlocked(error) &&
      player.getStatus() !== preparedStatus
    ) {
      // A media element can reject play after libmedia starts its pipeline.
      // Prepare that instance again so the next Play can start it.
      await player.stop(true)
      signal.throwIfAborted()
      await reloadSource()
      signal.throwIfAborted()
      if (preparedPosition > 0 && !player.isLive()) {
        const restored = await player.seek(BigInt(preparedPosition))
        signal.throwIfAborted()
        if (restored == null) {
          throw new Error('Could not restore the prepared position.')
        }
        playback.updatePosition(Number(restored))
      }
    }
    throw error
  }
}
