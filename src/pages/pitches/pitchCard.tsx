import { Pitch } from "@/types/slices";
import { Clock } from "lucide-react";
import { MdOutlineLock, MdOutlinePublic } from "react-icons/md";
import DownloadButton from "@/components/DownloadButton";


interface PitchCardProps {
  pitch: Pitch;
  index: number;
  onClick: (pitch: Pitch) => void;
}

const formatToReadableDate = (isoString: string): string => {
  const date = new Date(isoString);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};


const PitchCard = ({ pitch, index, onClick }: PitchCardProps) => (
  <div
    className="group bg-foreground group border-border hover:shadow-neon-green hover:bg-card flex cursor-pointer flex-col gap-4 rounded-2xl border p-2.5 shadow-xl transition duration-300 sm:hover:scale-105"
    onClick={() => onClick(pitch)}
  >
    <section className="relative">
      <img
        src={pitch.thumbnail_url}
        className="w-full aspect-[4/3] rounded-lg bg-black"
      />
      <span className="absolute bottom-0 left-0 m-1 flex items-center gap-2 rounded-full bg-black/70 px-2 py-0.5 text-sm text-white shadow-[inset_-2px_-2px_15px_0_rgba(255,255,255,0.3)] backdrop-blur-sm">
        <Clock size="16px" />
        {formatDuration(pitch.duration_sec)}
      </span>
      
      {/* Download button - visible on hover */}
      <div 
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DownloadButton 
          videoUrl={pitch.video_url}
          fileName={`pitch-${index}-${pitch.avatar_name?.replace(/\s+/g, '-').toLowerCase()}.mp4`}
          variant="icon"
          size="sm"
          addWatermark={true}
        />
      </div>

      <span className="absolute top-0 right-0 m-1 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-white shadow-[inset_-2px_-2px_15px_0_rgba(255,255,255,0.3)] backdrop-blur-sm ">
          {pitch.is_published ? (
            <MdOutlinePublic size="14px" color="white" />
          ) : (
            <MdOutlineLock size="14px" color="white"  />
          )}
          <p className="text-white text-sm capitalize">
            {pitch.is_published ? "Public" : "Private"}
          </p>
        </span>
    </section>
    <section className="px-3 pb-2">
      <span className="flex items-center justify-between">
        <h2 className="font-secondary group text-[20px] transition leading-tight group-hover:text-accent">
          {`Pitch ${index}`}
        </h2>
        
      </span>
      <h2 className=" text-white/80 mb-0.5">
        {pitch.avatar_name}
      </h2>
      <p className="text-[13px] text-secondary ">
        {formatToReadableDate(pitch.created_at)}
      </p>
    </section>
  </div>
);


export default PitchCard;