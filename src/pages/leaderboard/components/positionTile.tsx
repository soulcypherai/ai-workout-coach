import React from "react";

import { cn } from "../../../lib/utils";

interface PositionTileProps {
  position: number;
  imageUrl: string;
  name: string;
  points: number;
  className?: string;
}

const PositionTile: React.FC<PositionTileProps> = ({
  position,
  imageUrl,
  name,
  points,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-lg p-2",
        className,
      )}
    >
      {/* Position Number */}
      <div className="flex items-center gap-4">
        <div className="flex min-w-8 items-center justify-start text-xl font-bold">
          {position}
        </div>

        {/* Profile Image */}
        <div className="flex items-center gap-3">
          <img
            src={imageUrl}
            alt={`${name}'s profile`}
            className="h-9 w-9 rounded-full object-cover"
          />

          {/* Name */}
          <span className="font-secondary text-base">{name}</span>
        </div>
      </div>

      {/* Points */}
      <div className="font-secondary text-primary text-base">
        {points.toLocaleString()} points
      </div>
    </div>
  );
};

export default PositionTile;
