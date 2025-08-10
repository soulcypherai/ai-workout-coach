import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface GroupTilesProps {
  options: Array<{
    name: string;
    path: string;
  }>;
  className?: string;
}

const GroupTiles = ({ options, className }: GroupTilesProps) => {
  return (
    <div
      className={cn("mt-4 flex flex-col overflow-hidden rounded-xl", className)}
    >
      {options.map((option, index) => (
        <Link
          key={option.path}
          to={option.path}
          className={`bg-bg-foreground flex items-center justify-between px-4 py-3.5 ${index !== options.length - 1 ? "border-border border-b" : ""} `}
        >
          <span className="text-primary">{option.name}</span>
          <ChevronRight className="text-accent" size={20} />
        </Link>
      ))}
    </div>
  );
};

export default GroupTiles;
