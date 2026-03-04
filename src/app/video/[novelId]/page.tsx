"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Button,
  ConfigProvider,
  Segmented,
  Typography,
  theme as antTheme,
} from "antd";
import {
  AppstoreOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { useSessions } from "@/app/components/hooks/useSessions";
import { useVideoData } from "../hooks/useVideoData";
import { EpisodeList } from "../components/EpisodeList";
import { ResourcePanel } from "../components/ResourcePanel";
import { VideoChat } from "../components/VideoChat";
import type { VideoContext } from "../types";

const DEFAULT_SKILLS = ["novel-video-workflow", "novel-character-card"];
const DEFAULT_MCPS = ["novel-service"];

type ResourceView = "all" | "image" | "video" | "json";

export default function VideoWorkflowPage() {
  const params = useParams<{ novelId: string }>();
  const searchParams = useSearchParams();
  const novelId = params.novelId;
  const novelName = searchParams.get("name") ?? novelId;

  const data = useVideoData(novelId);

  const userName = data.selectedEpisode
    ? `video:${novelId}:${data.selectedEpisode.scriptKey}`
    : `video:${novelId}:_`;

  const sessionsHook = useSessions(
    userName,
    () => {},
    () => {},
  );
  const [currentSessionId, setCurrentSessionId] = useState<
    string | undefined
  >();
  const [chatKey, setChatKey] = useState(() => crypto.randomUUID());
  const [autoMessage, setAutoMessage] = useState<string | undefined>();
  const [resourceView, setResourceView] = useState<ResourceView>("all");

  const switchSession = useCallback((sessionId?: string) => {
    setCurrentSessionId(sessionId);
    setChatKey(crypto.randomUUID());
  }, []);

  const handleNewSession = useCallback(() => {
    switchSession(undefined);
  }, [switchSession]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await sessionsHook.deleteSession(sessionId);
      if (currentSessionId === sessionId) switchSession(undefined);
    },
    [sessionsHook, currentSessionId, switchSession],
  );

  const videoContext: VideoContext | null = useMemo(() => {
    if (!data.selectedEpisode) return null;
    return {
      novelId,
      scriptKey: data.selectedEpisode.scriptKey,
    };
  }, [novelId, data.selectedEpisode]);

  const handleSelectEpisode = useCallback(
    (ep: (typeof data.episodes)[number]) => {
      data.selectEpisode(ep);
      setCurrentSessionId(undefined);
      setAutoMessage(undefined);
      setChatKey(crypto.randomUUID());
    },
    [data],
  );

  const handleUpload = useCallback(
    async (
      scriptKey: string,
      scriptName: string | null,
      content: string | null,
    ) => {
      await data.uploadEpisode(scriptKey, scriptName, content);
      const refreshed = await data.refreshEpisodes();
      const newEp = refreshed.find((ep) => ep.scriptKey === scriptKey);
      if (newEp) {
        data.selectEpisode(newEp);
        setCurrentSessionId(undefined);
        setAutoMessage(
          "EP已上传，请先确认风格参考图与提示词，再开始人物卡 → 分镜 → 图片 → 视频流程。",
        );
        setChatKey(crypto.randomUUID());
      }
    },
    [data],
  );

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setCurrentSessionId(sessionId);
      setAutoMessage(undefined);
      void sessionsHook.refreshSessions();
    },
    [sessionsHook],
  );

  const handleRefreshNeeded = useCallback(() => {
    void data.refreshAll();
    void sessionsHook.refreshSessions();
  }, [data, sessionsHook]);

  return (
    <ConfigProvider
      theme={{
        algorithm: antTheme.defaultAlgorithm,
        token: {
          colorBgLayout: "#f8fafc",
          colorBgContainer: "#ffffff",
          colorBorderSecondary: "#e2e8f0",
        },
      }}
    >
      <main className="flex h-screen w-full flex-col bg-slate-50 text-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Video Workbench 2.0
            </Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {novelName}
            </Typography.Title>
          </div>
          <div className="flex items-center gap-2">
            <Segmented<ResourceView>
              value={resourceView}
              onChange={(value) => setResourceView(value)}
              options={[
                { label: "All", value: "all", icon: <AppstoreOutlined /> },
                { label: "Images", value: "image", icon: <PictureOutlined /> },
                {
                  label: "Videos",
                  value: "video",
                  icon: <VideoCameraOutlined />,
                },
                { label: "JSON", value: "json", icon: <CodeOutlined /> },
              ]}
            />
            <Button onClick={() => void data.refreshAll()}>Refresh</Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <EpisodeList
            novelName={novelName}
            episodes={data.episodes}
            isLoading={data.isLoadingEpisodes}
            isUploading={data.isUploading}
            selectedEpisode={data.selectedEpisode}
            onSelectEpisode={handleSelectEpisode}
            onDeleteEpisode={(ep) => {
              if (confirm(`Delete ${ep.scriptKey}?`))
                void data.deleteEpisode(ep.id);
            }}
            onRefresh={() => void data.refreshEpisodes()}
            onUpload={(key, name, content) =>
              void handleUpload(key, name, content)
            }
            sessions={sessionsHook.sessions}
            currentSessionId={currentSessionId}
            onSelectSession={switchSession}
            onNewSession={handleNewSession}
            onDeleteSession={(id) => void handleDeleteSession(id)}
          />

          <section className="min-w-0 flex-1 border-x border-slate-200 bg-white">
            <VideoChat
              key={chatKey}
              initialSessionId={currentSessionId}
              videoContext={videoContext}
              preloadMcps={DEFAULT_MCPS}
              skills={DEFAULT_SKILLS}
              onSessionCreated={handleSessionCreated}
              onRefreshNeeded={handleRefreshNeeded}
              autoMessage={autoMessage}
            />
          </section>

          <ResourcePanel
            resources={data.resources}
            isLoading={data.isLoadingResources}
            scriptId={data.selectedEpisode?.id ?? null}
            sessionId={currentSessionId}
            viewFilter={resourceView}
            onRefresh={() => void data.refreshResources()}
          />
        </div>
      </main>
    </ConfigProvider>
  );
}
