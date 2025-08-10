import React from "react";

import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ShowCardProps {
  title: string;
  description: string;
  date: string;
  reward: number;
  image?: string;
  onClick?: () => void;
  className?: string;
  liveStatus: "live" | "upcoming" | "past";
}

const ShowCard: React.FC<ShowCardProps> = ({
  title,
  description,
  date,
  reward,
  image,
  onClick,
  className,
  liveStatus,
}) => {
  return (
    <div
      className={cn(
        "max-w-md overflow-hidden rounded-xl border border-gray-800 bg-black text-white",
        className,
      )}
      onClick={onClick}
    >
      {/* Image - Full width */}
      <div className="relative w-full">
        <img src={image} alt={title} className="h-auto w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50"></div>
      </div>

      {/* Content */}
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-lg font-bold">{title}</h2>
          <div className="flex items-center gap-2">
            <Clock size={17} className="text-secondary" />
            <span className="text-secondary text-sm">{date}</span>
          </div>
        </div>

        <p className="text-secondary text-sm">{description}</p>

        {liveStatus === "upcoming" && (
          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" className="text-primary">
              <Clock size={15} />
              Set Reminder
            </Button>

            <div className="text-accent">Reward {reward} points</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShowCard;
