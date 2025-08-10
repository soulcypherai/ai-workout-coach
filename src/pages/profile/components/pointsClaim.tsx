import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PointsClaimProps {
  credits?: number;
}

const PointsClaim = ({ credits = 0 }: PointsClaimProps) => {
  return (
    <div className="flex flex-col items-center justify-center">
      <p className="text-accent font-secondary">{credits} </p>
      <p className="text-secondary text-sm">Credits</p>
      <Button className="mt-3 w-full">
        <span>
          <Gift className="text-black" />
        </span>{" "}
        Claim Daily Bonus
      </Button>
    </div>
  );
};

export default PointsClaim;
