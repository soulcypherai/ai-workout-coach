import React, { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ value, onChange, placeholder, className }) => {
  const [input, setInput] = useState("");

  const addTag = () => {
    const newTag = input.trim();
    if (newTag && !value.includes(newTag)) {
      onChange([...value, newTag]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded border border-gray-600 bg-gray-800 p-2 min-h-[44px] ${className || ""}`}>
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-accent text-black rounded text-xs">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-red-600">
            <X size={14} />
          </button>
        </span>
      ))}
      <Input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] bg-transparent border-0 focus:ring-0 focus:outline-none text-white text-xs"
        onBlur={addTag}
      />
      <Button type="button" size="sm" variant="secondary" onClick={addTag} className="px-2 py-1 text-xs">
        +
      </Button>
    </div>
  );
}; 