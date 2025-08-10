import React, { useState } from "react";

import { cn } from "@/lib/utils";
import { dispatch, useSelector } from "@/store";
import { setCurrentTab } from "@/store/slices/shows";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ShowsTabs as ShowsTabsType } from "@/types/slices";

import PastShows from "./pastShows";
import UpComingShows from "./upComingShows";

interface ShowsTabsProps {
  onTabChange?: (value: string) => void;
}

const ShowsTabs: React.FC<ShowsTabsProps> = ({ onTabChange }) => {
  const currentTab = useSelector((state) => state.shows.currentTab);
  const [activeTabState, setActiveTabState] = useState(currentTab);

  const handleTabChange = (value: string) => {
    setActiveTabState(value as ShowsTabsType);
    dispatch(setCurrentTab(value as ShowsTabsType));
    if (onTabChange) {
      onTabChange(value);
    }
  };

  return (
    <Tabs
      defaultValue={activeTabState}
      onValueChange={handleTabChange}
      className="mt-5 h-full w-full"
      value={activeTabState}
    >
      <div className="relative border-b border-[rgba(255,255,255,0.1)]">
        <TabsList className="flex h-12 w-full justify-around gap-1 bg-transparent p-0 sm:gap-2">
          <TabsTrigger
            value="Upcoming"
            className={cn(
              "text-primary relative flex-1 bg-transparent px-1 pb-2 sm:px-2",
              "data-[state=active]:text-accent border-none transition-all duration-200",
            )}
          >
            <span className="pixel-font">Upcoming</span>
            {activeTabState === "Upcoming" && (
              <div className="bg-accent absolute bottom-[-1px] left-0 h-[3px] w-full" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="Past"
            className={cn(
              "text-primary relative flex-1 bg-transparent px-1 pb-2 sm:px-2",
              "data-[state=active]:text-accent border-none transition-all duration-200",
            )}
          >
            <span className="pixel-font">Past</span>
            {activeTabState === "Past" && (
              <div className="bg-accent absolute bottom-[-1px] left-0 h-[3px] w-full" />
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="Upcoming" className="mt-4">
        <UpComingShows />
      </TabsContent>
      <TabsContent value="Past" className="max-h-full px-2 overflow-auto">
        <PastShows />
      </TabsContent>
    </Tabs>
  );
};

export default ShowsTabs;
