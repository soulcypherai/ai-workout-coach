import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

const VerdictBox = (verdict: {
  description: string;
  options: string[];
  result: number | null;
  index: number;
}) => {
  return (
    <div className="border-secondary/50 border-b pb-5">
      <p className="font-semibold">
        <span>{verdict.index}.</span> {verdict.description}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {verdict.options.map((option, index) => (
          <Button
            key={index}
            variant="secondary"
            className={cn(
              "flex-1",
              index === verdict.result ? "border-accent" : "",
            )}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default VerdictBox;
