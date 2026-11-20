import { LibmediaPlayer } from '../src/LibmediaPlayer'

const videoExtension =
  /\.(avi|flv|ivf|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|ogv|ts|webm)$/i
const sample = Object.keys(import.meta.glob('/.temp/*'))
  .sort()
  .find((path) => videoExtension.test(path))
  ?.split('/')
  .at(-1)

export default function App() {
  return (
    <main className="mx-auto my-8 max-w-[70rem] px-4">
      {sample ? (
        <>
          <h1 className="mb-4 text-[clamp(1rem,3vw,1.5rem)] font-semibold wrap-anywhere">
            {sample}
          </h1>
          <LibmediaPlayer
            src={`${import.meta.env.BASE_URL}.temp/${encodeURIComponent(sample)}`}
          />
        </>
      ) : (
        <p>No video files found in .temp/.</p>
      )}
    </main>
  )
}
