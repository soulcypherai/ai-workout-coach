/// <reference types="vite/client" />

// Declare modules for media file types
declare module "*.mkv" {
  const src: string;
  export default src;
}

declare module "*.mp4" {
  const src: string;
  export default src;
}

declare module "*.webm" {
  const src: string;
  export default src;
}

declare module "*.mp3" {
  const src: string;
  export default src;
}
