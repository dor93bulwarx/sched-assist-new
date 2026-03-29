import { useState, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { ChevronDown, Check, AlertTriangle, Loader2 } from "lucide-react";
import type { ConversationModelInfo } from "../api";
import { admin } from "../api";
import { VendorIcon, vendorColors } from "./VendorModelBadge";

interface ModelSelectorProps {
  currentModel: ConversationModelInfo | null;
  conversationType: "group" | "single";
  conversationId: string;
  onModelChanged: (model: ConversationModelInfo) => void;
}

export default function ModelSelector({
  currentModel,
  conversationType,
  conversationId,
  onModelChanged,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ConversationModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || models.length > 0) return;
    setLoading(true);
    admin
      .getModels()
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function selectModel(model: ConversationModelInfo) {
    setError(null);
    setSwitching(model.id);
    try {
      if (conversationType === "single") {
        await admin.setSingleChatModel(conversationId, model.id);
      } else {
        await admin.setGroupModel(conversationId, model.id);
      }
      onModelChanged(model);
      setOpen(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to switch model";
      setError(msg);
    } finally {
      setSwitching(null);
    }
  }

  const vendorSlug = currentModel?.vendor?.slug ?? "unknown";
  const colors =
    vendorColors[vendorSlug] ??
    "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <Box ref={ref} sx={{ position: "relative", flexShrink: 0 }}>
      <Stack
        component="button"
        direction="row"
        alignItems="center"
        onClick={() => {
          setOpen(!open);
          setError(null);
        }}
        className={`rounded-full border font-semibold shadow-sm transition-all duration-200 hover:shadow-md active:scale-95 ${colors}`}
        sx={{
          gap: { xs: "4px", sm: "6px" },
          px: { xs: "8px", sm: "12px" },
          py: { xs: "4px", sm: "6px" },
          fontSize: { xs: "10px", sm: "11px" },
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Change model"
      >
        <VendorIcon slug={vendorSlug} />
        <Box
          component="span"
          sx={{
            maxWidth: { xs: "5rem", sm: "none" },
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentModel?.name ?? "Select model"}
        </Box>
        <ChevronDown
          className={`h-3 w-3 flex-shrink-0 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </Stack>

      {open && (
        <Box
          className="animate-scale-in rounded-2xl border border-gray-200/80 bg-white/95 shadow-glass-lg backdrop-blur-xl"
          sx={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 50,
            mt: 1,
            width: { xs: "calc(100vw - 2rem)", sm: "18rem" },
            maxWidth: "18rem",
          }}
        >
          {error && (
            <Stack
              direction="row"
              alignItems="flex-start"
              spacing={1}
              className="border-b border-red-100 bg-red-50 rounded-t-2xl"
              sx={{ px: 1.5, py: 1.25 }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <Box
                component="p"
                sx={{
                  fontSize: "11px",
                  lineHeight: "tight",
                  color: "rgb(185 28 28)",
                  wordBreak: "break-word",
                  minWidth: 0,
                }}
              >
                {error}
              </Box>
            </Stack>
          )}

          <Box sx={{ p: 0.75, maxHeight: 256, overflowY: "auto" }}>
            {loading && (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 3 }}>
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </Stack>
            )}
            {!loading &&
              models.map((m) => {
                const isSelected = m.id === currentModel?.id;
                const isSwitching = switching === m.id;
                const mVendor = m.vendor?.slug ?? "unknown";
                const mColors = vendorColors[mVendor] ?? "";
                return (
                  <Stack
                    component="button"
                    key={m.id}
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    onClick={() => selectModel(m)}
                    disabled={isSwitching || isSelected}
                    className={`w-full rounded-xl text-left text-xs transition-all duration-150 ${
                      isSelected
                        ? "bg-indigo-50 ring-1 ring-indigo-100"
                        : "hover:bg-gray-50"
                    } disabled:opacity-60`}
                    sx={{ px: 1.5, py: 1.25, cursor: "pointer" }}
                  >
                    <Box
                      component="span"
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border ${mColors || "border-gray-200 bg-gray-50 text-gray-500"}`}
                      sx={{ flexShrink: 0 }}
                    >
                      <VendorIcon slug={mVendor} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box component="p" className="font-medium text-gray-900" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</Box>
                      <Box component="p" sx={{ fontSize: "10px" }} className="text-gray-400">
                        {m.vendor?.name}
                      </Box>
                    </Box>
                    {isSwitching ? (
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    ) : isSelected ? (
                      <Check className="h-4 w-4 text-indigo-600" />
                    ) : null}
                  </Stack>
                );
              })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
