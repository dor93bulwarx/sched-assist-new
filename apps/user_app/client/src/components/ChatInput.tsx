import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { SendHorizonal } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, onTyping, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [text]);

  const handleTyping = useCallback(() => {
    if (!onTyping) return;
    if (typingTimer.current) return; // already throttled
    onTyping();
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, 2000);
  }, [onTyping]);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="border-t border-gray-100 bg-white/80 backdrop-blur-xl px-4 py-3 pb-5 sm:px-6 sm:py-3 safe-bottom">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-3"
      >
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Type a message..."}
            rows={1}
            disabled={disabled}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 pr-4 text-sm placeholder-gray-400 shadow-sm transition-all duration-200 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !hasText}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
            hasText && !disabled
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-md hover:shadow-indigo-200/50 active:scale-95"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
          }`}
        >
          <SendHorizonal className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  );
}
