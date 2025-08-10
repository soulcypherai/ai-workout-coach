import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const shortenAddress = (address: string, start = 6, end = 4) => {
  if (!address) return "";

  return `${address.slice(0, start)}...${address.slice(-end)}`;
};
