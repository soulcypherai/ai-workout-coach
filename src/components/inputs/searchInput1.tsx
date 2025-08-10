import React from "react";

import searchSvg from "@/assets/svg/search.svg";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";

interface SearchInput1Props {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const SearchInput1: React.FC<SearchInput1Props> = ({
  placeholder = "Search...",
  value,
  onChange,
  className,
}) => {
  return (
    <div className={cn("bg-foreground relative w-full rounded-xl", className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <img
          src={searchSvg}
          alt="Search"
          className="text-muted-foreground h-4 w-4"
        />
      </div>
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="pl-10"
      />
    </div>
  );
};

export default SearchInput1;
