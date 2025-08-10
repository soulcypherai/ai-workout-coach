import React from "react";

import { cn } from "@/lib/utils";

const InvisibleBox = ({
  heading,
  subHeading = null,
  value,
  className,
}: {
  heading: string;
  value: string;
  subHeading?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "border-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4",
        className,
      )}
    >
      <p className="text-secondary text-sm">{heading}</p>
      <p className="text-primary font-secondary text-xl font-semibold">
        {value}
      </p>
      {subHeading}
    </div>
  );
};

export default InvisibleBox;
