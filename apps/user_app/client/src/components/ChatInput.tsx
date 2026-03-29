import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { SendHorizonal, X } from "lucide-react";
import { VendorIcon, vendorColors } from "./VendorModelBadge";

interface ChatInputProps {
  onSend: (message: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
  agentName?: string;
  vendorSlug?: string;
}

export default function ChatInput({
  onSend,
  onTyping,
  disabled,
  placeholder,
  agentName,
  vendorSlug,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [mentionedAgent, setMentionedAgent] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [text]);

  useEffect(() => {
    if (!showMentionDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMentionDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMentionDropdown]);

  const handleTyping = useCallback(() => {
    if (!onTyping) return;
    if (typingTimer.current) return;
    onTyping();
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, 2000);
  }, [onTyping]);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !mentionedAgent) return;
    if (disabled) return;

    const finalText = mentionedAgent && agentName
      ? `@${agentName} ${trimmed}`
      : trimmed;

    if (!finalText.trim()) return;
    onSend(finalText);
    setText("");
    setMentionedAgent(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && showMentionDropdown) {
      setShowMentionDropdown(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    if (agentName && !mentionedAgent) {
      const cursorPos = e.target.selectionStart ?? val.length;
      const charAtCursor = val[cursorPos - 1];
      const charBefore = cursorPos > 1 ? val[cursorPos - 2] : undefined;

      if (
        charAtCursor === "@" &&
        (!charBefore || charBefore === " " || charBefore === "\n")
      ) {
        setShowMentionDropdown(true);
      } else if (showMentionDropdown) {
        const lastAtIndex = val.lastIndexOf("@");
        if (lastAtIndex >= 0) {
          const typed = val.slice(lastAtIndex + 1).toLowerCase();
          if (!agentName.toLowerCase().startsWith(typed)) {
            setShowMentionDropdown(false);
          }
        } else {
          setShowMentionDropdown(false);
        }
      }
    }

    if (val.trim()) handleTyping();
  }

  function handleSelectMention() {
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex >= 0) {
      const spaceAfter = text.indexOf(" ", lastAtIndex);
      const before = text.slice(0, lastAtIndex);
      const after = spaceAfter === -1 ? "" : text.slice(spaceAfter);
      setText((before + after).trim() === "" ? "" : before + after);
    }
    setMentionedAgent(true);
    setShowMentionDropdown(false);
    textareaRef.current?.focus();
  }

  function handleRemoveMention() {
    setMentionedAgent(false);
    textareaRef.current?.focus();
  }

  const hasContent = text.trim().length > 0 || mentionedAgent;

  const chipColors = vendorSlug && vendorColors[vendorSlug]
    ? vendorColors[vendorSlug]
    : "bg-indigo-50 text-indigo-700 border-indigo-200/60";

  return (
    <Box
      className="border-t border-gray-100 bg-white/80 backdrop-blur-xl safe-bottom"
      sx={{
        px: { xs: 2, sm: 3 },
        py: { xs: 1.5, sm: 1.5 },
        pb: { xs: 2.5, sm: 1.5 },
      }}
    >
      <Stack
        component="form"
        direction="row"
        alignItems="flex-end"
        spacing={1.5}
        onSubmit={handleSubmit}
        sx={{ mx: "auto", maxWidth: "48rem" }}
      >
        <Box sx={{ position: "relative", flex: 1, minWidth: 0 }}>
          {/* Mention autocomplete dropdown */}
          {showMentionDropdown && agentName && (
            <Box
              ref={dropdownRef}
              className="animate-scale-in rounded-xl border border-gray-200/80 bg-white shadow-glass-lg backdrop-blur-xl overflow-hidden"
              sx={{ position: "absolute", bottom: "100%", left: 0, mb: 1, width: "100%", maxWidth: "20rem", zIndex: 10 }}
            >
              <Stack
                component="button"
                type="button"
                direction="row"
                alignItems="center"
                spacing={1.25}
                onClick={handleSelectMention}
                className="w-full text-left text-sm transition-colors hover:bg-indigo-50/70 active:bg-indigo-100/50"
                sx={{ px: 1.5, py: 1.25, cursor: "pointer" }}
              >
                <Box
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ${
                    vendorSlug === "openai" ? "bg-emerald-50 text-emerald-700 ring-emerald-200/60" :
                    vendorSlug === "anthropic" ? "bg-amber-50 text-amber-700 ring-amber-200/60" :
                    vendorSlug === "google" ? "bg-blue-50 text-blue-700 ring-blue-200/60" :
                    "bg-indigo-50 text-indigo-600 ring-indigo-200/60"
                  }`}
                >
                  <VendorIcon slug={vendorSlug ?? ""} />
                </Box>
                <Box component="span" className="font-medium text-gray-900">{agentName}</Box>
                {vendorSlug && (
                  <Box
                    component="span"
                    className={`ml-auto inline-flex items-center gap-1 rounded-full border text-[10px] font-semibold ${chipColors}`}
                    sx={{ px: 1, py: 0.25 }}
                  >
                    <VendorIcon slug={vendorSlug} />
                  </Box>
                )}
              </Stack>
            </Box>
          )}

          {/* Input area with optional chip */}
          <Box
            className={`rounded-2xl border bg-gray-50/80 shadow-sm transition-all duration-200 ${
              focused
                ? "border-indigo-300 bg-white ring-4 ring-indigo-500/10"
                : "border-gray-200"
            } ${disabled ? "opacity-50" : ""}`}
          >
            {/* Mention chip */}
            {mentionedAgent && agentName && (
              <Box sx={{ px: 1.5, pt: 1.25, pb: 0 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  className={`rounded-full border text-xs font-semibold shadow-sm ${chipColors}`}
                  sx={{ display: "inline-flex", width: "auto", gap: "6px", pl: "10px", pr: "6px", py: "4px" }}
                >
                  <Box sx={{ display: "flex", flexShrink: 0 }}>
                    <VendorIcon slug={vendorSlug ?? ""} />
                  </Box>
                  <Box component="span" sx={{ whiteSpace: "nowrap" }}>@{agentName}</Box>
                  <Box
                    component="button"
                    type="button"
                    onClick={handleRemoveMention}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      borderRadius: "50%",
                      p: "2px",
                      cursor: "pointer",
                      transition: "background-color 150ms",
                      "&:hover": { bgcolor: "rgba(0,0,0,0.1)" },
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Box>
                </Stack>
              </Box>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder ?? "Type a message..."}
              rows={1}
              disabled={disabled}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm placeholder-gray-400 focus:outline-none disabled:opacity-50"
            />
          </Box>
        </Box>
        <Box
          component="button"
          type="submit"
          disabled={disabled || !hasContent}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
            hasContent && !disabled
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-md hover:shadow-indigo-200/50 active:scale-95"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
          }`}
        >
          <SendHorizonal className="h-[18px] w-[18px]" />
        </Box>
      </Stack>
    </Box>
  );
}
