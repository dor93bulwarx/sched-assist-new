import { User, AlertTriangle } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { VendorIcon } from "./VendorModelBadge";

const vendorAvatarColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 shadow-emerald-100/50 ring-emerald-200/60",
  anthropic: "bg-amber-50 text-amber-700 shadow-amber-100/50 ring-amber-200/60",
  google: "bg-blue-50 text-blue-700 shadow-blue-100/50 ring-blue-200/60",
};

const defaultAvatarColor = "bg-gray-100 text-gray-500 shadow-gray-100/50 ring-gray-200/60";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  /** Display name shown above the bubble for group messages from other users. */
  senderName?: string;
  /** Vendor slug for the model (used to show vendor icon on assistant messages). */
  vendorSlug?: string | null;
}

export default function ChatMessage({ role, content, senderName, vendorSlug }: ChatMessageProps) {
  const isUser = role === "user";
  const isError = !isUser && content.startsWith("Error:");
  // Messages from other group members: role is "user" but senderName is set
  const isOtherUser = isUser && !!senderName;

  return (
    <div
      className={`flex animate-slide-up ${isUser && !isOtherUser ? "justify-end" : "justify-start"}`}
    >
      {/* Left-side avatar: assistant or other group member */}
      {!isUser && (
        <div
          className={`mr-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${
            isError
              ? "bg-red-100 text-red-500 ring-red-200/60"
              : vendorSlug
                ? vendorAvatarColors[vendorSlug] ?? defaultAvatarColor
                : defaultAvatarColor
          }`}
        >
          {isError ? (
            <AlertTriangle className="h-4 w-4" />
          ) : vendorSlug ? (
            <VendorIcon slug={vendorSlug} />
          ) : (
            <VendorIcon slug="" />
          )}
        </div>
      )}
      {isOtherUser && (
        <div className="mr-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-xs font-bold text-indigo-600 shadow-sm ring-1 ring-indigo-100">
          {senderName.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Bubble */}
      {isError ? (
        <div className="max-w-[88%] sm:max-w-[75%] rounded-2xl rounded-tl-md border border-red-200/60 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            Error
          </div>
          <p className="whitespace-pre-wrap">
            {content.replace(/^Error:\s*/, "")}
          </p>
        </div>
      ) : isOtherUser ? (
        <div className="max-w-[88%] sm:max-w-[75%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm text-gray-800 shadow-glass ring-1 ring-gray-950/[0.04]">
          <p className="mb-1 text-[10px] font-semibold text-indigo-500">{senderName}</p>
          <div className="chat-prose">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      ) : (
        <div
          className={`max-w-[88%] sm:max-w-[75%] text-sm ${
            isUser
              ? "rounded-2xl rounded-tr-md bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-3 text-white shadow-md shadow-blue-200/50"
              : "rounded-2xl rounded-tl-md bg-white px-4 py-3 text-gray-800 shadow-glass ring-1 ring-gray-950/[0.04]"
          }`}
        >
          <div className={`chat-prose ${isUser ? "chat-prose-user" : ""}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      )}

      {/* Right-side avatar: current user's own messages */}
      {isUser && !isOtherUser && (
        <div className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 text-gray-500 shadow-sm ring-1 ring-gray-950/[0.04]">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
