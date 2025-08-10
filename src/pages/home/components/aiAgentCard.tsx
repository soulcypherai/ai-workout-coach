import placeholderAgentImage from "@/assets/png/egghead.png";
import xLogo from "@/assets/svg/x-logo.svg";
import { cn } from "@/lib/utils";
import { ArrowRight, LockKeyhole } from "lucide-react";

interface AiAgentCardProps {
  name: string;
  description: string;
  onClick?: () => void;
  className?: string;
  perMinuteCost: number;
  isUnlocked?: boolean;
  xUrl?: string;
  image?: string;
}

const AiAgentCard = ({
  name,
  description,
  onClick,
  className,
  perMinuteCost,
  isUnlocked,
  xUrl,
  image = placeholderAgentImage,
}: AiAgentCardProps) => {
  const handleXClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (xUrl) {
      window.open(xUrl, "_blank");
    }
  };
  return (
    <div
      className={cn(
        "flex w-full cursor-pointer flex-col items-center rounded-xl text-center transition-all duration-200 hover:scale-105 hover:shadow-lg",
        className,
      )}
      onClick={onClick}
    >
      {/* Profile Image */}
      <div className="relative flex h-[130px] w-full items-center justify-center overflow-hidden rounded-xl sm:h-[180px] md:h-[200px]">
        <div
          className="h-full w-full rounded-xl"
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: "cover",
            backgroundPosition: "top",
          }}
        />
        {/* Subtle shadow gradient overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-black/40 via-black/10 to-transparent"></div>

        {/* Updated badge - per-minute pricing */}
        <div className="absolute top-2 right-2 flex items-center justify-center rounded-md border border-white/20 bg-black/70 px-2 py-1 backdrop-blur-md">
          <span className="text-xs font-semibold text-white">
            {perMinuteCost}/min
          </span>
        </div>
      </div>

      {/* Name */}
      <div className="mt-2 flex w-full items-start justify-between pr-2">
        <h3 className="mb-1.5 text-left text-lg leading-tight font-semibold text-white">
          {name}
        </h3>
        {xUrl && (
          <img
            src={xLogo}
            alt="X Profile"
            className="h-5 w-5 cursor-pointer"
            onClick={handleXClick}
            
          />
        )}
      </div>

      {/* Description */}
      <p className="mb-2 w-full text-left text-sm leading-[1.3] text-gray-400">
        {description}
      </p>

      {/* Updated action button with cost info */}
      <div className="mt-auto w-full">
        <p className="text-accent bg-bg-foreground border-border flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium">
          {isUnlocked === false ? (
            <>
              <span>{perMinuteCost} credits/min</span>
              <LockKeyhole size={16} />
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-1">
              <span className="text-start leading-[1.4]">
                Start talking • {perMinuteCost} credits/min
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </div>
          )}
        </p>
      </div>
    </div>
  );
};

export default AiAgentCard;
