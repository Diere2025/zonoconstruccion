import React, { useEffect, useState, useRef } from "react";
import { Calendar } from "lucide-react";

interface DateInputProps {
  label?: string;
  value: string; // YYYY-MM-DD format
  onChange: (val: string) => void;
  required?: boolean;
  className?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ label, value, onChange, required = false, className }) => {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (value) {
      const parts = value.split("-");
      if (parts.length === 3) {
        setTypedValue(`${parts[2]}/${parts[1]}/${parts[0]}`);
      } else {
        setTypedValue(value);
      }
    } else {
      setTypedValue("");
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;
    input = input.replace(/[^0-9/]/g, "");

    // Auto slashes
    if (input.length === 2 && !input.includes("/")) {
      input += "/";
    } else if (input.length === 5 && input.split("/").length === 2) {
      input += "/";
    }

    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    setTypedValue(input);

    const parts = input.split("/");
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const yyyy = parts[2];
      const mm = parts[1];
      const dd = parts[0];
      onChange(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleBlur = () => {
    const parts = typedValue.split("/");
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      if (value) {
        const vParts = value.split("-");
        setTypedValue(`${vParts[2]}/${vParts[1]}/${vParts[0]}`);
      } else {
        setTypedValue("");
      }
    }
  };

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const handleCalendarClick = () => {
    if (hiddenInputRef.current) {
      try {
        if (typeof hiddenInputRef.current.showPicker === "function") {
          hiddenInputRef.current.showPicker();
        } else {
          hiddenInputRef.current.click();
        }
      } catch {
        hiddenInputRef.current.click();
      }
    }
  };

  return (
    <div className={label ? "space-y-1" : ""}>
      {label && <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">{label}</label>}
      <div className="relative">
        <input
          type="text"
          required={required}
          value={typedValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="dd/mm/aaaa"
          className={className || "w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-brand-500/10 outline-none text-slate-800"}
        />
        <button
          type="button"
          onClick={handleCalendarClick}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
        <input
          ref={hiddenInputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
        />
      </div>
    </div>
  );
};
