import { useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/layouts/pageHeader";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { useNavigate } from "react-router-dom";

import { Pitch } from "@/types/slices";

import PitchCard from "./pitchCard";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

// Utility function to format ISO date

// Tabs definition
type ShowsTabs = "All" | "Public" | "Private";

const MyPitches = () => {
  const [activeTabState, setActiveTabState] = useState<ShowsTabs>("All");
  const { isLoading } = useAuth();
  const pitches = useSelector((state: RootState) => state.pitches);
  const navigate = useNavigate();

  const handleTabChange = (value: string) => {
    setActiveTabState(value as ShowsTabs);
  };

  const runPitch = (pitch: Pitch) => {
    navigate(`${pitch.id}`);
  };

  const filteredPitches =
    pitches
      ? activeTabState === "All"
        ? pitches
        : pitches.filter((p: Pitch) =>
            activeTabState === "Public" ? p.is_published : !p.is_published,
          )
      : [];

  return (
    <div className="flex h-full w-full flex-col px-4 pt-3">
      <PageHeader pageName="Your Pitches" />

      {/* Tabs always visible */}
      <Tabs
        value={activeTabState}
        onValueChange={handleTabChange}
        className="mt-5 mb-1 w-full"
      >
        <div className="relative border-b border-[rgba(255,255,255,0.1)]">
          <TabsList className="flex h-12 w-full cursor-pointer justify-around gap-1 bg-transparent p-0 sm:gap-2">
            {["All", "Public", "Private"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className={cn(
                  "text-primary relative flex-1 bg-transparent px-1 pb-2 sm:px-2",
                  `${activeTabState === tab && 'text-accent'} border-none transition-all duration-200}`,
                )}
              >
                <span className="pixel-font">{tab}</span>
                {activeTabState === tab && (
                  <div className="bg-accent absolute bottom-[-1px] left-0 h-[3px] w-full" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Loading */}
      {isLoading ? (
        <div className="text-secondary flex flex-1 items-center justify-center py-6 text-lg">
          Loading pitches...
        </div>
      ) : filteredPitches.length === 0 ? (
        <div className="text-secondary flex flex-1 items-center justify-center py-6 text-lg">
          No pitches found.
        </div>
      ) : (
        <div className="mb-1 grid grid-cols-1 gap-7 overflow-auto px-3 py-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredPitches.map((pitch: Pitch, index: number) => (
            <PitchCard
              key={pitch.id}
              pitch={pitch}
              index={filteredPitches.length - index}
              onClick={runPitch}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyPitches;
