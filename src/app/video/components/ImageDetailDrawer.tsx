"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Drawer, Input, Spin, Typography, App, Divider, Tag, Tooltip } from "antd";
import {
  ReloadOutlined,
  RollbackOutlined,
  SaveOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { fetchJson } from "@/app/components/client-utils";

/* ------------------------------------------------------------------ */
/*  Types (mirror backend service types)                               */
/* ------------------------------------------------------------------ */

interface VersionRow {
  id: string;
  version: number;
  prompt: string;
  imageUrl: string | null;
  refUrls: string[];
  createdAt: string;
}

interface ImageGenDetail {
  id: string;
  sessionId: string;
  key: string;
  currentVersion: number;
  prompt: string | null;
  imageUrl: string | null;
  versions: VersionRow[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ImageDetailDrawerProps {
  /** The ImageGeneration id to display. null = closed. */
  imageGenId: string | null;
  onClose: () => void;
  /** Called after any mutation so parent can refresh. */
  onRefresh?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ImageDetailDrawer({ imageGenId, onClose, onRefresh }: ImageDetailDrawerProps) {
  const { message } = App.useApp();
  const [detail, setDetail] = useState<ImageGenDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);

  /* ---- Fetch detail ---- */
  const fetchDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const data = await fetchJson<ImageGenDetail>(`/api/image-generations/${id}`);
      setDetail(data);
      setEditPrompt(data.prompt ?? "");
    } catch {
      void message.error("Failed to load image detail");
    } finally {
      setIsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (imageGenId) {
      void fetchDetail(imageGenId);
    } else {
      setDetail(null);
    }
  }, [imageGenId, fetchDetail]);

  /* ---- Save prompt ---- */
  const handleSavePrompt = useCallback(async () => {
    if (!detail || editPrompt === detail.prompt) return;
    setIsSavingPrompt(true);
    try {
      await fetchJson(`/api/image-generations/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editPrompt }),
      });
      void message.success("Prompt saved");
      void fetchDetail(detail.id);
      onRefresh?.();
    } catch {
      void message.error("Failed to save prompt");
    } finally {
      setIsSavingPrompt(false);
    }
  }, [detail, editPrompt, fetchDetail, message, onRefresh]);

  /* ---- Regenerate ---- */
  const handleRegenerate = useCallback(async () => {
    if (!detail) return;
    setIsRegenerating(true);
    try {
      // If prompt was edited but not saved, use the edited prompt for regeneration
      const promptOverride = editPrompt !== detail.prompt ? editPrompt : undefined;
      await fetchJson(`/api/image-generations/${detail.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptOverride ? { prompt: promptOverride } : {}),
      });
      void message.success("Image regenerated");
      void fetchDetail(detail.id);
      onRefresh?.();
    } catch {
      void message.error("Regeneration failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [detail, editPrompt, fetchDetail, message, onRefresh]);

  /* ---- Rollback ---- */
  const handleRollback = useCallback(async (version: number) => {
    if (!detail) return;
    setRollingBackVersion(version);
    try {
      await fetchJson(`/api/image-generations/${detail.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      void message.success(`Rolled back to v${version}`);
      void fetchDetail(detail.id);
      onRefresh?.();
    } catch {
      void message.error("Rollback failed");
    } finally {
      setRollingBackVersion(null);
    }
  }, [detail, fetchDetail, message, onRefresh]);

  /* ---- Render ---- */
  const promptDirty = detail != null && editPrompt !== (detail.prompt ?? "");

  return (
    <Drawer
      title={
        detail ? (
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm">{detail.key}</span>
            <Tag color="blue" style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
              v{detail.currentVersion}
            </Tag>
          </div>
        ) : "Image Detail"
      }
      open={!!imageGenId}
      onClose={onClose}
      styles={{ wrapper: { width: 520 } }}
      destroyOnClose
    >
      {isLoading || !detail ? (
        <div className="flex justify-center py-12"><Spin /></div>
      ) : (
        <div className="space-y-4">
          {/* ── Current Image ── */}
          {detail.imageUrl ? (
            <div className="overflow-hidden rounded-lg border border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.imageUrl}
                alt={detail.key}
                className="w-full object-contain"
                style={{ maxHeight: 360 }}
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
              No image yet
            </div>
          )}

          {/* ── Prompt Editor ── */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Prompt
            </Typography.Text>
            <Input.TextArea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 6 }}
              style={{ marginTop: 4, fontSize: 12 }}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="small"
                icon={<SaveOutlined />}
                onClick={() => void handleSavePrompt()}
                loading={isSavingPrompt}
                disabled={!promptDirty}
              >
                Save Prompt
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void handleRegenerate()}
                loading={isRegenerating}
              >
                {promptDirty ? "Save & Regenerate" : "Regenerate"}
              </Button>
            </div>
          </div>

          {/* ── Version History ── */}
          {detail.versions.length > 1 && (
            <>
              <Divider style={{ margin: "12px 0 8px" }} />
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Version History ({detail.versions.length})
                </Typography.Text>
                <div className="mt-2 space-y-2">
                  {[...detail.versions].reverse().map((ver) => {
                    const isCurrent = ver.version === detail.currentVersion;
                    return (
                      <div
                        key={ver.id}
                        className={`flex gap-2 rounded-lg border p-2 ${
                          isCurrent ? "border-blue-500/40 bg-blue-500/5" : "border-slate-700 bg-slate-900/50"
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-slate-800">
                          {ver.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ver.imageUrl}
                              alt={`v${ver.version}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-600">
                              pending
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">v{ver.version}</span>
                            {isCurrent && (
                              <CheckCircleFilled className="text-blue-400" style={{ fontSize: 11 }} />
                            )}
                            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-500">
                              <ClockCircleOutlined style={{ fontSize: 9 }} />
                              {new Date(ver.createdAt).toLocaleString("zh-CN", {
                                month: "short", day: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">
                            {ver.prompt.length > 80 ? ver.prompt.slice(0, 80) + "…" : ver.prompt}
                          </div>
                          {!isCurrent && (
                            <Tooltip title={`Roll back to v${ver.version}`}>
                              <Button
                                size="small"
                                type="link"
                                icon={<RollbackOutlined />}
                                onClick={() => void handleRollback(ver.version)}
                                loading={rollingBackVersion === ver.version}
                                style={{ fontSize: 11, padding: "0 4px", height: 20 }}
                              >
                                Rollback
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
