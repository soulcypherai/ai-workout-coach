import React, { useState } from "react";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import "./tabs.css";

interface HomeTabs {
  onTabChange?: (value: string) => void;
}

const HomeTabs: React.FC<HomeTabs> = ({ onTabChange }) => {
  const [activeTabState, setActiveTabState] = useState("coaches");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const tabs = [{ value: "coaches", label: "AI Coaches" }];

  const activeTabData = tabs.find((tab) => tab.value === activeTabState);

  const handleTabChange = (value: string) => {
    setActiveTabState(value);
    setDropdownOpen(false);
    if (onTabChange) {
      onTabChange(value);
    }
  };

  return (
    <>
      {/* Mobile Dropdown - visible on small screens */}
      <div className="relative mb-4 block sm:hidden">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-[rgba(255,255,255,0.1)] bg-black/30 px-4 py-3"
        >
          <span className="pixel-font text-accent">{activeTabData?.label}</span>
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform",
              dropdownOpen && "rotate-180",
            )}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[rgba(255,255,255,0.1)] bg-black/80 backdrop-blur-sm">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3 text-left",
                  "text-white/70 transition-colors hover:bg-white/5 hover:text-white/90",
                  activeTabState === tab.value &&
                    "bg-accent/10 text-accent hover:text-accent",
                )}
              >
                <span className="pixel-font text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Tabs - hidden on small screens */}
      <Tabs
        defaultValue={activeTabState}
        onValueChange={handleTabChange}
        className="hidden w-full gap-0 sm:block"
        value={activeTabState}
      >
        <div className="relative border-b border-[rgba(255,255,255,0.1)]">
          <TabsList className="flex h-12 w-full justify-around gap-0 bg-transparent p-0">
            <TabsTrigger
              value="coaches"
              className={cn(
                "text-primary relative flex-1 bg-transparent px-0.5 pb-2 sm:px-2",
                "data-[state=active]:text-accent border-none transition-all duration-200",
              )}
            >
              <span className="pixel-font text-xs sm:text-sm">AI Coaches</span>
              {activeTabState === "coaches" && (
                <div className="bg-accent absolute bottom-[-1px] left-0 h-[3px] w-full" />
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="coaches" className="mt-4">
          {/* Content for AI Coaches tab */}
        </TabsContent>
      </Tabs>
    </>
  );
};

export default HomeTabs;
