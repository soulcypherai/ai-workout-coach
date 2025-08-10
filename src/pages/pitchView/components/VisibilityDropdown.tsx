import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { MdOutlineLock, MdOutlinePublic } from "react-icons/md";

interface VisibilityDropdownProps {
  isPublic: boolean;
  loading: boolean;
  onApply: (nextState: "public" | "private") => void;
}

const VisibilityDropdown = ({ isPublic, loading, onApply }: VisibilityDropdownProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedState, setSelectedState] = useState(isPublic ? "public" : "private");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset selected state when isPublic changes
  useEffect(() => {
    setSelectedState(isPublic ? "public" : "private");
  }, [isPublic]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSelectedState(isPublic ? "public" : "private"); // reset if closed without applying
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen, isPublic]);

  return (
    <div ref={dropdownRef} className="absolute top-2 left-2 z-20">
      <button
        onClick={() => setDropdownOpen((v) => !v)}
        className={`rounded-full cursor-pointer bg-black/70 px-3 py-1 text-white shadow-[inset_-2px_-2px_15px_0_rgba(255,255,255,0.3)] backdrop-blur-sm flex items-center relative`}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
      >
        {loading ? (
          <span className="h-5 px-2 flex items-center">
            <span className="inline-block h-3 aspect-square animate-spin rounded-full border-1 border-white border-t-transparent align-middle " />
            <span className="ml-2 text-xs text-white">Loading...</span>
          </span>
        ) : (
          <>
            {isPublic ? (
              <MdOutlinePublic size="14px" color="white" />
            ) : (
              <MdOutlineLock size="14px" color="white" />
            )}
            <span className="text-sm text-white capitalize ml-1 mr-2">{isPublic ? "Public" : "Private"}</span>
            <ChevronDown className={`h-4 w-4 text-white transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {dropdownOpen && !loading && (
        <div className="absolute left-0 mt-2 w-30 rounded-lg bg-black/90 shadow-lg border border-white/10 z-50 p-3 flex flex-col gap-2 animate-in fade-in-0 zoom-in-95">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-white">
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={selectedState === "public"}
                onChange={() => setSelectedState("public")}
                className="accent-accent h-4 w-4"
              />
              Public {selectedState === "public" && <Check className="h-4 w-4 text-accent ml-1" />}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-white">
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={selectedState === "private"}
                onChange={() => setSelectedState("private")}
                className="accent-accent h-4 w-4"
              />
              Private {selectedState === "private" && <Check className="h-4 w-4 text-accent ml-1" />}
            </label>
          </div>
          <button
            onClick={() => {
              if ((isPublic ? "public" : "private") === selectedState) return;
              onApply(selectedState as "public" | "private");
              setDropdownOpen(false);
            }}
            disabled={loading || (isPublic ? "public" : "private") === selectedState}
            className={`mt-2 rounded bg-accent text-black px-3 py-1 text-xs font-medium transition-all duration-200 ${loading || (isPublic ? "public" : "private") === selectedState ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/90'}`}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default VisibilityDropdown; 